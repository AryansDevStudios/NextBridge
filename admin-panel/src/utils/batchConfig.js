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

export function getStreamsForClass(classId) {
  const c = String(classId || '').toLowerCase().trim();
  if (c === 'dropper' || c === '12+' || c.includes('drop')) {
    return [
      { id: 'jee', label: 'JEE (Main + Advanced)' },
      { id: 'neet', label: 'NEET UG (Medical)' },
      { id: 'general', label: 'Both / All Dropper Batches' }
    ];
  }
  if (c === 'other' || c.includes('comp') || c.includes('outer')) {
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

export function getRecommendedBatchIds(classId, streamId = '') {
  const c = String(classId || '').toLowerCase().trim();
  const s = String(streamId || '').toLowerCase().trim();

  // Dropper / Repeaters
  if (c === 'dropper' || c === '12+' || c.includes('drop')) {
    if (s.includes('jee') || s.includes('eng') || s.includes('pcm')) {
      return ['pw_prayas_jee_2027'];
    }
    if (s.includes('neet') || s.includes('med') || s.includes('pcb')) {
      return ['pw_yakeen_neet_2027'];
    }
    return ['pw_prayas_jee_2027', 'pw_yakeen_neet_2027'];
  }

  // Other Competitive (NDA, CUET)
  if (c === 'other' || c.includes('comp') || c.includes('nda') || c.includes('cuet') || c.includes('outer')) {
    if (s.includes('nda') || s.includes('def')) {
      return ['pw_shaurya_nda_2027'];
    }
    if (s.includes('cuet')) {
      return ['pw_pravesh_cuet_2027'];
    }
    return ['pw_shaurya_nda_2027', 'pw_pravesh_cuet_2027'];
  }

  switch (c) {
    case '7':
      return ['197'];
    case '8':
      return ['193', '206'];
    case '9':
      return ['178', '179', '214', 'pw_neev_2027', '64_old', '81_old'];
    case '10':
      return ['176', '215', 'pw_udaan_2027', '62_old', '78_old'];
    case '11':
      if (s === 'commerce') {
        return ['108', '110', '223', 'pw_uday_comm_2027', '89_old', '56_old'];
      }
      if (s === 'humanities') {
        return ['109', '111', '216', '87_old', '53_old'];
      }
      if (s === 'science_pcm' || s === 'jee') {
        return ['107', '112', '217', 'pw_arjuna_jee_2027', '85_old', '55_old'];
      }
      if (s === 'science_pcb' || s === 'neet') {
        return ['107', '112', '217', 'pw_arjuna_neet_2027', '85_old', '55_old'];
      }
      if (s.includes('science') || s.includes('pcm') || s.includes('pcb')) {
        return ['107', '112', '217', 'pw_arjuna_jee_2027', 'pw_arjuna_neet_2027', '85_old', '55_old'];
      }
      return ['107', '108', '109', '110', '111', '112', '216', '217', '223', 'pw_arjuna_jee_2027', 'pw_arjuna_neet_2027', 'pw_uday_comm_2027'];
    case '12':
      if (s === 'commerce') {
        return ['101', '102', '224', 'pw_parishram_comm_2027', '90_old', '57_old'];
      }
      if (s === 'humanities') {
        return ['105', '106', '218', '88_old', '59_old'];
      }
      if (s === 'science_pcm' || s === 'jee') {
        return ['103', '104', '219', 'pw_lakshya_jee_2027', 'pw_parishram_12th_2027', '86_old', '58_old'];
      }
      if (s === 'science_pcb' || s === 'neet') {
        return ['103', '104', '219', 'pw_lakshya_neet_2027', 'pw_parishram_12th_2027', '86_old', '58_old'];
      }
      if (s.includes('science') || s.includes('pcm') || s.includes('pcb')) {
        return ['103', '104', '219', 'pw_lakshya_jee_2027', 'pw_lakshya_neet_2027', 'pw_parishram_12th_2027', '86_old', '58_old'];
      }
      return ['101', '102', '103', '104', '105', '106', '218', '219', '224', 'pw_lakshya_jee_2027', 'pw_lakshya_neet_2027', 'pw_parishram_12th_2027', 'pw_parishram_comm_2027'];
    default:
      return ['176', '215', 'pw_udaan_2027'];
  }
}

export function getAllowedBatchIdsForUser(user) {
  if (!user) return ['176'];
  if (Array.isArray(user.allowedBatches) && user.allowedBatches.length > 0) {
    return user.allowedBatches.map(String);
  }
  const rawClass = String(user.class || user.className || '10').trim().toLowerCase();
  let cleanClass = rawClass;
  if (rawClass.includes('drop') || rawClass === '12+') {
    cleanClass = 'dropper';
  } else if (rawClass.includes('other') || rawClass.includes('comp') || rawClass.includes('nda') || rawClass.includes('cuet') || rawClass.includes('outer')) {
    cleanClass = 'other';
  } else {
    const numOnly = rawClass.replace(/\D/g, '');
    if (numOnly) cleanClass = numOnly;
  }
  return getRecommendedBatchIds(cleanClass, user.stream || user.section || '');
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
  if (!batchOrId) return false;
  const batch = typeof batchOrId === 'object' ? batchOrId : getBatchById(batchOrId);
  // Only Next Topper Class 11 batches are in development phase; PW batches are ready to explore
  return !!(batch?.in_development || batch?.development_phase || (batch?.class_name === 'Class 11' && batch?.provider !== 'Physics Wallah'));
}
