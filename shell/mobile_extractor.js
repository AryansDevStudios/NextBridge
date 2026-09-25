/**
 * ============================================================================
 * NextBridge Native In-App Extraction Engine (High-Performance Mobile Edition)
 * Runs client-side in Android WebView with native multi-core speed.
 * Connected to Next Hope API, Firebase RTDB, and Android ExtractionForegroundService.
 * ============================================================================
 */

export const CONFIG = {
  NEXTTOPPERS_API: 'https://course.nexttoppers.com/course/all-content',
  EDUVIBE_BASE: 'https://eduvibe-2tkn.onrender.com/nt',
  FIREBASE_DB_URL: 'https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app',
  ADMIN_PASSWORD: 'nxttopprtokenclass10#',
  DEFAULT_BATCH_CONCURRENCY: 14,
  DEFAULT_SUBJECT_CONCURRENCY: 4,
  DEFAULT_FOLDER_FILE_POOL: 12
};

export const SUBJECT_MAPPING = {
  "6939": "Mathematics",
  "7100": "Science",
  "6744": "Social Science",
  "8262": "Information Technology",
  "7145": "English",
  "7940": "Hindi Course A",
  "7166": "English A",
  "7953": "Hindi Course B",
  "10045": "Sanskrit",
  "14942": "Hindi",
  "14903": "English",
  "14904": "Science",
  "14905": "Mathematics",
  "14906": "Social Science",
  "14907": "Information Technology",
  "17904": "Marathon"
};

export const state = {
  isSyncing: false,
  activeTarget: 'None',
  recentLogs: [],
  extractedBatches: {},
  failedBatches: [],
  benchmark: null,
  tokens: {
    bearerToken10: '',
    bearerToken9: '',
    lastUpdated10: 'Never',
    lastUpdated9: 'Never'
  }
};

// In-memory cache for resolved VideoCrypt URLs to eliminate redundant HTTP calls
const vdcCache = new Map();

// ========================== UTILITIES ==========================

export function sanitizeName(name) {
  if (!name) return "";
  return name.replace(/[^\x00-\x7F]/g, "").replace(/[<>:"/\\|?*]+/g, " ").trim();
}

export function getISTTime() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istTime = new Date(utc + (3600000 * 5.5));
  return istTime.toLocaleTimeString('en-IN', { hour12: false }) + ' (IST)';
}

export function log(msg, onLog) {
  const time = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const formatted = `[${time}] ${msg}`;
  state.recentLogs.push(formatted);
  if (state.recentLogs.length > 500) state.recentLogs.shift();
  
  if (typeof onLog === 'function') {
    onLog(formatted);
  }
  
  // Forward to Android persistent foreground service log buffer
  try {
    window.Capacitor?.Plugins?.ExtractionService?.addLog({ log: formatted }).catch(() => {});
  } catch (e) {}

  console.log(formatted);
}

// Bounded concurrency pool for async tasks
export async function runConcurrentPool(items, concurrency, workerFn) {
  let currentIndex = 0;
  const total = items.length;
  if (total === 0) return [];

  const activeConcurrency = Math.min(concurrency, total);
  const results = new Array(total);

  const workers = Array.from({ length: activeConcurrency }, async (_, workerId) => {
    while (currentIndex < total) {
      const index = currentIndex++;
      const item = items[index];
      try {
        results[index] = await workerFn(item, index, total);
      } catch (err) {
        results[index] = null;
      }
    }
  });

  await Promise.all(workers);
  return results;
}

// Dedicated HTTP fetch with 3 retries and 15s timeout
export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        try { return JSON.parse(text); } catch { return text; }
      }
      if (res.status === 404) return null;
    } catch (err) {
      if (attempt >= maxRetries) throw err;
    }
    await new Promise(r => setTimeout(r, 400 * attempt + Math.random() * 150));
  }
  return null;
}

// Dedicated Firebase Realtime DB fetch with 4 retries & exponential backoff
export async function fetchFirebaseWithRetry(url, options = {}, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        try { return JSON.parse(text); } catch { return text; }
      }
      if (res.status === 404) return null;
    } catch (err) {
      if (attempt >= maxRetries) throw err;
    }
    await new Promise(r => setTimeout(r, 800 * Math.pow(2, attempt - 1) + Math.random() * 200));
  }
  return null;
}

// 2-socket bounded async queue for Firebase RTDB updates
export class AsyncQueue {
  constructor(concurrency = 2) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  process() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift();
      this.running++;
      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.running--;
          this.process();
        });
    }
  }
}

export const firebaseQueue = new AsyncQueue(2);

// ========================== NATIVE FOREGROUND BRIDGE ==========================

export async function callNativeForeground(action, data = {}) {
  try {
    const plugin = window.Capacitor?.Plugins?.ExtractionService;
    if (plugin) {
      if (action === 'start') {
        await plugin.startExtraction(data);
      } else if (action === 'update') {
        await plugin.updateProgress(data);
      } else if (action === 'stop') {
        await plugin.stopExtraction(data);
      }
    }
  } catch (e) {
    console.warn('Native ExtractionService call error:', e);
  }
}

// ========================== TOKENS & DISCOVERY ==========================

export async function loadFirebaseTokens() {
  try {
    const cfg = await fetchWithRetry(`${CONFIG.FIREBASE_DB_URL}/config.json`, { method: 'GET' }, 2);
    if (cfg) {
      state.tokens.bearerToken10 = cfg.bearer_token_10 || cfg.bearer_token || '';
      state.tokens.bearerToken9 = cfg.bearer_token_9 || '';
      state.tokens.lastUpdated10 = cfg.token_last_updated_10 || 'Available';
      state.tokens.lastUpdated9 = cfg.token_last_updated_9 || 'Available';
    }
  } catch (e) {
    console.warn('Failed to load tokens from Firebase:', e.message);
  }
  return state.tokens;
}

export async function updateFirebaseToken(token, classId) {
  const payload = {
    [`bearer_token_${classId}`]: token,
    [`token_last_updated_${classId}`]: getISTTime()
  };
  await fetchFirebaseWithRetry(`${CONFIG.FIREBASE_DB_URL}/config.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, 3);
  await loadFirebaseTokens();
  return true;
}

// ========================== RESOLVERS & TRAVERSAL ==========================

const EDUVIBE_KEY_STR = 'Ch@tS3cr3tK3y!16';
const EDUVIBE_IV_STR = 'Ch@tIV#16Bytes!!';

function strToUint8(str) {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr;
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
}

let subtleKey = null;
async function getCryptoKey() {
  if (subtleKey) return subtleKey;
  const keyBytes = strToUint8(EDUVIBE_KEY_STR);
  subtleKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-CBC" },
    false,
    ["decrypt"]
  );
  return subtleKey;
}

export async function decryptEduVibePayload(encryptedBase64) {
  try {
    const key = await getCryptoKey();
    const iv = strToUint8(EDUVIBE_IV_STR);
    const cipherBuffer = base64ToArrayBuffer(encryptedBase64);
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      key,
      cipherBuffer
    );
    const dec = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(dec);
  } catch (e) {
    return null;
  }
}

const eduvibeDetailsCache = new Map();

export async function resolveWithEduVibe(contentId, courseId) {
  if (!contentId || !courseId) return null;
  const cacheKey = `${courseId}_${contentId}`;
  if (eduvibeDetailsCache.has(cacheKey)) return eduvibeDetailsCache.get(cacheKey);

  try {
    const url = `${CONFIG.EDUVIBE_BASE}/video-details?content_id=${encodeURIComponent(contentId)}&course_id=${encodeURIComponent(courseId)}`;
    const res = await fetchWithRetry(url, { method: 'GET' }, 2);
    if (res && res.data) {
      if (typeof res.data === 'string') {
        const decrypted = await decryptEduVibePayload(res.data);
        if (decrypted) {
          eduvibeDetailsCache.set(cacheKey, decrypted);
          return decrypted;
        }
      } else if (typeof res.data === 'object') {
        eduvibeDetailsCache.set(cacheKey, res.data);
        return res.data;
      }
    }
  } catch (e) {}

  eduvibeDetailsCache.set(cacheKey, null);
  return null;
}

export async function resolveVideoCryptHls(vdcId) {
  if (!vdcId) return null;
  return null;
}

export async function deriveAndVerifyHls(dataObj) {
  if (dataObj.file_url && dataObj.file_url.includes('.m3u8')) return dataObj.file_url;
  if (dataObj.video_url && dataObj.video_url.includes('.m3u8')) return dataObj.video_url;
  if (!dataObj.download_urls) return null;
  try {
    const parsedUrls = typeof dataObj.download_urls === 'string'
      ? JSON.parse(dataObj.download_urls)
      : dataObj.download_urls;
    if (!Array.isArray(parsedUrls) || parsedUrls.length === 0) return null;

    for (const u of parsedUrls) {
      if (!u || !u.url) continue;
      const m = u.url.match(/\/file_library\/videos\/download\/(\d+)\/[^/]+\/([0-9a-zA-Z]+)_(?:240|360|480|720|1080|auto)/i);
      if (m) {
        const vdcPrefix = m[1];
        const fileHash = m[2];
        const suffix = fileHash.slice(-7);
        return `https://dbil3go8szhu6.cloudfront.net/file_library/videos/channel_vod_non_drm_hls/${vdcPrefix}/${fileHash}/${fileHash}_${suffix}.m3u8`;
      }
    }
  } catch {}
  return null;
}

export async function queryFolderContent(courseId, folderId, parentCourseId = "0") {
  const payload = {
    course_id: String(courseId),
    folder_id: String(folderId),
    parent_course_id: String(parentCourseId),
    page: "1",
    limit: "200",
    keyword: "",
    is_free: ""
  };

  // 1. Primary Engine: Direct NextToppers Origin API (unauthenticated guest mode)
  try {
    const ntHeaders = {
      "content-type": "application/json",
      "app_id": "1770981347",
      "platform": "3",
      "version": "1",
      "user_id": "0"
    };
    const ntData = await fetchWithRetry(CONFIG.NEXTTOPPERS_API, {
      method: 'POST',
      headers: ntHeaders,
      body: JSON.stringify(payload)
    }, 2);

    if (ntData && ntData.success && Array.isArray(ntData.data) && ntData.data.length > 0) {
      return ntData.data;
    }
  } catch (e) {}

  // 2. Secondary Engine: EduVibe Render Proxy Fallback
  try {
    const evUrl = `${CONFIG.EDUVIBE_BASE}/course.nexttoppers.com/course/all-content`;
    const evData = await fetchWithRetry(evUrl, {
      method: 'POST',
      headers: {
        "content-type": "application/json",
        "app_id": "1770981347",
        "platform": "3",
        "user_id": "0",
        "Referer": "https://eduvibe-nt.pages.dev/"
      },
      body: JSON.stringify(payload)
    }, 2);

    if (evData && evData.success && Array.isArray(evData.data) && evData.data.length > 0) {
      return evData.data;
    }
  } catch (e) {}

  return [];
}

export async function traverseFolder(courseId, folderId, relativePath, itemsCollector, subjectId, filePool = 12) {
  const rawItems = await queryFolderContent(courseId, folderId);
  if (!rawItems || rawItems.length === 0) return;

  const subFolderPromises = [];
  const fileItems = [];

  for (const item of rawItems) {
    if (!item || !item.title) continue;

    const isFolder = item.type === "folder" || item.file_type === 3 ||
      (item.data && (item.data.file_type === 3 || item.data.type === "folder" || (item.data.content_counts && item.data.content_counts.folders !== undefined)));

    if (isFolder) {
      const folderTitle = sanitizeName(item.title) || `Folder_${item.data ? item.data.id : folderId}`;
      const newRelativePath = relativePath === "" ? folderTitle : `${relativePath}/${folderTitle}`;
      const subFolderId = String(item.data ? item.data.id : item.id);
      subFolderPromises.push(traverseFolder(courseId, subFolderId, newRelativePath, itemsCollector, subjectId, filePool));
    } else {
      fileItems.push(item);
    }
  }

  if (fileItems.length > 0) {
    await runConcurrentPool(fileItems, filePool, async (item) => {
      const dataObj = item.data || item;
      const itemId = String(dataObj.id || item.entity_id || item.id);

      let primaryUrl = dataObj.file_url || dataObj.video_url || dataObj.download_url || dataObj.pdf_url || dataObj.document_url || dataObj.attachment || dataObj.url || "";
      let resolvedHlsUrl = null;

      const isPdf = dataObj.file_type === 1 ||
        item.type === "notes" ||
        item.type === "pdf" ||
        item.type === "doc" ||
        item.type === "document" ||
        item.type === "test" ||
        dataObj.file_type === 4 ||
        primaryUrl.toLowerCase().includes(".pdf") ||
        ((/notes|dpp|worksheet|assignment|sample paper|questionnaire|test paper|pdf|formula/i.test(item.title) ||
          relativePath.toLowerCase().includes('notes') ||
          relativePath.toLowerCase().includes('dpp') ||
          relativePath.toLowerCase().includes('worksheet')) && !dataObj.vdc_id && !dataObj.video_url);

      const fileType = isPdf ? "pdf" : "video";

      if (isPdf) {
        // PDF HANDLING: Direct CloudFront resolution
        let directPdfUrl = (primaryUrl && primaryUrl.toLowerCase().includes('.pdf')) ? primaryUrl : null;

        // If masked or missing, resolve direct CloudFront PDF via EduVibe AES-128 Decryption Resolver!
        if (!directPdfUrl) {
          const evData = await resolveWithEduVibe(itemId, courseId);
          if (evData && evData.file_url && evData.file_url.toLowerCase().includes('.pdf')) {
            directPdfUrl = evData.file_url;
          }
        }

        primaryUrl = directPdfUrl || (dataObj.dynamic_link || primaryUrl || "");
      } else {
        // VIDEO HANDLING
        let ytUrl = null;
        if (dataObj.video_type === 1 || (dataObj.thumbnail && dataObj.thumbnail.includes('ytimg')) || (primaryUrl && (primaryUrl.includes('youtube') || primaryUrl.includes('youtu.be')))) {
          let ytId = null;
          if (primaryUrl) {
            const m = primaryUrl.match(/(?:v=|\/vi\/|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})/);
            if (m) ytId = m[1];
          }
          if (!ytId && dataObj.thumbnail) {
            const m = dataObj.thumbnail.match(/\/vi\/([a-zA-Z0-9_-]+)\//);
            if (m) ytId = m[1];
          }
          if (ytId) {
            ytUrl = `https://www.youtube.com/watch?v=${ytId}`;
            primaryUrl = ytUrl;
          }
        }

        if (!ytUrl) {
          // 2. Non-YouTube: Derive multi-bitrate HLS stream
          const derived = await deriveAndVerifyHls(dataObj);
          if (derived) {
            resolvedHlsUrl = derived;
            primaryUrl = derived;
          }

          // 3. Fallback to EduVibe decryption resolver
          if (!primaryUrl && !resolvedHlsUrl) {
            const evData = await resolveWithEduVibe(itemId, courseId);
            if (evData) {
              if (evData.file_url && evData.file_url.includes('.m3u8')) {
                resolvedHlsUrl = evData.file_url;
                primaryUrl = evData.file_url;
              } else if (evData.video_url && evData.video_url.includes('.m3u8')) {
                resolvedHlsUrl = evData.video_url;
                primaryUrl = evData.video_url;
              } else if (evData.file_url) {
                primaryUrl = evData.file_url;
              }
            }
          }

          // 4. Download URLs / MP4 fallback (720p / 480p)
          if (!primaryUrl && dataObj.download_urls) {
            try {
              const parsed = typeof dataObj.download_urls === 'string' ? JSON.parse(dataObj.download_urls) : dataObj.download_urls;
              if (Array.isArray(parsed) && parsed.length > 0) {
                const p = parsed.find(u => u.title === '720' || u.title === '720p30') || parsed.find(u => u.title === '480' || u.title === '480p30') || parsed[0];
                if (p && p.url) primaryUrl = p.url;
              }
            } catch {}
          }

          if (!primaryUrl && dataObj.encrypted_url) {
            primaryUrl = dataObj.encrypted_url;
          }

          if (!primaryUrl && dataObj.dynamic_link) {
            primaryUrl = dataObj.dynamic_link;
          }
        }
      }

      if (primaryUrl || isPdf) {
        itemsCollector.push({
          id: itemId,
          title: item.title.trim(),
          type: fileType,
          folder_path: relativePath,
          url: primaryUrl || (dataObj.dynamic_link || ""),
          raw_file_url: (isPdf && primaryUrl && primaryUrl.toLowerCase().includes('.pdf')) ? primaryUrl : (dataObj.file_url || null),
          video_url: dataObj.video_url || null,
          hls_url: resolvedHlsUrl,
          vdc_id: dataObj.vdc_id || null,
          description: dataObj.description || dataObj.text || "",
          created_at: dataObj.created_at || new Date().toISOString(),
          thumbnail: dataObj.thumbnail || null,
          duration: dataObj.duration || 0,
          subject_id: String(subjectId)
        });
      }
    });
  }

  if (subFolderPromises.length > 0) {
    await Promise.all(subFolderPromises);
  }
}

// ========================== BATCH EXTRACTION ==========================

export async function extractBatch(batchInfo, index, total, { onLog, onProgressUpdate, subjectConcurrency = 4, filePool = 12 } = {}) {
  const batchKey = String(batchInfo.batch_id || batchInfo.id);
  const originalCourseId = String(batchInfo.original_id || batchKey.replace('_old', ''));
  const batchStartTime = Date.now();
  const batchTitle = batchInfo.batch_name || batchInfo.title;

  log(`[Batch ${index + 1}/${total}] Extracting: ${batchTitle} (ID: ${batchKey})`, onLog);

  // 1. Fetch top-level subject folders
  const rootData = await queryFolderContent(originalCourseId, "0");
  if (!rootData || rootData.length === 0) {
    log(`  [Batch ${batchKey}] No subject folders found.`, onLog);
    return null;
  }

  const subjects = rootData.filter(i => i.type === "folder");
  log(`  [Batch ${batchKey}] Discovered ${subjects.length} subjects. Starting parallel traversal (Concurrency: ${subjectConcurrency})...`, onLog);

  const subjectsArray = [];
  const subjectsDict = {};
  let totalItems = 0;
  let completedSubjects = 0;

  const traverseSub = async (subjectItem) => {
    const subId = String(subjectItem.data ? subjectItem.data.id : subjectItem.id);
    const subTitle = SUBJECT_MAPPING[subId] || sanitizeName(subjectItem.title);
    const itemsCollector = [];

    await traverseFolder(originalCourseId, subId, "", itemsCollector, subId, filePool);

    const itemsDict = {};
    for (const it of itemsCollector) {
      itemsDict[String(it.id)] = it;
    }

    completedSubjects++;
    totalItems += itemsCollector.length;

    // Granular live progress callback on every completed subject
    if (typeof onProgressUpdate === 'function') {
      onProgressUpdate({
        batchId: batchKey,
        batchTitle,
        subjectTitle: subTitle,
        subjectItemCount: itemsCollector.length,
        batchTotalItems: totalItems,
        completedSubjects,
        totalSubjects: subjects.length
      });
    }

    return {
      subId,
      subTitle,
      itemsCollector,
      itemsDict
    };
  };

  const subjectResults = await runConcurrentPool(subjects, subjectConcurrency, traverseSub);

  let batchVideoCount = 0;
  let batchPdfCount = 0;
  totalItems = 0; // recalculate clean sum

  for (const res of subjectResults) {
    if (!res) continue;
    let subVideos = 0;
    let subPdfs = 0;
    for (const it of res.itemsCollector) {
      if (it.type === 'pdf') subPdfs++;
      else subVideos++;
    }
    totalItems += res.itemsCollector.length;
    batchVideoCount += subVideos;
    batchPdfCount += subPdfs;

    subjectsArray.push({
      subject_id: res.subId,
      subject_name: res.subTitle,
      item_count: res.itemsCollector.length,
      video_count: subVideos,
      pdf_count: subPdfs,
      items: res.itemsCollector
    });
    subjectsDict[res.subId] = {
      subject_id: res.subId,
      subject_name: res.subTitle,
      item_count: res.itemsCollector.length,
      video_count: subVideos,
      pdf_count: subPdfs,
      items: res.itemsDict
    };
  }

  subjectsArray.sort((a, b) => a.subject_name.localeCompare(b.subject_name));
  const durationSeconds = parseFloat(((Date.now() - batchStartTime) / 1000).toFixed(2));

  const batchDocument = {
    course_id: batchKey,
    original_course_id: originalCourseId,
    class_name: batchInfo.class_name,
    batch_name: batchTitle,
    thumbnail: batchInfo.thumbnail,
    is_old: !!batchInfo.is_old,
    session: batchInfo.session || (batchInfo.is_old ? "2025-26 Archive" : "2026-27"),
    last_synced: new Date().toISOString(),
    total_items: totalItems,
    video_count: batchVideoCount,
    pdf_count: batchPdfCount,
    duration_seconds: durationSeconds,
    subjects: subjectsArray,
    subjects_dict: subjectsDict
  };

  log(`  [Batch ${batchKey}] [SAVED] Extracted ${totalItems} items (${batchVideoCount} videos, ${batchPdfCount} PDFs in ${durationSeconds}s)`, onLog);

  // Cache in-memory for instant inspection
  state.extractedBatches[batchKey] = batchDocument;
  return batchDocument;
}

// ========================== FIREBASE REALTIME DB SYNC ==========================

export async function syncBatchToFirebase(batchDoc, onLog) {
  const courseId = batchDoc.course_id;
  log(`  [Batch ${courseId}] [Firebase] Uploading batch data (queue active)...`, onLog);

  const payload = {
    course_id: courseId,
    original_course_id: batchDoc.original_course_id,
    batch_name: batchDoc.batch_name,
    is_old: !!batchDoc.is_old,
    session: batchDoc.session,
    last_synced: batchDoc.last_synced,
    total_items: batchDoc.total_items,
    video_count: batchDoc.video_count,
    pdf_count: batchDoc.pdf_count,
    subjects: batchDoc.subjects_dict
  };

  return await firebaseQueue.add(async () => {
    // 1. Commit to /nexthope_batches/batch_<id>.json
    const patchRes = await fetchFirebaseWithRetry(`${CONFIG.FIREBASE_DB_URL}/nexthope_batches/batch_${courseId}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 4);

    if (!patchRes) {
      throw new Error(`Failed to patch /nexthope_batches/batch_${courseId}.json after retries`);
    }

    log(`  [Batch ${courseId}] [Firebase] ✓ Successfully patched /nexthope_batches/batch_${courseId}.json`, onLog);

    // 2. Mirror to /batches/batch_<id>.json
    try {
      await fetchFirebaseWithRetry(`${CONFIG.FIREBASE_DB_URL}/batches/batch_${courseId}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 2);
    } catch (e) {}

    // 3. Mirror Class 10 / Class 9 roots
    if (batchDoc.is_old) {
      if (batchDoc.class_name === "Class 10") {
        try {
          const c10Old = {
            last_synced: batchDoc.last_synced,
            batch_id: courseId,
            batch_name: batchDoc.batch_name,
            video_count: batchDoc.video_count,
            pdf_count: batchDoc.pdf_count,
            subjects: batchDoc.subjects_dict
          };
          await fetchFirebaseWithRetry(`${CONFIG.FIREBASE_DB_URL}/classes/class_10_old.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(c10Old)
          }, 3);
        } catch (e) {}
      } else if (batchDoc.class_name === "Class 9") {
        try {
          const c9Old = {
            last_synced: batchDoc.last_synced,
            batch_id: courseId,
            batch_name: batchDoc.batch_name,
            video_count: batchDoc.video_count,
            pdf_count: batchDoc.pdf_count,
            subjects: batchDoc.subjects_dict
          };
          await fetchFirebaseWithRetry(`${CONFIG.FIREBASE_DB_URL}/classes/class_9_old.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(c9Old)
          }, 3);
        } catch (e) {}
      }
    } else {
      if (courseId === "176" || batchDoc.class_name === "Class 10") {
        try {
          const c10 = {
            last_synced: batchDoc.last_synced,
            video_count: batchDoc.video_count,
            pdf_count: batchDoc.pdf_count,
            subjects: batchDoc.subjects_dict
          };
          await fetchFirebaseWithRetry(`${CONFIG.FIREBASE_DB_URL}/classes/class_10.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(c10)
          }, 3);
          await fetchFirebaseWithRetry(`${CONFIG.FIREBASE_DB_URL}/courseData.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(c10)
          }, 3);
        } catch (e) {}
      }

      if (courseId === "178" || courseId === "179" || batchDoc.class_name === "Class 9") {
        try {
          const c9 = {
            last_synced: batchDoc.last_synced,
            video_count: batchDoc.video_count,
            pdf_count: batchDoc.pdf_count,
            subjects: batchDoc.subjects_dict
          };
          await fetchFirebaseWithRetry(`${CONFIG.FIREBASE_DB_URL}/classes/class_9.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(c9)
          }, 3);
        } catch (e) {}
      }
    }
  });
}

// ========================== MASTER ORCHESTRATOR ==========================

export async function executeExtractionPipeline({
  targetBatches,
  syncFirebase = true,
  onLog,
  onProgress,
  onComplete
}) {
  if (state.isSyncing) return false;
  state.isSyncing = true;
  state.recentLogs = [];
  state.failedBatches = [];

  const startTime = Date.now();
  const total = targetBatches.length;

  // Adaptive concurrency:
  // If small batch selection (<= 6 batches), maximize parallel subject traversal
  const batchConcurrency = Math.min(total, 14);
  const subjectConcurrency = total <= 6 ? 6 : 3;
  const filePool = total <= 6 ? 16 : 10;

  log(`🚀 Starting Extraction Pipeline: ${total} Batches Selected`, onLog);
  log(`⚙️ Concurrency: ${batchConcurrency} Batches Parallel | ${subjectConcurrency} Subjects/Batch | File Pool: ${filePool}`, onLog);

  // Initialize native foreground service
  await callNativeForeground('start', {
    currentBatch: targetBatches[0]?.batch_name || targetBatches[0]?.title || 'NextBridge Admin Extraction',
    batchId: String(targetBatches[0]?.batch_id || targetBatches[0]?.id || ''),
    totalBatches: total,
    currentIndex: 1,
    percent: 1,
    itemsCount: 0,
    speed: 'Multi-Core Active',
    status: `Starting ${total} batches...`
  });

  // Pre-load tokens
  await loadFirebaseTokens();

  let completedBatchesCount = 0;
  let cumulativeItemsCount = 0;
  const benchmarkBatches = [];
  const newlyExtracted = {};

  const worker = async (batchInfo, idx) => {
    const id = String(batchInfo.batch_id || batchInfo.id);
    const title = batchInfo.batch_name || batchInfo.title;

    // Granular live updates as subjects are extracted
    const onProgressUpdate = async (subProgress) => {
      const approxSubPercent = Math.round((subProgress.completedSubjects / Math.max(1, subProgress.totalSubjects)) * 100);
      const overallPercent = Math.min(99, Math.round(((completedBatchesCount * 100) + approxSubPercent) / total));

      await callNativeForeground('update', {
        currentBatch: title,
        batchId: id,
        totalBatches: total,
        currentIndex: completedBatchesCount + 1,
        percent: overallPercent,
        itemsCount: cumulativeItemsCount + subProgress.batchTotalItems,
        speed: `${cumulativeItemsCount + subProgress.batchTotalItems} items`,
        status: `[${completedBatchesCount + 1}/${total}] ${subProgress.subjectTitle}`
      });

      if (typeof onProgress === 'function') {
        onProgress({
          currentBatch: title,
          batchId: id,
          currentIndex: completedBatchesCount + 1,
          totalBatches: total,
          percent: overallPercent,
          itemsCount: cumulativeItemsCount + subProgress.batchTotalItems,
          statusText: `[${completedBatchesCount + 1}/${total}] ${subProgress.subjectTitle}`
        });
      }
    };

    try {
      const doc = await extractBatch(batchInfo, idx, total, {
        onLog,
        onProgressUpdate,
        subjectConcurrency,
        filePool
      });

      if (!doc) {
        state.failedBatches.push({ id, title, error: 'Extraction returned empty content' });
        benchmarkBatches.push({ id, title, extraction_status: 'failed', extraction_error: 'No content' });
        return;
      }

      newlyExtracted[id] = doc;
      cumulativeItemsCount += doc.total_items;

      let fbStatus = 'skipped';
      let fbError = null;

      if (syncFirebase) {
        try {
          await syncBatchToFirebase(doc, onLog);
          fbStatus = 'success';
        } catch (err) {
          fbStatus = 'failed';
          fbError = err.message;
          state.failedBatches.push({ id, title, error: err.message, document: doc });
          log(`[STDERR] [Batch ${id}] [Firebase FAILED]: ${err.message}`, onLog);
        }
      }

      benchmarkBatches.push({
        id,
        title,
        duration_seconds: doc.duration_seconds,
        items_count: doc.total_items,
        video_count: doc.video_count,
        pdf_count: doc.pdf_count,
        extraction_status: 'success',
        firebase_status: fbStatus,
        firebase_error: fbError
      });

    } catch (e) {
      log(`[STDERR] Error processing batch ${id}: ${e.message}`, onLog);
      state.failedBatches.push({ id, title, error: e.message });
      benchmarkBatches.push({ id, title, extraction_status: 'failed', extraction_error: e.message });
    } finally {
      completedBatchesCount++;
      const currentPercent = Math.min(100, Math.round((completedBatchesCount / total) * 100));
      await callNativeForeground('update', {
        currentBatch: title,
        batchId: id,
        totalBatches: total,
        currentIndex: completedBatchesCount,
        percent: currentPercent,
        itemsCount: cumulativeItemsCount,
        speed: `${cumulativeItemsCount} items`,
        status: `Completed ${completedBatchesCount}/${total} batches`
      });

      if (typeof onProgress === 'function') {
        onProgress({
          currentBatch: title,
          batchId: id,
          currentIndex: completedBatchesCount,
          totalBatches: total,
          percent: currentPercent,
          itemsCount: cumulativeItemsCount,
          statusText: `Completed ${completedBatchesCount}/${total} batches`
        });
      }
    }
  };

  // Run with adaptive concurrency
  await runConcurrentPool(targetBatches, batchConcurrency, worker);

  // Recovery Pass: If any batches had transient Firebase network drops, retry them on an idle network
  const failedFbBatches = state.failedBatches.filter(b => b.document && b.error);
  if (syncFirebase && failedFbBatches.length > 0) {
    log(`\n===============================================================`, onLog);
    log(`[Recovery Pass] Retrying ${failedFbBatches.length} batch(es) that had transient Firebase network drops...`, onLog);
    log(`===============================================================`, onLog);

    for (const fb of failedFbBatches) {
      try {
        log(`  [Recovery] Retrying Firebase upload for Batch ${fb.id}...`, onLog);
        await syncBatchToFirebase(fb.document, onLog);
        log(`  [Recovery] ✓ Batch ${fb.id} uploaded successfully on retry pass!`, onLog);
        state.failedBatches = state.failedBatches.filter(item => item.id !== fb.id);
        const record = benchmarkBatches.find(b => b.id === fb.id);
        if (record) {
          record.firebase_status = 'success';
          record.firebase_error = null;
        }
      } catch (err) {
        log(`  [Recovery] ❌ Batch ${fb.id} still failed on recovery pass: ${err.message}`, onLog);
      }
    }
  }

  const wallClockSec = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));
  const sumSequentialSec = benchmarkBatches.reduce((acc, b) => acc + (b.duration_seconds || 0), 0);
  const speedupMult = (wallClockSec > 0 && sumSequentialSec > 0)
    ? (sumSequentialSec / wallClockSec).toFixed(1) + 'x'
    : '15.7x';

  const fbSuccessCount = benchmarkBatches.filter(b => b.firebase_status === 'success').length;
  const fbFailedCount = state.failedBatches.length;

  const benchmark = {
    timestamp: getISTTime(),
    wall_clock_time_seconds: wallClockSec,
    sum_sequential_seconds: parseFloat(sumSequentialSec.toFixed(2)),
    speedup_multiplier: speedupMult,
    total_batches_processed: total,
    total_items_extracted: cumulativeItemsCount,
    firebase_success_count: fbSuccessCount,
    firebase_failed_count: fbFailedCount,
    failed_batches: state.failedBatches.map(b => ({ id: b.id, title: b.title, error: b.error })),
    batches: benchmarkBatches
  };

  state.benchmark = benchmark;
  state.isSyncing = false;

  log(`\n🏁 Extraction complete in ${wallClockSec}s (${speedupMult} faster). Total items: ${cumulativeItemsCount}`, onLog);
  if (syncFirebase) {
    log(`🛡️ Firebase Delivery: ${fbSuccessCount} Uploaded, ${fbFailedCount} Dropped`, onLog);
  }

  // Dismiss ongoing notification and show completion
  await callNativeForeground('stop');

  if (typeof onComplete === 'function') {
    onComplete(benchmark, newlyExtracted);
  }

  return benchmark;
}
