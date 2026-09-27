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

  // 1. NextToppers 3-segment download URL: /download/<vdcPrefix>/<midFolder>/<fileHash>[_quality][.mp4]
  const match3 = rawUrl.match(/(?:file_library\/videos\/download|\/download\/)\/(\d+)\/[^/]+\/([0-9a-zA-Z_-]+?)(?:_(?:240|360|480|720|1080|auto))?(?:\.mp4)?$/i);
  if (match3) {
    const vdcPrefix = match3[1];
    const fileHash = match3[2];
    const hashSuffix = fileHash.length >= 7 ? fileHash.slice(-7) : fileHash;
    return `https://dbil3go8szhu6.cloudfront.net/file_library/videos/channel_vod_non_drm_hls/${vdcPrefix}/${fileHash}/${fileHash}_${hashSuffix}.m3u8`;
  }

  // 2. NextToppers 2-segment download URL: /download/<vdcPrefix>/<fileHash>[_quality][.mp4]
  const match2 = rawUrl.match(/(?:file_library\/videos\/download|\/download\/)\/(\d+)\/([0-9a-zA-Z_-]+?)(?:_(?:240|360|480|720|1080|auto))?(?:\.mp4)?$/i);
  if (match2) {
    const vdcPrefix = match2[1];
    const fileHash = match2[2];
    const hashSuffix = fileHash.length >= 7 ? fileHash.slice(-7) : fileHash;
    return `https://dbil3go8szhu6.cloudfront.net/file_library/videos/channel_vod_non_drm_hls/${vdcPrefix}/${fileHash}/${fileHash}_${hashSuffix}.m3u8`;
  }

  return rawUrl;
}
