/**
 * NextBridge — NextToppers Real-Time Edge API Service
 * 
 * Fetches batches, subjects, chapters, lectures, and documents on demand
 * from our high-performance Cloudflare Edge Gateway (V8 isolates)
 * without requiring 24/7 background scrapers or monolithic 8MB database downloads.
 */

const NT_GATEWAY_URL = 'https://nextbridge-nt-gateway.adsbackend01.workers.dev';

// In-memory cache for ultra-fast, zero-latency back/forward navigation within the session
const folderCache = new Map();
const pdfCache = new Map();

export const ntApiService = {
  GATEWAY_URL: NT_GATEWAY_URL,

  /**
   * Fetches folder content (subfolders + items) on demand.
   * Cached in memory for the current session. Pass forceRefresh = true to bypass cache.
   */
  async getFolderContent(courseId, folderId = '0', forceRefresh = false) {
    if (!courseId) return { success: false, folders: [], items: [] };

    const cacheKey = `${courseId}:${folderId}`;
    if (!forceRefresh && folderCache.has(cacheKey)) {
      return folderCache.get(cacheKey);
    }

    try {
      const url = `${NT_GATEWAY_URL}/api/folder?courseId=${encodeURIComponent(courseId)}&folderId=${encodeURIComponent(folderId)}${forceRefresh ? '&refresh=1' : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Gateway returned HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!json || !json.success) {
        throw new Error(json?.error || 'Failed to load folder content');
      }

      // Format folders & items for NextBridge UI
      const result = {
        success: true,
        courseId: String(courseId),
        folderId: String(folderId),
        folders: (json.folders || []).map((f) => {
          let itemCountText = 'Folder';
          if (f.itemCount != null && f.itemCount > 0) {
            itemCountText = `${f.itemCount} items`;
          } else if (f.videoCount || f.pdfCount) {
            const parts = [];
            if (f.videoCount) parts.push(`${f.videoCount} ${f.videoCount === 1 ? 'vid' : 'vids'}`);
            if (f.pdfCount) parts.push(`${f.pdfCount} ${f.pdfCount === 1 ? 'note' : 'notes'}`);
            itemCountText = parts.join(' • ');
          }

          return {
            ...f,
            id: String(f.id || f.folderId),
            title: f.title || f.name || 'Untitled Folder',
            isFolder: true,
            courseId: String(courseId),
            folderId: String(f.id || f.folderId),
            itemCount: itemCountText,
          };
        }),
        items: (json.items || []).map((it) => ({
          ...it,
          id: String(it.id || it.entity_id),
          title: it.title || it.name || 'Untitled Item',
          isFolder: false,
          courseId: String(courseId),
          contentId: String(it.id || it.entity_id),
          isDynamicNt: true,
        })),
        total: json.total || 0,
      };

      folderCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.error(`[NtApiService] getFolderContent(${courseId}, ${folderId}) error:`, err);
      throw err;
    }
  },

  /**
   * Resolves a PDF URL using the 4-tier self-healing edge pipeline.
   * Returns the direct AWS CloudFront PDF link.
   */
  async resolvePdfUrl(itemOrId, courseId = null, shortCode = null) {
    let contentId = typeof itemOrId === 'object' ? itemOrId.contentId || itemOrId.id : itemOrId;
    let crsId = typeof itemOrId === 'object' ? itemOrId.courseId || itemOrId.course_id || courseId : courseId;
    let sCode = typeof itemOrId === 'object' ? itemOrId.shortCode || itemOrId.short_code || shortCode : shortCode;

    // Check if item already has a direct CloudFront PDF link
    if (typeof itemOrId === 'object' && itemOrId.url && itemOrId.url.includes('cloudfront.net') && itemOrId.url.toLowerCase().includes('.pdf')) {
      return itemOrId.url;
    }

    // Extract short code from /dl/r/ URL if available
    if (!sCode && typeof itemOrId === 'object' && itemOrId.url && itemOrId.url.includes('/dl/r/')) {
      const match = itemOrId.url.match(/\/dl\/r\/([a-zA-Z0-9_-]+)/);
      if (match) sCode = match[1];
    }

    const cacheKey = `pdf_${contentId}`;
    if (pdfCache.has(cacheKey)) {
      return pdfCache.get(cacheKey);
    }

    try {
      const params = new URLSearchParams();
      if (contentId) params.set('contentId', String(contentId));
      if (crsId) params.set('courseId', String(crsId));
      if (sCode) params.set('shortCode', String(sCode));

      const res = await fetch(`${NT_GATEWAY_URL}/api/resolve-pdf?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`PDF resolver returned HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json && json.success && json.url) {
        pdfCache.set(cacheKey, json.url);
        return json.url;
      }

      throw new Error(json?.message || 'Failed to resolve direct PDF link');
    } catch (err) {
      console.warn(`[NtApiService] resolvePdfUrl error:`, err);
      // Fallback to item's raw URL if available
      return typeof itemOrId === 'object' ? itemOrId.url || '' : '';
    }
  },

  /**
   * Proxies any external URL via Cloudflare Worker's universal wildcard CORS proxy
   */
  toProxiedUrl(targetUrl) {
    if (!targetUrl) return '';
    return `${NT_GATEWAY_URL}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  },

  /**
   * Clears in-memory session cache (e.g. on manual refresh or pull-to-refresh)
   */
  clearCache() {
    folderCache.clear();
    pdfCache.clear();
  },
};
