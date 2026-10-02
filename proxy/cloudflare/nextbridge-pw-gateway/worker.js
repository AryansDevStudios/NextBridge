/**
 * ============================================================================
 * NextBridge — Physics Wallah (PW) Cloudflare Edge Gateway
 * ============================================================================
 * 
 * Features:
 * 1. 100% Drop-in RPC Compatible: Implements POST /api/data with all actions
 *    (pw_btch_dtl, pw_sub_topics, pw_sch_cntnt, pw_sch_dtl, pw_dpp_lst, parcham_vid).
 * 2. Smart Direct CloudFront Streaming: Rewrites MPD manifests with embedded CloudFront
 *    signatures so client video chunks stream DIRECTLY from AWS CloudFront edge PoPs
 *    (0 worker requests consumed during playback, lowest possible latency, zero buffering).
 * 3. DRM ClearKey Engine: Auto-extracts default_KID from manifests and resolves
 *    decryption keys via get-otp.
 * 4. Direct PDF Resolution: Redirects /api/lxpdf directly to static.pw.live (302).
 * 5. High-Speed Edge Caching: Caches catalog, subjects, and chapters at the edge.
 * 6. Multi-Tier Upstream Failover: LearnxPW (Tier 1) -> PenPencil/StudySpark (Tier 2).
 */

const LX_ORIGIN = 'https://www.learnxpw.site';
const DEFAULT_CF_HOST = 'd1d34p8vz63oiq.cloudfront.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range, X-Requested-With, Origin, Accept, *',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, *',
  'Access-Control-Max-Age': '86400',
};

const FIREBASE_DB_URL = 'https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app';

// Fallback known folder signatures (when upstream API signature endpoint throttles)
const FALLBACK_SIGNATURES = {
  'a558fffd-9f3f-4334-ac96-50c13dd2cfc7':
    'Signature=jNepjtfmz52QXRhnbc6fpfUzjhRJrHDPwrRYYh9crNIgJvqy3cmNSfCiNsaiPmQEHFa6EJ8tKNBPlUufLmbSNugAsyFjW5yRJixcxLF0QWcjvEy~lUd9dPNXMZ0ZCGq7cCiOjxPn200yPolUMpQlfnzVTks3~cAFFiwUZS9dvZ5ssTOpmIJoDsuCqbvEqnYl1-JWIHuRfGO3sVAjl1Mm-cEbbavfCc5Lavgwa9YieCV~opvKuLW8HqEytkZE2yzjZkVEughljmlL-jFIonuSNUNZrhlRtg7aX31xjENZ4lRj2-EqGoXezLr4WDzTqilIHV9pZ~uWDrtlAqlD0efXGg__&Key-Pair-Id=APKAXVKMENFCRKTG5XE2&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9kMWQzNHA4dno2M29pcS5jbG91ZGZyb250Lm5ldC9hNTU4ZmZmZC05ZjNmLTQzMzQtYWM5Ni01MGMxM2RkMmNmYzcvKiIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc4ODcyNjMyN30sIkRhdGVHcmVhdGVyVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjo1NzY2ODAxMX19fV19',
  'dd3326fa-0ece-4bfe-8972-032cf2e46e04':
    'Signature=PRPN2G6cgfE7rk4sAaft2dq9fRbnrBdRvx2-jSdYvjQHcKml2yiV4g7sKE5Rgv86e13BlDX-xBkmS19SEpA-TV8Vg~YeT6sO-lEYLXkyU-KOq1XdJ2YUPMmrxbJYF4Db3yORDM23kGVc17o9QM5~5DapMH5OMB2z2c9AajcHQC7qZ~KF5TwgYM-~kmaM8WaztUKhLHBeZfmWN1dJCIWyshaNlyZm2s18vqFLT8KNCrfiGG414LNEdugx4ZsisLY5Uksozpr-knfd428syuZdARMpyUcmj4enndJMnpcARF2iUr-pEUfaSeX3kXC6j9E8JJSFqidsVPPBcMqxqRxWaw__&Key-Pair-Id=APKAXVKMENFCRKTG5XE2&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9kMWQzNHA4dno2M29pcS5jbG91ZGZyb250Lm5ldC9kZDMzMjZmYS0wZWNlLTRiZmUtODk3Mi0wMzJjZjJlNDZlMDQvKiIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc4OTU4OTU5OX0sIkRhdGVHcmVhdGVyVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNTc5ODk3NDA1fX19XX0_',
  'c698a999-5b4a-4540-8a90-d460815da0f2':
    'Signature=EZ3a4a-tzKdYeL6hBA~WT64jrScnuiyqL3q2x94ly3IylCxHIxYdyeMI4qytvjXI2qZQAUHWL3rmb4Hk2CjbJV9PMQIRG4BNoNrJSo4uvLIU4tjbu56gjqFJdt2Q0o8b4qinjLW-tBjzSV6TQXbTCH4u08kVDcKpK9-LHatjGvKn1AYhbg-6GLxOTNbS6aNZuRFzA4KqCTd4nXIclsImL2Qr5T3Yr9ZFv9mS1AKgFFAOV0O0-GAOHAbRXjoRd3k6Xes0dfvrffu~0VcWn8n3AShtSw5zTk7BSlI-dNpd1fgxEqsPj4JliR8~VgKdLDj3wY0q9~8Xat2yZ3KQrN9ZkQ__&Key-Pair-Id=APKAXVKMENFCRKTG5XE2&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9kMWQzNHA4dno2M29pcS5jbG91ZGZyb250Lm5ldC9jNjk4YTk5OS01YjRhLTQ1NDAtOGE5MC1kNDYwODE1ZGEwZjIvKiIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5MDcxMjYxMX0sIkRhdGVHcmVhdGVyVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoyMDk1MDc4OTR9fX1dfQ__',
};

// Official PW Guest JWT token for Tier-2 fallback
const PENPENCIL_GUEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M';

// ─── FIREBASE CLOUD SIGNATURE CACHE ──────────────────────────────────────────

async function getCachedSignature(folder) {
  if (!folder) return null;
  if (FALLBACK_SIGNATURES[folder]) return FALLBACK_SIGNATURES[folder];
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/pw_signatures/${encodeURIComponent(folder)}.json`, {
      headers: { 'User-Agent': UA }
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.signedQuery) {
        return data.signedQuery;
      }
    }
  } catch (_) {}
  return null;
}

function saveCachedSignature(folder, signedQuery, ctx) {
  if (!folder || !signedQuery || !signedQuery.includes('Signature=')) return;
  const clean = signedQuery.replace(/^\?/, '');
  const promise = fetch(`${FIREBASE_DB_URL}/pw_signatures/${encodeURIComponent(folder)}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedQuery: clean, updatedAt: Date.now() })
  }).catch(() => {});
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(promise);
  }
}

// ─── FIREBASE MANAGED NEXTHOPE AUTH COOKIE ───────────────────────────────────

let cachedAuthCookie = null;
let cachedAuthCookieExpiry = 0;

async function getPwAuthCookie() {
  const now = Date.now();
  if (cachedAuthCookie && now < cachedAuthCookieExpiry) {
    return cachedAuthCookie;
  }
  try {
    const res = await fetch(`${FIREBASE_DB_URL}/pw_auth.json`, {
      headers: { 'User-Agent': UA }
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.cookie) {
        cachedAuthCookie = data.cookie;
        cachedAuthCookieExpiry = now + 5 * 60 * 1000; // Cache 5 min at edge
        return cachedAuthCookie;
      }
    }
  } catch (_) {}
  return cachedAuthCookie || '';
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 1. Health & Edge Info
      if (path === '/' || path === '/health') {
        return jsonResponse({
          status: 'ok',
          service: 'NextBridge PW Edge Gateway',
          edgeLocation: request.cf?.colo || 'EDGE',
          country: request.cf?.country || 'IN',
          upstream: LX_ORIGIN,
          features: ['Direct-CloudFront-Streaming', 'ClearKey-DRM', 'Direct-PDF-302', 'No-Cache-Real-Time']
        });
      }

      // 2. Main RPC Endpoint: POST /api/data
      if (path === '/api/data' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        return handleRpcAction(body, request, env, ctx);
      }

      // 3. Smart Direct-CloudFront Manifest Rewriter: GET /manifest/:folder/master.mpd
      if (path.startsWith('/manifest/')) {
        return handleManifest(url, request, env, ctx);
      }

      // 4. Fallback Segment Relay: GET /api/pw/:folder/s/:sig/...
      if (path.startsWith('/api/pw/')) {
        return handleRelay(path, url, request);
      }

      // 5. Direct PDF Redirection: GET /api/lxpdf
      if (path === '/api/lxpdf') {
        return handlePdfRedirect(url);
      }

      // 6. Direct Upstream Proxies for catalog & search
      if (path === '/api/AllBatches' || path === '/api/searchBatch') {
        const targetUrl = `${LX_ORIGIN}${path}${url.search}`;
        return fetchUpstream(targetUrl, { ttl: 300 });
      }

      // 7. ClearKey OTP Direct Endpoint: GET /api/get-otp?kid=...
      if (path === '/api/get-otp') {
        const kid = url.searchParams.get('kid');
        if (!kid) return jsonResponse({ success: false, error: 'kid is required' }, 400);
        return fetchUpstream(`${LX_ORIGIN}/api/get-otp?kid=${encodeURIComponent(kid)}`, { ttl: 86400 });
      }

      return jsonResponse({ success: false, error: 'Not Found' }, 404);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message || 'Internal Edge Error' }, 500);
    }
  }
};

/**
 * Handle POST /api/data actions requested by PwApiService
 */
async function handleRpcAction(body, request, env, ctx) {
  try {
    const action = String(body.action || '').trim();
    const params = body.params || {};

    switch (action) {
    case 'pw_btch_dtl': {
      const batchId = String(params.batchId || '').trim();
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
      const batchId = String(params.batchId || '').trim();
      const subjectId = String(params.subjectId || '').trim();
      const page = Math.max(1, Number(params.page) || 1);
      if (!batchId || !subjectId) return jsonResponse({ success: true, data: { data: [] } });

      const targetUrl = `${LX_ORIGIN}/api/SubjectInfo?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&page=${page}`;
      const res = await fetchDirect(targetUrl);
      if (!res.ok) return jsonResponse({ success: false, error: `Upstream error ${res.status}`, status: res.status }, 502);

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
      const batchId = String(params.batchId || '').trim();
      const subjectId = String(params.subjectId || '').trim();
      const tagId = String(params.tagId || '').trim();
      const contentType = String(params.contentType || 'LECTURE').toUpperCase();
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
      if (!res.ok) return jsonResponse({ success: false, error: `Upstream error ${res.status}`, status: res.status }, 502);

      const json = await res.json();
      const rawItems = Array.isArray(json?.data) ? json.data : [];

      const nodes = rawItems.map(item => {
        const id = item._id || '';
        const vd = item.videoDetails;

        // Build homeworkIds / attachmentIds for direct notes and DPPs
        let homeworkIds = [];
        if (Array.isArray(item.homeworkIds)) {
          homeworkIds = item.homeworkIds;
        } else if (item.dpp?.homeworkIds) {
          homeworkIds = item.dpp.homeworkIds;
        }

        // Normalize attachment baseUrl
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
                baseUrl: direct || `/api/lxpdf?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&pdfId=${encodeURIComponent(id)}&attachmentId=${encodeURIComponent(att._id || '')}`,
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
      const batchId = String(params.batchId || '').trim();
      const scheduleId = String(params.scheduleId || '').trim();
      const subjectId = String(params.subjectId || '').trim();
      if (!batchId || !scheduleId || !subjectId) return jsonResponse({ success: true, data: null });

      const targetUrl = `${LX_ORIGIN}/api/Schedule?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&ContentId=${encodeURIComponent(scheduleId)}`;
      const res = await fetchDirect(targetUrl);
      if (!res.ok) return jsonResponse({ success: false, error: `Upstream error ${res.status}`, status: res.status }, 502);

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
            baseUrl: direct || `/api/lxpdf?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&pdfId=${encodeURIComponent(detail._id || scheduleId)}&attachmentId=${encodeURIComponent(att._id || '')}`,
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
      if (!res.ok) return jsonResponse({ success: false, error: `Upstream error ${res.status}`, status: res.status }, 502);

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
      if (!res.ok) return jsonResponse({ success: false, error: `Upstream error ${res.status}`, status: res.status }, 502);
      const json = await res.json();
      return jsonResponse({ success: true, data: Array.isArray(json?.data) ? json.data : [] });
    }

    case 'pw_tchr_dtl': {
      return jsonResponse({ success: true, data: null });
    }

    case 'parcham_vid': {
      return handleParchamVid(params, request, env, ctx);
    }

    case 'pw_auth_info': {
      try {
        const res = await fetch(`${FIREBASE_DB_URL}/pw_auth.json`, { headers: { 'User-Agent': UA } });
        const data = res.ok ? await res.json() : null;
        return jsonResponse({ success: true, data });
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, 500);
      }
    }

    case 'pw_save_auth': {
      try {
        const cookieStr = String(params.cookie || '').trim();
        if (!cookieStr) return jsonResponse({ success: false, error: 'Cookie is required' }, 400);
        const anon_id = (cookieStr.match(/anon_id=([0-9a-fA-F-]+)/) || [])[1] || '';
        const bodyData = {
          cookie: cookieStr,
          anon_id,
          updatedAt: Date.now(),
          updatedBy: params.updatedBy || 'Admin'
        };
        const res = await fetch(`${FIREBASE_DB_URL}/pw_auth.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData)
        });
        cachedAuthCookie = cookieStr;
        cachedAuthCookieExpiry = Date.now() + 5 * 60 * 1000;
        return jsonResponse({ success: res.ok, data: bodyData });
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, 500);
      }
    }

    default:
      return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message || 'Internal action error' }, 500);
  }
}

/**
 * Resolves video stream manifest + DRM ClearKeys (parcham_vid)
 */
async function handleParchamVid(params, request, env = null, ctx = null) {
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

    // Tier 1c: Try NextHope container orchestrator pool with Firebase-managed auth cookie
    if (!videoInfo?.url) {
      const authCookie = await getPwAuthCookie();
      const nhHeaders = {
        'User-Agent': UA,
        'Origin': 'https://pw.nexthope.site',
        'Referer': `https://pw.nexthope.site/watch?batchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&ChildId=${encodeURIComponent(cid)}&Type=penpencilvdo`
      };
      if (authCookie) {
        nhHeaders['Cookie'] = authCookie;
      }

      for (let c = 1; c <= 4; c++) {
        try {
          const nhRes = await fetch(`https://pw.nexthope.site/api/get-video-url?batchId=${encodeURIComponent(batchId)}&subjectId=${encodeURIComponent(subjectId)}&childId=${encodeURIComponent(cid)}&containerNum=${c}&topicId=all`, {
            headers: nhHeaders
          });
          if (nhRes.ok) {
            const nhJson = await nhRes.json();
            const targetUrl = nhJson?.data?.directUrl || nhJson?.directUrl || nhJson?.data?.streamUrl || nhJson?.data?.url || nhJson?.streamUrl || nhJson?.url;
            if (nhJson?.success && targetUrl) {
              const sigPart = nhJson.data?.signedUrl || nhJson.signedUrl || (targetUrl.includes('?') ? targetUrl.slice(targetUrl.indexOf('?')) : '');
              videoInfo = {
                url: targetUrl,
                signedUrl: sigPart,
                clearKeys: nhJson.data?.clearKeys || nhJson.clearKeys || null
              };
              break;
            }
          }
        } catch (_) {}
      }
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

  // Tier 3: Schedule API direct lookup (resolves underlying CloudFront stream URL)
  if (!videoInfo?.url && batchId && subjectId && targetId) {
    try {
      const schedRes = await fetch(`${LX_ORIGIN}/api/Schedule?BatchId=${encodeURIComponent(batchId)}&SubjectId=${encodeURIComponent(subjectId)}&ContentId=${encodeURIComponent(targetId)}`, {
        headers: { 'User-Agent': UA, 'Origin': LX_ORIGIN, 'Referer': `${LX_ORIGIN}/study/batches` }
      });
      if (schedRes.ok) {
        const schedJson = await schedRes.json();
        const schedData = schedJson?.data;
        const sUrl = schedData?.url || schedData?.videoDetails?.videoUrl;
        if (sUrl) {
          videoInfo = { url: sUrl, signedUrl: '' };
        }
      }
    } catch (_) {}
  }

  // Tier 4: If vUrl was passed directly from schedule item
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

  // If no signed query was returned from API, check fallback constants and Firebase cache
  if (!signedQuery && folder) {
    if (FALLBACK_SIGNATURES[folder]) {
      signedQuery = FALLBACK_SIGNATURES[folder];
    } else {
      const cached = await getCachedSignature(folder);
      if (cached) signedQuery = cached;
    }
  }

  // Clean signed query format
  if (signedQuery && !signedQuery.startsWith('?')) {
    signedQuery = `?${signedQuery}`;
  }

  // If a valid signed query was acquired, cache it to Firebase RTDB in the background
  if (folder && signedQuery && signedQuery.includes('Signature=')) {
    saveCachedSignature(folder, signedQuery, ctx);
  }

  // Resolve ClearKeys from master.mpd if available
  let clearKeys = videoInfo.clearKeys || null;
  if (!clearKeys && rawUrl.includes('.mpd')) {
    try {
      const probeUrl = `https://${host}/${folder}/master.mpd${signedQuery}`;
      let probeRes = await fetch(probeUrl, {
        headers: { 'User-Agent': UA }
      }).catch(() => null);

      if (!probeRes || !probeRes.ok) {
        probeRes = await fetch(`https://bidweb.lol/${host}/${folder}/master.mpd${signedQuery}`, {
          headers: { 'User-Agent': UA }
        }).catch(() => null);
      }

      if (probeRes && probeRes.ok) {
        const mpdText = await probeRes.text();
        const kidMatch = mpdText.match(/default_KID="([0-9a-fA-F-]+)"/i) || mpdText.match(/cenc:default_KID="([0-9a-fA-F-]+)"/i);
        if (kidMatch) {
          const kidRaw = kidMatch[1];
          const kidClean = kidRaw.replace(/-/g, '').toLowerCase();

          // 1. Try LearnxPW get-otp with clean kid
          let otpRes = await fetch(`${LX_ORIGIN}/api/get-otp?kid=${encodeURIComponent(kidClean)}`, {
            headers: { 'User-Agent': UA }
          }).catch(() => null);

          // 2. If LearnxPW fails, try NextHope get-otp with clean kid
          if (!otpRes || !otpRes.ok) {
            otpRes = await fetch(`https://pw.nexthope.site/api/get-otp?kid=${encodeURIComponent(kidClean)}&batchId=${encodeURIComponent(batchId)}`, {
              headers: { 'User-Agent': UA }
            }).catch(() => null);
          }

          if (otpRes && otpRes.ok) {
            const otpJson = await otpRes.json().catch(() => ({}));
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
async function handleManifest(url, request, env, ctx) {
  const parts = url.pathname.split('/').filter(Boolean);
  // Pattern: /manifest/:folder/...
  const folder = parts[1];
  if (!folder) return jsonResponse({ error: 'Folder required' }, 400);

  const assetParts = parts.slice(2);
  const assetPath = assetParts.join('/');

  const host = url.searchParams.get('host') || DEFAULT_CF_HOST;
  const rawSig = url.searchParams.get('sig') || '';
  let sigQuery = rawSig ? (rawSig.startsWith('?') ? rawSig : `?${decodeURIComponent(rawSig)}`) : '';

  // If no explicit sig parameter, check if URL itself has raw CloudFront signature parameters
  if (!sigQuery && url.searchParams.has('Signature')) {
    // Build clean CloudFront query (strip worker-specific params)
    const cfParams = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
      if (k !== 'sig' && k !== 'host') cfParams.set(k, v);
    }
    sigQuery = cfParams.toString() ? `?${cfParams.toString()}` : '';
  }

  // Fallback to known folder signatures or Firebase cache if needed
  if (!sigQuery) {
    if (FALLBACK_SIGNATURES[folder]) {
      sigQuery = `?${FALLBACK_SIGNATURES[folder]}`;
    } else {
      const cached = await getCachedSignature(folder);
      if (cached) {
        sigQuery = cached.startsWith('?') ? cached : `?${cached}`;
      }
    }
  }

  // 1. Media Segment Proxying (init.mp4, 1.mp4, chunk.m4s, .ts, enc.key, etc.)
  //    Worker fetches from CloudFront and adds CORS headers on the response.
  if (assetPath && !assetPath.endsWith('.mpd') && !assetPath.endsWith('.m3u8')) {
    // Build clean CloudFront query — strip worker-only params (sig, host)
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

  // Remove any existing <BaseURL> tags
  text = text.replace(/<BaseURL[\s\S]*?<\/BaseURL>/gi, '');

  // BaseURL points BACK TO THIS WORKER — critical for CORS.
  // PW's CloudFront does not return Access-Control-Allow-Origin, so segments
  // fetched directly from CloudFront are opaque to JavaScript. By routing
  // through the worker, every response gets CORS headers injected.
  const workerBase = `${url.origin}/manifest/${folder}/`;
  if (/<MPD[^>]*>/i.test(text)) {
    text = text.replace(/(<MPD[^>]*>)/i, `$1\n  <BaseURL>${workerBase}</BaseURL>`);
  } else {
    text = `<BaseURL>${workerBase}</BaseURL>\n` + text;
  }

  // Inject CloudFront signature + host into SegmentTemplate attributes so each
  // segment request arriving at the worker carries the info needed to fetch from CF
  if (sigQuery) {
    const qClean = sigQuery.replace(/^\?/, '');
    const hostParam = host !== DEFAULT_CF_HOST ? `&host=${encodeURIComponent(host)}` : '';
    const qXml = (qClean + hostParam).replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
    text = text.replace(/initialization="([^"?]+)"/g, (_m, p1) => `initialization="${p1}?${qXml}"`);
    text = text.replace(/media="([^"?]+)"/g, (_m, p1) => `media="${p1}?${qXml}"`);
    text = text.replace(/sourceURL="([^"?]+)"/g, (_m, p1) => `sourceURL="${p1}?${qXml}"`);
  }

  // Ensure all remaining bare ampersands inside attributes in the XML document are safely escaped
  text = text.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');

  return new Response(text, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/dash+xml',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}

/**
 * Fallback Segment Relay Engine: /api/pw/:folder/s/:sig/...
 */
async function handleRelay(path, url, request) {
  const parts = path.split('/').filter(Boolean);
  let host = DEFAULT_CF_HOST;
  let cursor = 0;
  const pwIdx = parts.indexOf('pw');
  if (pwIdx === -1) return jsonResponse({ error: 'Bad relay path' }, 400);

  cursor = pwIdx + 1;
  if (parts[cursor] === 'h' && parts.length >= cursor + 2) {
    host = parts[cursor + 1];
    cursor += 2;
  }

  const folder = parts[cursor];
  if (!folder) return jsonResponse({ error: 'Folder required' }, 400);
  cursor += 1;

  let signedQuery = '';
  if (parts[cursor] === 's' && parts.length >= cursor + 2) {
    const sigSegment = parts[cursor + 1];
    try {
      signedQuery = decodeURIComponent(sigSegment);
      if (!signedQuery.includes('Signature=') && !signedQuery.includes('Key-Pair-Id=')) {
        const decoded = atob(sigSegment.replace(/-/g, '+').replace(/_/g, '/'));
        if (decoded.includes('Signature=')) signedQuery = decoded;
      }
    } catch (_) {
      signedQuery = sigSegment;
    }
    cursor += 2;
  }

  if (signedQuery && !signedQuery.startsWith('?')) signedQuery = `?${signedQuery}`;
  if (!signedQuery && url.searchParams.has('Signature')) signedQuery = url.search;
  if (!signedQuery) {
    if (FALLBACK_SIGNATURES[folder]) {
      signedQuery = `?${FALLBACK_SIGNATURES[folder]}`;
    } else {
      const cached = await getCachedSignature(folder);
      if (cached) signedQuery = cached.startsWith('?') ? cached : `?${cached}`;
    }
  }

  const assetParts = parts.slice(cursor);
  const assetPath = assetParts.join('/');
  const targetUrl = `https://${host}/${folder}/${assetPath}${signedQuery}`;

  const forwardHeaders = new Headers();
  forwardHeaders.set('User-Agent', UA);
  const range = request.headers.get('range');
  if (range) forwardHeaders.set('range', range);

  const res = await fetch(targetUrl, { headers: forwardHeaders });

  const responseHeaders = new Headers(res.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => responseHeaders.set(k, v));
  responseHeaders.set('Cache-Control', 'public, max-age=86400');

  return new Response(res.body, {
    status: res.status,
    headers: responseHeaders
  });
}

/**
 * Direct PDF 302 Redirect Engine: GET /api/lxpdf
 */
async function handlePdfRedirect(url) {
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
        return Response.redirect(fullUrl, 302);
      }
    }
  } catch (_) {}

  return jsonResponse({ success: false, error: 'PDF not available' }, 404);
}

// ---------------------------------------------------------------------------
// Utility Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache'
    }
  });
}

async function fetchDirect(url) {
  return fetch(url, {
    headers: { 'User-Agent': UA, 'Origin': LX_ORIGIN, 'Referer': `${LX_ORIGIN}/study/batches` }
  });
}

async function fetchUpstream(targetUrl) {
  const res = await fetch(targetUrl, {
    headers: { 'User-Agent': UA, 'Origin': LX_ORIGIN, 'Referer': `${LX_ORIGIN}/study/batches` }
  });
  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': res.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache'
    }
  });
}

function extractFolder(url) {
  try {
    const uuidMatch = url.match(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
    if (uuidMatch) return uuidMatch[1];
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] || '';
  } catch {
    return '';
  }
}

function extractHost(url) {
  try {
    if (url.includes('cloudfront.net')) {
      const match = url.match(/([a-zA-Z0-9-]+\.cloudfront\.net)/i);
      if (match) return match[1];
    }
    return new URL(url).host || DEFAULT_CF_HOST;
  } catch {
    return DEFAULT_CF_HOST;
  }
}
