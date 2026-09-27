import batchListData from '../assets/batch_list.json';

export const BATCH_CATALOG = Array.isArray(batchListData) ? batchListData : [];

export const CLASS_OPTIONS = [
  { id: '7', label: 'Class 7', roman: '7th' },
  { id: '8', label: 'Class 8', roman: '8th' },
  { id: '9', label: 'Class 9', roman: '9th' },
  { id: '10', label: 'Class 10', roman: '10th' },
  { id: '11', label: 'Class 11', roman: '11th' },
  { id: '12', label: 'Class 12', roman: '12th' },
  { id: 'dropper', label: 'Dropper / 12th Pass', roman: 'Dropper' },
  { id: 'other', label: 'Competitive / Outers (NDA, CUET)', roman: 'Other' },
];

export const STREAM_OPTIONS = [
  { id: 'science_pcm', label: 'Science (PCM) - Engineering / JEE', group: 'science' },
  { id: 'science_pcb', label: 'Science (PCB) - Medical / NEET', group: 'science' },
  { id: 'science_pcmb', label: 'Science (PCMB) - Both', group: 'science' },
  { id: 'commerce', label: 'Commerce', group: 'commerce' },
  { id: 'humanities', label: 'Humanities (Arts)', group: 'humanities' },
  { id: 'general', label: 'All / General Curriculum', group: 'general' },
  { id: 'jee', label: 'JEE (Main + Advanced)', group: 'competitive' },
  { id: 'neet', label: 'NEET UG (Medical)', group: 'competitive' },
  { id: 'nda', label: 'NDA / Defence', group: 'competitive' },
  { id: 'cuet', label: 'CUET UG (College Entrance)', group: 'competitive' }
];

export function parseCleanClass(rawClass) {
  const c = String(rawClass || '10').trim().toLowerCase();
  if (c.includes('drop') || c === '12+') return 'dropper';
  if (c.includes('other') || c.includes('comp') || c.includes('nda') || c.includes('cuet') || c.includes('outer')) return 'other';
  const numOnly = c.replace(/\D/g, '');
  return numOnly || '10';
}

export function getStreamsForClass(classId) {
  const c = parseCleanClass(classId);
  if (c === 'dropper') {
    return [
      { id: 'jee', label: 'JEE (Main + Advanced)' },
      { id: 'neet', label: 'NEET UG (Medical)' },
      { id: 'general', label: 'Both / All Dropper Batches' }
    ];
  }
  if (c === 'other') {
    return [
      { id: 'nda', label: 'NDA / Defence' },
      { id: 'cuet', label: 'CUET UG (College Entrance)' },
      { id: 'general', label: 'All Competitive Exams' }
    ];
  }
  if (c === '11' || c === '12') {
    return [
      { id: 'science_pcm', label: 'Science (PCM)' },
      { id: 'science_pcb', label: 'Science (PCB)' },
      { id: 'science_pcmb', label: 'Science (PCMB)' },
      { id: 'commerce', label: 'Commerce' },
      { id: 'humanities', label: 'Humanities (Arts)' },
      { id: 'general', label: 'All / General' }
    ];
  }
  return [];
}

export function getStreamLabel(streamId) {
  if (!streamId) return '';
  const match = STREAM_OPTIONS.find(s => s.id === streamId);
  return match ? match.label : streamId;
}

/**
 * Returns all Next Topper batches for a given class & stream
 */
export function getNextTopperBatchIdsForClass(classId, streamId = '') {
  const c = parseCleanClass(classId);
  const s = String(streamId || '').toLowerCase().trim();

  switch (c) {
    case '7':
      return ['197'];
    case '8':
      return ['193', '206'];
    case '9':
      return ['178', '179', '214', '64_old', '81_old'];
    case '10':
      return ['176', '215', '62_old', '78_old'];
    case '11':
      if (s === 'commerce') {
        return ['108', '110', '223', '89_old', '56_old'];
      }
      if (s === 'humanities') {
        return ['109', '111', '216', '87_old', '53_old'];
      }
      if (s === 'science_pcm' || s === 'jee' || s === 'science_pcb' || s === 'neet' || s.includes('science')) {
        return ['107', '112', '217', '85_old', '55_old'];
      }
      return ['107', '108', '109', '110', '111', '112', '216', '217', '223'];
    case '12':
      if (s === 'commerce') {
        return ['101', '102', '224', '90_old', '57_old'];
      }
      if (s === 'humanities') {
        return ['105', '106', '218', '88_old', '59_old'];
      }
      if (s === 'science_pcm' || s === 'jee' || s === 'science_pcb' || s === 'neet' || s.includes('science')) {
        return ['103', '104', '219', '86_old', '58_old'];
      }
      return ['101', '102', '103', '104', '105', '106', '218', '219', '224'];
    default:
      return ['176', '215', '62_old', '78_old'];
  }
}

/**
 * Returns the relevant Physics Wallah batches for a given class & stream
 */
export function getPwBatchIdsForClass(classId, streamId = '') {
  const c = parseCleanClass(classId);
  const s = String(streamId || '').toLowerCase().trim();

  if (c === 'dropper') {
    if (s.includes('jee') || s.includes('eng') || s.includes('pcm')) {
      return ['pw_prayas_jee_2027'];
    }
    if (s.includes('neet') || s.includes('med') || s.includes('pcb')) {
      return ['pw_yakeen_neet_2027'];
    }
    return ['pw_prayas_jee_2027', 'pw_yakeen_neet_2027'];
  }

  if (c === 'other') {
    if (s.includes('nda') || s.includes('def')) {
      return ['pw_shaurya_nda_2027'];
    }
    if (s.includes('cuet')) {
      return ['pw_pravesh_cuet_2027'];
    }
    return ['pw_shaurya_nda_2027', 'pw_pravesh_cuet_2027'];
  }

  switch (c) {
    case '9':
      return ['pw_neev_2027'];
    case '10':
      return ['pw_udaan_2027'];
    case '11':
      if (s === 'commerce') {
        return ['pw_uday_comm_2027'];
      }
      if (s === 'science_pcm' || s === 'jee') {
        return ['pw_arjuna_jee_2027'];
      }
      if (s === 'science_pcb' || s === 'neet') {
        return ['pw_arjuna_neet_2027'];
      }
      if (s.includes('science') || s.includes('pcm') || s.includes('pcb')) {
        return ['pw_arjuna_jee_2027', 'pw_arjuna_neet_2027'];
      }
      return ['pw_arjuna_jee_2027', 'pw_arjuna_neet_2027', 'pw_uday_comm_2027'];
    case '12':
      if (s === 'commerce') {
        return ['pw_parishram_comm_2027'];
      }
      if (s === 'science_pcm' || s === 'jee') {
        return ['pw_lakshya_jee_2027', 'pw_parishram_12th_2027'];
      }
      if (s === 'science_pcb' || s === 'neet') {
        return ['pw_lakshya_neet_2027', 'pw_parishram_12th_2027'];
      }
      if (s.includes('science') || s.includes('pcm') || s.includes('pcb')) {
        return ['pw_lakshya_jee_2027', 'pw_lakshya_neet_2027', 'pw_parishram_12th_2027'];
      }
      return ['pw_lakshya_jee_2027', 'pw_lakshya_neet_2027', 'pw_parishram_12th_2027', 'pw_parishram_comm_2027'];
    default:
      return [];
  }
}

/**
 * Recommended batches for new users: Both Next Topper batches AND PW batches selected
 */
export function getRecommendedBatchIds(classId, streamId = '') {
  const nt = getNextTopperBatchIdsForClass(classId, streamId);
  const pw = getPwBatchIdsForClass(classId, streamId);
  return Array.from(new Set([...nt, ...pw]));
}

export function getDefaultBatchIdsForNewUser(classId, streamId = '') {
  return getRecommendedBatchIds(classId, streamId);
}

/**
 * Resolves allowed batch IDs for a user:
 * - For newly created users (createdAfterPw = true or hasPwAccess = true or having pw_ batch): Returns allowedBatches including PW.
 * - For older users (created before PW was added): All batches of their class of Next Topper are available directly in the app, but PW batches are not supported by default.
 */
export function getAllowedBatchIdsForUser(user) {
  if (!user) return ['176', '215', '62_old', '78_old'];

  const cleanClass = parseCleanClass(user.class || user.className || '10');
  const stream = user.stream || user.section || '';
  const allNtBatchesForClass = getNextTopperBatchIdsForClass(cleanClass, stream);

  // Check if user was explicitly granted or created with PW access
  const hasExplicitPw = Array.isArray(user.allowedBatches) && user.allowedBatches.some(id => String(id).startsWith('pw_'));
  const isNewUserWithPw = !!(user.createdAfterPw || user.hasPwAccess || hasExplicitPw);

  if (isNewUserWithPw) {
    if (Array.isArray(user.allowedBatches) && user.allowedBatches.length > 0) {
      return user.allowedBatches.map(String);
    }
    return getRecommendedBatchIds(cleanClass, stream);
  }

  // Older user before PW was added:
  // "for older users before the PWS added, the PW batches are not supported by default and for their purpose, all the batches of their classes of Next Topper will be available in the app directly."
  if (Array.isArray(user.allowedBatches) && user.allowedBatches.length > 0) {
    const userNt = user.allowedBatches.map(String).filter(id => !id.startsWith('pw_'));
    return Array.from(new Set([...userNt, ...allNtBatchesForClass]));
  }

  return allNtBatchesForClass;
}

export function getBatchById(batchId) {
  const idStr = String(batchId || '');
  return BATCH_CATALOG.find(b => String(b.batch_id) === idStr || String(b.original_id) === idStr) || null;
}

export function getBatchDisplayName(batch) {
  if (!batch) return 'Batch';
  let name = batch.batch_name || batch.title || `Batch ${batch.batch_id}`;
  return name.replace(/_old$/i, ' (Archive)');
}

export function isBatchInDevelopment(batchOrId) {
  return false;
}
