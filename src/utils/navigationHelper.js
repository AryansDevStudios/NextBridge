/**
 * Universal Navigation and URL Query Synchronization Helper
 * Ensures smooth breadcrumb navigation, deep linking, and hardware/browser back gesture support.
 */

export function getUrlParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      tab: params.get('tab') || null,
      batch: params.get('batch') || null,
      subject: params.get('subject') || null,
      chapter: params.get('chapter') || null,
      filter: params.get('filter') || null,
      folder: params.get('folder') || null,
      play: params.get('play') || null,
      type: params.get('type') || null
    };
  } catch (_) {
    return {};
  }
}

export function updateUrlParams(newParams = {}, replace = false) {
  try {
    const url = new URL(window.location.href);
    Object.entries(newParams).forEach(([key, val]) => {
      if (val === null || val === undefined || val === '') {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, String(val));
      }
    });
    const newRelative = url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '');
    if (replace) {
      window.history.replaceState({ ...window.history.state, ...newParams }, '', newRelative);
    } else {
      window.history.pushState({ ...window.history.state, ...newParams }, '', newRelative);
    }
  } catch (_) {}
}
