import batchListData from '../assets/batch_list.json';

export const BATCH_CATALOG = Array.isArray(batchListData) ? batchListData : [];

export const CLASS_OPTIONS = [
  { id: '7', label: 'Class 7', roman: '7th' },
  { id: '8', label: 'Class 8', roman: '8th' },
  { id: '9', label: 'Class 9', roman: '9th' },
  { id: '10', label: 'Class 10', roman: '10th' },
  { id: '11', label: 'Class 11', roman: '11th' },
  { id: '12', label: 'Class 12', roman: '12th' },
];

export const STREAM_OPTIONS = [
  { id: 'science_pcm', label: 'Science (PCM)', group: 'science' },
  { id: 'science_pcb', label: 'Science (PCB)', group: 'science' },
  { id: 'science_pcmb', label: 'Science (PCMB)', group: 'science' },
  { id: 'commerce', label: 'Commerce', group: 'commerce' },
  { id: 'humanities', label: 'Humanities (Arts)', group: 'humanities' },
  { id: 'general', label: 'All / General', group: 'general' }
];

export function getStreamLabel(streamId) {
  if (!streamId) return '';
  const match = STREAM_OPTIONS.find(s => s.id === streamId);
  return match ? match.label : streamId;
}

export function getRecommendedBatchIds(classId, streamId = '') {
  const c = String(classId || '').trim();
  const s = String(streamId || '').toLowerCase().trim();

  switch (c) {
    case '7':
      return ['197'];
    case '8':
      return ['193', '206'];
    case '9':
      return ['178', '179', '214', '64_old', '81_old'];
    case '10':
      return ['176', '215', 'pw_udaan_2027', '62_old', '78_old'];
    case '11':
      if (s === 'commerce') {
        return ['108', '110', '223', '89_old', '56_old'];
      }
      if (s === 'humanities') {
        return ['109', '111', '216', '87_old', '53_old'];
      }
      if (s.includes('science') || s.includes('pcm') || s.includes('pcb')) {
        return ['107', '112', '217', '85_old', '55_old'];
      }
      // General or unspecified stream for Class 11:
      return ['107', '108', '109', '110', '111', '112', '216', '217', '223'];
    case '12':
      if (s === 'commerce') {
        return ['101', '102', '224', '90_old', '57_old'];
      }
      if (s === 'humanities') {
        return ['105', '106', '218', '88_old', '59_old'];
      }
      if (s.includes('science') || s.includes('pcm') || s.includes('pcb')) {
        return ['103', '104', '219', '86_old', '58_old'];
      }
      // General or unspecified stream for Class 12:
      return ['101', '102', '103', '104', '105', '106', '218', '219', '224'];
    default:
      return ['176', '215'];
  }
}

export function getAllowedBatchIdsForUser(user) {
  if (!user) return ['176'];
  if (Array.isArray(user.allowedBatches) && user.allowedBatches.length > 0) {
    return user.allowedBatches.map(String);
  }
  const cleanClass = String(user.class || user.className || '10').replace(/\D/g, '') || '10';
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
  return !!(batch?.in_development || batch?.development_phase || batch?.class_name === 'Class 11');
}
