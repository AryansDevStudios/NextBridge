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
  if (bytesPerSec >= 1024 * 1024) {
    return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
  }
  return Math.round(bytesPerSec / 1024) + ' KB/s';
}

export function formatTimeRemaining(seconds) {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s remaining`;
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m < 60) return `${m}m ${remSec}s remaining`;
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  return `${h}h ${remMin}m remaining`;
}

class DownloadManagerService {
  constructor() {
    this.activeDownloads = new Map(); // id -> DownloadTask
    this.queuedDownloads = []; // array of items waiting for slot
    this.listeners = new Set();
    this.maxConcurrentVideos = 3;
    this.fetchConcurrency = 8;
    this.queryConcurrency = 25;
    this.wakeLock = null;

    // Listen for notification tray actions (pause, resume, cancel)
    if (Capacitor.isNativePlatform()) {
      try {
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
        console.warn('[DownloadManager] Failed to attach native action listener:', e);
      }

      // Prompt notification permission on first launch for download status bar alerts
      this.requestNotificationPermission().catch(() => {});
    }
  }

  async requestNotificationPermission() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      if (typeof DownloadService.requestPermissions === 'function') {
        await DownloadService.requestPermissions();
      }
    } catch (e) {
      console.warn('[DownloadManager] Notification permission request:', e);
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
    this.syncNativeNotification();
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
   * Accurate segment query: fetches all segments via 50 concurrent HEAD requests
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

    // Query each variant in sequence, using 50 concurrent HEAD requests per variant
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

        // Query segments using 50 concurrency
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

    const existing = this.activeDownloads.get(String(item.id));
    if (existing) {
      if (existing.status === 'paused') {
        this.resumeDownload(item.id);
      }
      return;
    }

    // Check if already queued
    if (this.queuedDownloads.some(q => String(q.item.id) === String(item.id))) {
      return;
    }

    const task = new DownloadTask(this, item, variant);

    if (this.activeDownloads.size < this.maxConcurrentVideos) {
      this.activeDownloads.set(String(item.id), task);
      this.acquireWakeLock();
      task.start();
    } else {
      this.queuedDownloads.push({ item, variant, task });
    }

    this.notify();
  }

  pauseDownload(itemId) {
    const task = this.activeDownloads.get(String(itemId));
    if (task) {
      task.pause();
      this.notify();
    }
  }

  resumeDownload(itemId) {
    const task = this.activeDownloads.get(String(itemId));
    if (task) {
      this.acquireWakeLock();
      task.resume();
      this.notify();
    }
  }

  async cancelDownload(itemId) {
    const strId = String(itemId);
    const task = this.activeDownloads.get(strId);
    if (task) {
      task.cancel();
      this.activeDownloads.delete(strId);
    } else {
      this.queuedDownloads = this.queuedDownloads.filter(q => String(q.item.id) !== strId);
    }

    // Clean disk files
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

  onTaskCompleted(itemId, task) {
    const strId = String(itemId);
    this.activeDownloads.delete(strId);

    // Save to download registry
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
      this.stopNativeNotification();
    }
  }

  syncNativeNotification() {
    if (!Capacitor.isNativePlatform()) return;

    if (this.activeDownloads.size === 0) {
      this.stopNativeNotification();
      return;
    }

    // Aggregate summary for notification
    const tasks = Array.from(this.activeDownloads.values());
    const first = tasks[0];
    const totalSpeed = tasks.reduce((sum, t) => sum + (t.status === 'downloading' ? t.speedBytesPerSec : 0), 0);
    const totalDownloaded = tasks.reduce((sum, t) => sum + t.downloadedBytes, 0);
    const totalSize = tasks.reduce((sum, t) => sum + t.totalBytes, 0);
    const overallPercent = totalSize > 0 ? Math.round((totalDownloaded / totalSize) * 100) : 0;
    const isAllPaused = tasks.every(t => t.status === 'paused');

    let title = tasks.length === 1 
      ? `Downloading: ${first.item.title}`
      : `Downloading ${tasks.length} Videos (${overallPercent}%)`;

    let subtext = `${formatBytes(totalDownloaded)} / ${formatBytes(totalSize)}`;
    if (totalSpeed > 0 && !isAllPaused) {
      subtext += ` • ${formatSpeed(totalSpeed)}`;
      const remainingBytes = Math.max(0, totalSize - totalDownloaded);
      const eta = remainingBytes / totalSpeed;
      if (eta > 0) subtext += ` • ${formatTimeRemaining(eta)}`;
    } else if (isAllPaused) {
      subtext += ' • Paused';
    }

    try {
      DownloadService.updateProgress({
        title,
        subtext,
        progress: overallPercent,
        isPaused: isAllPaused,
        downloadId: String(first.item.id)
      }).catch(() => {
        // Fallback to start if not started
        DownloadService.startDownload({
          title,
          subtext,
          progress: overallPercent,
          isPaused: isAllPaused,
          downloadId: String(first.item.id)
        }).catch(() => {});
      });
    } catch (e) {}
  }

  stopNativeNotification() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      DownloadService.stopDownload().catch(() => {});
    } catch (e) {}
  }
}

class DownloadTask {
  constructor(manager, item, variant) {
    this.manager = manager;
    this.item = item;
    this.variant = variant;
    this.status = 'queued'; // queued | downloading | paused | done | error
    this.downloadedBytes = 0;
    this.totalBytes = variant.exactBytes || Math.round((variant.bandwidth / 8) * (item.duration || 3600));
    this.speedBytesPerSec = 0;
    this.etaSeconds = 0;
    this.percent = 0;
    this.completedSegments = new Set();
    this.allSegments = [];
    this.modifiedPlaylist = [];
    this.abortController = null;
    this.speedInterval = null;
    this.lastBytes = 0;
  }

  toPublicState() {
    return {
      id: this.item.id,
      title: this.item.title,
      thumbnail: this.item.thumbnail,
      quality: `${this.variant.height}p`,
      status: this.status,
      percent: this.percent,
      downloadedBytes: this.downloadedBytes,
      totalBytes: this.totalBytes,
      formattedDownloaded: formatBytes(this.downloadedBytes),
      formattedTotal: formatBytes(this.totalBytes),
      speed: formatSpeed(this.speedBytesPerSec),
      eta: formatTimeRemaining(this.etaSeconds),
      completedChunks: this.completedSegments.size,
      totalChunks: this.allSegments.length
    };
  }

  async start() {
    this.status = 'downloading';
    this.abortController = new AbortController();
    this.startSpeedTracker();

    try {
      const baseDir = `downloads/${this.item.id}`;
      await Filesystem.mkdir({ path: baseDir, directory: Directory.Data, recursive: true });

      // Fetch variant playlist if not already fetched
      if (this.allSegments.length === 0) {
        const vRes = await fetch(this.variant.url, { signal: this.abortController.signal });
        const vText = await vRes.text();
        const vBase = this.variant.url.substring(0, this.variant.url.lastIndexOf('/') + 1);
        const lines = vText.split('\n');

        let segIdx = 0;
        this.modifiedPlaylist = [];
        this.allSegments = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('#')) {
            this.modifiedPlaylist.push(trimmed);
          } else {
            const localName = `seg_${segIdx}.ts`;
            this.modifiedPlaylist.push(localName);
            const fullUrl = trimmed.startsWith('http') ? trimmed : vBase + trimmed;
            this.allSegments.push({ url: fullUrl, localName, index: segIdx });
            segIdx++;
          }
        }
      }

      await this.runParallelDownload();
    } catch (err) {
      if (err.name === 'AbortError' || this.status === 'paused') {
        // Expected during pause or cancel
        return;
      }
      console.error(`[DownloadTask ${this.item.id}] Error:`, err);
      this.status = 'error';
      this.stopSpeedTracker();
      this.manager.notify();
    }
  }

  async runParallelDownload() {
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
          // Download segment file directly to Directory.Data
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
          // Retry once
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

    // 16 concurrent workers
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

    // Write modified index.m3u8
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

  startSpeedTracker() {
    this.stopSpeedTracker();
    this.lastBytes = this.downloadedBytes;

    this.speedInterval = setInterval(() => {
      const deltaBytes = Math.max(0, this.downloadedBytes - this.lastBytes);
      this.lastBytes = this.downloadedBytes;
      this.speedBytesPerSec = deltaBytes;

      if (this.speedBytesPerSec > 0) {
        const remainingBytes = Math.max(0, this.totalBytes - this.downloadedBytes);
        this.etaSeconds = Math.round(remainingBytes / this.speedBytesPerSec);
      } else {
        this.etaSeconds = 0;
      }
      this.manager.notify();
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
