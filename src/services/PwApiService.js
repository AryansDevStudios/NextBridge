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
      return rawUrl.startsWith('http') ? rawUrl : `${PW_BASE_URL}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    };

    // Parse Notes
    if (notesRes.status === 'fulfilled' && Array.isArray(notesRes.value)) {
      notesRes.value.forEach(item => {
        const d = item.data || {};
        const homework = d.homeworkIds?.[0];
        const pdfUrl = resolveAttachmentPdfUrl(d);

        items.push({
          id: item._id ? `pdf_${item._id}` : `pdf_${Math.random()}`,
          title: d.topic || homework?.topic || 'Class Notes',
          type: 'pdf',
          subCategory: 'NOTES',
          badgeText: 'NOTES',
          isDynamicPw: true,
          batchId,
          subjectId,
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
        const pdfUrl = resolveAttachmentPdfUrl(d);

        items.push({
          id: item._id ? `dpp_${item._id}` : `dpp_${Math.random()}`,
          title: d.topic || homework?.topic || 'Daily Practice Problem (DPP)',
          type: 'pdf',
          subCategory: 'DPP_PDF',
          badgeText: 'DPP PDF',
          isDynamicPw: true,
          batchId,
          subjectId,
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
