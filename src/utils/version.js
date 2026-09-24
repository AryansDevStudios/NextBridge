export const APP_VERSION = '2.7.0';
export const APP_VERSION_CODE = 20700;

/**
 * Compare two semantic version strings.
 * Supports versions like "2.7.0", "v2.6.6", "2.7", "2.7.0-beta.1".
 *
 * @param {string} v1
 * @param {string} v2
 * @returns {number} -1 if v1 < v2, 1 if v1 > v2, 0 if v1 === v2
 */
export function compareSemver(v1, v2) {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;

  const normalize = (v) => {
    return String(v)
      .trim()
      .replace(/^v/i, '')
      .split('-')[0] // remove pre-release qualifiers
      .split('.')
      .map(part => parseInt(part, 10) || 0);
  };

  const p1 = normalize(v1);
  const p2 = normalize(v2);
  const maxLen = Math.max(p1.length, p2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 < num2) return -1;
    if (num1 > num2) return 1;
  }
  return 0;
}

/**
 * Check if a forced update lockout should be enforced.
 *
 * @param {Object|null} forcedUpdate - The forcedUpdate configuration object from student document
 * @param {string} currentVersion - The running app version (defaults to APP_VERSION)
 * @param {number} currentCode - The running version code (defaults to APP_VERSION_CODE)
 * @param {boolean} isNative - Whether running on native Capacitor Android
 * @returns {boolean}
 */
export function isUpdateRequired(forcedUpdate, currentVersion = APP_VERSION, currentCode = APP_VERSION_CODE, isNative = false) {
  if (!forcedUpdate || !forcedUpdate.enabled) {
    return false;
  }

  const currentPlatform = isNative ? 'android' : 'web';
  const targetPlatform = forcedUpdate.targetPlatform || 'all';

  if (targetPlatform !== 'all' && targetPlatform !== currentPlatform) {
    return false;
  }

  // 1. Check SemVer
  if (forcedUpdate.minVersion) {
    if (compareSemver(currentVersion, forcedUpdate.minVersion) < 0) {
      return true;
    }
  }

  // 2. Check Version Code (applies on native)
  if (isNative && forcedUpdate.minVersionCode) {
    const minCode = Number(forcedUpdate.minVersionCode);
    if (!isNaN(minCode) && currentCode < minCode) {
      return true;
    }
  }

  return false;
}
