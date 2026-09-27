/**
 * ============================================================================
 * NextBridge — NextToppers Real-Time Edge Gateway (Cloudflare Worker)
 * ============================================================================
 * 
 * Features:
 * 1. Real-time folder & course queries to course.nexttoppers.com
 * 2. Automated token injection from Firebase RTDB with in-memory edge caching
 * 3. Native Direct PDF Resolution: Extracts direct CloudFront PDF URLs without middleware
 * 4. Algorithmic HLS Stream Derivation: Derives unencrypted CloudFront .m3u8 streams in 0ms
 * 5. Multi-tier Edge Caching: Caches responses in caches.default (5–10 min TTL)
 * 6. Built-in Universal Wildcard CORS Proxy for streams, PDFs, and API payloads
 */

const NEXTTOPPERS_API = 'https://course.nexttoppers.com/course/all-content';
const DYNAMIC_LINK_API = 'https://course.nexttoppers.com/dl/dynamic-link';
const FIREBASE_DB_URL = 'https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app';
const NEXTHOPE_API = 'https://nt.nexthope.site/api/content-details';

// EduVibe AES Keys (Maintained strictly as fallback if token expires)
const EDUVIBE_BASE = 'https://eduvibe-2tkn.onrender.com/nt';
const EDUVIBE_AES_KEY = 'Ch@tS3cr3tK3y!16';
const EDUVIBE_AES_IV = 'Ch@tIV#16Bytes!!';

// In-Worker memory cache for student Bearer token (refreshed every 30 minutes)
let tokenCache = {
  token: '',
  userId: '1559161',
  lastFetched: 0,
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, *',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // 2. Health & Status Check
    if (pathname === '/' || pathname === '/health') {
      const auth = await getActiveAuthToken();
      return jsonResponse({
        status: 'ok',
        service: 'NextBridge NextToppers Edge Gateway',
        region: request.cf?.colo || 'EDGE',
        country: request.cf?.country || 'GLOBAL',
        tokenActive: Boolean(auth.token),
      });
    }

    // 3. Universal Wildcard CORS Proxy: /api/proxy?url=<targetUrl>
    if (pathname === '/api/proxy') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) return jsonResponse({ error: 'Missing ?url= query parameter' }, 400);

      try {
        const proxyRes = await fetch(targetUrl, {
          method: request.method,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        const newHeaders = new Headers(proxyRes.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
        newHeaders.set('Cache-Control', 'public, max-age=86400, immutable');

        return new Response(proxyRes.body, {
          status: proxyRes.status,
          headers: newHeaders,
        });
      } catch (err) {
        return jsonResponse({ error: `Proxy fetch failed: ${err.message}` }, 502);
      }
    }

    // 4. Main Content / Folder Exploration Endpoint: /api/folder
    if (pathname === '/api/folder' || pathname === '/api/content') {
      const courseId = url.searchParams.get('courseId') || url.searchParams.get('course_id');
      const folderId = url.searchParams.get('folderId') || url.searchParams.get('folder_id') || '0';
      const parentCourseId = url.searchParams.get('parentCourseId') || '0';
      const page = url.searchParams.get('page') || '1';
      const limit = url.searchParams.get('limit') || '200';

      if (!courseId) {
        return jsonResponse({ success: false, error: 'Missing courseId parameter' }, 400);
      }

      // Always fetch fresh real-time data from upstream (no caching) so new lectures/PDFs reflect instantly
      try {
        // Retrieve fresh student token
        const auth = await getActiveAuthToken();

        const headers = {
          'Content-Type': 'application/json',
          'app_id': '1770981347',
          'platform': '3',
          'version': '1',
          'extra_value': 'NEXT400',
        };

        if (auth.token) {
          headers['authorization'] = `Bearer ${auth.token}`;
          headers['user_id'] = String(auth.userId);
        } else {
          headers['user_id'] = '0';
        }

        const payload = {
          course_id: String(courseId),
          folder_id: String(folderId),
          parent_course_id: String(parentCourseId),
          page: String(page),
          limit: String(limit),
          keyword: '',
          is_free: '',
        };

        const originRes = await fetch(NEXTTOPPERS_API, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (!originRes.ok) {
          return jsonResponse({ success: false, error: `NextToppers HTTP ${originRes.status}` }, originRes.status);
        }

        const data = await originRes.json();
        const rawItems = Array.isArray(data?.data) ? data.data : [];

        // Transform items into clean, ready-to-consume entities
        const folders = [];
        const items = [];

        for (const raw of rawItems) {
          if (!raw) continue;
          const dataObj = raw.data || raw;
          const itemId = String(dataObj.id || raw.id || raw.entity_id);
          const title = (raw.title || dataObj.title || '').trim();

          const isFolder =
            raw.type === 'folder' ||
            raw.file_type === 3 ||
            dataObj.file_type === 3 ||
            dataObj.type === 'folder' ||
            Boolean(dataObj.content_counts?.folders !== undefined);

          if (isFolder) {
            folders.push({
              id: itemId,
              title,
              isFolder: true,
              folderId: itemId,
              courseId,
              itemCount: dataObj.content_counts?.total ?? dataObj.items_count ?? 0,
              videoCount: dataObj.content_counts?.video?.paid ?? 0,
              pdfCount: dataObj.content_counts?.pdf?.paid ?? 0,
            });
          } else {
            let primaryUrl = dataObj.file_url || dataObj.video_url || dataObj.download_url || dataObj.url || '';
            let resolvedHlsUrl = null;

            const isPdf =
              dataObj.file_type === 1 ||
              dataObj.file_type === 4 ||
              raw.type === 'notes' ||
              raw.type === 'pdf' ||
              raw.type === 'document' ||
              primaryUrl.toLowerCase().includes('.pdf') ||
              /notes|dpp|worksheet|assignment|sample paper|formula/i.test(title);

            if (isPdf) {
              // ─── PDF RESOLUTION ───────────────────────────────────────
              // 1. Direct CloudFront URL returned by NextToppers when authenticated:
              let directPdfUrl = primaryUrl.toLowerCase().includes('.pdf') ? primaryUrl : null;

              // 2. Dynamic short link resolution if unauthenticated:
              const dynamicLink = dataObj.dynamic_link || (primaryUrl.includes('/dl/r/') ? primaryUrl : '');
              if (!directPdfUrl && dynamicLink) {
                directPdfUrl = dynamicLink;
              }

              items.push({
                id: itemId,
                title,
                type: 'pdf',
                url: directPdfUrl || dynamicLink || primaryUrl,
                rawFileUrl: directPdfUrl,
                courseId,
                contentId: itemId,
                needsResolve: !directPdfUrl,
                resolveUrl: `/api/resolve-pdf?contentId=${itemId}&courseId=${courseId}`,
                isLocked: dataObj.is_locked ?? 0,
              });
            } else {
              // ─── VIDEO RESOLUTION ─────────────────────────────────────
              let parsedDownloadUrls = [];
              if (dataObj.download_urls) {
                try {
                  const rawList = typeof dataObj.download_urls === 'string'
                    ? JSON.parse(dataObj.download_urls)
                    : dataObj.download_urls;
                  if (Array.isArray(rawList)) {
                    parsedDownloadUrls = rawList.map((u) => {
                      const rawTitle = String(u.title || '').trim();
                      const num = parseInt(rawTitle, 10);
                      const qLabel = !isNaN(num) && num > 0 ? `${num}p` : rawTitle;
                      return {
                        title: qLabel,
                        quality: !isNaN(num) && num > 0 ? num : 720,
                        url: u.url,
                      };
                    }).sort((a, b) => b.quality - a.quality);
                  }
                } catch (_) {}
              }

              if (dataObj.video_type === 1 || primaryUrl.includes('youtube') || primaryUrl.includes('youtu.be')) {
                // YouTube link extraction
                const m = primaryUrl.match(/(?:v=|\/vi\/|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})/);
                const ytId = m ? m[1] : null;
                primaryUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : primaryUrl;
              } else {
                // Best quality direct playable MP4 URL (720p, 480p, 360p)
                let bestMp4 = null;
                if (Array.isArray(parsedDownloadUrls) && parsedDownloadUrls.length > 0) {
                  bestMp4 = parsedDownloadUrls[0]?.url;
                }

                // CloudFront HLS (.m3u8) derivation from download_urls or native stream
                resolvedHlsUrl = deriveHlsStream(dataObj, primaryUrl);
                primaryUrl = bestMp4 || resolvedHlsUrl || primaryUrl;
              }

              items.push({
                id: itemId,
                title,
                type: 'video',
                url: primaryUrl,
                hlsUrl: resolvedHlsUrl,
                downloadUrls: parsedDownloadUrls,
                thumbnail: dataObj.thumbnail || null,
                duration: dataObj.duration || 0,
                courseId,
                isLocked: dataObj.is_locked ?? 0,
              });
            }
          }
        }

        // Parallel pre-resolution for any PDFs lacking direct CloudFront URL via Firebase flat index
        const unmappedPdfs = items.filter((it) => it.type === 'pdf' && (!it.rawFileUrl || !it.rawFileUrl.toLowerCase().includes('.pdf')));
        if (unmappedPdfs.length > 0) {
          await Promise.all(
            unmappedPdfs.map(async (pdfItem) => {
              try {
                const fbRes = await fetch(`${FIREBASE_DB_URL}/pdf_index/${encodeURIComponent(pdfItem.contentId)}.json`);
                if (fbRes.ok) {
                  const directUrl = await fbRes.json();
                  if (directUrl && typeof directUrl === 'string' && directUrl.includes('cloudfront.net')) {
                    pdfItem.url = directUrl;
                    pdfItem.rawFileUrl = directUrl;
                    pdfItem.needsResolve = false;
                    pdfItem.source = 'firebase_index';
                  }
                }

                // Tier 2 Fallback: NextHope Edge Gateway
                if (!pdfItem.rawFileUrl || !pdfItem.rawFileUrl.toLowerCase().includes('.pdf')) {
                  const nhUrl = await resolveNextHopeContent(pdfItem.contentId, courseId);
                  if (nhUrl) {
                    pdfItem.url = nhUrl;
                    pdfItem.rawFileUrl = nhUrl;
                    pdfItem.needsResolve = false;
                    pdfItem.source = 'nexthope_edge';
                    ctx.waitUntil(
                      fetch(`${FIREBASE_DB_URL}/pdf_index/${encodeURIComponent(pdfItem.contentId)}.json`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(nhUrl),
                      }).catch(() => {})
                    );
                  }
                }
              } catch (_) {}
            })
          );
        }

        const resultPayload = {
          success: true,
          courseId,
          folderId,
          folders,
          items,
          total: folders.length + items.length,
          timestamp: Date.now(),
        };

        return new Response(JSON.stringify(resultPayload), {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache'
          },
        });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // 5. On-Demand Dynamic PDF & Content Resolver (Self-Healing Pipeline): /api/resolve-pdf
    if (pathname === '/api/resolve-pdf') {
      const shortCode = url.searchParams.get('shortCode') || url.searchParams.get('code');
      const contentId = url.searchParams.get('contentId') || url.searchParams.get('content_id') || url.searchParams.get('id');
      const courseId = url.searchParams.get('courseId') || url.searchParams.get('course_id');

      if (!contentId && !shortCode) {
        return jsonResponse({ error: 'Missing parameters. Provide ?contentId=&courseId= or ?shortCode=' }, 400);
      }

      // Check Edge Cache for resolved PDF (7 days TTL)
      const cacheKey = new Request(url.toString(), request);
      const cache = caches.default;
      let cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const res = new Response(cachedResponse.body, cachedResponse);
        res.headers.set('X-Edge-Cache', 'HIT');
        return res;
      }

      let resolvedUrl = null;
      let source = 'none';

      // ─── TIER 1: Firebase RTDB Flat Index Check (/pdf_index/{contentId}.json) ───
      if (contentId) {
        try {
          const fbRes = await fetch(`${FIREBASE_DB_URL}/pdf_index/${encodeURIComponent(contentId)}.json`);
          if (fbRes.ok) {
            const fbUrl = await fbRes.json();
            if (fbUrl && typeof fbUrl === 'string' && fbUrl.includes('cloudfront.net') && fbUrl.toLowerCase().includes('.pdf')) {
              resolvedUrl = fbUrl;
              source = 'firebase_index';
            }
          }
        } catch (err) {
          console.warn('Firebase index lookup error:', err.message);
        }
      }

      // ─── TIER 2: Native NextToppers Dynamic Link (if shortCode available) ───
      if (!resolvedUrl && shortCode) {
        try {
          const auth = await getActiveAuthToken();
          const headers = {
            'Content-Type': 'application/json',
            'app_id': '1770981347',
            'platform': '3',
            'version': '1',
            'user_id': String(auth.userId),
            'extra_value': 'NEXT400',
          };
          if (auth.token) headers['authorization'] = `Bearer ${auth.token}`;

          const dlRes = await fetch(`${DYNAMIC_LINK_API}?short_code=${encodeURIComponent(shortCode)}`, { headers });
          if (dlRes.ok) {
            const dlJson = await dlRes.json();
            if (dlJson?.data?.file_url && dlJson.data.file_url.includes('cloudfront.net')) {
              resolvedUrl = dlJson.data.file_url;
              source = 'dynamic_link';
            }
          }
        } catch (err) {
          console.warn('Dynamic link resolution error:', err.message);
        }
      }

      // ─── TIER 3: NextHope High-Availability Edge Gateway (Zero Cold Starts) ───
      if (!resolvedUrl && contentId && courseId) {
        try {
          const nhUrl = await resolveNextHopeContent(contentId, courseId);
          if (nhUrl && nhUrl.includes('cloudfront.net')) {
            resolvedUrl = nhUrl;
            source = 'nexthope_edge';

            // ─── SELF-HEALING AUTO-SAVE: Write back single key to Firebase RTDB in background ───
            ctx.waitUntil(
              fetch(`${FIREBASE_DB_URL}/pdf_index/${encodeURIComponent(contentId)}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nhUrl),
              }).catch((e) => console.warn('Auto-save to Firebase failed:', e.message))
            );
          }
        } catch (err) {
          console.warn('NextHope resolver error:', err.message);
        }
      }

      // ─── TIER 4: Silent EduVibe Decryptor (WebCrypto AES-128 Emergency Fallback) ───
      if (!resolvedUrl && contentId && courseId) {
        try {
          const evUrl = await resolveEduVibeContent(contentId, courseId);
          if (evUrl && evUrl.includes('cloudfront.net')) {
            resolvedUrl = evUrl;
            source = 'eduvibe_decrypted';

            // ─── SELF-HEALING AUTO-SAVE: Write back single key to Firebase RTDB in background ───
            ctx.waitUntil(
              fetch(`${FIREBASE_DB_URL}/pdf_index/${encodeURIComponent(contentId)}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(evUrl),
              }).catch((e) => console.warn('Auto-save to Firebase failed:', e.message))
            );
          }
        } catch (err) {
          console.warn('Edge decryptor error:', err.message);
        }
      }

      if (resolvedUrl) {
        const payload = {
          success: true,
          contentId,
          courseId,
          url: resolvedUrl,
          source,
          timestamp: Date.now(),
        };

        const res = new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            // Edge Cache for 7 days, browser cache for 1 day
            'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
            'X-Edge-Cache': 'MISS',
          },
        });

        ctx.waitUntil(cache.put(cacheKey, res.clone()));
        return res;
      }

      return jsonResponse({ success: false, message: 'Could not resolve direct PDF URL' }, 404);
    }

    return jsonResponse({ error: 'Endpoint not found' }, 404);
  },
};

/**
 * Derives the live non-DRM CloudFront HLS (.m3u8) URL from download_urls or raw stream URL
 */
function deriveHlsStream(dataObj, fallbackUrl) {
  if (fallbackUrl && fallbackUrl.includes('.m3u8')) return fallbackUrl;

  const candidateUrls = [];
  const downloadUrls = dataObj?.download_urls;
  if (downloadUrls) {
    try {
      const urls = typeof downloadUrls === 'string' ? JSON.parse(downloadUrls) : downloadUrls;
      if (Array.isArray(urls)) {
        for (const u of urls) {
          if (u?.url) candidateUrls.push(u.url);
        }
      }
    } catch (_) {}
  }
  if (dataObj?.download_url) candidateUrls.push(dataObj.download_url);
  if (dataObj?.file_url) candidateUrls.push(dataObj.file_url);
  if (dataObj?.video_url) candidateUrls.push(dataObj.video_url);
  if (fallbackUrl) candidateUrls.push(fallbackUrl);

  for (const raw of candidateUrls) {
    if (typeof raw !== 'string') continue;
    if (raw.includes('.m3u8')) return raw;

    // 1. 3-segment download URL: /download/<vdcPrefix>/<midFolder>/<fileHash>[_quality][.mp4]
    const match3 = raw.match(
      /(?:file_library\/videos\/download|\/download\/)\/(\d+)\/[^/]+\/([0-9a-zA-Z_-]+?)(?:_(?:240|360|480|720|1080|auto))?(?:\.mp4)?$/i
    );
    if (match3) {
      const vdcPrefix = match3[1];
      const fileHash = match3[2];
      const suffix = fileHash.length >= 7 ? fileHash.slice(-7) : fileHash;
      return `https://dbil3go8szhu6.cloudfront.net/file_library/videos/channel_vod_non_drm_hls/${vdcPrefix}/${fileHash}/${fileHash}_${suffix}.m3u8`;
    }

    // 2. 2-segment download URL: /download/<vdcPrefix>/<fileHash>[_quality][.mp4]
    const match2 = raw.match(
      /(?:file_library\/videos\/download|\/download\/)\/(\d+)\/([0-9a-zA-Z_-]+?)(?:_(?:240|360|480|720|1080|auto))?(?:\.mp4)?$/i
    );
    if (match2) {
      const vdcPrefix = match2[1];
      const fileHash = match2[2];
      const suffix = fileHash.length >= 7 ? fileHash.slice(-7) : fileHash;
      return `https://dbil3go8szhu6.cloudfront.net/file_library/videos/channel_vod_non_drm_hls/${vdcPrefix}/${fileHash}/${fileHash}_${suffix}.m3u8`;
    }
  }

  return null;
}

/**
 * Retrieves the current student Bearer token from Firebase RTDB config with 30-min TTL
 */
async function getActiveAuthToken() {
  const now = Date.now();
  if (tokenCache.token && now - tokenCache.lastFetched < 30 * 60 * 1000) {
    return tokenCache;
  }

  try {
    const res = await fetch(`${FIREBASE_DB_URL}/config.json`);
    if (res.ok) {
      const cfg = await res.json();
      const token = cfg?.bearer_token_10 || cfg?.bearer_token || '';
      if (token) {
        tokenCache.token = token;
        tokenCache.userId = '1559161';
        tokenCache.lastFetched = now;
      }
    }
  } catch (_) {}

  return tokenCache;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Resolves content details (raw direct CloudFront PDF or video stream) via NextHope Edge Gateway
 * Used as high-availability Tier 2 fallback with pre-decrypted CloudFront URLs.
 */
async function resolveNextHopeContent(contentId, courseId) {
  if (!contentId || !courseId) return null;
  try {
    const url = `${NEXTHOPE_API}?courseId=${encodeURIComponent(courseId)}&contentId=${encodeURIComponent(contentId)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!res.ok) return null;

    const json = await res.json();
    if (json && json.success && json.decryptedData && json.decryptedData.file_url) {
      const fileUrl = json.decryptedData.file_url;
      if (fileUrl.includes('cloudfront.net')) {
        return fileUrl;
      }
    }
  } catch (err) {
    console.warn('resolveNextHopeContent error:', err.message);
  }
  return null;
}

/**
 * Resolves content details (raw direct CloudFront PDF or video stream) via EduVibe API
 * used as an emergency Tier 3 decryption fallback for unpurchased classes.
 */
async function resolveEduVibeContent(contentId, courseId) {
  if (!contentId || !courseId) return null;
  try {
    const url = `${EDUVIBE_BASE}/video-details?content_id=${encodeURIComponent(contentId)}&course_id=${encodeURIComponent(courseId)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!res.ok) return null;

    const json = await res.json();
    if (json && json.data) {
      if (typeof json.data === 'string') {
        const decrypted = await decryptEduVibePayload(json.data);
        return decrypted?.file_url || null;
      } else if (typeof json.data === 'object') {
        return json.data?.file_url || null;
      }
    }
  } catch (err) {
    console.warn('resolveEduVibeContent error:', err.message);
  }
  return null;
}

/**
 * Standard Web Crypto AES-128-CBC decryption for EduVibe payloads (Runs natively in V8 isolates)
 */
async function decryptEduVibePayload(base64Str) {
  try {
    const keyBuf = new TextEncoder().encode(EDUVIBE_AES_KEY);
    const ivBuf = new TextEncoder().encode(EDUVIBE_AES_IV);
    const cipherBytes = Uint8Array.from(atob(base64Str), (c) => c.charCodeAt(0));

    const cryptoKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'AES-CBC' }, false, ['decrypt']);
    const decryptedBuf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivBuf }, cryptoKey, cipherBytes);
    return JSON.parse(new TextDecoder().decode(decryptedBuf));
  } catch (err) {
    console.warn('decryptEduVibePayload error:', err.message);
    return null;
  }
}

