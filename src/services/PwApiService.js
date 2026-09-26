/**
 * NextBridge — Physics Wallah (PW) Live API Service
 * Fetches batches, subjects, chapters, lectures, and stream manifests on demand
 * from NextHope gateway without requiring a local database or custom server.
 */

const PW_BASE_URL = 'https://nexthope-pw.space-z.ai';

// In-memory cache for ultra-fast navigation
const memoryCache = new Map();

async function callRpc(action, params = {}, method = 'GET', payload = null) {
  const cacheKey = `${action}:${JSON.stringify(params)}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  const res = await fetch(`${PW_BASE_URL}/api/data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, params, method, payload })
  });

  if (!res.ok) {
    throw new Error(`PW API returned HTTP ${res.status}`);
  }

  const json = await res.json();
  if (!json.success && json.error) {
    throw new Error(json.error);
  }

  // Cache response for current session
  memoryCache.set(cacheKey, json.data);
  return json.data;
}

export const pwApiService = {
  /**
   * Fetch batch detail & all subjects
   */
  async getBatchSubjects(batchId) {
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

    const data = await callRpc('pw_sub_topics', {
      batchId,
      subjectId,
      tagType: 'UNITS',
      page: 1,
      limit: 100
    });

    const units = data?.data || [];
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
   * Fetch lectures, DPPs, and notes for a chapter
   */
  async getChapterItems(batchId, subject, chapterId, folderTitle = '') {
    const subjectId = typeof subject === 'string' ? subject : (subject.subjectId || subject.subject_id);
    const masterId = subject.masterId;

    // Fetch lectures, notes, and DPP PDFs in parallel
    const [lecturesRes, notesRes, dppPdfRes] = await Promise.allSettled([
      callRpc('pw_sch_cntnt', { batchId, subjectId, tagId: chapterId, contentType: 'LECTURE', skip: 0, limit: 100 }),
      callRpc('pw_sch_cntnt', { batchId, subjectId, tagId: chapterId, contentType: 'NOTES', skip: 0, limit: 100 }),
      callRpc('pw_sch_cntnt', { batchId, subjectId, tagId: chapterId, contentType: 'DPP_PDF', skip: 0, limit: 100 })
    ]);

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
    if (lecturesRes.status === 'fulfilled' && Array.isArray(lecturesRes.value)) {
      lecturesRes.value.forEach(item => {
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
          folder_path: folderTitle,
          thumbnail: d.videoDetails?.image || '',
          duration: durationSecs,
          dateStr: formatDateStr(d.date),
          created_at: d.date ? new Date(d.date).getTime() / 1000 : 0,
          subject_name: subject.subject_name || subject.subject || 'Physics'
        });
      });
    }

    // Helper to safely resolve attachment URLs from PW responses
    const resolveAttachmentPdfUrl = (d) => {
      const homework = d.homeworkIds?.[0];
      const attach = homework?.attachmentIds?.[0] || d.attachmentIds?.[0];
      let rawUrl = attach?.baseUrl || '';
      if (attach?.key && !rawUrl.includes(attach.key)) {
        rawUrl = rawUrl ? `${rawUrl.replace(/\/+$/, '')}/${attach.key.replace(/^\/+/, '')}` : attach.key;
      }
      if (!rawUrl && attach?.url) {
        rawUrl = attach.url;
      }
      if (!rawUrl && d.fileUrl) {
        rawUrl = d.fileUrl;
      }
      if (!rawUrl) return '';
      const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${PW_BASE_URL}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
      return toProxiedPdfUrl(fullUrl);
    };

    // Parse Notes
    if (notesRes.status === 'fulfilled' && Array.isArray(notesRes.value)) {
      notesRes.value.forEach(item => {
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
    }

    // Parse DPP PDFs
    if (dppPdfRes.status === 'fulfilled' && Array.isArray(dppPdfRes.value)) {
      dppPdfRes.value.forEach(item => {
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
    }

    return items;
  },

  /**
   * Resolves the direct static.pw.live PDF URL for any PW note/DPP item.
   * Uses pw_sch_dtl to query the live database for direct attachment URLs,
   * avoiding flaky /api/lxpdf serverless timeouts and 404s.
   * Wraps the result in toProxiedPdfUrl to avoid browser CORS blocks.
   */
  async resolvePdfUrl(item) {
    if (!item) return '';

    // If item already has a verified direct static.pw.live URL or already proxied
    if (item.directPdfUrl) {
      return toProxiedPdfUrl(item.directPdfUrl);
    }
    if (item.url && item.url.includes('static.pw.live')) {
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
  async getVideoPlaybackInfo(batchId, scheduleId, masterId) {
    const data = await callRpc('parcham_vid', {
      childId: scheduleId,
      batchId,
      subjectId: masterId
    });

    if (!data || !data.url) {
      throw new Error('Video stream is currently unavailable');
    }

    const manifestUrl = data.url.startsWith('http') ? data.url : `${PW_BASE_URL}${data.url}`;

    return {
      manifestUrl,
      clearKeys: data.clearKeys || null,
      kind: data.kind || 'dash'
    };
  }
};

/**
 * Transforms any static.pw.live URL into a CORS-safe proxied URL.
 * Uses lightweight Render CORS proxy as primary to avoid consuming Netlify bandwidth limits.
 */
export function toProxiedPdfUrl(url) {
  if (!url) return '';
  // If already proxied via Render or Netlify, return as is
  if (url.includes('corsproxy-bppd.onrender.com') || url.startsWith('/api/pw-static') || url.includes('/api/pw-static/')) {
    return url;
  }

  if (url.includes('static.pw.live')) {
    // Primary: Render CORS proxy (Cloudflare cached, preserves Netlify 100GB monthly quota)
    return `https://corsproxy-bppd.onrender.com/proxy?url=${encodeURIComponent(url)}`;
  }

  return url;
}

/**
 * Returns Netlify edge proxy URL for a given static.pw.live URL or Render proxy URL.
 * Used as reliable instant fallback if Render is waking from cold start.
 */
export function getNetlifyFallbackPdfUrl(url) {
  if (!url) return '';
  let targetUrl = url;

  if (url.includes('corsproxy-bppd.onrender.com')) {
    try {
      const parsed = new URL(url);
      targetUrl = parsed.searchParams.get('url') || url;
    } catch (_) {}
  }

  if (targetUrl.includes('static.pw.live')) {
    const relativePath = targetUrl.replace(/^https?:\/\/static\.pw\.live\/?/, '');
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
