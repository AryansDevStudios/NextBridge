/**
 * ============================================================
 * NextBridge — App Version & Update Utility
 * ============================================================
 *
 * HOW VERSION NUMBERS WORK
 * ─────────────────────────
 * APP_VERSION      → Semantic version string: "MAJOR.MINOR.PATCH"
 * APP_VERSION_CODE → Integer: MAJOR*10000 + MINOR*100 + PATCH
 *                    e.g.  2.7.4  →  20704
 *                          2.8.0  →  20800
 *
 * WHEN TO BUMP THESE
 * ─────────────────────────────────────────────────────────────
 * ✅ OTA (web bundle only — no APK needed):
 *   • React UI changes, new screens, Firestore logic, bug fixes
 *   → Bump PATCH or MINOR
 *   → Rebuild web app, zip dist/, update version.json, deploy
 *
 * ⚠️  APK REQUIRED (cannot be pushed via OTA):
 *   • New Android permissions (AndroidManifest.xml)
 *   • New Java plugin methods (DownloadServicePlugin.java, etc.)
 *   • PiP / foreground service / manifest config changes
 *   • New Capacitor plugins (requires `cap sync android`)
 *   → Bump MINOR or MAJOR here AND in build.gradle
 *   → Build new APK → admin sets forced-update lockout with APK URL
 *
 * ⚠️  SYNC RULE — CRITICAL:
 *   This file (src/utils/version.js) and admin-panel/src/utils/version.js
 *   MUST always have the same version numbers.
 *   They are separate Vite projects with no shared package.
 *   If you forget to update the admin panel copy:
 *     - Admin sees ALL students as "Outdated"
 *     - Default lockout messages show wrong version
 *     - "Outdated Only" broadcast targets the wrong students
 *
 * See UPDATING.md at the project root for the full release checklist.
 * ============================================================
 */

// ─── BUMP BOTH OF THESE ON EVERY RELEASE ───────────────────
export const APP_VERSION = '2.7.5';
export const APP_VERSION_CODE = 20705;
// ───────────────────────────────────────────────────────────

/**
 * Strips timestamp/prerelease suffixes from compound OTA version strings.
 * e.g. "2.4.9-1789976471117" → "2.4.9",  "v2.7.0-beta.1" → "2.7.0"
 * Plain semvers like "2.7.2" pass through unchanged.
 *
 * @param {string} v
 * @returns {string}
 */
export function extractCleanVersion(v) {
  if (!v) return '0';
  return String(v).trim().replace(/^v/i, '').split('-')[0];
}

/**
 * Compare two semantic version strings.
 * Supports "2.7.0", "v2.6.6", "2.7", and OTA compound strings like "2.4.9-1789976471117".
 *
 * @param {string} v1
 * @param {string} v2
 * @returns {number} -1 if v1 < v2, 1 if v1 > v2, 0 if v1 === v2
 */
export function compareSemver(v1, v2) {
  if (!v1 && !v2) return 0;
  if (!v1) return -1;
  if (!v2) return 1;

  const normalize = (v) =>
    extractCleanVersion(v)
      .split('.')
      .map(part => parseInt(part, 10) || 0);

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

  // 1. Check SemVer (clean comparison, tolerant of OTA compound strings)
  if (forcedUpdate.minVersion) {
    if (compareSemver(currentVersion, forcedUpdate.minVersion) < 0) {
      return true;
    }
  }

  // 2. Check Version Code (native only)
  if (isNative && forcedUpdate.minVersionCode) {
    const minCode = Number(forcedUpdate.minVersionCode);
    if (!isNaN(minCode) && currentCode < minCode) {
      return true;
    }
  }

  return false;
}

