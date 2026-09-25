import React, { useState, useMemo } from 'react';
import { db } from '../firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { 
  BATCH_CATALOG, 
  getRecommendedBatchIds, 
  getNextTopperBatchIdsForClass,
  getPwBatchIdsForClass,
  getStreamsForClass,
  getBatchDisplayName,
  getStreamLabel,
  parseCleanClass
} from '../utils/batchConfig';
import { 
  X, 
  Layers, 
  Search, 
  Filter, 
  CheckSquare, 
  Square, 
  Plus, 
  Minus, 
  RotateCcw, 
  Sparkles, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Users, 
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

const CLASS_OPTIONS = [
  { id: 'all', label: 'All Classes' },
  { id: '7', label: 'Class 7' },
  { id: '8', label: 'Class 8' },
  { id: '9', label: 'Class 9' },
  { id: '10', label: 'Class 10' },
  { id: '11', label: 'Class 11' },
  { id: '12', label: 'Class 12' },
  { id: 'dropper', label: 'Droppers (JEE / NEET)' },
  { id: 'other', label: 'Outers (NDA / CUET)' }
];

export default function BulkBatchManagerModal({ students = [], onClose }) {
  // ── Filters State ──
  const [classFilter, setClassFilter] = useState('all');
  const [streamFilter, setStreamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'expired', 'revoked'
  const [pwAccessFilter, setPwAccessFilter] = useState('all'); // 'all', 'has_pw', 'no_pw'
  const [batchPresenceFilter, setBatchPresenceFilter] = useState('all'); // 'all' or batchId
  const [presenceMode, setPresenceMode] = useState('has'); // 'has', 'lacks'
  const [searchQuery, setSearchQuery] = useState('');

  // ── Selected Students State ──
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);

  // ── Action Configuration State ──
  const [actionType, setActionType] = useState('grant'); // 'grant', 'remove', 'replace'
  const [targetBatchIds, setTargetBatchIds] = useState([]);
  const [batchCategory, setBatchCategory] = useState('all'); // 'all', 'pw', 'nexttoppers', '10', '11', '12', etc.
  const [batchSearchQuery, setBatchSearchQuery] = useState('');

  // ── Execution State ──
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState('');
  const [successReport, setSuccessReport] = useState(null);
  const [errorReport, setErrorReport] = useState('');

  // Available streams dynamically based on selected class
  const availableStreams = useMemo(() => {
    if (classFilter === 'all') {
      return [
        { id: 'all', label: 'All Streams' },
        { id: 'science_pcm', label: 'PCM' },
        { id: 'science_pcb', label: 'PCB' },
        { id: 'science_pcmb', label: 'PCMB' },
        { id: 'commerce', label: 'Commerce' },
        { id: 'arts', label: 'Arts' },
        { id: 'jee', label: 'JEE' },
        { id: 'neet', label: 'NEET' },
        { id: 'nda', label: 'NDA' },
        { id: 'cuet', label: 'CUET' }
      ];
    }
    const streams = getStreamsForClass(classFilter);
    return [{ id: 'all', label: 'All Streams' }, ...streams.map(s => ({ id: s.id, label: s.label }))];
  }, [classFilter]);

  // ── 1. Filtered Students Computation ──
  const filteredStudents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const now = Date.now();

    return students.filter((s) => {
      // Class filter
      if (classFilter !== 'all') {
        const cleanStudentClass = parseCleanClass(s.class);
        if (cleanStudentClass !== classFilter) return false;
      }

      // Stream filter
      if (streamFilter !== 'all') {
        const studentStream = String(s.stream || s.section || '').toLowerCase();
        if (!studentStream.includes(streamFilter.toLowerCase())) return false;
      }

      // Status filter
      const expiry = s.subscriptionExpiresAt 
        ? (typeof s.subscriptionExpiresAt === 'number' ? s.subscriptionExpiresAt : new Date(s.subscriptionExpiresAt).getTime())
        : null;
      const isExpired = expiry !== null && expiry <= now;

      if (statusFilter === 'active' && (s.status === 'revoked' || isExpired)) return false;
      if (statusFilter === 'expired' && !isExpired && s.status !== 'revoked') return false;
      if (statusFilter === 'revoked' && s.status !== 'revoked') return false;

      // PW Access filter
      const hasPw = Boolean(
        s.hasPwAccess || 
        s.createdAfterPw || 
        (Array.isArray(s.allowedBatches) && s.allowedBatches.some(id => String(id).startsWith('pw_')))
      );
      if (pwAccessFilter === 'has_pw' && !hasPw) return false;
      if (pwAccessFilter === 'no_pw' && hasPw) return false;

      // Batch presence filter
      if (batchPresenceFilter !== 'all') {
        const effectiveBatches = Array.isArray(s.allowedBatches) && s.allowedBatches.length > 0
          ? s.allowedBatches.map(String)
          : getNextTopperBatchIdsForClass(s.class, s.stream);
        const hasSpecificBatch = effectiveBatches.includes(String(batchPresenceFilter));
        if (presenceMode === 'has' && !hasSpecificBatch) return false;
        if (presenceMode === 'lacks' && hasSpecificBatch) return false;
      }

      // Search query
      if (q) {
        const nameMatch = (s.name || '').toLowerCase().includes(q);
        const patMatch = (s.pat || '').toLowerCase().includes(q);
        const schoolMatch = (s.personalDetails?.school || '').toLowerCase().includes(q);
        const areaMatch = (s.personalDetails?.area || '').toLowerCase().includes(q);
        return nameMatch || patMatch || schoolMatch || areaMatch;
      }

      return true;
    });
  }, [students, classFilter, streamFilter, statusFilter, pwAccessFilter, batchPresenceFilter, presenceMode, searchQuery]);

  // ── Student Selection Handlers ──
  const handleSelectAllFiltered = () => {
    setSelectedStudentIds(filteredStudents.map(s => s.id));
  };

  const handleDeselectAll = () => {
    setSelectedStudentIds([]);
  };

  const toggleStudentSelection = (id) => {
    setSelectedStudentIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // ── Batch Catalog Filtering for Picker ──
  const filteredCatalog = useMemo(() => {
    const q = batchSearchQuery.toLowerCase().trim();

    return BATCH_CATALOG.filter(b => {
      // Category tab
      if (batchCategory === 'pw' && !b.is_dynamic_pw && b.provider !== 'Physics Wallah' && !String(b.batch_id).startsWith('pw_')) return false;
      if (batchCategory === 'nexttoppers' && (b.is_dynamic_pw || b.provider === 'Physics Wallah' || String(b.batch_id).startsWith('pw_'))) return false;
      if (batchCategory === '9' && b.class_name !== 'Class 9') return false;
      if (batchCategory === '10' && b.class_name !== 'Class 10') return false;
      if (batchCategory === '11' && b.class_name !== 'Class 11') return false;
      if (batchCategory === '12' && b.class_name !== 'Class 12') return false;
      if (batchCategory === 'dropper' && b.class_name !== 'Dropper' && b.class_name !== 'Class 12+') return false;
      if (batchCategory === 'other' && b.class_name !== 'Other') return false;

      // Text search
      if (q) {
        const nameMatch = (b.batch_name || '').toLowerCase().includes(q);
        const origMatch = (b.original_title || '').toLowerCase().includes(q);
        const idMatch = String(b.batch_id).toLowerCase().includes(q);
        return nameMatch || origMatch || idMatch;
      }

      return true;
    });
  }, [batchCategory, batchSearchQuery]);

  const toggleTargetBatch = (batchId) => {
    const idStr = String(batchId);
    setTargetBatchIds(prev => 
      prev.includes(idStr) ? prev.filter(i => i !== idStr) : [...prev, idStr]
    );
  };

  // Quick Preset Actions for Target Batches
  const handleSelectAllPwForClass = () => {
    const targetClass = classFilter === 'all' ? '10' : classFilter;
    const pwIds = getPwBatchIdsForClass(targetClass, streamFilter === 'all' ? '' : streamFilter);
    const fallback = pwIds.length > 0 ? pwIds : BATCH_CATALOG.filter(b => b.is_dynamic_pw || b.provider === 'Physics Wallah').map(b => String(b.batch_id));
    setTargetBatchIds(Array.from(new Set([...targetBatchIds, ...fallback.map(String)])));
  };

  const handleSelectAllNtForClass = () => {
    const targetClass = classFilter === 'all' ? '10' : classFilter;
    const ntIds = getNextTopperBatchIdsForClass(targetClass, streamFilter === 'all' ? '' : streamFilter);
    setTargetBatchIds(Array.from(new Set([...targetBatchIds, ...ntIds.map(String)])));
  };

  const handleSelectAllRecommended = () => {
    const targetClass = classFilter === 'all' ? '10' : classFilter;
    const recIds = getRecommendedBatchIds(targetClass, streamFilter === 'all' ? '' : streamFilter);
    setTargetBatchIds(Array.from(new Set([...targetBatchIds, ...recIds.map(String)])));
  };

  const handleClearTargetBatches = () => {
    setTargetBatchIds([]);
  };

  // ── 2. Execute Bulk Batch Update ──
  const handleExecuteBulkUpdate = async () => {
    if (selectedStudentIds.length === 0) {
      alert('Please select at least one student.');
      return;
    }

    if (targetBatchIds.length === 0 && actionType !== 'remove_all') {
      alert('Please select at least one batch to perform this action.');
      return;
    }

    const actionText = 
      actionType === 'grant' ? 'grant the selected batches to' :
      actionType === 'remove' ? 'remove the selected batches from' :
      'overwrite batch permissions with the selected list for';

    const confirmMsg = `Are you sure you want to ${actionText} ${selectedStudentIds.length} students?`;
    if (!window.confirm(confirmMsg)) return;

    setIsProcessing(true);
    setErrorReport('');
    setSuccessReport(null);
    setProgressStatus('Preparing batch updates in Firestore...');

    try {
      const selectedStudentObjs = students.filter(s => selectedStudentIds.includes(s.id));
      const updates = [];

      for (const student of selectedStudentObjs) {
        // Resolve effective current batches
        const cleanClass = parseCleanClass(student.class);
        const effectiveCurrent = Array.isArray(student.allowedBatches) && student.allowedBatches.length > 0
          ? student.allowedBatches.map(String)
          : getNextTopperBatchIdsForClass(cleanClass, student.stream || student.section);

        let finalBatches = [];

        if (actionType === 'grant') {
          finalBatches = Array.from(new Set([...effectiveCurrent, ...targetBatchIds]));
        } else if (actionType === 'remove') {
          finalBatches = effectiveCurrent.filter(id => !targetBatchIds.includes(String(id)));
        } else if (actionType === 'replace') {
          finalBatches = Array.from(new Set(targetBatchIds.map(String)));
        }

        const hasPw = finalBatches.some(id => String(id).startsWith('pw_'));

        updates.push({
          studentId: student.id,
          name: student.name,
          updateData: {
            allowedBatches: finalBatches,
            hasPwAccess: hasPw,
            updatedAt: new Date().toISOString()
          }
        });
      }

      // Execute in Firestore in chunks of 450 (Firestore limit is 500)
      const CHUNK_SIZE = 450;
      let completedCount = 0;

      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const item of chunk) {
          const studentRef = doc(db, 'students', item.studentId);
          batch.update(studentRef, item.updateData);
        }

        setProgressStatus(`Writing batch ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(updates.length / CHUNK_SIZE)} to Firestore...`);
        await batch.commit();
        completedCount += chunk.length;
      }

      setSuccessReport({
        totalUpdated: completedCount,
        action: actionType,
        batchCount: targetBatchIds.length
      });
      setSelectedStudentIds([]);
    } catch (err) {
      console.error('Failed to execute bulk batch update:', err);
      setErrorReport(err.message || 'An error occurred while updating students in Firestore.');
    } finally {
      setIsProcessing(false);
      setProgressStatus('');
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0c0c0c]/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-[#141416] border border-[#262626] rounded-2xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* ── Top Header ── */}
        <div className="p-4 sm:p-5 border-b border-[#262626] flex items-center justify-between bg-[#121214] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#f59e0b]/15 border border-[#f59e0b]/30 flex items-center justify-center">
              <Layers size={22} className="text-[#f59e0b]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-[#f3f4f6]">Bulk Batch Permission Manager</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Physics Wallah & Next Topper
                </span>
              </div>
              <p className="text-xs text-[#9ca3af] mt-0.5">
                Filter students by class, stream, and criteria to grant or revoke batch access in bulk.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#1f1f23] hover:bg-[#28282d] text-[#9ca3af] hover:text-white flex items-center justify-center transition border border-[#2a2a2e]"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body: Two Columns (Left: Filters & Student Selection | Right: Action & Batches) ── */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#262626]">
          
          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* COLUMN 1: FILTERS & STUDENT SELECTION (7 COLS ON DESKTOP)          */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-7 p-4 sm:p-5 flex flex-col space-y-4">
            
            {/* Filter Controls Row */}
            <div className="bg-[#18181b] p-3 rounded-xl border border-[#262626] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#f3f4f6] flex items-center gap-1.5">
                  <Filter size={13} className="text-[#f59e0b]" />
                  <span>Student Filters</span>
                </span>
                <span className="text-[11px] text-[#9ca3af]">
                  {filteredStudents.length} of {students.length} match
                </span>
              </div>

              {/* Filter Selects Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {/* Class Filter */}
                <div>
                  <label className="text-[10px] text-[#9ca3af] uppercase font-bold block mb-1">Class</label>
                  <select
                    value={classFilter}
                    onChange={(e) => {
                      setClassFilter(e.target.value);
                      setStreamFilter('all');
                    }}
                    className="w-full bg-[#121214] border border-[#2c2c30] text-[#f3f4f6] rounded-lg p-2 text-xs outline-none focus:border-[#f59e0b]"
                  >
                    {CLASS_OPTIONS.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Stream Filter */}
                <div>
                  <label className="text-[10px] text-[#9ca3af] uppercase font-bold block mb-1">Stream</label>
                  <select
                    value={streamFilter}
                    onChange={(e) => setStreamFilter(e.target.value)}
                    className="w-full bg-[#121214] border border-[#2c2c30] text-[#f3f4f6] rounded-lg p-2 text-xs outline-none focus:border-[#f59e0b]"
                  >
                    {availableStreams.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="text-[10px] text-[#9ca3af] uppercase font-bold block mb-1">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full bg-[#121214] border border-[#2c2c30] text-[#f3f4f6] rounded-lg p-2 text-xs outline-none focus:border-[#f59e0b]"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active Only</option>
                    <option value="expired">Expired Only</option>
                    <option value="revoked">Revoked Only</option>
                  </select>
                </div>

                {/* PW Access Filter */}
                <div>
                  <label className="text-[10px] text-[#9ca3af] uppercase font-bold block mb-1">PW Support</label>
                  <select
                    value={pwAccessFilter}
                    onChange={(e) => setPwAccessFilter(e.target.value)}
                    className="w-full bg-[#121214] border border-[#2c2c30] text-[#f3f4f6] rounded-lg p-2 text-xs outline-none focus:border-[#f59e0b]"
                  >
                    <option value="all">All Students</option>
                    <option value="has_pw">Has PW Access</option>
                    <option value="no_pw">No PW (Legacy)</option>
                  </select>
                </div>
              </div>

              {/* Advanced Batch Presence & Search Filter */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1 border-t border-[#262626]">
                {/* Search */}
                <div className="sm:col-span-6 relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                  <input
                    type="text"
                    placeholder="Search name, PAT token, school, area..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 bg-[#121214] border border-[#2c2c30] text-xs text-[#f3f4f6] rounded-lg outline-none focus:border-[#f59e0b] placeholder-[#6b7280]"
                  />
                </div>

                {/* Batch Presence Filter */}
                <div className="sm:col-span-6 flex items-center gap-1.5">
                  <select
                    value={presenceMode}
                    onChange={(e) => setPresenceMode(e.target.value)}
                    className="bg-[#121214] border border-[#2c2c30] text-[#f3f4f6] rounded-lg py-1.5 px-2 text-xs outline-none shrink-0"
                  >
                    <option value="has">Has Batch:</option>
                    <option value="lacks">Lacks Batch:</option>
                  </select>
                  <select
                    value={batchPresenceFilter}
                    onChange={(e) => setBatchPresenceFilter(e.target.value)}
                    className="flex-1 bg-[#121214] border border-[#2c2c30] text-[#f3f4f6] rounded-lg py-1.5 px-2 text-xs outline-none focus:border-[#f59e0b] truncate"
                  >
                    <option value="all">Any / None</option>
                    {BATCH_CATALOG.map(b => (
                      <option key={b.batch_id} value={b.batch_id}>
                        {b.is_dynamic_pw ? '⚡ [PW] ' : '📚 [NT] '}{getBatchDisplayName(b)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Selection Toolbar */}
            <div className="flex items-center justify-between bg-[#141417] px-3 py-2 rounded-lg border border-[#262626]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectedStudentIds.length === filteredStudents.length ? handleDeselectAll : handleSelectAllFiltered}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#f3f4f6] hover:text-[#f59e0b] transition"
                >
                  {selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0 ? (
                    <CheckSquare size={16} className="text-[#f59e0b]" />
                  ) : (
                    <Square size={16} className="text-[#9ca3af]" />
                  )}
                  <span>Select All Filtered ({filteredStudents.length})</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30">
                  {selectedStudentIds.length} Selected
                </span>
                {selectedStudentIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-xs text-[#9ca3af] hover:text-white underline transition"
                  >
                    Deselect
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Student List */}
            <div className="flex-1 min-h-[300px] max-h-[460px] overflow-y-auto space-y-1.5 pr-1">
              {filteredStudents.length === 0 ? (
                <div className="p-8 text-center bg-[#18181b] rounded-xl border border-[#262626] text-[#9ca3af]">
                  <Users size={32} className="mx-auto opacity-30 mb-2" />
                  <p className="text-sm font-semibold">No students match current filter criteria</p>
                  <span className="text-xs opacity-75">Adjust class, stream, or search filters above</span>
                </div>
              ) : (
                filteredStudents.map((s) => {
                  const isChecked = selectedStudentIds.includes(s.id);
                  const cleanClass = parseCleanClass(s.class);
                  const effectiveBatches = Array.isArray(s.allowedBatches) && s.allowedBatches.length > 0
                    ? s.allowedBatches.map(String)
                    : getNextTopperBatchIdsForClass(cleanClass, s.stream);
                  const pwCount = effectiveBatches.filter(id => id.startsWith('pw_')).length;
                  const ntCount = effectiveBatches.length - pwCount;

                  return (
                    <div
                      key={s.id}
                      onClick={() => toggleStudentSelection(s.id)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isChecked 
                          ? 'bg-[#f59e0b]/10 border-[#f59e0b]/50 shadow-sm' 
                          : 'bg-[#18181b] border-[#262626] hover:border-[#38383e]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 text-xs">
                          {isChecked ? (
                            <CheckSquare size={17} className="text-[#f59e0b]" />
                          ) : (
                            <Square size={17} className="text-[#666]" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-bold text-[#f3f4f6] truncate">
                              {s.name || 'Unnamed Student'}
                            </span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-[#2a2a2e] text-[#d1d5db]">
                              Class {cleanClass}
                            </span>
                            {s.stream && (
                              <span className="text-[10px] text-[#9ca3af] hidden sm:inline">
                                ({getStreamLabel(s.stream)})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-[#9ca3af] mt-0.5">
                            <span className="font-mono text-[#f59e0b] bg-[#f59e0b]/10 px-1 rounded">
                              {s.pat}
                            </span>
                            {s.personalDetails?.school && (
                              <span className="truncate max-w-[140px] text-[#888]">
                                • {s.personalDetails.school}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right info pill */}
                      <div className="flex items-center gap-1.5 shrink-0 text-right">
                        {pwCount > 0 ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            PW ({pwCount})
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                            NT ({ntCount})
                          </span>
                        )}
                        <span className="text-[11px] text-[#6b7280]">
                          {effectiveBatches.length} total
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* COLUMN 2: ACTION & BATCH SELECTION (5 COLS ON DESKTOP)             */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-5 p-4 sm:p-5 flex flex-col space-y-4 bg-[#121214]">
            
            {/* Step 1: Choose Action Type */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#f3f4f6] flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#f59e0b]" />
                <span>1. Select Operation</span>
              </label>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setActionType('grant')}
                  className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                    actionType === 'grant'
                      ? 'bg-emerald-500/20 border-emerald-500/60 text-white font-bold shadow-sm'
                      : 'bg-[#18181b] border-[#262626] text-[#9ca3af] hover:text-white'
                  }`}
                >
                  <Plus size={16} className={actionType === 'grant' ? 'text-emerald-400' : ''} />
                  <span className="text-xs font-semibold">Grant / Add</span>
                  <span className="text-[10px] opacity-75">Append batches</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActionType('remove')}
                  className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                    actionType === 'remove'
                      ? 'bg-red-500/20 border-red-500/60 text-white font-bold shadow-sm'
                      : 'bg-[#18181b] border-[#262626] text-[#9ca3af] hover:text-white'
                  }`}
                >
                  <Minus size={16} className={actionType === 'remove' ? 'text-red-400' : ''} />
                  <span className="text-xs font-semibold">Remove</span>
                  <span className="text-[10px] opacity-75">Strip batches</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActionType('replace')}
                  className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                    actionType === 'replace'
                      ? 'bg-[#f59e0b]/20 border-[#f59e0b]/60 text-white font-bold shadow-sm'
                      : 'bg-[#18181b] border-[#262626] text-[#9ca3af] hover:text-white'
                  }`}
                >
                  <RefreshCw size={16} className={actionType === 'replace' ? 'text-[#f59e0b]' : ''} />
                  <span className="text-xs font-semibold">Replace All</span>
                  <span className="text-[10px] opacity-75">Exact overwrite</span>
                </button>
              </div>
            </div>

            {/* Step 2: Target Batches Selection */}
            <div className="space-y-2.5 flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#f3f4f6] flex items-center gap-1.5">
                  <Layers size={14} className="text-blue-400" />
                  <span>2. Target Batches ({targetBatchIds.length} Selected)</span>
                </label>
                {targetBatchIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearTargetBatches}
                    className="text-[11px] text-[#9ca3af] hover:text-white underline transition"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Quick Batch Presets */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAllPwForClass}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/40 transition active:scale-95"
                >
                  + PW Batches
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllNtForClass}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/40 transition active:scale-95"
                >
                  + Next Topper
                </button>
                <button
                  type="button"
                  onClick={handleSelectAllRecommended}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-[#f59e0b]/20 text-[#f59e0b] hover:bg-[#f59e0b]/30 border border-[#f59e0b]/40 transition active:scale-95"
                >
                  + Recommended
                </button>
              </div>

              {/* Batch Search & Category */}
              <div className="space-y-1.5">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                  <input
                    type="text"
                    placeholder="Search batches by name or ID..."
                    value={batchSearchQuery}
                    onChange={(e) => setBatchSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 bg-[#18181b] border border-[#2c2c30] text-xs text-[#f3f4f6] rounded-lg outline-none focus:border-[#f59e0b] placeholder-[#6b7280]"
                  />
                </div>

                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none text-[11px]">
                  {['all', 'pw', 'nexttoppers', '9', '10', '11', '12', 'dropper', 'other'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setBatchCategory(cat)}
                      className={`px-2 py-0.5 rounded-md font-semibold whitespace-nowrap transition border ${
                        batchCategory === cat
                          ? 'bg-[#2a2a2e] text-[#f59e0b] border-[#f59e0b]/40'
                          : 'bg-[#18181b] text-[#9ca3af] border-[#262626] hover:text-white'
                      }`}
                    >
                      {cat === 'pw' ? 'PW Live' : cat === 'nexttoppers' ? 'Next Topper' : cat.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Batch Cards Grid */}
              <div className="flex-1 min-h-[160px] max-h-[220px] overflow-y-auto space-y-1 pr-1 bg-[#18181b] p-2 rounded-xl border border-[#262626]">
                {filteredCatalog.map(b => {
                  const isTargetSelected = targetBatchIds.includes(String(b.batch_id));
                  const isPw = b.is_dynamic_pw || b.provider === 'Physics Wallah' || String(b.batch_id).startsWith('pw_');

                  return (
                    <div
                      key={b.batch_id}
                      onClick={() => toggleTargetBatch(b.batch_id)}
                      className={`p-2 rounded-lg border transition cursor-pointer flex items-center justify-between gap-2 text-xs ${
                        isTargetSelected
                          ? isPw
                            ? 'bg-blue-500/20 border-blue-500/60 text-white font-bold'
                            : 'bg-emerald-500/20 border-emerald-500/60 text-white font-bold'
                          : 'bg-[#121214] border-[#262626] text-[#9ca3af] hover:text-white hover:border-[#38383e]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isTargetSelected ? (
                          <CheckSquare size={14} className={isPw ? 'text-blue-400 shrink-0' : 'text-emerald-400 shrink-0'} />
                        ) : (
                          <Square size={14} className="text-[#555] shrink-0" />
                        )}
                        <span className="truncate">{getBatchDisplayName(b)}</span>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                        isPw 
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' 
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}>
                        {isPw ? 'PW' : 'NT'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Summary & Execution Box */}
            <div className="bg-[#18181b] p-3 rounded-xl border border-[#262626] space-y-3 shrink-0">
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-[#9ca3af]">
                  <span>Target Students:</span>
                  <span className="font-bold text-white">{selectedStudentIds.length} students</span>
                </div>
                <div className="flex items-center justify-between text-[#9ca3af]">
                  <span>Action:</span>
                  <span className={`font-bold capitalize ${
                    actionType === 'grant' ? 'text-emerald-400' :
                    actionType === 'remove' ? 'text-red-400' : 'text-[#f59e0b]'
                  }`}>
                    {actionType} {targetBatchIds.length} Batches
                  </span>
                </div>
              </div>

              {/* Success / Error Feedback */}
              {successReport && (
                <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span>
                    Successfully applied <strong>{successReport.action}</strong> on <strong>{successReport.totalUpdated} students</strong>!
                  </span>
                </div>
              )}

              {errorReport && (
                <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-400 shrink-0" />
                  <span>{errorReport}</span>
                </div>
              )}

              {progressStatus && (
                <div className="flex items-center gap-2 text-xs text-[#f59e0b]">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{progressStatus}</span>
                </div>
              )}

              {/* Action Button */}
              <button
                type="button"
                disabled={isProcessing || selectedStudentIds.length === 0 || targetBatchIds.length === 0}
                onClick={handleExecuteBulkUpdate}
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-lg ${
                  isProcessing || selectedStudentIds.length === 0 || targetBatchIds.length === 0
                    ? 'bg-[#2a2a2e] text-[#6b7280] cursor-not-allowed border border-[#333]'
                    : actionType === 'grant'
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold shadow-emerald-500/20 active:scale-95'
                      : actionType === 'remove'
                        ? 'bg-red-500 hover:bg-red-400 text-white font-extrabold shadow-red-500/20 active:scale-95'
                        : 'bg-[#f59e0b] hover:bg-[#fbbf24] text-black font-extrabold shadow-amber-500/20 active:scale-95'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Processing Firestore Updates...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    <span>
                      Apply {actionType.toUpperCase()} to {selectedStudentIds.length} Student{selectedStudentIds.length === 1 ? '' : 's'}
                    </span>
                  </>
                )}
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
