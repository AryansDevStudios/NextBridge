import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  ChevronRight, 
  Search, 
  Play, 
  FileText, 
  Video, 
  Calendar, 
  Check, 
  Megaphone, 
  Sparkles, 
  FlaskConical, 
  Leaf, 
  Divide, 
  BookOpen, 
  Globe, 
  Laptop, 
  Cpu, 
  Languages, 
  Award, 
  Loader2, 
  Download, 
  X,
  Layers,
  Info,
  Clock,
  ExternalLink
} from 'lucide-react';
import { pwApiService } from '../services/PwApiService';
import { getBatchDisplayName } from '../utils/batchConfig';

/**
 * Subject visual config matching dark-themed aesthetics with glowing accents
 */
function getSubjectVisual(name = '') {
  const n = name.toLowerCase();

  if (n.includes('notice')) {
    return {
      icon: Megaphone,
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.25)',
      color: '#f59e0b'
    };
  }
  if (n.includes('physics')) {
    return {
      icon: Sparkles,
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.25)',
      color: '#f87171'
    };
  }
  if (n.includes('chemistry')) {
    return {
      icon: FlaskConical,
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.25)',
      color: '#fbbf24'
    };
  }
  if (n.includes('biology')) {
    return {
      icon: Leaf,
      bg: 'rgba(34, 197, 94, 0.12)',
      border: 'rgba(34, 197, 94, 0.25)',
      color: '#4ade80'
    };
  }
  if (n.includes('math')) {
    return {
      icon: Divide,
      bg: 'rgba(249, 115, 22, 0.12)',
      border: 'rgba(249, 115, 22, 0.25)',
      color: '#fb923c'
    };
  }
  if (n.includes('english')) {
    return {
      icon: BookOpen,
      bg: 'rgba(251, 191, 36, 0.12)',
      border: 'rgba(251, 191, 36, 0.25)',
      color: '#fde047'
    };
  }
  if (n.includes('sst') || n.includes('social')) {
    return {
      icon: Globe,
      bg: 'rgba(234, 88, 12, 0.12)',
      border: 'rgba(234, 88, 12, 0.25)',
      color: '#fdba74'
    };
  }
  if (n.includes('computer') || n.includes('information')) {
    return {
      icon: Laptop,
      bg: 'rgba(59, 130, 246, 0.12)',
      border: 'rgba(59, 130, 246, 0.25)',
      color: '#60a5fa'
    };
  }
  if (n.includes('artificial') || n.includes('ai')) {
    return {
      icon: Cpu,
      bg: 'rgba(99, 102, 241, 0.12)',
      border: 'rgba(99, 102, 241, 0.25)',
      color: '#818cf8'
    };
  }
  if (n.includes('hindi') || n.includes('sanskrit')) {
    return {
      icon: Languages,
      bg: 'rgba(244, 63, 94, 0.12)',
      border: 'rgba(244, 63, 94, 0.25)',
      color: '#fb7185'
    };
  }
  return {
    icon: Award,
    bg: 'rgba(168, 85, 247, 0.12)',
    border: 'rgba(168, 85, 247, 0.25)',
    color: '#c084fc'
  };
}

export default function PwBatchExplorer({
  batch,
  user,
  onPlayVideo,
  onBackToBatches,
  onSwitchBatch,
  allowedBatchCount = 1,
  allowedSections = {}
}) {
  const batchId = batch?.pw_batch_id || batch?.original_id || '6a071d17f84ddfb496a59f76';

  // Navigation hierarchy: 'subjects' | 'chapters' | 'content'
  const [level, setLevel] = useState('subjects');
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);

  // Tab states
  const [activeSubjectTab, setActiveSubjectTab] = useState('classes'); // 'classes' | 'resources'
  const [activeChapterTab, setActiveChapterTab] = useState('chapters'); // 'chapters' | 'study_material'
  const [activeContentFilter, setActiveContentFilter] = useState('all'); // 'all' | 'lectures' | 'dpps' | 'notes' | 'dpp_pdfs' | 'dpp_videos'

  // Data caches
  const [subjects, setSubjects] = useState([]);
  const [chaptersMap, setChaptersMap] = useState({});
  const [contentMap, setContentMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Watched state tracking in localStorage
  const [watchedSet, setWatchedSet] = useState(() => {
    try {
      const saved = localStorage.getItem('nb_pw_watched_ids');
      return new Set(saved ? JSON.parse(saved) : []);
    } catch (_) {
      return new Set();
    }
  });

  const markWatched = (id) => {
    setWatchedSet(prev => {
      const next = new Set(prev);
      if (next.has(String(id))) {
        next.delete(String(id));
      } else {
        next.add(String(id));
      }
      try {
        localStorage.setItem('nb_pw_watched_ids', JSON.stringify([...next]));
      } catch (_) {}
      return next;
    });
  };

  // 1. Fetch Batch Subjects
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    pwApiService.getBatchSubjects(batchId)
      .then(subs => {
        if (isMounted) {
          setSubjects(subs);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Failed to load PW batch subjects:', err);
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [batchId]);

  // 2. Fetch Chapters when entering a Subject
  useEffect(() => {
    if (!selectedSubject) return;
    const subId = selectedSubject.subject_id || selectedSubject.id;
    if (chaptersMap[subId]) return;

    setLoading(true);
    pwApiService.getSubjectChapters(batchId, selectedSubject)
      .then(chaps => {
        setChaptersMap(prev => ({ ...prev, [subId]: chaps }));
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load PW chapters:', err);
        setLoading(false);
      });
  }, [selectedSubject, batchId]);

  // 3. Fetch Content when entering a Chapter
  useEffect(() => {
    if (!selectedChapter || !selectedSubject) return;
    const chId = selectedChapter.chapterId || selectedChapter.id;
    if (contentMap[chId]) return;

    setLoading(true);
    pwApiService.getChapterItems(batchId, selectedSubject, chId, selectedChapter.title)
      .then(items => {
        setContentMap(prev => ({ ...prev, [chId]: items }));
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load PW chapter content:', err);
        setLoading(false);
      });
  }, [selectedChapter, selectedSubject, batchId]);

  // Handlers
  const handleOpenSubject = (subject) => {
    setSelectedSubject(subject);
    setSelectedChapter(null);
    setLevel('chapters');
    setActiveChapterTab('chapters');
    setSearchQuery('');
  };

  const handleOpenChapter = (chapter, defaultFilter = 'all') => {
    setSelectedChapter(chapter);
    setLevel('content');
    setActiveContentFilter(defaultFilter);
    setSearchQuery('');
  };

  const handleBack = () => {
    setSearchQuery('');
    if (level === 'content') {
      setLevel('chapters');
      setSelectedChapter(null);
    } else if (level === 'chapters') {
      setLevel('subjects');
      setSelectedSubject(null);
    } else if (level === 'subjects') {
      if (onBackToBatches) onBackToBatches();
    }
  };

  // Filtered Subjects
  const filteredSubjects = useMemo(() => {
    let list = subjects;
    if (activeSubjectTab === 'resources') {
      list = subjects.filter(s => s.subject_name.toLowerCase().includes('notice') || s.subject_name.toLowerCase().includes('guidance'));
    } else {
      list = subjects.filter(s => !s.subject_name.toLowerCase().includes('notice') && !s.subject_name.toLowerCase().includes('guidance'));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(s => s.subject_name.toLowerCase().includes(q));
    }
    return list;
  }, [subjects, activeSubjectTab, searchQuery]);

  // Filtered Chapters
  const activeChapters = useMemo(() => {
    if (!selectedSubject) return [];
    const subId = selectedSubject.subject_id || selectedSubject.id;
    let list = chaptersMap[subId] || [];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(c => c.title.toLowerCase().includes(q));
    }
    return list;
  }, [selectedSubject, chaptersMap, searchQuery]);

  // Filtered Content Items
  const activeContentItems = useMemo(() => {
    if (!selectedChapter) return [];
    const chId = selectedChapter.chapterId || selectedChapter.id;
    let list = contentMap[chId] || [];

    if (activeContentFilter === 'lectures') {
      list = list.filter(i => i.subCategory === 'LECTURE');
    } else if (activeContentFilter === 'dpps') {
      list = list.filter(i => i.subCategory === 'DPP_PDF' || i.subCategory === 'DPP_VIDEO');
    } else if (activeContentFilter === 'notes') {
      list = list.filter(i => i.subCategory === 'NOTES');
    } else if (activeContentFilter === 'dpp_pdfs') {
      list = list.filter(i => i.subCategory === 'DPP_PDF');
    } else if (activeContentFilter === 'dpp_videos') {
      list = list.filter(i => i.subCategory === 'DPP_VIDEO');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(i => i.title.toLowerCase().includes(q));
    }
    return list;
  }, [selectedChapter, contentMap, activeContentFilter, searchQuery]);

  return (
    <div className="main-content pb-24" style={{ animation: 'fadeIn 0.2s ease' }}>
      {/* ── BREADCRUMBS BAR (App Consistent Navigation) ── */}
      <div className="breadcrumbs" style={{ marginBottom: '14px' }}>
        <button
          onClick={handleBack}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--accent)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '2px 6px',
            marginRight: '6px',
            borderRadius: '4px'
          }}
          title="Go Back"
        >
          <ArrowLeft size={18} />
        </button>

        <span
          className="breadcrumb-item"
          onClick={() => {
            setLevel('subjects');
            setSelectedSubject(null);
            setSelectedChapter(null);
            setSearchQuery('');
          }}
        >
          {getBatchDisplayName(batch)}
        </span>

        {selectedSubject && (
          <>
            <ChevronRight size={16} className="breadcrumb-separator" />
            <span
              className="breadcrumb-item"
              onClick={() => {
                setLevel('chapters');
                setSelectedChapter(null);
                setSearchQuery('');
              }}
            >
              {selectedSubject.subject_name}
            </span>
          </>
        )}

        {selectedChapter && (
          <>
            <ChevronRight size={16} className="breadcrumb-separator" />
            <span className="breadcrumb-item" style={{ color: 'var(--text-primary)' }}>
              {selectedChapter.title}
            </span>
          </>
        )}
      </div>

      {/* ── ACTIVE BATCH TOP PANEL (Matching NextBridge Design) ── */}
      {level === 'subjects' && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(99, 102, 241, 0.08) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '14px',
          padding: '14px 16px',
          marginBottom: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            {batch?.thumbnail ? (
              <img 
                src={batch.thumbnail} 
                alt={batch.batch_name}
                style={{ 
                  width: '50px', 
                  height: '50px', 
                  borderRadius: '10px', 
                  objectFit: 'cover',
                  border: '1px solid rgba(255,255,255,0.1)'
                }} 
              />
            ) : (
              <div style={{ 
                width: '50px', 
                height: '50px', 
                borderRadius: '10px', 
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: '#60a5fa'
              }}>
                <Layers size={24} />
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                <span style={{ 
                  fontSize: '0.68rem', 
                  fontWeight: 800, 
                  padding: '2px 7px', 
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  color: '#fff'
                }}>
                  PW Live
                </span>
                <span style={{ 
                  fontSize: '0.68rem', 
                  fontWeight: 700, 
                  padding: '2px 7px', 
                  borderRadius: '6px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#6ee7b7',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                  {batch?.session || '2026-27'}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {batch?.class_name || 'Class 10'}
                </span>
              </div>
              <div style={{ 
                fontSize: '1.05rem', 
                fontWeight: 700, 
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '440px'
              }}>
                {getBatchDisplayName(batch)}
              </div>
            </div>
          </div>

          {/* Switch Batch CTA */}
          <button
            type="button"
            onClick={onSwitchBatch || onBackToBatches}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#93c5fd',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'}
          >
            <Layers size={14} />
            <span>Switch Batch {allowedBatchCount > 1 ? `(${allowedBatchCount})` : ''}</span>
          </button>
        </div>
      )}

      {/* ── SEARCH INPUT ── */}
      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        <input
          type="text"
          placeholder={
            level === 'subjects' ? 'Search subjects in this batch...' :
            level === 'chapters' ? `Search chapters in ${selectedSubject?.subject_name || 'subject'}...` :
            `Search lectures, notes in ${selectedChapter?.title || 'chapter'}...`
          }
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
            <X size={15} />
          </button>
        )}
      </div>

      {/* ── PW LEVEL TABS (Styled in Dark Theme with Gold/Amber Accents) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '16px',
        overflowX: 'auto',
        scrollbarWidth: 'none'
      }}>
        {/* Level 1 Tabs */}
        {level === 'subjects' && (
          <>
            <button
              type="button"
              onClick={() => setActiveSubjectTab('classes')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 4px 10px 4px',
                fontSize: '0.92rem',
                fontWeight: 700,
                color: activeSubjectTab === 'classes' ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: activeSubjectTab === 'classes' ? '2.5px solid var(--accent)' : '2.5px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              All Classes ({subjects.filter(s => !s.subject_name.toLowerCase().includes('notice') && !s.subject_name.toLowerCase().includes('guidance')).length})
            </button>
            <button
              type="button"
              onClick={() => setActiveSubjectTab('resources')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 4px 10px 4px',
                fontSize: '0.92rem',
                fontWeight: 700,
                color: activeSubjectTab === 'resources' ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: activeSubjectTab === 'resources' ? '2.5px solid var(--accent)' : '2.5px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              Resources & Notices ({subjects.filter(s => s.subject_name.toLowerCase().includes('notice') || s.subject_name.toLowerCase().includes('guidance')).length})
            </button>
          </>
        )}

        {/* Level 2 Tabs */}
        {level === 'chapters' && (
          <>
            <button
              type="button"
              onClick={() => setActiveChapterTab('chapters')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 4px 10px 4px',
                fontSize: '0.92rem',
                fontWeight: 700,
                color: activeChapterTab === 'chapters' ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: activeChapterTab === 'chapters' ? '2.5px solid var(--accent)' : '2.5px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              Chapters ({activeChapters.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveChapterTab('study_material')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 4px 10px 4px',
                fontSize: '0.92rem',
                fontWeight: 700,
                color: activeChapterTab === 'study_material' ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: activeChapterTab === 'study_material' ? '2.5px solid var(--accent)' : '2.5px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              Study Material
            </button>
          </>
        )}

        {/* Level 3 Tabs */}
        {level === 'content' && (
          [
            { id: 'all', label: `All (${contentMap[selectedChapter?.chapterId || selectedChapter?.id]?.length || 0})` },
            { id: 'lectures', label: `Lectures (${(contentMap[selectedChapter?.chapterId || selectedChapter?.id] || []).filter(i => i.subCategory === 'LECTURE').length})` },
            { id: 'dpps', label: `DPPs (${(contentMap[selectedChapter?.chapterId || selectedChapter?.id] || []).filter(i => i.subCategory === 'DPP_PDF' || i.subCategory === 'DPP_VIDEO').length})` },
            { id: 'notes', label: `Notes (${(contentMap[selectedChapter?.chapterId || selectedChapter?.id] || []).filter(i => i.subCategory === 'NOTES').length})` },
            { id: 'dpp_pdfs', label: `DPP PDFs (${(contentMap[selectedChapter?.chapterId || selectedChapter?.id] || []).filter(i => i.subCategory === 'DPP_PDF').length})` },
            { id: 'dpp_videos', label: `DPP Videos (${(contentMap[selectedChapter?.chapterId || selectedChapter?.id] || []).filter(i => i.subCategory === 'DPP_VIDEO').length})` },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveContentFilter(tab.id)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 2px 10px 2px',
                fontSize: '0.88rem',
                fontWeight: 700,
                color: activeContentFilter === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                borderBottom: activeContentFilter === tab.id ? '2.5px solid var(--accent)' : '2.5px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))
        )}
      </div>

      {/* ── LOADING SPINNER ── */}
      {loading && (
        <div style={{
          padding: '54px 20px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--panel-bg)',
          borderRadius: '14px',
          border: '1px dashed var(--border-color)',
          margin: '16px 0'
        }}>
          <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent)', marginBottom: '14px' }} />
          <h3 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', margin: '0 0 4px', fontWeight: 700 }}>
            Loading from Physics Wallah...
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0 }}>
            Fetching latest lessons, notes, and study materials on demand
          </p>
        </div>
      )}

      {/* ── LEVEL 1: SUBJECTS CARDS (Screenshot 1 - Dark Themed) ── */}
      {!loading && level === 'subjects' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {filteredSubjects.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1',
              padding: '48px 20px',
              textAlign: 'center',
              backgroundColor: 'var(--panel-bg)',
              borderRadius: '14px',
              border: '1px dashed var(--border-color)'
            }}>
              <BookOpen size={36} style={{ color: 'var(--text-secondary)', opacity: 0.4, margin: '0 auto 10px' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>No Subjects Found</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                {searchQuery ? `No subjects match "${searchQuery}".` : 'No items available in this category.'}
              </p>
            </div>
          ) : (
            filteredSubjects.map(sub => {
              const visual = getSubjectVisual(sub.subject_name);
              const IconComponent = visual.icon;

              return (
                <div
                  key={sub.id}
                  onClick={() => handleOpenSubject(sub)}
                  style={{
                    backgroundColor: 'var(--panel-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    cursor: 'pointer',
                    transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.45)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                  }}
                >
                  {/* Subject Icon Container */}
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    backgroundColor: visual.bg,
                    border: `1px solid ${visual.border}`,
                    color: visual.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <IconComponent size={22} />
                  </div>

                  {/* Subject Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      margin: '0 0 3px 0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {sub.subject_name}
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                      Tap to view chapters
                    </p>
                  </div>

                  {/* Chevron Right */}
                  <ChevronRight size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── LEVEL 2: CHAPTERS CARDS (Screenshots 2 & 3 - Dark Themed) ── */}
      {!loading && level === 'chapters' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
          {activeChapters.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1',
              padding: '48px 20px',
              textAlign: 'center',
              backgroundColor: 'var(--panel-bg)',
              borderRadius: '14px',
              border: '1px dashed var(--border-color)'
            }}>
              <Layers size={36} style={{ color: 'var(--text-secondary)', opacity: 0.4, margin: '0 auto 10px' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>No Chapters Found</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                {searchQuery ? `No chapters match "${searchQuery}".` : 'This subject has no registered chapters.'}
              </p>
            </div>
          ) : (
            activeChapters.map(chap => {
              const isStudyMaterial = activeChapterTab === 'study_material';
              const pillLabel = isStudyMaterial ? chap.smPill : chap.chPill;

              return (
                <div
                  key={chap.id}
                  onClick={() => handleOpenChapter(chap, isStudyMaterial ? 'notes' : 'all')}
                  style={{
                    backgroundColor: 'var(--panel-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    padding: '16px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '14px',
                    cursor: 'pointer',
                    transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.45)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Pill Tag (CH - 01 / SM - 01) */}
                    <div style={{ marginBottom: '6px' }}>
                      <span style={{
                        display: 'inline-block',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        color: 'var(--accent)'
                      }}>
                        {pillLabel}
                      </span>
                    </div>

                    {/* Chapter Title */}
                    <h3 style={{
                      fontSize: '0.96rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      margin: '0 0 6px 0',
                      lineHeight: 1.35
                    }}>
                      {chap.title}
                    </h3>

                    {/* Chapter Stats */}
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {chap.itemCount}
                    </div>
                  </div>

                  {/* Chevron Right */}
                  <ChevronRight size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── LEVEL 3: CONTENT ITEMS CARDS (Screenshot 4 - Dark Themed) ── */}
      {!loading && level === 'content' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {activeContentItems.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1',
              padding: '48px 20px',
              textAlign: 'center',
              backgroundColor: 'var(--panel-bg)',
              borderRadius: '14px',
              border: '1px dashed var(--border-color)'
            }}>
              <Video size={36} style={{ color: 'var(--text-secondary)', opacity: 0.4, margin: '0 auto 10px' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>No Content Found</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                {searchQuery ? `No items match "${searchQuery}".` : 'No items found in this filter category.'}
              </p>
            </div>
          ) : (
            activeContentItems.map((item, idx) => {
              const isVideo = item.type === 'video' || item.subCategory === 'LECTURE';
              const isWatched = watchedSet.has(String(item.id));

              const handleOpenItem = () => {
                markWatched(item.id);
                if (!onPlayVideo) return;
                if (isVideo) {
                  onPlayVideo(item);
                } else {
                  onPlayVideo({
                    ...item,
                    type: 'pdf',
                    title: item.title || 'Physics Wallah Notes',
                    url: item.url || item.raw_file_url,
                    subject_name: item.subject_name || selectedSubject?.subject_name || 'Physics Wallah'
                  });
                }
              };

              return (
                <div
                  key={item.id || idx}
                  style={{
                    backgroundColor: 'var(--panel-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
                    transition: 'border-color 0.18s ease'
                  }}
                >
                  {/* Top Row: Thumbnail + Details + Status Checkmark */}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    {/* Left: Thumbnail Container */}
                    <div 
                      onClick={handleOpenItem}
                      style={{
                        width: '115px',
                        aspectRatio: '16 / 9',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        backgroundColor: '#0a0a0a',
                        flexShrink: 0,
                        position: 'relative',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                      ) : isVideo ? (
                        <Video size={24} style={{ color: 'var(--accent)' }} />
                      ) : (
                        <FileText size={24} style={{ color: '#38bdf8' }} />
                      )}

                      {/* Duration Tag if video */}
                      {item.duration > 0 && (
                        <div style={{
                          position: 'absolute',
                          bottom: '4px',
                          right: '4px',
                          background: 'rgba(0,0,0,0.85)',
                          color: '#fff',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          padding: '1px 4px',
                          borderRadius: '4px'
                        }}>
                          {Math.floor(item.duration / 60)}m
                        </div>
                      )}
                    </div>

                    {/* Middle: Details */}
                    <div 
                      onClick={handleOpenItem}
                      style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    >
                      {/* Tag Pill (VIDEO / NOTES / DPP PDF) */}
                      <div style={{ marginBottom: '4px' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: isVideo 
                            ? 'rgba(245, 158, 11, 0.15)' 
                            : item.subCategory === 'NOTES' 
                              ? 'rgba(34, 197, 94, 0.15)' 
                              : 'rgba(168, 85, 247, 0.15)',
                          border: `1px solid ${
                            isVideo 
                              ? 'rgba(245, 158, 11, 0.3)' 
                              : item.subCategory === 'NOTES' 
                                ? 'rgba(34, 197, 94, 0.3)' 
                                : 'rgba(168, 85, 247, 0.3)'
                          }`,
                          color: isVideo 
                            ? 'var(--accent)' 
                            : item.subCategory === 'NOTES' 
                              ? '#4ade80' 
                              : '#c084fc',
                          letterSpacing: '0.3px'
                        }}>
                          {item.badgeText || (isVideo ? 'VIDEO' : 'PDF')}
                        </span>
                      </div>

                      {/* Title */}
                      <h4 style={{
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        margin: '0 0 6px 0',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {item.title}
                      </h4>

                      {/* Date */}
                      {item.dateStr && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          <Calendar size={12} />
                          <span>{item.dateStr}</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Circular Checkmark */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        markWatched(item.id);
                      }}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: isWatched ? '#22c55e' : 'rgba(255, 255, 255, 0.06)',
                        border: isWatched ? 'none' : '1px solid var(--border-color)',
                        color: isWatched ? '#000' : 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                        boxShadow: isWatched ? '0 0 8px rgba(34, 197, 94, 0.4)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                      title={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
                    >
                      <Check size={14} strokeWidth={3} />
                    </div>
                  </div>

                  {/* Bottom Row: Full Width CTA Button (Screenshot 4 - Dark App Styled) */}
                  <div>
                    {isVideo ? (
                      <button
                        type="button"
                        onClick={handleOpenItem}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'var(--accent)',
                          color: '#000',
                          fontSize: '0.86rem',
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 10px rgba(245, 158, 11, 0.25)',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'var(--accent-hover)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'var(--accent)';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <Play size={15} fill="#000" />
                        <span>Watch</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleOpenItem}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          color: '#38bdf8',
                          fontSize: '0.86rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(56, 189, 248, 0.2)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'rgba(56, 189, 248, 0.12)';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <FileText size={15} />
                        <span>{item.subCategory === 'DPP_PDF' ? 'View DPP' : 'View Notes'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
