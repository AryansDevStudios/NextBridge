export const CURRENT_LATEST_VERSION = '2.7.4';
export const CURRENT_LATEST_CODE = 20704;

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
