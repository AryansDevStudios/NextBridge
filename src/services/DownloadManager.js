import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor, registerPlugin } from '@capacitor/core';

const DownloadService = registerPlugin('DownloadService');

export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  if (typeof bytesPerSec === 'string') return bytesPerSec;
  if (bytesPerSec >= 1024 * 1024) {
    return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
  }
  return Math.round(bytesPerSec / 1024) + ' KB/s';
}

export function formatTimeRemaining(seconds) {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '';
  if (typeof seconds === 'string') return seconds;
  const s = Math.round(seconds);
  if (s < 60) return `${s}s remaining`;
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m < 60) return `${m}m ${remSec}s remaining`;
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  return `${h}h ${remMin}m remaining`;
}

export async function cacheThumbnailLocally(remoteUrl) {
  if (!remoteUrl || typeof remoteUrl !== 'string') return remoteUrl;
  if (remoteUrl.startsWith('data:') || remoteUrl.startsWith('blob:') || remoteUrl.startsWith('file:') || remoteUrl.startsWith('capacitor:')) {
    return remoteUrl;
  }
  try {
    const res = await fetch(remoteUrl, { mode: 'cors' });
    if (!res.ok) return remoteUrl;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          resolve(remoteUrl);
        }
      };
      reader.onerror = () => resolve(remoteUrl);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[DownloadManager] Failed to cache thumbnail locally:', e);
    return remoteUrl;
  }
}

export function getDescriptivePdfFileName(item) {
  if (!item) return 'Document.pdf';

  const sanitize = (str) =>
    String(str || '')
      .replace(/\.pdf$/i, '')
      .replace(/[\\/:*?"<>|&]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .trim();

  // --- NCERT items: Book_Chapter_Subject ---
  if (item.source === 'ncert') {
    const book = sanitize(item.book_title || '');
    const chapter = sanitize(item.chapter_title || item.name || item.title || '');
    const subject = sanitize(
      (item.subject_name || item.subjectName || '')
        .replace(/^NCERT:\s*/i, '')
        .split('/')[0]
        .trim()
    );
    const parts = [book, chapter, subject].filter(Boolean);
    return `${parts.join('_')}.pdf`;
  }

  // --- PYQ items: FileName_Subject_Year ---
  if (item.source === 'pyq') {
    const name = sanitize(item.name || item.title || '');
    const pathParts = String(item.folder_path || item.raw_url || item.url || '').split('/').filter(Boolean);
    // Pick subject (first folder part) and year (second folder part if it looks like a year)
    const subjectPart = sanitize(item.subject_name || pathParts[0] || '');
    const yearPart = pathParts.find(p => /\d{4}/.test(p));
    const year = yearPart ? sanitize(yearPart) : '';
    const parts = [name, subjectPart, year].filter(Boolean);
    return `${parts.join('_')}.pdf`;
  }

  // --- RS Aggarwal items: RS_Aggarwal_Chapter_Mathematics ---
  if (item.source === 'rsa') {
    const chapter = sanitize(item.chapter_title || item.name || item.title || '');
    const parts = ['RS_Aggarwal', chapter, 'Mathematics'].filter(Boolean);
    return `${parts.join('_')}.pdf`;
  }

  // --- Regular course notes / lectures ---
  let rawTitle = (item.title || item.name || 'Notes').trim();
  rawTitle = rawTitle.replace(/\.pdf$/i, '');

  let rawSubject = (item.subject_name || item.subjectName || '').trim();
  rawSubject = rawSubject.replace(/^(NCERT|CBSE PYQ):\s*/i, '');
  if (rawSubject.includes('/')) {
    rawSubject = rawSubject.split('/')[0].trim();
  }

  let rawFolder = (item.folder_path || item.folderPath || '').trim();

  let baseParts = [rawTitle];

  // If it's a notes doc (folder includes "note" or title has lecture numbers like L1, L2)
  const isNotes = item.type === 'pdf' && (
    (rawFolder && rawFolder.toLowerCase().includes('note')) ||
    (/\bL\d+\b/i.test(rawTitle))
  );

  if (isNotes && !rawTitle.toLowerCase().includes('notes')) {
    baseParts.push('notes');
  }

  // Add subject if not already embedded
  if (rawSubject && !rawTitle.toLowerCase().includes(rawSubject.toLowerCase())) {
    baseParts.push(rawSubject);
  }

  const formatted = baseParts
    .join('_')
    .replace(/[\\/:*?"<>|&]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return `${formatted}.pdf`;
}

export function parseDownloadSubjectAndFolder(item) {
  if (!item) return { subject: 'General Studies', folder: 'Lectures' };

  let subject = (item.subject_name || item.subjectName || '').trim();
  let folder = (item.folder_path || item.folderPath || '').trim();

  // If source is ncert or pyq or rsa
  if (item.source === 'ncert' || subject.startsWith('NCERT:')) {
    if (!subject.startsWith('NCERT:')) subject = `NCERT: ${subject}`;
    if (!folder) folder = item.book_title || 'Textbooks';
  } else if (item.source === 'pyq' || subject.startsWith('CBSE PYQ:')) {
    if (!subject.startsWith('CBSE PYQ:')) subject = `CBSE PYQ: ${subject}`;
    if (!folder) folder = 'Question Papers';
  } else if (item.source === 'rsa') {
    subject = 'Mathematics';
    folder = 'RS Aggarwal';
  } else {
    // If subject contains slashes (e.g. "Social Science/Lectures" or "Social Science/History/Chapter 1")
    if (subject.includes('/')) {
      const parts = subject.split('/');
      subject = parts[0].trim();
      const remaining = parts.slice(1).join('/').trim();
      if (!folder) {
        folder = remaining;
      } else if (!folder.startsWith(remaining)) {
        folder = `${remaining}/${folder}`;
      }
    }

    // If unified_path exists and subject is generic or empty
    if ((!subject || subject === 'Class Lecture' || subject === 'General' || subject === 'General Studies') && item.unified_path) {
      const parts = item.unified_path.split('/');
      subject = parts[0].trim();
      if (!folder && parts.length > 1) {
        folder = parts.slice(1).join('/').trim();
      }
    }

    // Default folder if completely empty
    if (!folder) {
      folder = item.type === 'pdf' ? 'Notes' : 'Lectures';
    }

    if (!subject) {
      subject = 'General Studies';
    }
  }

  folder = folder.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  return { subject, folder };
}

class NativeTaskProxy {
  constructor(data) {
    this.id = String(data.id);
    this.title = data.title || 'Lecture';
    this.quality = data.quality || '720p';
    this.percent = data.percent || 0;
    this.downloadedBytes = data.downloadedBytes || 0;
    this.totalBytes = data.totalBytes || 0;
    this.speed = data.speed || '0 KB/s';
    this.eta = data.eta || 'calculating...';
    this.status = data.status || 'downloading';
  }

  update(data) {
    if (data.percent !== undefined) this.percent = data.percent;
    if (data.downloadedBytes !== undefined) this.downloadedBytes = data.downloadedBytes;
    if (data.totalBytes !== undefined) this.totalBytes = data.totalBytes;
    if (data.speed !== undefined) this.speed = data.speed;
    if (data.eta !== undefined) this.eta = data.eta;
    if (data.status !== undefined) this.status = data.status;
  }

  toPublicState() {
    return {
      id: this.id,
      title: this.title,
      quality: this.quality,
      percent: this.percent,
      downloadedBytes: this.downloadedBytes,
      totalBytes: this.totalBytes,
      formattedDownloaded: formatBytes(this.downloadedBytes),
      formattedTotal: formatBytes(this.totalBytes),
      speed: formatSpeed(this.speed),
      eta: formatTimeRemaining(this.eta),
      status: this.status
    };
  }
}

class DownloadManagerService {
  constructor() {
    this.activeDownloads = new Map(); // id -> DownloadTask or NativeTaskProxy
    this.queuedDownloads = []; // items waiting for slot
    this.listeners = new Set();
    this.maxConcurrentVideos = 3;
    this.fetchConcurrency = 8;
    this.queryConcurrency = 25;
    this.wakeLock = null;

    if (Capacitor.isNativePlatform()) {
      // 1. Listen for native background download progress events
      try {
        DownloadService.addListener('downloadProgress', (data) => {
          this.handleNativeProgress(data);
        });

        // 2. Listen for native completion events
        DownloadService.addListener('downloadCompleted', (data) => {
          this.handleNativeCompleted(data);
        });

        // 3. Listen for notification actions
        DownloadService.addListener('downloadAction', ({ action, downloadId }) => {
          if (action === 'pause') {
            this.pauseDownload(downloadId);
          } else if (action === 'resume') {
            this.resumeDownload(downloadId);
          } else if (action === 'cancel') {
            this.cancelDownload(downloadId);
          }
        });
      } catch (e) {
        console.warn('[DownloadManager] Failed to attach native listeners:', e);
      }

      // Prompt notification permission on first launch
      this.requestNotificationPermission().catch(() => {});

      // Sync any running tasks (e.g. if app was swiped from recents and reopened!)
      this.syncFromNativeService();
    }
  }

  async syncFromNativeService() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const res = await DownloadService.getActiveTasks();
      if (res && res.tasks && Array.isArray(res.tasks)) {
        res.tasks.forEach(t => {
          this.handleNativeProgress(t);
        });
      }
      await this.syncCompletedFromRegistry();
    } catch (e) {
      console.warn('[DownloadManager] syncFromNativeService error:', e);
    }
  }

  async syncCompletedFromRegistry() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const res = await DownloadService.getCompletedDownloads();
      if (res && res.downloads && Array.isArray(res.downloads)) {
        const local = JSON.parse(localStorage.getItem('downloaded_lectures') || '[]');
        const map = new Map();
        local.forEach(item => {
          const { subject, folder } = parseDownloadSubjectAndFolder(item);
          map.set(String(item.id), { ...item, subjectName: subject, folderPath: folder });
        });
        res.downloads.forEach(item => {
          const strId = String(item.id);
          const { subject, folder } = parseDownloadSubjectAndFolder(item);
          const existing = map.get(strId);
          // Preserve local cached data: URI thumbnail if already present
          const thumb = (existing?.thumbnail && existing.thumbnail.startsWith('data:'))
            ? existing.thumbnail
            : (item.thumbnail || existing?.thumbnail || '');
          map.set(strId, { ...existing, ...item, thumbnail: thumb, subjectName: subject, folderPath: folder });
        });
        const merged = Array.from(map.values()).sort((a, b) => {
          const tA = new Date(a.downloadedAt || 0).getTime();
          const tB = new Date(b.downloadedAt || 0).getTime();
          return tB - tA;
        });
        localStorage.setItem('downloaded_lectures', JSON.stringify(merged));
        this.cacheRemoteThumbnails(merged);
      }
    } catch (e) {
      console.warn('[DownloadManager] syncCompletedFromRegistry error:', e);
    }
  }

  cacheRemoteThumbnails(items) {
    if (!navigator.onLine || !Array.isArray(items)) return;
    items.forEach(async (item) => {
      if (item.thumbnail && (item.thumbnail.startsWith('http://') || item.thumbnail.startsWith('https://'))) {
        try {
          const cached = await cacheThumbnailLocally(item.thumbnail);
          if (cached && cached.startsWith('data:')) {
            const list = JSON.parse(localStorage.getItem('downloaded_lectures') || '[]');
            const idx = list.findIndex(d => String(d.id) === String(item.id));
            if (idx !== -1 && list[idx].thumbnail !== cached) {
              list[idx].thumbnail = cached;
              localStorage.setItem('downloaded_lectures', JSON.stringify(list));
              this.notify();
            }
          }
        } catch (_) {}
      }
    });
  }

  handleNativeProgress(data) {
    if (!data || !data.id) return;
    const strId = String(data.id);
    let task = this.activeDownloads.get(strId);
    if (!task) {
      task = new NativeTaskProxy(data);
      this.activeDownloads.set(strId, task);
    } else {
      task.update(data);
    }
    this.notify();
  }

  handleNativeCompleted(data) {
    if (!data || !data.id) return;
    const strId = String(data.id);
    this.activeDownloads.delete(strId);
    this.syncCompletedFromRegistry().catch(() => {});
    this.notify();
  }

  async requestNotificationPermission() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      if (typeof DownloadService.requestPermissions === 'function') {
        await DownloadService.requestPermissions();
      }
    } catch (e) {
      console.warn('[DownloadManager] Notification permission request error:', e);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  notify() {
    const state = this.getState();
    this.listeners.forEach(fn => fn(state));
  }

  getState() {
    return {
      active: Array.from(this.activeDownloads.values()).map(t => t.toPublicState()),
      queued: this.queuedDownloads.map(q => ({ ...q })),
      activeCount: this.activeDownloads.size
    };
  }

  async acquireWakeLock() {
    if ('wakeLock' in navigator && !this.wakeLock) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
      } catch (e) {}
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
      } catch (e) {}
      this.wakeLock = null;
    }
  }

  /**
   * Accurate segment query: fetches all variant manifests in parallel
   * and runs a single-pass concurrent HEAD worker pool with continuous 0-100% global progress
   */
  async queryAccurateResolutionSizes(masterUrl, duration, onProgress) {
    let masterText = '';
    const response = await fetch(masterUrl);
    if (!response.ok) throw new Error('Failed to fetch master manifest');
    masterText = await response.text();

    const baseMasterUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
    const lines = masterText.split('\n');
    const rawVariants = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        let height = 720;
        let bandwidth = 1200000;
        const resMatch = line.match(/RESOLUTION=\d+x(\d+)/i);
        if (resMatch) height = parseInt(resMatch[1]);
        const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
        if (bwMatch) bandwidth = parseInt(bwMatch[1]);

        let vUrl = lines[i + 1]?.trim();
        if (vUrl && !vUrl.startsWith('#')) {
          if (!vUrl.startsWith('http')) vUrl = baseMasterUrl + vUrl;
          rawVariants.push({ height, bandwidth, url: vUrl });
        }
      }
    }

    if (rawVariants.length === 0) {
      return [{
        height: 720,
        url: masterUrl,
        bandwidth: 1200000,
        exactBytes: Math.round((1200000 / 8) * (duration || 3600)),
        formattedSize: formatBytes(Math.round((1200000 / 8) * (duration || 3600))),
        isEstimated: true
      }];
    }

    rawVariants.sort((a, b) => b.height - a.height);

    // 1. Concurrently fetch all variant manifests in parallel
    const variantPlaylists = await Promise.all(rawVariants.map(async (variant) => {
      try {
        const vRes = await fetch(variant.url);
        if (!vRes.ok) return { variant, segments: [] };
        const vText = await vRes.text();
        const vBase = variant.url.substring(0, variant.url.lastIndexOf('/') + 1);
        const segmentUrls = [];

        for (const vLine of vText.split('\n')) {
          const trimmed = vLine.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            segmentUrls.push(trimmed.startsWith('http') ? trimmed : vBase + trimmed);
          }
        }
        return { variant, segments: segmentUrls };
      } catch (e) {
        return { variant, segments: [] };
      }
    }));

    // 2. Build a unified list of tasks across ALL streams
    const allTasks = [];
    variantPlaylists.forEach((vp, variantIndex) => {
      vp.segments.forEach((segUrl) => {
        allTasks.push({ variantIndex, segUrl });
      });
    });

    const totalTasks = allTasks.length;
    const variantBytes = new Array(variantPlaylists.length).fill(0);
    const variantFailed = new Array(variantPlaylists.length).fill(false);

    if (totalTasks === 0) {
      return variantPlaylists.map(vp => {
        const est = Math.round((vp.variant.bandwidth / 8) * (duration || 3600));
        return {
          ...vp.variant,
          exactBytes: est,
          formattedSize: formatBytes(est),
          isEstimated: true
        };
      });
    }

    // 3. Process all tasks in a single concurrent worker pool with global 0-100% progress
    let taskIdx = 0;
    let completedCount = 0;

    const worker = async () => {
      while (taskIdx < allTasks.length) {
        const currentTask = allTasks[taskIdx++];
        try {
          const headRes = await fetch(currentTask.segUrl, { method: 'HEAD' });
          const cl = headRes.headers.get('content-length');
          if (cl) {
            variantBytes[currentTask.variantIndex] += parseInt(cl);
          } else {
            variantFailed[currentTask.variantIndex] = true;
          }
        } catch (e) {
          variantFailed[currentTask.variantIndex] = true;
        }

        completedCount++;
        if (onProgress) {
          onProgress({
            completed: completedCount,
            total: totalTasks
          });
        }
      }
    };

    const workers = [];
    const concurrency = Math.min(30, totalTasks);
    for (let w = 0; w < concurrency; w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    // 4. Assemble resolved variants
    return variantPlaylists.map((vp, idx) => {
      let total = variantBytes[idx];
      const isFailed = variantFailed[idx] || total === 0;
      if (isFailed) {
        total = Math.round((vp.variant.bandwidth / 8) * (duration || 3600));
      }
      return {
        ...vp.variant,
        exactBytes: total,
        formattedSize: formatBytes(total),
        isEstimated: isFailed,
        segmentCount: vp.segments.length
      };
    });
  }

  enqueueDownload(item, variant) {
    this.requestNotificationPermission().catch(() => {});
    const strId = String(item.id);

    // Pre-cache thumbnail locally for offline rendering
    if (item.thumbnail && (item.thumbnail.startsWith('http://') || item.thumbnail.startsWith('https://'))) {
      cacheThumbnailLocally(item.thumbnail).then((cached) => {
        if (cached && cached.startsWith('data:')) {
          item.thumbnail = cached;
        }
      }).catch(() => {});
    }

    const existing = this.activeDownloads.get(strId);
    if (existing) {
      if (existing.status === 'paused') {
        this.resumeDownload(strId);
      }
      return;
    }

    if (Capacitor.isNativePlatform()) {
      // 1. Dispatch native foreground download service (stays alive even if swiped from recents!)
      const { subject, folder } = parseDownloadSubjectAndFolder(item);
      DownloadService.startDownload({
        id: strId,
        title: item.title || 'Lecture',
        subjectName: subject,
        folderPath: folder,
        duration: item.duration || 0,
        thumbnail: item.thumbnail || '',
        quality: `${variant.height}p`,
        playlistUrl: variant.url,
        totalBytes: variant.exactBytes || Math.round((variant.bandwidth / 8) * (item.duration || 3600))
      }).catch(err => {
        console.error('[DownloadManager] Native startDownload failed:', err);
      });

      // 2. Setup local proxy task immediately for smooth UI reaction
      const proxy = new NativeTaskProxy({
        id: strId,
        title: item.title,
        quality: `${variant.height}p`,
        percent: 0,
        downloadedBytes: 0,
        totalBytes: variant.exactBytes || Math.round((variant.bandwidth / 8) * (item.duration || 3600)),
        status: 'downloading'
      });
      this.activeDownloads.set(strId, proxy);
      this.acquireWakeLock();
      this.notify();
      return;
    }

    // Web Fallback
    if (this.queuedDownloads.some(q => String(q.item.id) === strId)) {
      return;
    }

    const task = new DownloadTask(this, item, variant);
    if (this.activeDownloads.size < this.maxConcurrentVideos) {
      this.activeDownloads.set(strId, task);
      this.acquireWakeLock();
      task.start();
    } else {
      this.queuedDownloads.push({ item, variant, task });
    }

    this.notify();
  }

  pauseDownload(itemId) {
    const strId = String(itemId);
    if (Capacitor.isNativePlatform()) {
      DownloadService.pauseDownload({ id: strId }).catch(() => {});
      const task = this.activeDownloads.get(strId);
      if (task) {
        task.status = 'paused';
        this.notify();
      }
      return;
    }

    const task = this.activeDownloads.get(strId);
    if (task && typeof task.pause === 'function') {
      task.pause();
      this.notify();
    }
  }

  resumeDownload(itemId) {
    const strId = String(itemId);
    if (Capacitor.isNativePlatform()) {
      DownloadService.resumeDownload({ id: strId }).catch(() => {});
      const task = this.activeDownloads.get(strId);
      if (task) {
        task.status = 'downloading';
        this.notify();
      }
      return;
    }

    const task = this.activeDownloads.get(strId);
    if (task && typeof task.resume === 'function') {
      this.acquireWakeLock();
      task.resume();
      this.notify();
    }
  }

  async cancelDownload(itemId) {
    const strId = String(itemId);
    if (Capacitor.isNativePlatform()) {
      DownloadService.cancelDownload({ id: strId }).catch(() => {});
      this.activeDownloads.delete(strId);
      this.notify();
      return;
    }

    const task = this.activeDownloads.get(strId);
    if (task && typeof task.cancel === 'function') {
      task.cancel();
      this.activeDownloads.delete(strId);
    } else {
      this.queuedDownloads = this.queuedDownloads.filter(q => String(q.item.id) !== strId);
    }

    try {
      await Filesystem.rmdir({
        path: `downloads/${strId}`,
        directory: Directory.Data,
        recursive: true
      });
    } catch (e) {}

    this.checkQueue();
    this.notify();
  }

  async deleteDownload(itemId) {
    const strId = String(itemId);
    if (Capacitor.isNativePlatform()) {
      try {
        await DownloadService.deleteDownload({ id: strId });
      } catch (e) {}
    }

    try {
      await Filesystem.rmdir({
        path: `downloads/${strId}`,
        directory: Directory.Data,
        recursive: true
      });
    } catch (e) {}

    const local = JSON.parse(localStorage.getItem('downloaded_lectures') || '[]');
    const updated = local.filter(d => String(d.id) !== strId);
    localStorage.setItem('downloaded_lectures', JSON.stringify(updated));
    this.notify();
  }

  onTaskCompleted(itemId, task) {
    const strId = String(itemId);
    this.activeDownloads.delete(strId);

    try {
      const existing = JSON.parse(localStorage.getItem('downloaded_lectures') || '[]');
      const updated = existing.filter(d => String(d.id) !== strId);
      const { subject, folder } = parseDownloadSubjectAndFolder(task.item);
      // swPlaylistUrl: served by the Service Worker from IndexedDB on web
      const swPlaylistUrl = `/sw-hls/${strId}/index.m3u8`;
      let thumb = task.item.thumbnail || null;
      updated.unshift({
        id: task.item.id,
        title: task.item.title,
        subjectName: subject,
        folderPath: folder,
        duration: task.item.duration || 0,
        thumbnail: thumb,
        downloadedAt: new Date().toISOString(),
        path: `downloads/${task.item.id}`,
        quality: `${task.variant.height}p`,
        sizeBytes: task.downloadedBytes || task.totalBytes,
        formattedSize: formatBytes(task.downloadedBytes || task.totalBytes),
        swPlaylistUrl,
      });
      localStorage.setItem('downloaded_lectures', JSON.stringify(updated));

      // Asynchronously cache thumbnail offline if remote
      if (thumb && (thumb.startsWith('http://') || thumb.startsWith('https://'))) {
        cacheThumbnailLocally(thumb).then(cached => {
          if (cached && cached.startsWith('data:')) {
            const cur = JSON.parse(localStorage.getItem('downloaded_lectures') || '[]');
            const idx = cur.findIndex(d => String(d.id) === strId);
            if (idx !== -1) {
              cur[idx].thumbnail = cached;
              localStorage.setItem('downloaded_lectures', JSON.stringify(cur));
              this.notify();
            }
          }
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('[DownloadManager] Failed to record completed download:', e);
    }

    this.checkQueue();
    this.notify();
  }

  async downloadPdf(item) {
    const strId = String(item.id);
    const fileName = `document_${strId}.pdf`;
    const folderDir = `downloads/${strId}`;
    const filePath = `${folderDir}/${fileName}`;

    const proxy = new NativeTaskProxy({
      id: strId,
      title: item.title || 'PDF Document',
      quality: 'PDF',
      percent: 10,
      downloadedBytes: 0,
      totalBytes: 0,
      status: 'downloading'
    });
    this.activeDownloads.set(strId, proxy);
    this.notify();

    try {
      let sizeBytes = 0;
      if (Capacitor.isNativePlatform()) {
        await Filesystem.mkdir({
          path: folderDir,
          directory: Directory.Data,
          recursive: true
        }).catch(() => {});

        const res = await fetch(item.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        sizeBytes = blob.size;

        proxy.percent = 60;
        proxy.downloadedBytes = sizeBytes;
        proxy.totalBytes = sizeBytes;
        this.notify();

        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result;
            const base64 = typeof result === 'string' && result.includes(',') ? result.split(',')[1] : result;
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        await Filesystem.writeFile({
          path: filePath,
          data: base64Data,
          directory: Directory.Data
        });
      } else {
        const res = await fetch(item.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        sizeBytes = blob.size;
      }

      proxy.percent = 100;
      proxy.status = 'completed';
      this.activeDownloads.delete(strId);

      const { subject, folder } = parseDownloadSubjectAndFolder(item);
      const record = {
        id: strId,
        title: item.title,
        name: item.name || item.title,
        type: 'pdf',
        source: item.source || null,
        subject_name: item.subject_name || item.subjectName || subject,
        book_title: item.book_title || null,
        chapter_title: item.chapter_title || null,
        subjectName: subject,
        folderPath: folder,
        path: filePath,
        url: item.url,
        sizeBytes: sizeBytes,
        formattedSize: formatBytes(sizeBytes),
        downloadedAt: new Date().toISOString()
      };

      const existing = JSON.parse(localStorage.getItem('downloaded_lectures') || '[]');
      const updated = [record, ...existing.filter(d => String(d.id) !== strId)];
      localStorage.setItem('downloaded_lectures', JSON.stringify(updated));

      if (Capacitor.isNativePlatform()) {
        try {
          let reg = [];
          try {
            const regFile = await Filesystem.readFile({
              path: 'downloads/registry.json',
              directory: Directory.Data,
              encoding: 'utf8'
            });
            reg = JSON.parse(regFile.data || '[]');
          } catch (e) {}
          const filtered = reg.filter(r => String(r.id) !== strId);
          filtered.unshift(record);
          await Filesystem.writeFile({
            path: 'downloads/registry.json',
            data: JSON.stringify(filtered),
            directory: Directory.Data,
            encoding: 'utf8'
          });
        } catch (e) {
          console.warn('[DownloadManager] Failed to update registry.json for PDF:', e);
        }
      }

      this.notify();
      return record;
    } catch (err) {
      console.error('[DownloadManager] downloadPdf error:', err);
      this.activeDownloads.delete(strId);
      this.notify();
      throw err;
    }
  }

  async openPdf(item) {
    if (Capacitor.isNativePlatform()) {
      try {
        const DownloadService = registerPlugin('DownloadService');
        await DownloadService.openPdf({ path: item.path || `downloads/${item.id}/document_${item.id}.pdf` });
        return true;
      } catch (e) {
        console.warn('[DownloadManager] openPdf native intent failed, falling back to URL:', e);
      }
    }
    if (item.url) {
      window.open(item.url, '_blank');
    }
    return false;
  }

  async getPdfLocalUrl(item) {
    if (!item) return '';
    if (Capacitor.isNativePlatform()) {
      try {
        const strId = String(item.id);
        const relPath = item.path || `downloads/${strId}/document_${strId}.pdf`;

        // Read the file as base64 — avoids the _capacitor_file_ URL scheme which
        // the Capacitor WebView's localhost server cannot serve from internal storage
        const result = await Filesystem.readFile({
          path: relPath,
          directory: Directory.Data
        });

        if (result && result.data) {
          // Create an in-memory blob URL accessible to the WebView's PDF.js iframe
          const byteChars = atob(result.data);
          const byteNums = new Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteNums[i] = byteChars.charCodeAt(i);
          }
          const byteArr = new Uint8Array(byteNums);
          const blob = new Blob([byteArr], { type: 'application/pdf' });
          return URL.createObjectURL(blob);
        }
      } catch (e) {
        console.warn('[DownloadManager] Failed to read local PDF as blob, falling back to remote:', e);
      }
    }
    return item.url || '';
  }

  async saveToDevice(item) {
    const strId = String(item.id);
    const fileName = getDescriptivePdfFileName(item);

    if (Capacitor.isNativePlatform()) {
      let relPath = item.path || `downloads/${strId}/document_${strId}.pdf`;
      const isLocallySaved = this.isDownloaded(strId);
      if (!isLocallySaved) {
        await this.downloadPdf(item);
        relPath = `downloads/${strId}/document_${strId}.pdf`;
      }
      return await DownloadService.saveToDeviceDownloads({
        path: relPath,
        fileName: fileName
      });
    } else {
      try {
        const res = await fetch(item.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        return { success: true };
      } catch (e) {
        console.warn('[DownloadManager] Web saveToDevice fallback to direct open:', e);
        const a = document.createElement('a');
        a.href = item.url;
        a.download = fileName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return { success: true };
      }
    }
  }

  async sharePdf(item) {
    const strId = String(item.id);
    const fileName = getDescriptivePdfFileName(item);

    if (Capacitor.isNativePlatform()) {
      let relPath = item.path || `downloads/${strId}/document_${strId}.pdf`;
      const isLocallySaved = this.isDownloaded(strId);
      if (!isLocallySaved) {
        await this.downloadPdf(item);
        relPath = `downloads/${strId}/document_${strId}.pdf`;
      }
      return await DownloadService.sharePdf({
        path: relPath,
        title: item.title || 'Study Notes',
        fileName: fileName
      });
    } else {
      try {
        if (navigator.share) {
          const res = await fetch(item.url);
          const blob = await res.blob();
          const file = new File([blob], fileName, { type: 'application/pdf' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: item.title || 'Study Notes',
              files: [file]
            });
            return true;
          } else {
            await navigator.share({
              title: item.title || 'Study Notes',
              url: item.url
            });
            return true;
          }
        }
      } catch (e) {
        console.warn('[DownloadManager] Web share failed:', e);
      }
      if (item.url) {
        window.open(item.url, '_blank');
      }
      return false;
    }
  }

  getStorageDetails() {
    try {
      const items = JSON.parse(localStorage.getItem('downloaded_lectures') || '[]');
      let videoCount = 0;
      let videoSizeBytes = 0;
      let pdfCount = 0;
      let pdfSizeBytes = 0;

      items.forEach(item => {
        const size = Number(item.sizeBytes) || 0;
        if (item.type === 'pdf') {
          pdfCount++;
          pdfSizeBytes += size;
        } else {
          videoCount++;
          videoSizeBytes += size;
        }
      });

      const totalSizeBytes = videoSizeBytes + pdfSizeBytes;
      return {
        totalItems: items.length,
        totalSizeBytes,
        formattedTotalSize: formatBytes(totalSizeBytes),
        videoCount,
        videoSizeBytes,
        formattedVideoSize: formatBytes(videoSizeBytes),
        pdfCount,
        pdfSizeBytes,
        formattedPdfSize: formatBytes(pdfSizeBytes),
        items
      };
    } catch (e) {
      return {
        totalItems: 0,
        totalSizeBytes: 0,
        formattedTotalSize: '0 B',
        videoCount: 0,
        videoSizeBytes: 0,
        formattedVideoSize: '0 B',
        pdfCount: 0,
        pdfSizeBytes: 0,
        formattedPdfSize: '0 B',
        items: []
      };
    }
  }

  isDownloaded(itemId) {
    const strId = String(itemId);
    try {
      const local = JSON.parse(localStorage.getItem('downloaded_lectures') || '[]');
      return local.some(d => String(d.id) === strId);
    } catch (e) {
      return false;
    }
  }

  isDownloading(itemId) {
    const strId = String(itemId);
    return this.activeDownloads.has(strId);
  }

  getDownloadedItem(itemId) {
    const strId = String(itemId);
    try {
      const local = JSON.parse(localStorage.getItem('downloaded_lectures') || '[]');
      return local.find(d => String(d.id) === strId) || null;
    } catch (e) {
      return null;
    }
  }

  checkQueue() {
    while (this.activeDownloads.size < this.maxConcurrentVideos && this.queuedDownloads.length > 0) {
      const next = this.queuedDownloads.shift();
      this.activeDownloads.set(String(next.item.id), next.task);
      this.acquireWakeLock();
      next.task.start();
    }

    if (this.activeDownloads.size === 0) {
      this.releaseWakeLock();
    }
  }
}

/**
 * Web / Browser Fallback Task
 */
class DownloadTask {
  constructor(manager, item, variant) {
    this.manager = manager;
    this.item = item;
    this.variant = variant;
    this.status = 'queued';
    this.downloadedBytes = 0;
    this.totalBytes = variant.exactBytes || Math.round((variant.bandwidth / 8) * (item.duration || 3600));
    this.speedBytesPerSec = 0;
    this.etaSeconds = 0;
    this.percent = 0;
    this.abortController = null;
    this.allSegments = [];
    this.completedSegments = new Set();
    this.modifiedPlaylist = [];
    this.lastBytes = 0;
    this.lastTime = Date.now();
    this.speedInterval = null;
  }

  toPublicState() {
    return {
      id: this.item.id,
      title: this.item.title,
      quality: `${this.variant.height}p`,
      percent: this.percent,
      downloadedBytes: this.downloadedBytes,
      totalBytes: this.totalBytes,
      formattedDownloaded: formatBytes(this.downloadedBytes),
      formattedTotal: formatBytes(this.totalBytes),
      speed: formatSpeed(this.speedBytesPerSec),
      eta: formatTimeRemaining(this.etaSeconds),
      status: this.status
    };
  }

  startSpeedTracker() {
    this.lastTime = Date.now();
    this.lastBytes = this.downloadedBytes;
    this.speedInterval = setInterval(() => {
      const now = Date.now();
      const timeDiff = (now - this.lastTime) / 1000;
      if (timeDiff >= 1) {
        const bytesDiff = this.downloadedBytes - this.lastBytes;
        this.speedBytesPerSec = Math.max(0, Math.round(bytesDiff / timeDiff));
        const rem = Math.max(0, this.totalBytes - this.downloadedBytes);
        this.etaSeconds = this.speedBytesPerSec > 0 ? rem / this.speedBytesPerSec : 0;
        this.lastTime = now;
        this.lastBytes = this.downloadedBytes;
        this.manager.notify();
      }
    }, 1000);
  }

  stopSpeedTracker() {
    if (this.speedInterval) {
      clearInterval(this.speedInterval);
      this.speedInterval = null;
    }
    this.speedBytesPerSec = 0;
    this.etaSeconds = 0;
  }

  async start() {
    this.status = 'downloading';
    this.abortController = new AbortController();
    this.startSpeedTracker();

    try {
      const baseDir = `downloads/${this.item.id}`;
      await Filesystem.mkdir({ path: baseDir, directory: Directory.Data, recursive: true });

      const res = await fetch(this.variant.url, { signal: this.abortController.signal });
      if (!res.ok) throw new Error('Variant playlist fetch failed');
      const text = await res.text();

      const basePrefix = this.variant.url.substring(0, this.variant.url.lastIndexOf('/') + 1);
      const lines = text.split('\n');
      this.allSegments = [];
      this.modifiedPlaylist = [];
      let segIdx = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const segUrl = trimmed.startsWith('http') ? trimmed : basePrefix + trimmed;
          const localName = `segment_${segIdx}.ts`;
          this.allSegments.push({ url: segUrl, localName, index: segIdx });
          this.modifiedPlaylist.push(localName);
          segIdx++;
        } else {
          this.modifiedPlaylist.push(line);
        }
      }

      await this.downloadSegmentsInParallel();
    } catch (err) {
      if (this.abortController?.signal.aborted) return;
      console.error('[DownloadTask] Failed:', err);
      this.status = 'error';
      this.stopSpeedTracker();
      this.manager.notify();
    }
  }

  async downloadSegmentsInParallel() {
    const baseDir = `downloads/${this.item.id}`;
    const pending = this.allSegments.filter(s => !this.completedSegments.has(s.index));

    if (pending.length === 0) {
      await this.finishDownload();
      return;
    }

    let queueIdx = 0;
    const signal = this.abortController.signal;

    const worker = async () => {
      while (queueIdx < pending.length) {
        if (signal.aborted || this.status === 'paused') return;

        const myIdx = queueIdx++;
        const seg = pending[myIdx];

        try {
          const res = await fetch(seg.url, { signal });
          const blob = await res.blob();
          const buffer = await blob.arrayBuffer();
          const base64 = this.arrayBufferToBase64(buffer);

          await Filesystem.writeFile({
            path: `${baseDir}/${seg.localName}`,
            data: base64,
            directory: Directory.Data
          });

          this.completedSegments.add(seg.index);
          this.downloadedBytes += blob.size;

          const pct = Math.min(99, Math.round((this.completedSegments.size / this.allSegments.length) * 100));
          this.percent = pct;
          this.manager.notify();
        } catch (e) {
          if (signal.aborted || this.status === 'paused') return;
          try {
            await Filesystem.downloadFile({
              url: seg.url,
              path: `${baseDir}/${seg.localName}`,
              directory: Directory.Data
            });
            this.completedSegments.add(seg.index);
          } catch (retryErr) {}
        }
      }
    };

    const workers = [];
    for (let w = 0; w < Math.min(this.manager.fetchConcurrency, pending.length); w++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    if (this.completedSegments.size >= this.allSegments.length) {
      await this.finishDownload();
    }
  }

  async finishDownload() {
    const baseDir = `downloads/${this.item.id}`;

    // 1. Write local index.m3u8 (segment_N.ts filenames — used by native)
    await Filesystem.writeFile({
      path: `${baseDir}/index.m3u8`,
      data: this.modifiedPlaylist.join('\n'),
      directory: Directory.Data,
      encoding: 'utf8'
    });

    // 2. On web: also write a SW-served playlist where each segment URL is
    //    /sw-hls/{itemId}/segment_N.ts so the Service Worker can intercept and
    //    serve them from IndexedDB (Capacitor Filesystem web adapter storage).
    if (!Capacitor.isNativePlatform()) {
      const swPlaylist = this.modifiedPlaylist.map(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          // Replace bare segment filename with SW-served absolute path
          return `/sw-hls/${this.item.id}/${trimmed}`;
        }
        return line;
      });
      await Filesystem.writeFile({
        path: `${baseDir}/sw_index.m3u8`,
        data: swPlaylist.join('\n'),
        directory: Directory.Data,
        encoding: 'utf8'
      });
    }

    this.percent = 100;
    this.status = 'done';
    this.stopSpeedTracker();
    this.manager.onTaskCompleted(this.item.id, this);
  }

  pause() {
    this.status = 'paused';
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.stopSpeedTracker();
  }

  resume() {
    if (this.status === 'paused') {
      this.start();
    }
  }

  cancel() {
    this.status = 'cancelled';
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.stopSpeedTracker();
  }

  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}

export const downloadManager = new DownloadManagerService();
