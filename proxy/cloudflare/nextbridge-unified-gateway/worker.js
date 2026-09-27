/**
 * ============================================================================
 * NextBridge — Unified Cloudflare Edge Gateway (V8 Isolates)
 * ============================================================================
 * 
 * Combines both NextToppers (NT) and Physics Wallah (PW) real-time gateways
 * into a single high-performance edge server.
 * 
 * Routes:
 *   /nt/...       -> NextToppers Engine (folder contents, real-time sync, PDF resolver)
 *   /pw/...       -> Physics Wallah Engine (batch data RPC, manifest rewriter, segment streamer, DRM)
 *   /api/...      -> Direct backward compatibility fallback (auto-dispatches to NT or PW)
 *   /manifest/... -> PW video stream manifest & segment proxy
 */

// ─── SHARED CONFIGURATION & CORS ──────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range, X-Requested-With, Origin, Accept, *',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, *',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

// ─── NEXTTOPPERS (NT) ENGINE CONFIGURATION ────────────────────────────────────

const NEXTTOPPERS_API = 'https://course.nexttoppers.com/course/all-content';
const DYNAMIC_LINK_API = 'https://course.nexttoppers.com/dl/dynamic-link';
const FIREBASE_DB_URL = 'https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app';
const NEXTHOPE_API = 'https://nt.nexthope.site/api/content-details';

// EduVibe AES Fallback Keys
const EDUVIBE_BASE = 'https://eduvibe-2tkn.onrender.com/nt';
const EDUVIBE_AES_KEY = 'Ch@tS3cr3tK3y!16';
const EDUVIBE_AES_IV = 'Ch@tIV#16Bytes!!';

// In-Worker memory cache for student Bearer token (refreshed every 30 minutes)
let tokenCache = {
  token: '',
  userId: '1559161',
  lastFetched: 0,
};

// ─── PHYSICS WALLAH (PW) ENGINE CONFIGURATION ─────────────────────────────────

const LX_ORIGIN = 'https://www.learnxpw.site';
const DEFAULT_CF_HOST = 'd1d34p8vz63oiq.cloudfront.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Known folder fallback signatures (when upstream API signature endpoint throttles)
const FALLBACK_SIGNATURES = {
  'a558fffd-9f3f-4334-ac96-50c13dd2cfc7':
    'Signature=jNepjtfmz52QXRhnbc6fpfUzjhRJrHDPwrRYYh9crNIgJvqy3cmNSfCiNsaiPmQEHFa6EJ8tKNBPlUufLmbSNugAsyFjW5yRJixcxLF0QWcjvEy~lUd9dPNXMZ0ZCGq7cCiOjxPn200yPolUMpQlfnzVTks3~cAFFiwUZS9dvZ5ssTOpmIJoDsuCqbvEqnYl1-JWIHuRfGO3sVAjl1Mm-cEbbavfCc5Lavgwa9YieCV~opvKuLW8HqEytkZE2yzjZkVEughljmlL-jFIonuSNUNZrhlRtg7aX31xjENZ4lRj2-EqGoXezLr4WDzTqilIHV9pZ~uWDrtlAqlD0efXGg__&Key-Pair-Id=APKAXVKMENFCRKTG5XE2&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9kMWQzNHA4dno2M29pcS5jbG91ZGZyb250Lm5ldC9hNTU4ZmZmZC05ZjNmLTQzMzQtYWM5Ni01MGMxM2RkMmNmYzcvKiIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc4ODcyNjMyN30sIkRhdGVHcmVhdGVyVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjo1NzY2ODAxMX19fV19',
  'dd3326fa-0ece-4bfe-8972-032cf2e46e04':
    'Signature=PRPN2G6cgfE7rk4sAaft2dq9fRbnrBdRvx2-jSdYvjQHcKml2yiV4g7sKE5Rgv86e13BlDX-xBkmS19SEpA-TV8Vg~YeT6sO-lEYLXkyU-KOq1XdJ2YUPMmrxbJYF4Db3yORDM23kGVc17o9QM5~5DapMH5OMB2z2c9AajcHQC7qZ~KF5TwgYM-~kmaM8WaztUKhLHBeZfmWN1dJCIWyshaNlyZm2s18vqFLT8KNCrfiGG414LNEdugx4ZsisLY5Uksozpr-knfd428syuZdARMpyUcmj4enndJMnpcARF2iUr-pEUfaSeX3kXC6j9E8JJSFqidsVPPBcMqxqRxWaw__&Key-Pair-Id=APKAXVKMENFCRKTG5XE2&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9kMWQzNHA4dno2M29pcS5jbG91ZGZyb250Lm5ldC9kZDMzMjZmYS0wZWNlLTRiZmUtODk3Mi0wMzJjZjJlNDZlMDQvKiIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc4OTU4OTU5OX0sIkRhdGVHcmVhdGVyVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNTc5ODk3NDA1fX19XX0_',
};

const PENPENCIL_GUEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M';

// ─── MAIN ROUTER & EVENT DISPATCHER ──────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // 2. Health & Status
      if (pathname === '/' || pathname === '/health') {
        const auth = await getActiveAuthToken();
        return jsonResponse({
          status: 'ok',
          service: 'NextBridge Unified Edge Gateway',
          edgeLocation: request.cf?.colo || 'EDGE',
          country: request.cf?.country || 'GLOBAL',
          modules: {
            nexttoppers: {
              prefix: '/nt',
              tokenActive: Boolean(auth.token),
              upstream: NEXTTOPPERS_API
            },
            physicswallah: {
              prefix: '/pw',
              upstream: LX_ORIGIN,
              features: ['CORS-Segment-Proxying', 'ClearKey-DRM', 'Direct-PDF-302', 'Zero-Cache-Real-Time']
            }
          },
          timestamp: Date.now()
        });
      }

      // 3. Route by explicit prefix: /nt/...
      if (pathname.startsWith('/nt/') || pathname === '/nt') {
        const subPath = pathname.replace(/^\/nt/, '') || '/';
        return routeNt(subPath, url, request, env, ctx);
      }

      // 4. Route by explicit prefix: /pw/...
      if (pathname.startsWith('/pw/') || pathname === '/pw') {
        const subPath = pathname.replace(/^\/pw/, '') || '/';
        return routePw(subPath, url, request, env, ctx, '/pw');
      }

      // 5. Direct / Legacy Fallback Routes (Unprefixed compatibility)
      // PW Manifest Rewriting and Segment Streaming
      if (pathname.startsWith('/manifest/')) {
        return handlePwManifest(url, request, env, ctx, '');
      }

      // PW Data RPC
      if (pathname === '/api/data' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        return handlePwDataRpc(body, request, env, ctx, '');
      }

      // PW Segment Relay
      if (pathname.startsWith('/api/pw/')) {
        return handlePwRelay(pathname, url, request);
      }

      // PW PDF Redirection
      if (pathname === '/api/lxpdf') {
        return handlePwPdfRedirect(url);
      }

      // PW Batch Catalog & Search
      if (pathname === '/api/AllBatches' || pathname === '/api/searchBatch') {
        const targetUrl = `${LX_ORIGIN}${pathname}${url.search}`;
        return fetchUpstream(targetUrl, { ttl: 300 });
      }

      // PW ClearKey OTP
      if (pathname === '/api/get-otp') {
        const kid = url.searchParams.get('kid');
        if (!kid) return jsonResponse({ success: false, error: 'kid is required' }, 400);
        return fetchUpstream(`${LX_ORIGIN}/api/get-otp?kid=${encodeURIComponent(kid)}`, { ttl: 86400 });
      }

      // NT Folder Exploration
      if (pathname === '/api/folder' || pathname === '/api/content') {
        return handleNtFolder(url, request, env, ctx);
      }

      // NT PDF Resolver
      if (pathname === '/api/resolve-pdf') {
        return handleNtResolvePdf(url, request, env, ctx);
      }

      // Universal Wildcard CORS Proxy
      if (pathname === '/api/proxy') {
        return handleUniversalProxy(url, request);
      }

      return jsonResponse({ error: `Endpoint not found: ${pathname}` }, 404);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message || 'Internal Edge Error' }, 500);
    }
  }
};

// ─── NEXTTOPPERS (NT) ROUTE DISPATCHER ─────────────────────────────────────────

async function routeNt(subPath, url, request, env, ctx) {
  if (subPath === '/' || subPath === '/health') {
    const auth = await getActiveAuthToken();
    return jsonResponse({
      status: 'ok',
      service: 'NextBridge NextToppers Module',
      region: request.cf?.colo || 'EDGE',
      tokenActive: Boolean(auth.token),
    });
  }

  if (subPath === '/api/folder' || subPath === '/api/content') {
    return handleNtFolder(url, request, env, ctx);
  }

  if (subPath === '/api/resolve-pdf') {
    return handleNtResolvePdf(url, request, env, ctx);
  }

  if (subPath === '/api/proxy') {
    return handleUniversalProxy(url, request);
  }

  return jsonResponse({ error: `NT endpoint not found: ${subPath}` }, 404);
}

// ─── PHYSICS WALLAH (PW) ROUTE DISPATCHER ─────────────────────────────────────

async function routePw(subPath, url, request, env, ctx, prefix = '/pw') {
  if (subPath === '/' || subPath === '/health') {
    return jsonResponse({
      status: 'ok',
      service: 'NextBridge Physics Wallah Module',
      region: request.cf?.colo || 'EDGE',
      upstream: LX_ORIGIN,
    });
  }

  if (subPath === '/api/data' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    return handlePwDataRpc(body, request, env, ctx, prefix);
  }

  if (subPath.startsWith('/manifest/')) {
    return handlePwManifest(url, request, env, ctx, prefix);
  }

  if (subPath.startsWith('/api/pw/')) {
    return handlePwRelay(subPath, url, request);
  }

  if (subPath === '/api/lxpdf') {
    return handlePwPdfRedirect(url);
  }

  if (subPath === '/api/AllBatches' || subPath === '/api/searchBatch') {
    const targetUrl = `${LX_ORIGIN}${subPath}${url.search}`;
    return fetchUpstream(targetUrl, { ttl: 300 });
  }

  if (subPath === '/api/get-otp') {
    const kid = url.searchParams.get('kid');
    if (!kid) return jsonResponse({ success: false, error: 'kid is required' }, 400);
    return fetchUpstream(`${LX_ORIGIN}/api/get-otp?kid=${encodeURIComponent(kid)}`, { ttl: 86400 });
  }

  if (subPath === '/api/proxy') {
    return handleUniversalProxy(url, request);
  }

  return jsonResponse({ error: `PW endpoint not found: ${subPath}` }, 404);
}

// ─── NEXTTOPPERS HANDLERS ─────────────────────────────────────────────────────

async function handleNtFolder(url, request, env, ctx) {
  const courseId = url.searchParams.get('courseId') || url.searchParams.get('course_id');
  const folderId = url.searchParams.get('folderId') || url.searchParams.get('folder_id') || '0';
  const parentCourseId = url.searchParams.get('parentCourseId') || '0';
  const page = url.searchParams.get('page') || '1';
  const limit = url.searchParams.get('limit') || '200';

  if (!courseId) {
    return jsonResponse({ success: false, error: 'Missing courseId parameter' }, 400);
  }

  try {
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
          let directPdfUrl = primaryUrl.toLowerCase().includes('.pdf') ? primaryUrl : null;
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
            isLocked: dataObj.is_locked ?? 0,
            needsResolve: !directPdfUrl || !directPdfUrl.toLowerCase().includes('.pdf'),
          });
        } else {
          let parsedDownloadUrls = null;
          if (dataObj.download_urls) {
            try {
              parsedDownloadUrls = typeof dataObj.download_urls === 'string'
                ? JSON.parse(dataObj.download_urls)
                : dataObj.download_urls;
            } catch (_) {}
          }

          const isYouTube =
            primaryUrl.includes('youtube.com') ||
            primaryUrl.includes('youtu.be') ||
            dataObj.video_type === 2;

          if (isYouTube) {
            const m = primaryUrl.match(/(?:v=|\/vi\/|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})/);
            const ytId = m ? m[1] : null;
            primaryUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : primaryUrl;
          } else {
            let bestMp4 = null;
            if (Array.isArray(parsedDownloadUrls) && parsedDownloadUrls.length > 0) {
              bestMp4 = parsedDownloadUrls[0]?.url;
            }
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
        'Pragma': 'no-cache',
      },
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleNtResolvePdf(url, request, env, ctx) {
  const shortCode = url.searchParams.get('shortCode') || url.searchParams.get('code');
  const contentId = url.searchParams.get('contentId') || url.searchParams.get('content_id') || url.searchParams.get('id');
  const courseId = url.searchParams.get('courseId') || url.searchParams.get('course_id');

  if (!contentId && !shortCode) {
    return jsonResponse({ error: 'Missing parameters. Provide ?contentId=&courseId= or ?shortCode=' }, 400);
  }

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

  // Tier 1: Firebase RTDB flat index
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
    } catch (_) {}
  }

  // Tier 2: Dynamic link
  if (!resolvedUrl && shortCode) {
    try {
      const auth = await getActiveAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        'app_id': '1770981347',
        'platform': '3',
        'version': '1',
        'extra_value': 'NEXT400',
      };
      if (auth.token) headers['authorization'] = `Bearer ${auth.token}`;

      const dlRes = await fetch(DYNAMIC_LINK_API, {
        method: 'POST',
        headers,
        body: JSON.stringify({ link: shortCode }),
      });

      if (dlRes.ok) {
        const dlData = await dlRes.json();
        const extracted = dlData?.data?.url || dlData?.data?.file_url;
        if (extracted && extracted.includes('cloudfront.net') && extracted.toLowerCase().includes('.pdf')) {
          resolvedUrl = extracted;
          source = 'dynamic_link';
        }
      }
    } catch (_) {}
  }

  // Tier 3: NextHope Edge Gateway
  if (!resolvedUrl && contentId && courseId) {
    const nhUrl = await resolveNextHopeContent(contentId, courseId);
    if (nhUrl) {
      resolvedUrl = nhUrl;
      source = 'nexthope_edge';
    }
  }

  // Tier 4: EduVibe AES Decryptor
  if (!resolvedUrl && contentId && courseId) {
    try {
      const evUrl = await resolveEduVibeContent(contentId, courseId);
      if (evUrl && evUrl.includes('cloudfront.net')) {
        resolvedUrl = evUrl;
        source = 'eduvibe_aes';
      }
    } catch (_) {}
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
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
        'X-Edge-Cache': 'MISS',
      },
    });

    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  return jsonResponse({ success: false, message: 'Could not resolve direct PDF URL' }, 404);
}

// ─── PHYSICS WALLAH (PW) HANDLERS ─────────────────────────────────────────────

async function fetchDirect(targetUrl, options = {}) {
  const reqHeaders = new Headers(options.headers || {});
  reqHeaders.set('User-Agent', UA);
  reqHeaders.set('Origin', LX_ORIGIN);
  reqHeaders.set('Referer', `${LX_ORIGIN}/study/batches`);
  return fetch(targetUrl, {
    method: options.method || 'GET',
    headers: reqHeaders,
    body: options.body
  });
}

async function handlePwDataRpc(body, request, env, ctx, prefix = '') {
  try {
    const action = String(body.action || '').trim();
    const rawParams = (body.params && typeof body.params === 'object') ? body.params : {};
    const params = { ...body, ...rawParams };

    switch (action) {
    case 'pw_btch_dtl': {
      const batchId = String(params.batchId || params.batch_id || '').trim();
      if (!batchId) return jsonResponse({ success: false, error: 'batchId required' }, 400);

      const targetUrl = `${LX_ORIGIN}/api/BatchInfo?BatchId=${encodeURIComponent(batchId)}&Type=details`;
      const res = await fetchDirect(targetUrl);
      if (!res.ok) return jsonResponse({ success: false, error: 'Batch not found' }, res.status);

      const json = await res.json();
      const d = json?.data;
      if (!d) return jsonResponse({ success: false, error: 'Invalid batch response' }, 502);

      const exams = Array.isArray(d.exam)
        ? d.exam.map(e => (typeof e === 'string' ? e : e?.name || '')).filter(Boolean)
        : [];
      const subjects = Array.isArray(d.subjects) ? d.subjects : [];

      return jsonResponse({
        success: true,
        data: {
          _id: d._id || batchId,
          id: d.slug || batchId,
          name: d.name || 'Batch',
          byName: d.byName || '',
          description: typeof d.description === 'string' ? d.description : '',
          imageUrl: d.previewImage || d.previewImageUrl || '',
          exams,
          language: d.language || '',
          className: typeof d.class === 'string' ? d.class : Array.isArray(d.class) ? d.class.join(', ') : '',
          amount: typeof d.feeTotal === 'number' ? d.feeTotal : null,
          startDate: d.startDate || '',
          endDate: d.endDate || '',
          subjects: subjects.map(s => ({
            _id: s.slug || s.subjectId || s._id || '',
            subject: s.subject || '',
            subjectId: s.slug || s.subjectId || '',
            batchSubjectId: s._id || '',
            masterId: s.subjectId || ''
          }))
        }
      });
    }

    case 'pw_sub_topics': {
      const batchId = String(params.batchId || params.batch_id || '').trim();
      const subjectId = String(params.subjectId || params.subject_id || '').trim();
      const page = Math.max(1, Number(params.page) || 1);
      if (!batchId || !subjectId) return jsonResponse({ success: true, data: { data: [] } });

      const targetUrl = `${LX_ORIGIN}/api/SubjectInfo?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&page=${page}`;
      const res = await fetchDirect(targetUrl);
      if (!res.ok) return jsonResponse({ success: true, data: { data: [] } });

      const json = await res.json();
      const chapters = Array.isArray(json?.data) ? json.data : [];
      const data = chapters.map((c, i) => ({
        _id: c._id || '',
        name: c.name || 'Chapter',
        typeId: subjectId,
        notes: Number(c.notes || 0),
        videos: Number(c.videos || c.lectureVideos || 0),
        exercises: Number(c.exercises || 0),
        order: Number.isFinite(c.displayOrder) ? Number(c.displayOrder) : (i + 1)
      }));

      return jsonResponse({ success: true, data: { data } });
    }

    case 'pw_res_topics': {
      return jsonResponse({ success: true, data: { data: [] } });
    }

    case 'pw_sch_cntnt': {
      const batchId = String(params.batchId || params.batch_id || '').trim();
      const subjectId = String(params.subjectId || params.subject_id || '').trim();
      const tagId = String(params.tagId || params.tag_id || params.topicId || params.topic_id || '').trim();
      const contentType = String(params.contentType || params.cntnt_type || 'LECTURE').toUpperCase();
      const page = Math.max(1, Number(params.page) || 1);

      if (!batchId || !subjectId || !tagId) {
        return jsonResponse({ success: true, data: [] });
      }

      let upstreamType = 'videos';
      if (contentType === 'NOTES') upstreamType = 'notes';
      else if (contentType === 'DPP_PDF') upstreamType = 'DppNotes';
      else if (contentType === 'DPP_VIDEOS') upstreamType = 'DppVideos';

      const targetUrl = `${LX_ORIGIN}/api/TopicInfo?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&TopicId=${encodeURIComponent(tagId)}&ContentType=${upstreamType}&page=${page}`;
      const res = await fetchDirect(targetUrl);
      if (!res.ok) return jsonResponse({ success: true, data: [] });

      const json = await res.json();
      const rawItems = Array.isArray(json?.data) ? json.data : [];

      const nodes = rawItems.map(item => {
        const id = item._id || '';
        const vd = item.videoDetails;

        let homeworkIds = [];
        if (Array.isArray(item.homeworkIds)) {
          homeworkIds = item.homeworkIds;
        } else if (item.dpp?.homeworkIds) {
          homeworkIds = item.dpp.homeworkIds;
        }

        if (homeworkIds.length > 0) {
          homeworkIds = homeworkIds.map(hw => ({
            ...hw,
            attachmentIds: (hw.attachmentIds || []).map(att => {
              let direct = '';
              if (att.baseUrl && att.key) {
                direct = `${att.baseUrl.replace(/\/+$/, '')}/${att.key.replace(/^\/+/, '')}`;
              } else if (att.baseUrl && att.baseUrl.includes('.pdf')) {
                direct = att.baseUrl;
              } else if (att.url && att.url.includes('.pdf')) {
                direct = att.url;
              }
              return {
                _id: att._id || '',
                baseUrl: direct || `${prefix}/api/lxpdf?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&pdfId=${encodeURIComponent(id)}&attachmentId=${encodeURIComponent(att._id || '')}`,
                key: att.key || '',
                name: att.name || hw.topic || 'Document'
              };
            })
          }));
        }

        return {
          _id: id,
          data: {
            _id: id,
            topic: item.topic || item.name || (contentType === 'NOTES' ? 'Class Notes' : 'Lecture'),
            date: item.date || item.startTime || '',
            startTime: item.startTime || '',
            endTime: item.endTime || '',
            videoDetails: vd ? {
              _id: vd._id || vd.id || id,
              name: vd.name || item.topic || '',
              image: vd.image || item.previewImageUrl || '',
              duration: vd.duration || '00:00:00',
              status: vd.status || 'Ready',
              types: vd.types || ['DASH', 'HLS']
            } : null,
            homeworkIds,
            attachmentIds: item.attachmentIds || []
          }
        };
      });

      return jsonResponse({ success: true, data: nodes });
    }

    case 'pw_sch_dtl': {
      const batchId = String(params.batchId || params.batch_id || '').trim();
      const scheduleId = String(params.scheduleId || params.schedule_id || params.contentId || params.content_id || '').trim();
      const subjectId = String(params.subjectId || params.subject_id || '').trim();
      if (!batchId || !scheduleId || !subjectId) return jsonResponse({ success: true, data: null });

      const targetUrl = `${LX_ORIGIN}/api/Schedule?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&ContentId=${encodeURIComponent(scheduleId)}`;
      const res = await fetchDirect(targetUrl);
      if (!res.ok) return jsonResponse({ success: true, data: null });

      const json = await res.json();
      const detail = json?.data;
      if (!detail) return jsonResponse({ success: true, data: null });

      const rawHw = [...(detail.homeworkIds || []), ...(detail.dpp?.homeworkIds || [])];
      const homeworkIds = rawHw.map(hw => ({
        _id: hw._id || '',
        topic: hw.topic || 'Class Note',
        attachmentIds: (hw.attachmentIds || []).map(att => {
          let direct = '';
          if (att.baseUrl && att.key) {
            direct = `${att.baseUrl.replace(/\/+$/, '')}/${att.key.replace(/^\/+/, '')}`;
          } else if (att.baseUrl && att.baseUrl.includes('.pdf')) {
            direct = att.baseUrl;
          } else if (att.url && att.url.includes('.pdf')) {
            direct = att.url;
          }
          return {
            _id: att._id || '',
            baseUrl: direct || `${prefix}/api/lxpdf?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&pdfId=${encodeURIComponent(detail._id || scheduleId)}&attachmentId=${encodeURIComponent(att._id || '')}`,
            key: att.key || ''
          };
        })
      }));

      return jsonResponse({
        success: true,
        data: {
          _id: detail._id || scheduleId,
          topic: detail.topic || detail.name || '',
          startTime: detail.startTime || '',
          endTime: detail.endTime || '',
          urlType: detail.urlType || '',
          homeworkIds,
          exerciseIds: []
        }
      });
    }

    case 'pw_dpp_lst': {
      const batchId = String(params.batchId || '').trim();
      const batchSubjectId = String(params.batchSubjectId || '').trim();
      const chapterId = String(params.chapterId || '').trim();
      const page = Math.max(1, Number(params.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));

      if (!batchId || !batchSubjectId || !chapterId) {
        return jsonResponse({ success: true, data: { data: [] } });
      }

      const targetUrl = `${LX_ORIGIN}/api/dpp-list?batchId=${encodeURIComponent(batchId)}&batchSubjectId=${encodeURIComponent(batchSubjectId)}&chapterId=${encodeURIComponent(chapterId)}&page=${page}&limit=${limit}`;
      const res = await fetchDirect(targetUrl);
      if (!res.ok) return jsonResponse({ success: true, data: { data: [] } });

      const json = await res.json();
      const items = Array.isArray(json?.data) ? json.data : [];
      const data = items.map(it => {
        const q = it.dppQuizDetails;
        const t = q?.test;
        if (!t?._id) return null;
        return {
          _id: t._id,
          name: t.name || 'DPP Quiz',
          totalQuestions: Number(t.totalQuestions || 0),
          totalMarks: Number(t.totalMarks || 0),
          duration: (Number(t.maxDuration || 0) * 60) || 1800,
          testActivityStatus: 'Not Started',
          testStudentMapping: null,
          dppQuizDetails: {
            contentId: q?.contentId || t._id,
            scheduleId: q?.scheduleId || '',
            test: {
              _id: t._id,
              name: t.name || 'DPP Quiz',
              totalQuestions: Number(t.totalQuestions || 0),
              totalMarks: Number(t.totalMarks || 0)
            },
            testStudentMapping: { testActivityStatus: q?.tag || 'Start' }
          }
        };
      }).filter(Boolean);

      return jsonResponse({ success: true, data: { data } });
    }

    case 'pw_tdy_sch': {
      const batchId = String(params.batchId || '').trim();
      if (!batchId) return jsonResponse({ success: true, data: [] });

      const res = await fetch(`${LX_ORIGIN}/api/todays-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Origin': LX_ORIGIN, 'Referer': `${LX_ORIGIN}/study/batches` },
        body: JSON.stringify({ batchId })
      }).catch(() => null);

      if (!res || !res.ok) return jsonResponse({ success: true, data: [] });
      const json = await res.json().catch(() => ({}));
      const items = Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.data) ? json.data.data : [];
      return jsonResponse({ success: true, data: items });
    }

    case 'pw_notifs': {
      const batchId = String(params.batchId || '').trim();
      const page = Math.max(1, Number(params.page) || 1);
      if (!batchId) return jsonResponse({ success: true, data: [] });

      const targetUrl = `${LX_ORIGIN}/api/BatchInfo?BatchId=${encodeURIComponent(batchId)}&Type=announcement&page=${page}`;
      const res = await fetchDirect(targetUrl);
      if (!res.ok) return jsonResponse({ success: true, data: [] });
      const json = await res.json();
      return jsonResponse({ success: true, data: Array.isArray(json?.data) ? json.data : [] });
    }

    case 'pw_tchr_dtl': {
      return jsonResponse({ success: true, data: null });
    }

    case 'parcham_vid': {
      return handleParchamVid(params, request, prefix);
    }

    default:
      return jsonResponse({ success: false, error: `Unknown RPC action: ${action}` }, 400);
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message || 'Internal action error' }, 500);
  }
}

async function handleParchamVid(params, request, prefix = '') {
  const childId = String(params.childId || '').trim();
  const videoId = String(params.videoId || '').trim();
  const vUrl = String(params.vUrl || '').trim();
  const batchId = String(params.batchId || '').trim();
  const subjectId = String(params.subjectId || '').trim();

  const targetId = childId || videoId;
  if (!targetId && !vUrl) {
    return jsonResponse({ success: false, error: 'childId or videoId required' }, 400);
  }

  // Tier 1: Query LearnxPW for signed video URL
  let videoInfo = null;
  const idsToTry = [childId, videoId].filter(Boolean);

  for (const cid of idsToTry) {
    if (videoInfo?.url) break;
    try {
      const lxRes = await fetch(`${LX_ORIGIN}/api/video-url?batch_id=${encodeURIComponent(batchId)}&subject_id=${encodeURIComponent(subjectId)}&video_id=${encodeURIComponent(cid)}`, {
        headers: { 'User-Agent': UA, 'Origin': LX_ORIGIN, 'Referer': `${LX_ORIGIN}/study/batches` }
      });
      if (lxRes.ok) {
        const body = await lxRes.json();
        if (body?.success && body?.data?.url) {
          videoInfo = body.data;
          break;
        }
      }
    } catch (_) {}

    // Tier 1b: Try get-video-url
    if (!videoInfo?.url) {
      try {
        const lxRes2 = await fetch(`${LX_ORIGIN}/api/get-video-url?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&childId=${encodeURIComponent(cid)}`, {
          headers: { 'User-Agent': UA, 'Origin': LX_ORIGIN, 'Referer': `${LX_ORIGIN}/study/batches` }
        });
        if (lxRes2.ok) {
          const body = await lxRes2.json();
          if (body?.data?.url) {
            videoInfo = body.data;
            break;
          }
        }
      } catch (_) {}
    }

    // Tier 2 Fallback: Query PenPencil / StudySpark with guest JWT
    if (!videoInfo?.url) {
      try {
        const nsRes = await fetch(`https://api.studyspark.study/api/penpencil/v1/videos/${encodeURIComponent(cid)}`, {
          headers: {
            'Authorization': `Bearer ${PENPENCIL_GUEST_TOKEN}`,
            'client-type': 'WEB',
            'User-Agent': UA
          }
        });
        if (nsRes.ok) {
          const body = await nsRes.json();
          if (body?.success && body?.data?.videoUrl) {
            videoInfo = { url: body.data.videoUrl, signedUrl: '' };
            break;
          }
        }
      } catch (_) {}
    }
  }

  // Tier 3: If vUrl was passed directly from schedule item
  if (!videoInfo?.url && vUrl && (vUrl.includes('.mpd') || vUrl.includes('.m3u8'))) {
    videoInfo = { url: vUrl, signedUrl: '' };
  }

  if (!videoInfo?.url) {
    return jsonResponse({
      success: false,
      error: 'Lecture stream is currently gated or unavailable.'
    }, 404);
  }

  const rawUrl = videoInfo.url;
  const folder = extractFolder(rawUrl);
  const host = extractHost(rawUrl) || DEFAULT_CF_HOST;
  let signedQuery = videoInfo.signedUrl || '';

  // If no signed query was returned from API, check fallback constants
  if (!signedQuery && folder && FALLBACK_SIGNATURES[folder]) {
    signedQuery = FALLBACK_SIGNATURES[folder];
  }

  // Clean signed query format
  if (signedQuery && !signedQuery.startsWith('?')) {
    signedQuery = `?${signedQuery}`;
  }

  // Resolve ClearKeys from master.mpd if available
  let clearKeys = null;
  if (rawUrl.includes('.mpd')) {
    try {
      const probeUrl = `https://${host}/${folder}/master.mpd${signedQuery}`;
      const probeRes = await fetch(probeUrl, {
        headers: { 'User-Agent': UA }
      });
      if (probeRes.ok) {
        const mpdText = await probeRes.text();
        const kidMatch = mpdText.match(/default_KID="([0-9a-fA-F-]+)"/);
        if (kidMatch) {
          const kid = kidMatch[1];
          const otpRes = await fetch(`${LX_ORIGIN}/api/get-otp?kid=${encodeURIComponent(kid)}`, {
            headers: { 'User-Agent': UA }
          });
          if (otpRes.ok) {
            const otpJson = await otpRes.json();
            if (otpJson?.clearKeys) {
              clearKeys = otpJson.clearKeys;
            }
          }
        }
      }
    } catch (_) {}
  }

  // Build the Smart Direct-CloudFront Manifest URL
  const sigParam = signedQuery ? encodeURIComponent(signedQuery.replace(/^\?/, '')) : '';
  const manifestPath = `/manifest/${folder}/master.mpd?sig=${sigParam}&host=${encodeURIComponent(host)}`;

  return jsonResponse({
    success: true,
    data: {
      kind: 'dash',
      url: manifestPath,
      clearKeys,
      poster: '',
      drmDetails: null
    }
  });
}

/**
 * CORS-Safe Manifest Rewriter & Segment Proxy:
 *
 * PW's CloudFront distribution does NOT return Access-Control-Allow-Origin
 * headers on media segments, so Shaka Player cannot read segment data when
 * fetched cross-origin from the browser. All segments MUST route through
 * this worker which adds CORS headers on every response.
 *
 * Flow:
 *   1. Master MPD is fetched from CloudFront, rewritten so <BaseURL> points
 *      back to this worker (/manifest/:folder/), and CloudFront signature
 *      params are injected into SegmentTemplate initialization/media attrs.
 *   2. When Shaka Player requests each segment (init.mp4, 1.mp4, etc.),
 *      the request hits this worker → worker strips its own params, fetches
 *      from CloudFront, and returns with CORS + Range headers.
 */

async function handlePwManifest(url, request, env, ctx, prefix = '') {
  const parts = url.pathname.split('/').filter(Boolean);
  // Pattern: [prefix, 'manifest', :folder, ...] or ['manifest', :folder, ...]
  const manifestIdx = parts.indexOf('manifest');
  const folder = parts[manifestIdx + 1];
  if (!folder) return jsonResponse({ error: 'Folder required' }, 400);

  const assetParts = parts.slice(manifestIdx + 2);
  const assetPath = assetParts.join('/');

  const host = url.searchParams.get('host') || DEFAULT_CF_HOST;
  const rawSig = url.searchParams.get('sig') || '';
  let sigQuery = rawSig ? (rawSig.startsWith('?') ? rawSig : `?${decodeURIComponent(rawSig)}`) : '';

  if (!sigQuery && url.searchParams.has('Signature')) {
    const cfParams = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
      if (k !== 'sig' && k !== 'host') cfParams.set(k, v);
    }
    sigQuery = cfParams.toString() ? `?${cfParams.toString()}` : '';
  }

  if (!sigQuery && FALLBACK_SIGNATURES[folder]) {
    sigQuery = `?${FALLBACK_SIGNATURES[folder]}`;
  }

  // 1. Media Segment Proxying (init.mp4, 1.mp4, chunk.m4s, .ts, etc.)
  if (assetPath && !assetPath.endsWith('.mpd') && !assetPath.endsWith('.m3u8')) {
    const cfParams = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
      if (k !== 'sig' && k !== 'host') cfParams.set(k, v);
    }
    let cfQuery = cfParams.toString() ? `?${cfParams.toString()}` : '';
    if (!cfQuery && sigQuery) cfQuery = sigQuery;

    const targetAssetUrl = `https://${host}/${folder}/${assetPath}${cfQuery}`;

    const forwardHeaders = new Headers();
    forwardHeaders.set('User-Agent', UA);
    const range = request.headers.get('range');
    if (range) forwardHeaders.set('range', range);

    const assetRes = await fetch(targetAssetUrl, { headers: forwardHeaders });
    const responseHeaders = new Headers(assetRes.headers);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => responseHeaders.set(k, v));
    responseHeaders.set('Cache-Control', 'public, max-age=86400');

    return new Response(assetRes.body, {
      status: assetRes.status,
      headers: responseHeaders
    });
  }

  // 2. MPD Manifest Rewriting
  const upstreamMpdUrl = `https://${host}/${folder}/master.mpd${sigQuery}`;
  const upstreamRes = await fetch(upstreamMpdUrl, {
    headers: { 'User-Agent': UA }
  });

  if (!upstreamRes.ok) {
    return new Response(`Upstream CloudFront error: ${upstreamRes.status}`, {
      status: upstreamRes.status,
      headers: CORS_HEADERS
    });
  }

  let text = await upstreamRes.text();
  text = text.replace(/<BaseURL[\s\S]*?<\/BaseURL>/gi, '');

  const workerBase = `${url.origin}${prefix}/manifest/${folder}/`;
  if (/<MPD[^>]*>/i.test(text)) {
    text = text.replace(/(<MPD[^>]*>)/i, `$1\n  <BaseURL>${workerBase}</BaseURL>`);
  } else {
    text = `<BaseURL>${workerBase}</BaseURL>\n` + text;
  }

  if (sigQuery) {
    const qClean = sigQuery.replace(/^\?/, '');
    const hostParam = host !== DEFAULT_CF_HOST ? `&host=${encodeURIComponent(host)}` : '';
    text = text.replace(/initialization="([^"?]+)"/g, (_m, p1) => `initialization="${p1}?${qClean}${hostParam}"`);
    text = text.replace(/media="([^"?]+)"/g, (_m, p1) => `media="${p1}?${qClean}${hostParam}"`);
    text = text.replace(/sourceURL="([^"?]+)"/g, (_m, p1) => `sourceURL="${p1}?${qClean}${hostParam}"`);
  }

  return new Response(text, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/dash+xml',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}

async function handlePwRelay(path, url, request) {
  const parts = path.split('/').filter(Boolean);
  let host = DEFAULT_CF_HOST;
  let cursor = 0;
  const pwIdx = parts.indexOf('pw');
  cursor = pwIdx + 1;

  if (parts[cursor] === 'h' && parts[cursor + 1]) {
    host = decodeURIComponent(parts[cursor + 1]);
    cursor += 2;
  }

  const folder = parts[cursor];
  cursor++;
  let sig = '';
  if (parts[cursor] === 's' && parts[cursor + 1]) {
    sig = parts[cursor + 1];
    cursor += 2;
  }

  const assetParts = parts.slice(cursor);
  const assetPath = assetParts.join('/');
  if (!folder || !assetPath) return jsonResponse({ error: 'Invalid relay URL format' }, 400);

  let cfQuery = '';
  if (sig) {
    try {
      const decoded = atob(sig.replace(/-/g, '+').replace(/_/g, '/'));
      cfQuery = decoded.startsWith('?') ? decoded : `?${decoded}`;
    } catch (_) {}
  }
  if (!cfQuery && FALLBACK_SIGNATURES[folder]) {
    cfQuery = `?${FALLBACK_SIGNATURES[folder]}`;
  }

  const targetUrl = `https://${host}/${folder}/${assetPath}${cfQuery}`;
  const fwdHeaders = new Headers();
  fwdHeaders.set('User-Agent', UA);
  const range = request.headers.get('range');
  if (range) fwdHeaders.set('range', range);

  const res = await fetch(targetUrl, { headers: fwdHeaders });
  const outHeaders = new Headers(res.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => outHeaders.set(k, v));
  outHeaders.set('Cache-Control', 'public, max-age=86400');

  return new Response(res.body, { status: res.status, headers: outHeaders });
}

async function handlePwPdfRedirect(url) {
  const batchId = url.searchParams.get('batchId') || '';
  const subjectId = url.searchParams.get('subjectId') || '';
  const pdfId = url.searchParams.get('pdfId') || '';
  const attachmentId = url.searchParams.get('attachmentId') || '';

  if (!batchId || !subjectId || !pdfId || !attachmentId) {
    return jsonResponse({ success: false, error: 'Missing parameters' }, 400);
  }

  try {
    const lxRes = await fetch(`${LX_ORIGIN}/api/GetPdf?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&PdfId=${encodeURIComponent(pdfId)}&AttachmentId=${encodeURIComponent(attachmentId)}`, {
      headers: { 'User-Agent': UA, 'Origin': LX_ORIGIN, 'Referer': `${LX_ORIGIN}/study/batches` }
    });

    if (lxRes.ok) {
      const body = await lxRes.json();
      const d = body?.data;
      if (d?.baseUrl && d?.key) {
        const fullUrl = `${d.baseUrl.replace(/\/+$/, '')}/${d.key.replace(/^\/+/, '')}`;
        return new Response(null, { status: 302, headers: { ...CORS_HEADERS, 'Location': fullUrl } });
      }
    }
  } catch (_) {}

  return jsonResponse({ success: false, error: 'PDF not available' }, 404);
}

// ─── UNIVERSAL WILDCARD CORS PROXY ───────────────────────────────────────────

async function handleUniversalProxy(url, request) {
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) return jsonResponse({ error: 'Missing ?url= query parameter' }, 400);

  try {
    const proxyRes = await fetch(targetUrl, {
      method: request.method,
      headers: { 'User-Agent': UA },
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

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

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

    const match3 = raw.match(
      /(?:file_library\/videos\/download|\/download\/)\/(\d+)\/[^/]+\/([0-9a-zA-Z_-]+?)(?:_(?:240|360|480|720|1080|auto))?(?:\.mp4)?$/i
    );
    if (match3) {
      const vdcPrefix = match3[1];
      const fileHash = match3[2];
      const suffix = fileHash.length >= 7 ? fileHash.slice(-7) : fileHash;
      return `https://dbil3go8szhu6.cloudfront.net/file_library/videos/channel_vod_non_drm_hls/${vdcPrefix}/${fileHash}/${fileHash}_${suffix}.m3u8`;
    }

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

async function resolveNextHopeContent(contentId, courseId) {
  if (!contentId || !courseId) return null;
  try {
    const url = `${NEXTHOPE_API}?courseId=${encodeURIComponent(courseId)}&contentId=${encodeURIComponent(contentId)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.success && json.decryptedData?.file_url?.includes('cloudfront.net')) {
      return json.decryptedData.file_url;
    }
  } catch (_) {}
  return null;
}

async function resolveEduVibeContent(contentId, courseId) {
  if (!contentId || !courseId) return null;
  try {
    const url = `${EDUVIBE_BASE}/video-details?content_id=${encodeURIComponent(contentId)}&course_id=${encodeURIComponent(courseId)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
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
  } catch (_) {}
  return null;
}

async function decryptEduVibePayload(base64Str) {
  try {
    const keyBuf = new TextEncoder().encode(EDUVIBE_AES_KEY);
    const ivBuf = new TextEncoder().encode(EDUVIBE_AES_IV);
    const cipherBytes = Uint8Array.from(atob(base64Str), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'AES-CBC' }, false, ['decrypt']);
    const decryptedBuf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: ivBuf }, cryptoKey, cipherBytes);
    return JSON.parse(new TextDecoder().decode(decryptedBuf));
  } catch (_) {
    return null;
  }
}

function parseMpdDrm(text) {
  const kidMatch = text.match(/default_KID="([0-9a-fA-F-]{32,36})"/i);
  if (kidMatch) return kidMatch[1];
  const cencMatch = text.match(/<cenc:pssh[^>]*>([a-zA-Z0-9+/=]+)<\/cenc:pssh>/i);
  if (cencMatch) {
    try {
      const raw = atob(cencMatch[1]);
      if (raw.length >= 32) {
        const kidBytes = raw.slice(12, 28);
        return Array.from(kidBytes).map(b => b.charCodeAt(0).toString(16).padStart(2, '0')).join('');
      }
    } catch (_) {}
  }
  return null;
}

async function fetchUpstream(targetUrl, { ttl = 300 } = {}) {
  const reqHeaders = {
    'User-Agent': UA,
    'Origin': LX_ORIGIN,
    'Referer': `${LX_ORIGIN}/study/batches`
  };
  const res = await fetch(targetUrl, { headers: reqHeaders });
  const headers = new Headers(res.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return new Response(res.body, { status: res.status, headers });
}

function extractFolder(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] || '';
  } catch {
    return '';
  }
}

function extractHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

