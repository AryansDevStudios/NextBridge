/**
 * NextBridge — Physics Wallah (PW) Live API Service
 * Fetches batches, subjects, chapters, lectures, and stream manifests on demand
 * from NextHope gateway without requiring a local database or custom server.
 */

const PW_GATEWAYS = [
  'https://nextbridgeapi.adsbackend01.workers.dev',
  'https://nextbridgeapi.adsbackend04.workers.dev',
  'https://nextbridgeapi.adsbackend05.workers.dev',
  'https://nextbridge-pw-gateway.adsbackend01.workers.dev',
  'https://nextbridgeapi.adsbackend02.workers.dev',
  'https://nextbridgeapi.adsbackend03.workers.dev',
  'https://nextbridgeapi.adsbackend06.workers.dev',
  'https://nexthope-pw.space-z.ai'
];

const FIREBASE_DB_URL = 'https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app';
const batchCache = new Map();

async function getCachedBatchData(batchId) {
  if (!batchId) return null;
  const cleanId = String(batchId).trim();
  if (batchCache.has(cleanId)) return batchCache.get(cleanId);

  const candidateKeys = [cleanId, cleanId.replace(/^batch_/, '')];
  for (const k of candidateKeys) {
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/nexthope_batches/batch_${encodeURIComponent(k)}.json`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.subjects) && data.subjects.length > 0) {
          batchCache.set(cleanId, data);
          return data;
        }
      }
    } catch (_) {}
  }
  return null;
}

// Active base URL defaults to our high-speed unified Cloudflare Edge Gateway
let activeBaseUrl = PW_GATEWAYS[0];

export function getPwBaseUrl() {
  return activeBaseUrl;
}

/**
 * Checks if a CloudFront signed URL contains an expired DateLessThan policy epoch.
 */
export function isCloudFrontSignatureExpired(url) {
  if (!url || typeof url !== 'string') return false;
  const match = url.match(/Policy=([A-Za-z0-9_~-]+)/);
  if (!match) return false;
  try {
    const b64 = match[1].replace(/-/g, '+').replace(/~/g, '/').replace(/_/g, '=');
    const jsonStr = atob(b64);
    const policy = JSON.parse(jsonStr);
    const dateLessThan = policy?.Statement?.[0]?.Condition?.DateLessThan?.['AWS:EpochTime'];
    if (dateLessThan && typeof dateLessThan === 'number') {
      return (dateLessThan * 1000) <= (Date.now() + 60000);
    }
  } catch (_) {}
  return false;
}

// In-memory cache for ultra-fast navigation
const memoryCache = new Map();

async function callRpc(action, params = {}, method = 'GET', payload = null) {
  const cacheKey = `${action}:${JSON.stringify(params)}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  const gateways = [activeBaseUrl, ...PW_GATEWAYS.filter(g => g !== activeBaseUrl)];
  let lastError = null;

  for (const baseUrl of gateways) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

      const endpoint = baseUrl.includes('nextbridgeapi') ? `${baseUrl}/pw/api/data` : `${baseUrl}/api/data`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({ action, params, method, payload })
      });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!json.success && json.error) {
        throw new Error(json.error);
      }

      // Success! Keep active base URL sticky
      activeBaseUrl = baseUrl;
      memoryCache.set(cacheKey, json.data);
      return json.data;
    } catch (err) {
      lastError = err;
      console.warn(`[pwApiService] Gateway ${baseUrl} (${action}) failed: ${err.message}. Retrying fallback...`);
    }
  }

  throw new Error(`PW API Error: ${lastError?.message || 'All gateways unreachable'}`);
}

async function patchFirebaseChapterItems(batchId, subjectId, chapterId, updatedItems) {
  try {
    const cached = await getCachedBatchData(batchId);
    if (!cached || !Array.isArray(cached.subjects)) return;

    const sIdx = cached.subjects.findIndex(s => 
      String(s.subjectId || s.id) === String(subjectId) ||
      String(s.subject_name || s.name || '').toLowerCase() === String(subjectId).toLowerCase()
    );
    if (sIdx === -1) return;

    const fIdx = (cached.subjects[sIdx].folders || []).findIndex(f => String(f.id) === String(chapterId));
    if (fIdx === -1) return;

    // Update in memory cache
    cached.subjects[sIdx].folders[fIdx].items = updatedItems;
    batchCache.set(String(batchId), cached);

    // Update in Firebase RTDB asynchronously
    const candidateKeys = [String(batchId), String(batchId).replace(/^batch_/, '')];
    for (const k of candidateKeys) {
      fetch(`${FIREBASE_DB_URL}/nexthope_batches/batch_${encodeURIComponent(k)}/subjects/${sIdx}/folders/${fIdx}/items.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedItems)
      }).catch(() => {});
    }
  } catch (_) {}
}

export function clearPwApiCaches() {
  batchCache.clear();
  memoryCache.clear();
}

export const pwApiService = {
  clearCaches() {
    clearPwApiCaches();
  },

  getPwBaseUrl() {
    return getPwBaseUrl();
  },

  /**
   * Fetch today's live/scheduled lectures on demand
   */
  async getTodaysSchedule(batchId) {
    try {
      const data = await callRpc('pw_tdy_sch', { batchId });
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.data)) return data.data;
      return [];
    } catch (_) {
      return [];
    }
  },

  /**
   * Fetch batch detail & all subjects
   */
  async getBatchSubjects(batchId) {
    // 1. Try Firebase RTDB pre-cached batch tree first
    const cachedBatch = await getCachedBatchData(batchId);
    if (cachedBatch && Array.isArray(cachedBatch.subjects) && cachedBatch.subjects.length > 0) {
      return cachedBatch.subjects.map(sub => ({
        id: sub.subjectId || sub.id,
        subject_id: sub.subjectId || sub.id,
        subject_name: sub.subject_name || sub.name || sub.title,
        batchSubjectId: sub.batchSubjectId,
        masterId: sub.masterId,
        batchId,
        isRootSubject: true,
        isDynamicPw: true,
        itemCount: `${sub.folders?.length || 0} Chapters`
      }));
    }

    // 2. Fallback to live RPC
    const data = await callRpc('pw_btch_dtl', { batchId });
    if (!data || !data.subjects) return [];

    return data.subjects.map((sub) => ({
      id: sub._id || sub.subjectId,
      subject_id: sub.subjectId,
      subject_name: sub.subject || sub.name || sub.subjectId,
      batchSubjectId: sub.batchSubjectId,
      masterId: sub.masterId,
      batchId,
      isRootSubject: true,
      isDynamicPw: true,
      itemCount: 'Units & Lectures'
    }));
  },

  /**
   * Fetch chapters/units for a subject
   */
  async getSubjectChapters(batchId, subject) {
    const subjectId = typeof subject === 'string' ? subject : (subject.subjectId || subject.subject_id);
    const masterId = subject.masterId;
    const batchSubjectId = subject.batchSubjectId;

    // 1. Try Firebase RTDB pre-cached folders
    const cachedBatch = await getCachedBatchData(batchId);
    if (cachedBatch && Array.isArray(cachedBatch.subjects)) {
      const sObj = cachedBatch.subjects.find(s => 
        String(s.subjectId || s.id) === String(subjectId) ||
        String(s.subject_name || s.name || '').toLowerCase() === String(subject.subject_name || subject.subject || subject.name || '').toLowerCase()
      );
      if (sObj && Array.isArray(sObj.folders) && sObj.folders.length > 0) {
        return sObj.folders.map((u, idx) => {
          const orderNum = u.order || (idx + 1);
          const chPill = `CH - ${String(orderNum).padStart(2, '0')}`;
          const smPill = `SM - ${String(orderNum).padStart(2, '0')}`;
          const vids = (u.items || []).filter(it => it.type === 'video').length;
          const notes = (u.items || []).filter(it => it.type === 'pdf').length;

          return {
            id: u.id,
            title: u.title || u.name,
            isFolder: true,
            isDynamicPwFolder: true,
            batchId,
            subjectId,
            masterId,
            batchSubjectId,
            chapterId: u.id,
            order: orderNum,
            chPill,
            smPill,
            videos: vids,
            dpp: 0,
            notes: notes,
            itemCount: `Lectures: ${vids} • Notes: ${notes}`
          };
        });
      }
    }

    // 2. Fallback to live RPC
    const data = await callRpc('pw_sub_topics', {
      batchId,
      subjectId,
      tagType: 'UNITS',
      page: 1,
      limit: 100
    });

    const units = Array.isArray(data) ? data : (data?.data || []);
    return units.map((u, idx) => {
      const orderNum = u.order || (idx + 1);
      const chPill = `CH - ${String(orderNum).padStart(2, '0')}`;
      const smPill = `SM - ${String(orderNum).padStart(2, '0')}`;
      const vids = u.videos || 0;
      const dpp = u.exercises || 0;
      const notes = u.notes || 0;

      return {
        id: u._id,
        title: u.name,
        isFolder: true,
        isDynamicPwFolder: true,
        batchId,
        subjectId,
        masterId,
        batchSubjectId,
        chapterId: u._id,
        order: orderNum,
        chPill,
        smPill,
        videos: vids,
        dpp: dpp,
        notes: notes,
        itemCount: `Lectures: ${vids} • DPP: ${dpp} • Notes: ${notes}`
      };
    });
  },

  /**
   * Fetch lectures, DPPs, and notes for a chapter with Stale-While-Revalidate (SWR) support.
   * Instantly serves cached items, and revalidates upstream in the background, pushing
   * new items into state and Firebase RTDB in real time (<1s).
   */
  async getChapterItems(batchId, subject, chapterId, folderTitle = '', options = {}) {
    const subjectId = typeof subject === 'string' ? subject : (subject.subjectId || subject.subject_id);
    const masterId = subject.masterId;
    const { onLiveUpdate, forceLive } = (typeof options === 'object' && options !== null) ? options : {};

    // Helper to safely resolve attachment URLs from PW responses
    const isFullPdfUrl = (u) => {
      if (!u || typeof u !== 'string') return false;
      const stripped = u.replace(/^https?:\/\/static\.pw\.live\/?/, '').trim();
      return stripped.length > 5 && (stripped.includes('.pdf') || stripped.includes('/'));
    };

    const resolveAttachmentPdfUrl = (d) => {
      const homework = d.homeworkIds?.[0];
      const attach = homework?.attachmentIds?.[0] || d.attachmentIds?.[0];
      let rawUrl = '';
      if (attach?.baseUrl && attach?.key) {
        rawUrl = `${attach.baseUrl.replace(/\/+$/, '')}/${attach.key.replace(/^\/+/, '')}`;
      } else if (attach?.baseUrl && isFullPdfUrl(attach.baseUrl)) {
        rawUrl = attach.baseUrl;
      } else if (attach?.url && isFullPdfUrl(attach.url)) {
        rawUrl = attach.url;
      } else if (d.fileUrl && isFullPdfUrl(d.fileUrl)) {
        rawUrl = d.fileUrl;
      } else if (attach?.baseUrl && attach.baseUrl.includes('/api/lxpdf')) {
        rawUrl = attach.baseUrl;
      }
      if (!rawUrl) return '';
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${activeBaseUrl}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
      return toProxiedPdfUrl(fullUrl);
    };

    // Live RPC Fetcher
    const fetchLiveItems = async () => {
      const [lecturesRes, notesRes, dppPdfRes] = await Promise.allSettled([
        callRpc('pw_sch_cntnt', { batchId, subjectId, tagId: chapterId, contentType: 'LECTURE', skip: 0, limit: 100 }),
        callRpc('pw_sch_cntnt', { batchId, subjectId, tagId: chapterId, contentType: 'NOTES', skip: 0, limit: 100 }),
        callRpc('pw_sch_cntnt', { batchId, subjectId, tagId: chapterId, contentType: 'DPP_PDF', skip: 0, limit: 100 })
      ]);

      const extractArray = (resVal) => {
        if (!resVal) return [];
        if (Array.isArray(resVal)) return resVal;
        if (Array.isArray(resVal.data)) return resVal.data;
        if (Array.isArray(resVal.data?.data)) return resVal.data.data;
        return [];
      };

      const lecturesList = lecturesRes.status === 'fulfilled' ? extractArray(lecturesRes.value) : [];
      const notesList = notesRes.status === 'fulfilled' ? extractArray(notesRes.value) : [];
      const dppPdfList = dppPdfRes.status === 'fulfilled' ? extractArray(dppPdfRes.value) : [];

      const items = [];

      const formatDateStr = (dateVal) => {
        if (!dateVal) return '';
        try {
          return new Date(dateVal).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch (_) {
          return '';
        }
      };

      // Parse Lectures
      lecturesList.forEach(item => {
        const d = item.data || {};
        let durationSecs = 0;
        if (d.videoDetails?.duration) {
          const parts = String(d.videoDetails.duration).split(':').map(Number);
          if (parts.length === 3) durationSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else if (parts.length === 2) durationSecs = parts[0] * 60 + parts[1];
        }

        items.push({
          id: item._id || d._id,
          title: d.topic || 'Video Lecture',
          type: 'video',
          subCategory: 'LECTURE',
          badgeText: 'VIDEO',
          isDynamicPw: true,
          batchId,
          subjectId,
          masterId,
          scheduleId: item._id || d._id,
          videoId: d.videoDetails?._id || d.videoDetails?.id || '',
          vUrl: d.url || d.videoDetails?.videoUrl || '',
          folder_path: folderTitle,
          thumbnail: d.videoDetails?.image || '',
          duration: durationSecs,
          dateStr: formatDateStr(d.date),
          created_at: d.date ? new Date(d.date).getTime() / 1000 : 0,
          subject_name: subject.subject_name || subject.subject || 'Physics'
        });
      });

      // Parse Notes
      notesList.forEach(item => {
        const d = item.data || {};
        const homework = d.homeworkIds?.[0];
        const attach = homework?.attachmentIds?.[0] || d.attachmentIds?.[0];
        const pdfUrl = resolveAttachmentPdfUrl(d);
        const cleanScheduleId = item._id || d._id;

        items.push({
          id: item._id ? `pdf_${item._id}` : `pdf_${Math.random()}`,
          title: d.topic || homework?.topic || 'Class Notes',
          type: 'pdf',
          subCategory: 'NOTES',
          badgeText: 'NOTES',
          isDynamicPw: true,
          batchId,
          subjectId,
          scheduleId: cleanScheduleId,
          attachmentId: attach?._id || '',
          url: pdfUrl,
          raw_file_url: pdfUrl,
          folder_path: folderTitle,
          dateStr: formatDateStr(d.date),
          created_at: d.date ? new Date(d.date).getTime() / 1000 : 0,
          subject_name: subject.subject_name || subject.subject || 'Physics'
        });
      });

      // Parse DPP PDFs
      dppPdfList.forEach(item => {
        const d = item.data || {};
        const homework = d.homeworkIds?.[0];
        const attach = homework?.attachmentIds?.[0] || d.attachmentIds?.[0];
        const pdfUrl = resolveAttachmentPdfUrl(d);
        const cleanScheduleId = item._id || d._id;

        items.push({
          id: item._id ? `dpp_${item._id}` : `dpp_${Math.random()}`,
          title: d.topic || homework?.topic || 'Daily Practice Problem (DPP)',
          type: 'pdf',
          subCategory: 'DPP_PDF',
          badgeText: 'DPP PDF',
          isDynamicPw: true,
          batchId,
          subjectId,
          scheduleId: cleanScheduleId,
          attachmentId: attach?._id || '',
          url: pdfUrl,
          raw_file_url: pdfUrl,
          folder_path: folderTitle,
          dateStr: formatDateStr(d.date),
          created_at: d.date ? new Date(d.date).getTime() / 1000 : 0,
          subject_name: subject.subject_name || subject.subject || 'Physics'
        });
      });

      return items;
    };

    // 1. Try Firebase RTDB pre-cached items
    let cachedItems = null;
    if (!forceLive) {
      const cachedBatch = await getCachedBatchData(batchId);
      if (cachedBatch && Array.isArray(cachedBatch.subjects)) {
        const sObj = cachedBatch.subjects.find(s => 
          String(s.subjectId || s.id) === String(subjectId) ||
          String(s.subject_name || s.name || '').toLowerCase() === String(subject.subject_name || subject.subject || subject.name || '').toLowerCase()
        );
        if (sObj && Array.isArray(sObj.folders)) {
          const fObj = sObj.folders.find(f => String(f.id) === String(chapterId) || String(f.title) === String(folderTitle));
            cachedItems = fObj.items.map(it => {
              let itemUrl = it.url || '';
              if (itemUrl.startsWith('/manifest/') || itemUrl.startsWith('/pw/manifest/')) {
                itemUrl = `${activeBaseUrl}${itemUrl}`;
              }
              // If the CloudFront signature in the cached stream is expired, clear it so it triggers fresh on-demand resolution
              if (isCloudFrontSignatureExpired(itemUrl) || isCloudFrontSignatureExpired(it.stream_url)) {
                itemUrl = '';
              }
              return {
                ...it,
                url: itemUrl,
                folder_path: folderTitle || it.folder_path,
                subject_name: subject.subject_name || subject.subject || it.subject_name
              };
            });
        }
      }
    }

    // 2. Stale-While-Revalidate Trigger
    if (cachedItems && !forceLive) {
      if (typeof onLiveUpdate === 'function') {
        // Asynchronously check live edge worker without delaying the UI render
        setTimeout(async () => {
          try {
            const liveItems = await fetchLiveItems();
            if (liveItems && liveItems.length > 0) {
              const cachedIds = new Set(cachedItems.map(it => String(it.id || it.scheduleId)));
              const newArrivals = liveItems.filter(it => !cachedIds.has(String(it.id || it.scheduleId)));
              if (newArrivals.length > 0) {
                newArrivals.forEach(it => { it.isNewlyUploaded = true; });

                // Instantly resolve stream URLs and DRM ClearKeys for any newly discovered lectures BEFORE saving
                await Promise.allSettled(newArrivals.map(async (item) => {
                  if (item.type === 'video') {
                    try {
                      const streamRes = await callRpc('parcham_vid', {
                        batchId: item.batchId || batchId,
                        subjectId: item.masterId || item.subjectId || subjectId,
                        childId: item.scheduleId || item.id,
                        videoId: item.videoId || '',
                        vUrl: item.vUrl || item.url || ''
                      });
                      if (streamRes && streamRes.url) {
                        item.url = streamRes.url;
                        item.stream_url = streamRes.url;
                        item.video_url = streamRes.url;
                        item.clear_keys = streamRes.clearKeys || null;
                        item.clearKeys = streamRes.clearKeys || null;
                        item.has_keys = Boolean(streamRes.clearKeys && Object.keys(streamRes.clearKeys).length > 0);
                        item.isPreResolved = true;
                      }
                    } catch (_) {}
                  }
                }));

                const merged = [...newArrivals, ...cachedItems];
                onLiveUpdate(merged, newArrivals);
                // Patch cloud database in background with fully resolved streams and DRM keys
                patchFirebaseChapterItems(batchId, subjectId, chapterId, merged);

                // Log discovery to Firebase RTDB audit log
                fetch(`${FIREBASE_DB_URL}/pw_sync_logs/${Date.now()}.json`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    timestamp: Date.now(),
                    type: 'new_lectures_detected',
                    batchId,
                    subjectId,
                    chapterId,
                    chapterTitle: folderTitle,
                    count: newArrivals.length,
                    lectures: newArrivals.filter(i => i.type === 'video').map(i => ({
                      id: i.id,
                      title: i.title,
                      hasKeys: Boolean(i.has_keys)
                    }))
                  })
                }).catch(() => {});
              }
            }
          } catch (_) {}
        }, 50);
      }
      return cachedItems;
    }

    // 3. Fallback to live RPC
    return fetchLiveItems();
  },

  /**
   * Resolves the direct static.pw.live PDF URL for any PW note/DPP item.
   * Uses pw_sch_dtl to query the live database for direct attachment URLs,
   * avoiding flaky /api/lxpdf serverless timeouts and 404s.
   * Wraps the result in toProxiedPdfUrl to avoid browser CORS blocks.
   */
  async resolvePdfUrl(item) {
    if (!item) return '';

    const isFullPdfUrl = (u) => {
      if (!u || typeof u !== 'string') return false;
      const stripped = u.replace(/^https?:\/\/static\.pw\.live\/?/, '').trim();
      return stripped.length > 5 && (stripped.includes('.pdf') || stripped.includes('/'));
    };

    // If item already has a verified direct static.pw.live URL or already proxied
    if (item.directPdfUrl && isFullPdfUrl(item.directPdfUrl)) {
      return toProxiedPdfUrl(item.directPdfUrl);
    }
    if (item.url && isFullPdfUrl(item.url)) {
      return toProxiedPdfUrl(item.url);
    }

    const batchId = item.batchId;
    const subjectId = item.subjectId;
    const scheduleId = item.scheduleId || (typeof item.id === 'string' ? item.id.replace(/^(pdf_|dpp_)/, '') : '');
    const attachId = item.attachmentId;

    const cacheKey = `pdf_url:${batchId}:${scheduleId}:${attachId || 'default'}`;
    if (memoryCache.has(cacheKey)) {
      return memoryCache.get(cacheKey);
    }

    // 1. Primary method: pw_sch_dtl (fastest direct database lookup with 100% reliability)
    if (batchId && scheduleId && subjectId) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const detail = await callRpc('pw_sch_dtl', { batchId, scheduleId, subjectId });
          if (detail && Array.isArray(detail.homeworkIds)) {
            let matchedUrl = '';
            for (const hw of detail.homeworkIds) {
              if (Array.isArray(hw.attachmentIds)) {
                for (const att of hw.attachmentIds) {
                  // Prefer exact attachmentId match if known
                  if (attachId && att._id === attachId && att.baseUrl) {
                    matchedUrl = att.baseUrl;
                    break;
                  }
                  // Otherwise pick first valid PDF url
                  if (!matchedUrl && att.baseUrl && att.baseUrl.includes('.pdf')) {
                    matchedUrl = att.baseUrl;
                  }
                }
              }
              if (matchedUrl && attachId) break;
            }

            if (matchedUrl) {
              const proxied = toProxiedPdfUrl(matchedUrl);
              item.directPdfUrl = matchedUrl;
              memoryCache.set(cacheKey, proxied);
              return proxied;
            }
          }
        } catch (err) {
          console.warn(`[pwApiService] pw_sch_dtl attempt ${attempt} failed:`, err.message);
          if (attempt < 2) await new Promise(r => setTimeout(r, 400));
        }
      }
    }

    // 2. Secondary fallback: If item.url points to /api/lxpdf, try resolving the 302 redirect
    if (item.url && item.url.includes('/api/lxpdf')) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(item.url, { redirect: 'manual' });
          if (res.status === 302 || res.status === 301) {
            const loc = res.headers.get('location');
            if (loc) {
              const proxied = toProxiedPdfUrl(loc);
              item.directPdfUrl = loc;
              memoryCache.set(cacheKey, proxied);
              return proxied;
            }
          } else if (res.ok && res.url && res.url.includes('static.pw.live')) {
            const proxied = toProxiedPdfUrl(res.url);
            memoryCache.set(cacheKey, proxied);
            return proxied;
          }
        } catch (err) {
          console.warn(`[pwApiService] lxpdf fallback attempt ${attempt} failed:`, err.message);
        }
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }

    // 3. Final fallback: return original url through proxy if applicable
    const fallback = toProxiedPdfUrl(item.url || '');
    if (fallback) memoryCache.set(cacheKey, fallback);
    return fallback;
  },

  /**
   * Fetch video manifest URL and ClearKeys on the fly
   */
  async getVideoPlaybackInfo(batchIdOrItem, scheduleId, masterId, videoId = '', vUrl = '') {
    let bId = batchIdOrItem;
    let sId = scheduleId;
    let mId = masterId;
    let vId = videoId;
    let directUrl = vUrl;

    if (typeof batchIdOrItem === 'object' && batchIdOrItem !== null) {
      const it = batchIdOrItem;
      // Instant return if stream & keys are already pre-resolved in Firebase RTDB AND signature is not expired
      const directStream = it.stream_url || it.video_url;
      if (
        directStream &&
        !isCloudFrontSignatureExpired(directStream) &&
        (directStream.includes('.mpd') || directStream.includes('.m3u8') || directStream.includes('.mp4'))
      ) {
        const manifestUrl = directStream.startsWith('http') ? directStream : `${activeBaseUrl}${directStream.startsWith('/') ? '' : '/'}${directStream}`;
        return {
          manifestUrl,
          clearKeys: it.clear_keys || it.clearKeys || null,
          kind: directStream.includes('.mpd') ? 'dash' : 'hls'
        };
      }
      bId = it.batchId;
      sId = it.scheduleId || it.id;
      mId = it.masterId;
      vId = it.videoId || '';
      directUrl = it.vUrl || it.url || '';
    }

    const data = await callRpc('parcham_vid', {
      childId: sId,
      batchId: bId,
      subjectId: mId,
      videoId: vId,
      vUrl: directUrl
    });

    if (!data || !data.url) {
      throw new Error('Video stream is currently unavailable');
    }

    const manifestUrl = data.url.startsWith('http') ? data.url : `${activeBaseUrl}${data.url.startsWith('/') ? '' : '/'}${data.url}`;

    return {
      manifestUrl,
      clearKeys: data.clearKeys || null,
      kind: data.kind || 'dash'
    };
  }
};

/**
 * Transforms any static.pw.live URL into a CORS-safe proxied URL using our
 * high-performance Cloudflare Edge Gateway (Tier 1) as primary.
 */
export function toProxiedPdfUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const stripped = url.replace(/^https?:\/\/static\.pw\.live\/?/, '').trim();
  if (url.includes('static.pw.live') && stripped.length < 5) {
    return ''; // Never proxy bare domain
  }
  // If already proxied via Cloudflare, Netlify, or Render, return as is
  if (
    url.includes('workers.dev/api/proxy') ||
    url.includes('corsproxy-bppd.onrender.com') ||
    url.startsWith('/api/pw-static') ||
    url.includes('/api/pw-static/')
  ) {
    return url;
  }

  if (url.includes('static.pw.live')) {
    // Tier 1 Primary: Cloudflare Edge Worker Proxy (adsbackend01...06)
    const baseUrl = activeBaseUrl.includes('workers.dev') ? activeBaseUrl : 'https://nextbridgeapi.adsbackend01.workers.dev';
    return `${baseUrl}/api/proxy?url=${encodeURIComponent(url)}`;
  }

  return url;
}

/**
 * Generates an ordered waterfall array of proxy candidate URLs according to priority:
 * Tier 1: Cloudflare Edge Workers (adsbackend01 through adsbackend06)
 * Tier 2: Netlify Edge Reverse Proxy CDN (/api/pw-static/...)
 * Tier 3: Render Proxy (corsproxy-bppd.onrender.com)
 * Tier 4: Backup Archive Proxy & Direct Fallback
 */
export function getPdfProxyCandidates(url) {
  if (!url || typeof url !== 'string') return [];
  const rawUrl = url.trim();

  // Extract clean target URL if already wrapped in a proxy
  let targetUrl = rawUrl;
  if (
    targetUrl.includes('corsproxy-bppd.onrender.com') ||
    targetUrl.includes('/api/proxy?url=') ||
    targetUrl.includes('/proxy/pdf?url=')
  ) {
    try {
      const parsed = new URL(targetUrl);
      const inner = parsed.searchParams.get('url');
      if (inner) targetUrl = inner;
    } catch (_) {}
  }

  const encodedTarget = encodeURIComponent(targetUrl);
  const candidates = [];

  // Direct access first if already a CORS-friendly domain (e.g. AWS CloudFront)
  if (targetUrl.includes('cloudfront.net')) {
    candidates.push(targetUrl);
  }

  // ─── TIER 1: Cloudflare Edge Workers Cluster (adsbackend01 to adsbackend06) ───
  const cfWorkers = [
    'https://nextbridgeapi.adsbackend01.workers.dev',
    'https://nextbridgeapi.adsbackend02.workers.dev',
    'https://nextbridgeapi.adsbackend03.workers.dev',
    'https://nextbridgeapi.adsbackend04.workers.dev',
    'https://nextbridgeapi.adsbackend05.workers.dev',
    'https://nextbridgeapi.adsbackend06.workers.dev',
    'https://nextbridge-pw-gateway.adsbackend01.workers.dev'
  ];

  for (const gw of cfWorkers) {
    candidates.push(`${gw}/api/proxy?url=${encodedTarget}`);
  }

  // Also include direct Cloudflare lxpdf handler if available
  if (targetUrl.includes('static.pw.live')) {
    candidates.push(`https://nextbridgeapi.adsbackend01.workers.dev/api/lxpdf/${encodedTarget}`);
  }

  // ─── TIER 2: Netlify Edge Reverse Proxy CDN ───
  if (targetUrl.includes('static.pw.live')) {
    const relativePath = targetUrl.replace(/^https?:\/\/static\.pw\.live\/?/, '').trim();
    if (relativePath && relativePath.length > 4) {
      const isNative = typeof window !== 'undefined' && (
        window.Capacitor?.isNativePlatform?.() ||
        window.location.protocol === 'capacitor:' ||
        window.location.protocol === 'ionic:'
      );
      if (isNative) {
        candidates.push(`https://nextbridgeweb.netlify.app/api/pw-static/${relativePath}`);
      } else {
        const origin = (typeof window !== 'undefined' && window.location.origin) ? window.location.origin : '';
        if (origin) candidates.push(`${origin}/api/pw-static/${relativePath}`);
        candidates.push(`https://nextbridgeweb.netlify.app/api/pw-static/${relativePath}`);
      }
    }
  }

  // ─── TIER 3: Render Proxy ───
  candidates.push(`https://corsproxy-bppd.onrender.com/proxy?url=${encodedTarget}`);

  // ─── TIER 4: Backup Render Archive Proxy & Direct Fallback ───
  candidates.push(`https://nxttoppers-archive.onrender.com/api/proxy/pdf?url=${encodedTarget}`);
  candidates.push(targetUrl);

  // Return unique, valid candidate list
  return Array.from(new Set(candidates.filter(Boolean)));
}

/**
 * Returns Netlify edge proxy URL for a given static.pw.live URL or Render proxy URL.
 * Used as reliable instant fallback if needed.
 */
export function getNetlifyFallbackPdfUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let targetUrl = url;

  if (url.includes('corsproxy-bppd.onrender.com') || url.includes('/api/proxy?url=')) {
    try {
      const parsed = new URL(url);
      targetUrl = parsed.searchParams.get('url') || url;
    } catch (_) {}
  }

  if (targetUrl.includes('static.pw.live')) {
    const relativePath = targetUrl.replace(/^https?:\/\/static\.pw\.live\/?/, '').trim();
    if (!relativePath || relativePath.length < 5) return '';

    const isNative = typeof window !== 'undefined' && (
      window.Capacitor?.isNativePlatform?.() ||
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'ionic:'
    );

    if (isNative) {
      return `https://nextbridgeweb.netlify.app/api/pw-static/${relativePath}`;
    }

    const origin = (typeof window !== 'undefined' && window.location.origin) ? window.location.origin : '';
    return `${origin}/api/pw-static/${relativePath}`;
  }

  return targetUrl;
}
