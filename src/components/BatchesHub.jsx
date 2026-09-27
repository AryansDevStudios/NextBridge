import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Layers, 
  Check, 
  Folder, 
  Video, 
  FileText, 
  Sparkles, 
  Clock, 
  ChevronRight,
  Archive,
  Zap,
  Play
} from 'lucide-react';
import { getBatchDisplayName } from '../utils/batchConfig';

export default function BatchesHub({ 
  user, 
  activeBatchId, 
  onSelectBatch, 
  allowedBatches = []
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'active', 'archive', 'crash', 'free'

  // Filter batches based on tab and search
  const filteredBatches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allowedBatches.filter(batch => {
      // Filter tabs
      if (activeFilter === 'pw' && !batch.is_dynamic_pw && batch.provider !== 'Physics Wallah') return false;
      if (activeFilter === 'nexttoppers' && (batch.is_dynamic_pw || batch.provider === 'Physics Wallah')) return false;
      if (activeFilter === 'active' && batch.is_old) return false;
      if (activeFilter === 'archive' && !batch.is_old) return false;
      if (activeFilter === 'crash' && !batch.class_name?.toLowerCase().includes('crash') && !batch.batch_name?.toLowerCase().includes('crash') && !batch.batch_name?.toLowerCase().includes('pro')) return false;
      if (activeFilter === 'free' && !batch.batch_name?.toLowerCase().includes('free')) return false;

      // Search
      if (q) {
        const titleMatch = (batch.batch_name || '').toLowerCase().includes(q);
        const classMatch = (batch.class_name || '').toLowerCase().includes(q);
        const subMatch = Array.isArray(batch.subjects) && batch.subjects.some(s => s.toLowerCase().includes(q));
        return titleMatch || classMatch || subMatch;
      }

      return true;
    });
  }, [allowedBatches, activeFilter, searchQuery]);

  const pwCount = allowedBatches.filter(b => b.is_dynamic_pw || b.provider === 'Physics Wallah').length;
  const ntCount = allowedBatches.filter(b => !b.is_dynamic_pw && b.provider !== 'Physics Wallah').length;
  const activeCount = allowedBatches.filter(b => !b.is_old).length;
  const archiveCount = allowedBatches.filter(b => b.is_old).length;
  const crashCount = allowedBatches.filter(b => b.class_name?.toLowerCase().includes('crash') || b.batch_name?.toLowerCase().includes('crash') || b.batch_name?.toLowerCase().includes('pro')).length;

  return (
    <div className="main-content pb-24" style={{ animation: 'fadeIn 0.25s ease' }}>
      {/* Batches Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ 
              width: '38px', 
              height: '38px', 
              borderRadius: '10px', 
              background: 'rgba(245, 158, 11, 0.15)', 
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'var(--accent)'
            }}>
              <Layers size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
                My Batches
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                You have permission to access {allowedBatches.length} batch{allowedBatches.length === 1 ? '' : 'es'}
              </p>
            </div>
          </div>

          <div style={{ 
            fontSize: '0.75rem', 
            fontWeight: 600, 
            color: 'var(--accent)', 
            background: 'rgba(245, 158, 11, 0.1)', 
            padding: '4px 10px', 
            borderRadius: '999px',
            border: '1px solid rgba(245, 158, 11, 0.25)'
          }}>
            {String(user?.class || '').toLowerCase() === 'dropper'
              ? 'Dropper / 12th Pass Student'
              : String(user?.class || '').toLowerCase() === 'other'
              ? 'Competitive Aspirant'
              : `Class ${user?.class || '10'} Student`}
          </div>
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', marginTop: '12px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search your permitted batches..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 38px',
              background: 'var(--panel-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          overflowX: 'auto', 
          paddingTop: '12px', 
          paddingBottom: '4px',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch'
        }}>
          {[
            { id: 'all', label: `All (${allowedBatches.length})` },
            ...(pwCount > 0 ? [{ id: 'pw', label: `Physics Wallah (${pwCount})` }] : []),
            ...(ntCount > 0 ? [{ id: 'nexttoppers', label: `Next Toppers (${ntCount})` }] : []),
            { id: 'active', label: `Active 2026-27 (${activeCount})` },
            ...(archiveCount > 0 ? [{ id: 'archive', label: `2025-26 Archive (${archiveCount})` }] : []),
            ...(crashCount > 0 ? [{ id: 'crash', label: `Crash / Olympiad (${crashCount})` }] : []),
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: activeFilter === f.id ? 'var(--accent)' : 'var(--panel-bg)',
                color: activeFilter === f.id ? '#000' : 'var(--text-secondary)',
                border: activeFilter === f.id ? '1px solid var(--accent)' : '1px solid var(--border-color)'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Batches Grid */}
      {filteredBatches.length === 0 ? (
        <div style={{ 
          padding: '48px 24px', 
          textAlign: 'center', 
          background: 'var(--panel-bg)', 
          borderRadius: '14px', 
          border: '1px dashed var(--border-color)',
          marginTop: '16px' 
        }}>
          <Layers size={36} style={{ color: 'var(--text-secondary)', opacity: 0.5, margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', margin: '0 0 6px', fontWeight: 700 }}>
            No Batches Found
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
            {searchQuery ? `No batches matched "${searchQuery}".` : 'You do not have access to any batches in this filter.'}
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px'
        }}>
          {filteredBatches.map(batch => {
            const isCurrentlyActive = String(batch.batch_id) === String(activeBatchId);
            const isArchive = !!batch.is_old;

            return (
              <div
                key={batch.batch_id}
                onClick={() => onSelectBatch(String(batch.batch_id))}
                style={{
                  background: 'var(--panel-bg)',
                  border: isCurrentlyActive ? '2px solid var(--accent)' : '1px solid var(--border-color)',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
                  position: 'relative',
                  boxShadow: isCurrentlyActive ? '0 4px 20px rgba(245, 158, 11, 0.18)' : '0 2px 8px rgba(0,0,0,0.2)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  if (!isCurrentlyActive) e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.5)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  if (!isCurrentlyActive) e.currentTarget.style.borderColor = 'var(--border-color)';
                }}
              >
                {/* Batch Thumbnail Container */}
                <div style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16 / 9',
                  background: '#0a0a0a',
                  overflow: 'hidden'
                }}>
                  {batch.thumbnail ? (
                    <img 
                      src={batch.thumbnail} 
                      alt={batch.batch_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy" 
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                      <Layers size={36} />
                    </div>
                  )}

                  {/* Gradient shadow overlay */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.7) 100%)'
                  }} />

                  {/* Top Badges */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    right: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    pointerEvents: 'none'
                  }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backdropFilter: 'blur(6px)',
                        background: isArchive ? 'rgba(88, 28, 135, 0.85)' : 'rgba(16, 185, 129, 0.85)',
                        color: '#fff',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
                      }}>
                        {isArchive ? '2025-26 Archive' : (batch.session || '2026-27')}
                      </span>

                      {batch.provider === 'Physics Wallah' && (
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backdropFilter: 'blur(6px)',
                          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                          color: '#fff',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
                        }}>
                          PW Live
                        </span>
                      )}
                    </div>

                    {isCurrentlyActive && (
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: 'var(--accent)',
                        color: '#000',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)'
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#000', display: 'inline-block' }} />
                        Active
                      </span>
                    )}
                  </div>

                  {/* Bottom Class Pill */}
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: '4px',
                      background: 'rgba(0,0,0,0.75)',
                      color: '#e5e7eb',
                      border: '1px solid rgba(255,255,255,0.15)'
                    }}>
                      {batch.class_name || 'Class'}
                    </span>
                  </div>
                </div>

                {/* Batch Card Body */}
                <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <h3 style={{
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    margin: '0 0 8px 0',
                    lineHeight: 1.35,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {getBatchDisplayName(batch)}
                  </h3>

                  {/* Metadata Stats */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)',
                    marginTop: 'auto',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(255,255,255,0.06)'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Folder size={12} style={{ color: 'var(--accent)' }} />
                      <span>{batch.subject_count || (batch.subjects ? batch.subjects.length : 0)} Subjects</span>
                    </span>

                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Video size={12} style={{ color: '#38bdf8' }} />
                      <span>{batch.video_count || 0} Videos</span>
                    </span>

                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FileText size={12} style={{ color: '#a78bfa' }} />
                      <span>{batch.pdf_count || 0} PDFs</span>
                    </span>
                  </div>

                  {/* Card Bottom CTA */}
                  <div style={{ marginTop: '12px' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectBatch(String(batch.batch_id));
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease',
                        background: isCurrentlyActive ? 'rgba(245, 158, 11, 0.15)' : 'var(--accent)',
                        color: isCurrentlyActive ? 'var(--accent)' : '#000',
                        border: isCurrentlyActive ? '1px solid rgba(245, 158, 11, 0.4)' : 'none'
                      }}
                    >
                      {isCurrentlyActive ? (
                        <>
                          <Check size={14} />
                          <span>Currently Active • Browse</span>
                        </>
                      ) : (
                        <>
                          <Play size={14} fill="#000" />
                          <span>Open Batch</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
