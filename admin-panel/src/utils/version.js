/**
 * ============================================================
 * NextBridge Admin Panel — Version Constants
 * ============================================================
 *
 * ⚠️  SYNC RULE — CRITICAL:
 *   CURRENT_LATEST_VERSION and CURRENT_LATEST_CODE here MUST always
 *   match APP_VERSION and APP_VERSION_CODE in:
 *     → src/utils/version.js  (the Android/web app)
 *
 *   These are TWO SEPARATE Vite projects with no shared package.
 *   You must manually keep them in sync on EVERY release.
 *
 * WHAT BREAKS IF THEY DIVERGE:
 *   • Version badges on the Dashboard show wrong green/amber/outdated state
 *   • "Outdated Only" lockout scope targets the wrong students
 *   • Default lockout message text shows the wrong version number
 *   • "< vX.Y.Z" legacy label shows a stale floor version
 *
 * HOW TO BUMP:
 *   1. Update CURRENT_LATEST_VERSION and CURRENT_LATEST_CODE below
 *   2. Update APP_VERSION and APP_VERSION_CODE in src/utils/version.js
 *   3. Update version.json at deploy_dist/buildcode/version.json
 *   4. If APK update: also bump versionCode/versionName in android/app/build.gradle
 *
 * See UPDATING.md at the project root for the full release checklist.
 * ============================================================
 */

// ─── BUMP BOTH OF THESE ON EVERY RELEASE ───────────────────
export const CURRENT_LATEST_VERSION = '3.3.18';
export const CURRENT_LATEST_CODE = 30318;
// ───────────────────────────────────────────────────────────

export const DEFAULT_ANDROID_VERSION_CONFIG = {
  minAppVersion: '2.7.0',
  minVersionCode: 20700,
  latestAppVersion: '3.3.18',
  latestVersionCode: 30318,
  apkDownloadUrl: '',
  defaultMessage: 'A mandatory app update is required to continue using NextBridge.',
  releaseNotes: '• Version 3.3.18: Fix SW manifest cache poisoning, DASH player init errors, and Netlify proxy routing.'
};

/**
 * Compare two semantic version strings.
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
      .split('-')[0]
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
 * Evaluates the version status of a student against the dynamic database config.
 * 
 * Rules:
 * - Web students: returned with neutral status (no warning badges).
 * - Android students:
 *   • 🔴 RED ('critical'):
 *       Version is missing/legacy OR semver < minAppVersion OR (code > 0 and code < minVersionCode)
 *   • 🟡 YELLOW ('outdated'):
 *       Version >= min (both semver and code) BUT semver < latestAppVersion OR (code > 0 and code < latestVersionCode)
 *   • 🟢 GREEN ('latest'):
 *       Version >= latestAppVersion AND (code >= latestVersionCode or code not tracked)
 *
 * @param {Object} student
 * @param {Object} config - The dynamic version config from Firestore
 * @returns {Object} { status: 'critical'|'outdated'|'latest'|'web', color: 'red'|'yellow'|'green'|'zinc', label: string, badgeClass: string, isAndroid: boolean }
 */
export function getAndroidVersionStatus(student, config = DEFAULT_ANDROID_VERSION_CONFIG) {
  if (!student) {
    return {
      status: 'unknown',
      color: 'zinc',
      label: 'Unknown',
      badgeClass: 'bg-zinc-900 text-zinc-500 border-zinc-800',
      isAndroid: false
    };
  }

  // Determine if this is an Android student
  const isAndroid = student.platform === 'android' || (student.device && (!student.platform || student.platform === 'android'));

  // Web students are isolated: they automatically fetch fresh code on browser reload
  if (!isAndroid) {
    return {
      status: 'web',
      isAndroid: false,
      color: 'zinc',
      label: 'Web Browser',
      badgeClass: 'bg-zinc-900/60 text-zinc-400 border-zinc-800'
    };
  }

  const studentVersion = student.appVersion;
  const studentCode = Number(student.versionCode || 0);

  const minVersion = config?.minAppVersion || '2.7.0';
  const minCode = Number(config?.minVersionCode || 0);
  const latestVersion = config?.latestAppVersion || '2.7.4';
  const latestCode = Number(config?.latestVersionCode || 0);

  // 1. Missing or unparseable version string -> RED
  if (!studentVersion || typeof studentVersion !== 'string' || studentVersion.trim() === '') {
    return {
      status: 'critical',
      isAndroid: true,
      color: 'red',
      label: `Legacy (< v${minVersion})`,
      badgeClass: 'bg-red-950/60 text-red-400 border-red-800 animate-pulse font-semibold'
    };
  }

  // 2. Below Minimum -> RED
  const belowMinSemver = compareSemver(studentVersion, minVersion) < 0;
  const belowMinCode = minCode > 0 && studentCode > 0 && studentCode < minCode;

  if (belowMinSemver || belowMinCode) {
    return {
      status: 'critical',
      isAndroid: true,
      color: 'red',
      label: `v${studentVersion} (Critical / < Min)`,
      badgeClass: 'bg-red-950/60 text-red-400 border-red-800 font-semibold'
    };
  }

  // 3. Below Latest (but >= Minimum) -> YELLOW
  const belowLatestSemver = compareSemver(studentVersion, latestVersion) < 0;
  const belowLatestCode = latestCode > 0 && studentCode > 0 && studentCode < latestCode;

  if (belowLatestSemver || belowLatestCode) {
    return {
      status: 'outdated',
      isAndroid: true,
      color: 'yellow',
      label: `v${studentVersion} (Update Avail)`,
      badgeClass: 'bg-amber-950/50 text-amber-400 border-amber-800 font-semibold'
    };
  }

  // 4. Equal to or greater than Latest -> GREEN
  return {
    status: 'latest',
    isAndroid: true,
    color: 'green',
    label: `v${studentVersion} (Latest)`,
    badgeClass: 'bg-emerald-950/50 text-emerald-400 border-emerald-800 font-semibold'
  };
}

/**
 * Determines whether a student is currently locked out by a forced update requirement.
 * A student is ONLY truly locked if:
 * 1. forcedUpdate is enabled in the database
 * 2. The student's platform matches targetPlatform (web students are never locked by android targets)
 * 3. The student has NOT yet satisfied the requirement (appVersion < minVersion OR versionCode < minVersionCode)
 *
 * If a student has already updated to a version >= minVersion (and versionCode >= minVersionCode),
 * they are NOT locked out, even if forcedUpdate.enabled is still true in the database.
 *
 * @param {Object} student
 * @returns {boolean}
 */
export function isStudentUpdateLocked(student) {
  if (!student?.forcedUpdate?.enabled) {
    return false;
  }

  const isAndroid = student.platform === 'android' || (student.device && (!student.platform || student.platform === 'android'));
  const currentPlatform = isAndroid ? 'android' : 'web';
  const targetPlatform = student.forcedUpdate.targetPlatform || 'all';

  if (targetPlatform !== 'all' && targetPlatform !== currentPlatform) {
    return false;
  }

  const minVersion = student.forcedUpdate.minVersion;
  const minCode = Number(student.forcedUpdate.minVersionCode || 0);

  // If student hasn't logged in / no appVersion recorded yet:
  if (!student.appVersion) {
    return Boolean(minVersion || minCode);
  }

  // 1. Check SemVer
  if (minVersion && compareSemver(student.appVersion, minVersion) < 0) {
    return true;
  }

  // 2. Check Version Code (native android only)
  if (isAndroid && minCode > 0) {
    const studentCode = Number(student.versionCode || 0);
    if (studentCode > 0 && studentCode < minCode) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether a student had a forced update applied, but has already fulfilled it
 * (i.e. forcedUpdate.enabled is true in DB, but their installed appVersion / versionCode meets or exceeds the requirement).
 *
 * @param {Object} student
 * @returns {boolean}
 */
export function isStudentUpdateFulfilled(student) {
  if (!student?.forcedUpdate?.enabled) {
    return false;
  }
  return !isStudentUpdateLocked(student);
}

