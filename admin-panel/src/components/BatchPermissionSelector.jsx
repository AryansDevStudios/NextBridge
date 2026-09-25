import React, { useState, useMemo } from 'react';
import { 
  BATCH_CATALOG, 
  getRecommendedBatchIds, 
  getBatchDisplayName,
  getStreamLabel
} from '../utils/batchConfig';
import { 
  Check, 
  Search, 
  Sparkles, 
  Layers, 
  CheckSquare, 
  Square, 
  Clock, 
  Video, 
  FileText,
  RotateCcw
} from 'lucide-react';

export default function BatchPermissionSelector({ 
  studentClass, 
  studentStream = '', 
  selectedBatchIds = [], 
  onChange 
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all'); // 'all', '7', '8', '9', '10', '11', '12', 'crash', 'archive', 'free'

  // 1. Compute recommended batch IDs dynamically
  const recommendedIds = useMemo(() => {
    return getRecommendedBatchIds(studentClass, studentStream);
  }, [studentClass, studentStream]);

  // 2. Filter batches based on category and search query
  const filteredBatches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return BATCH_CATALOG.filter(batch => {
      // Category filter
      if (activeCategory === '7' && batch.class_name !== 'Class 7') return false;
      if (activeCategory === '8' && batch.class_name !== 'Class 8') return false;
      if (activeCategory === '9' && batch.class_name !== 'Class 9') return false;
      if (activeCategory === '10' && batch.class_name !== 'Class 10') return false;
      if (activeCategory === '11' && batch.class_name !== 'Class 11') return false;
      if (activeCategory === '12' && batch.class_name !== 'Class 12') return false;
      if (activeCategory === 'crash' && !batch.class_name?.toLowerCase().includes('crash') && !batch.batch_name?.toLowerCase().includes('crash') && !batch.batch_name?.toLowerCase().includes('pro')) return false;
      if (activeCategory === 'archive' && !batch.is_old) return false;
      if (activeCategory === 'free' && !batch.batch_name?.toLowerCase().includes('free')) return false;

      // Search filter
      if (q) {
        const titleMatch = (batch.batch_name || '').toLowerCase().includes(q);
        const origMatch = (batch.original_title || '').toLowerCase().includes(q);
        const idMatch = String(batch.batch_id).toLowerCase().includes(q);
        const classMatch = (batch.class_name || '').toLowerCase().includes(q);
        return titleMatch || origMatch || idMatch || classMatch;
      }

      return true;
    });
  }, [activeCategory, searchQuery]);

  const toggleBatch = (batchId) => {
    const idStr = String(batchId);
    if (selectedBatchIds.includes(idStr)) {
      onChange(selectedBatchIds.filter(id => id !== idStr));
    } else {
      onChange([...selectedBatchIds, idStr]);
    }
  };

  const handleSelectRecommended = () => {
    // Merge recommended with any currently selected, or set to recommended
    const merged = Array.from(new Set([...selectedBatchIds, ...recommendedIds]));
    onChange(merged);
  };

  const handleSelectOnlyRecommended = () => {
    onChange([...recommendedIds]);
  };

  const handleSelectAllFiltered = () => {
    const idsToAdd = filteredBatches.map(b => String(b.batch_id));
    const merged = Array.from(new Set([...selectedBatchIds, ...idsToAdd]));
    onChange(merged);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const streamText = getStreamLabel(studentStream);

  return (
    <div className="bg-[#181818] p-3.5 sm:p-4 rounded-xl border border-[#262626] space-y-3.5">
      {/* Header with counter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#262626]">
        <div>
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-[#f59e0b]" />
            <h3 className="text-sm font-bold text-[#f3f4f6]">Batch Permissions & Access Control</h3>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/40">
              {selectedBatchIds.length} Granted
            </span>
          </div>
          <p className="text-xs text-[#9ca3af] mt-0.5">
            Allow students to access specific batches. Admin has complete flexibility to assign across any class or archive.
          </p>
        </div>

        {/* Quick Batch Actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={handleSelectRecommended}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#f59e0b]/15 text-[#f59e0b] hover:bg-[#f59e0b]/25 border border-[#f59e0b]/30 transition"
            title="Add all recommended batches for this student's class and stream"
          >
            <Sparkles size={12} />
            <span>Select Recommended</span>
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-[#222] text-[#9ca3af] hover:text-white hover:bg-[#2a2a2a] border border-[#333] transition"
          >
            <RotateCcw size={11} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Recommended Batches Box */}
      <div className="bg-[#121212] p-2.5 sm:p-3 rounded-lg border border-[#2a2a2a] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-[#f3f4f6]">
            <Sparkles size={13} className="text-[#f59e0b]" />
            <span>Recommended for Class {studentClass}{streamText ? ` (${streamText})` : ''}:</span>
          </div>
          <span className="text-[11px] text-[#9ca3af]">
            {recommendedIds.filter(id => selectedBatchIds.includes(id)).length}/{recommendedIds.length} active
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {recommendedIds.map(batchId => {
            const batch = BATCH_CATALOG.find(b => String(b.batch_id) === String(batchId));
            if (!batch) return null;
            const isSelected = selectedBatchIds.includes(String(batchId));

            return (
              <button
                key={batchId}
                type="button"
                onClick={() => toggleBatch(batchId)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition border ${
                  isSelected 
                    ? 'bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/50 shadow-sm' 
                    : 'bg-[#181818] text-[#9ca3af] border-[#333] hover:text-white hover:border-[#555]'
                }`}
              >
                {isSelected ? <Check size={12} className="text-[#f59e0b]" /> : <Square size={12} className="opacity-50" />}
                <span className="truncate max-w-[200px]">{getBatchDisplayName(batch)}</span>
                {batch.is_old && <span className="text-[9px] bg-purple-950/60 text-purple-300 px-1 py-0.2 rounded border border-purple-800/40">Archive</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search and Category Filters */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="Search batches by title, class or ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#121212] border border-[#2a2a2a] rounded-lg text-xs text-[#f3f4f6] placeholder-[#6b7280] outline-none focus:border-[#f59e0b]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#9ca3af] hover:text-white"
              >
                ×
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleSelectAllFiltered}
            className="px-2.5 py-1.5 text-xs bg-[#222] hover:bg-[#2a2a2a] border border-[#333] text-[#9ca3af] hover:text-white rounded-lg transition whitespace-nowrap self-start"
          >
            Select Filtered ({filteredBatches.length})
          </button>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-[11px]">
          {[
            { id: 'all', label: 'All Batches' },
            { id: '7', label: 'Class 7' },
            { id: '8', label: 'Class 8' },
            { id: '9', label: 'Class 9' },
            { id: '10', label: 'Class 10' },
            { id: '11', label: 'Class 11' },
            { id: '12', label: 'Class 12' },
            { id: 'crash', label: 'Crash Courses' },
            { id: 'archive', label: '2025-26 Archive' },
            { id: 'free', label: 'Free Batches' }
          ].map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-2 py-0.5 rounded-md whitespace-nowrap transition border ${
                activeCategory === cat.id 
                  ? 'bg-[#f59e0b] text-[#0a0a0a] font-bold border-[#f59e0b]' 
                  : 'bg-[#121212] text-[#9ca3af] border-[#262626] hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Batch Cards Grid (Scrollable) */}
      <div className="max-h-[280px] overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
        {filteredBatches.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#9ca3af]">
            No batches found matching "{searchQuery}"
          </div>
        ) : (
          filteredBatches.map(batch => {
            const isSelected = selectedBatchIds.includes(String(batch.batch_id));
            const isRec = recommendedIds.includes(String(batch.batch_id));

            return (
              <div
                key={batch.batch_id}
                onClick={() => toggleBatch(batch.batch_id)}
                className={`p-2 rounded-lg border transition cursor-pointer flex items-center gap-2.5 sm:gap-3 ${
                  isSelected 
                    ? 'bg-[#f59e0b]/10 border-[#f59e0b]/40 hover:bg-[#f59e0b]/15' 
                    : 'bg-[#121212] border-[#262626] hover:border-[#383838]'
                }`}
              >
                {/* Checkbox */}
                <div className="shrink-0">
                  {isSelected ? (
                    <div className="w-4 h-4 rounded bg-[#f59e0b] flex items-center justify-center text-[#0a0a0a]">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  ) : (
                    <div className="w-4 h-4 rounded border border-[#444] bg-[#181818]" />
                  )}
                </div>

                {/* Batch Thumbnail */}
                <div className="w-12 h-8 sm:w-14 sm:h-9 rounded bg-[#222] overflow-hidden shrink-0 border border-[#333] relative">
                  {batch.thumbnail ? (
                    <img 
                      src={batch.thumbnail} 
                      alt="" 
                      className="w-full h-full object-cover"
                      loading="lazy" 
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#555]">
                      <Video size={14} />
                    </div>
                  )}
                  {batch.is_old && (
                    <span className="absolute bottom-0 right-0 bg-purple-900/90 text-purple-200 text-[8px] font-bold px-1 rounded-tl">
                      Old
                    </span>
                  )}
                </div>

                {/* Batch Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-[#f3f4f6] truncate max-w-[320px]">
                      {getBatchDisplayName(batch)}
                    </span>
                    {isRec && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/30">
                        Recommended
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-[#9ca3af] mt-0.5 flex-wrap">
                    <span className="bg-[#222] px-1.5 py-0.2 rounded border border-[#333] text-[#ddd]">
                      {batch.class_name || 'Course'}
                    </span>
                    <span>{batch.session || (batch.is_old ? '2025-26' : '2026-27')}</span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <Video size={10} className="text-[#f59e0b]" />
                      {batch.video_count || 0} vids
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <FileText size={10} className="text-[#38bdf8]" />
                      {batch.pdf_count || 0} pdfs
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
