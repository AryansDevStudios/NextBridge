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
        local.forEach(item => map.set(String(item.id), item));
        res.downloads.forEach(item => map.set(String(item.id), item));
        const merged = Array.from(map.values()).sort((a, b) => {
          const tA = new Date(a.downloadedAt || 0).getTime();
          const tB = new Date(b.downloadedAt || 0).getTime();
          return tB - tA;
        });
        localStorage.setItem('downloaded_lectures', JSON.stringify(merged));
      }
    } catch (e) {
      console.warn('[DownloadManager] syncCompletedFromRegistry error:', e);
    }
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
   * Accurate segment query: fetches all segments via 25 concurrent HEAD requests
   */
  async queryAccurateResolutionSizes(masterUrl, duration, onProgress) {
    let masterText = '';
    const response = await fetch(masterUrl);
    if (!response.ok) throw new Error('Failed to fetch master manifest');
    masterText = await response.text();

    const baseMasterUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
    const lines = masterText.split('\n');
    const variants = [];

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
          variants.push({ height, bandwidth, url: vUrl });
        }
      }
    }

    if (variants.length === 0) {
      return [{
        height: 720,
        url: masterUrl,
        bandwidth: 1200000,
        estimatedBytes: Math.round((1200000 / 8) * (duration || 3600)),
        formattedSize: formatBytes(Math.round((1200000 / 8) * (duration || 3600)))
      }];
    }

    variants.sort((a, b) => b.height - a.height);

    // Query each variant in sequence, using 25 concurrent HEAD requests per variant
    const resolvedVariants = [];

    for (const variant of variants) {
      try {
        const vRes = await fetch(variant.url);
        if (!vRes.ok) throw new Error('Variant fetch failed');
        const vText = await vRes.text();
        const vBase = variant.url.substring(0, variant.url.lastIndexOf('/') + 1);
        const segmentUrls = [];

        for (const vLine of vText.split('\n')) {
          const trimmed = vLine.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            segmentUrls.push(trimmed.startsWith('http') ? trimmed : vBase + trimmed);
          }
        }

        if (segmentUrls.length === 0) {
          const est = Math.round((variant.bandwidth / 8) * (duration || 3600));
          resolvedVariants.push({
            ...variant,
            exactBytes: est,
            formattedSize: formatBytes(est),
            isEstimated: true
          });
          continue;
        }

        let totalBytes = 0;
        let completed = 0;
        let failedHead = false;

        const workerPool = async (urls) => {
          let idx = 0;
          const runWorker = async () => {
            while (idx < urls.length) {
              const myIdx = idx++;
              const segUrl = urls[myIdx];
              try {
                const headRes = await fetch(segUrl, { method: 'HEAD' });
                const cl = headRes.headers.get('content-length');
                if (cl) {
                  totalBytes += parseInt(cl);
                } else {
                  failedHead = true;
                }
              } catch (e) {
                failedHead = true;
              }
              completed++;
              if (onProgress) {
                onProgress({
                  variantHeight: variant.height,
                  completed,
                  total: urls.length
                });
              }
            }
          };

          const workers = [];
          for (let w = 0; w < Math.min(this.queryConcurrency, urls.length); w++) {
            workers.push(runWorker());
          }
          await Promise.all(workers);
        };

        await workerPool(segmentUrls);

        if (failedHead || totalBytes === 0) {
          totalBytes = Math.round((variant.bandwidth / 8) * (duration || 3600));
        }

        resolvedVariants.push({
          ...variant,
          exactBytes: totalBytes,
          formattedSize: formatBytes(totalBytes),
          isEstimated: failedHead,
          segmentCount: segmentUrls.length
        });
      } catch (err) {
        const est = Math.round((variant.bandwidth / 8) * (duration || 3600));
        resolvedVariants.push({
          ...variant,
          exactBytes: est,
          formattedSize: formatBytes(est),
          isEstimated: true
        });
      }
    }

    return resolvedVariants;
  }

  enqueueDownload(item, variant) {
    this.requestNotificationPermission().catch(() => {});
    const strId = String(item.id);

    const existing = this.activeDownloads.get(strId);
    if (existing) {
      if (existing.status === 'paused') {
        this.resumeDownload(strId);
      }
      return;
    }

    if (Capacitor.isNativePlatform()) {
      // 1. Dispatch native foreground download service (stays alive even if swiped from recents!)
      DownloadService.startDownload({
        id: strId,
        title: item.title || 'Lecture',
        subjectName: item.unified_path || item.folder_path || 'Class Lecture',
        folderPath: item.folder_path || '',
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
      updated.unshift({
        id: task.item.id,
        title: task.item.title,
        subjectName: task.item.unified_path || task.item.folder_path || 'Class Lecture',
        folderPath: task.item.folder_path || '',
        duration: task.item.duration || 0,
        thumbnail: task.item.thumbnail || null,
        downloadedAt: new Date().toISOString(),
        path: `downloads/${task.item.id}`,
        quality: `${task.variant.height}p`,
        sizeBytes: task.downloadedBytes || task.totalBytes,
        formattedSize: formatBytes(task.downloadedBytes || task.totalBytes)
      });
      localStorage.setItem('downloaded_lectures', JSON.stringify(updated));
    } catch (e) {
      console.warn('[DownloadManager] Failed to record completed download:', e);
    }

    this.checkQueue();
    this.notify();
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

    await Filesystem.writeFile({
      path: `${baseDir}/index.m3u8`,
      data: this.modifiedPlaylist.join('\n'),
      directory: Directory.Data,
      encoding: 'utf8'
    });

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
