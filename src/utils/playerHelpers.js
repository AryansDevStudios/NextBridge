export function formatSeekTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function convertDownloadUrlToHls(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  if (rawUrl.includes('.m3u8')) return rawUrl;
  const match = rawUrl.match(/(?:file_library\/videos\/download|\/download\/)\/(\d+)\/([a-zA-Z0-9_-]+)/);
  if (match) {
    const vdcPrefix = match[1];
    const fileHash = match[2];
    const hashSuffix = fileHash.length >= 7 ? fileHash.slice(-7) : fileHash;
    return `https://dbil3go8szhu6.cloudfront.net/file_library/videos/channel_vod_non_drm_hls/${vdcPrefix}/${fileHash}/${fileHash}_${hashSuffix}.m3u8`;
  }
  return rawUrl;
}
