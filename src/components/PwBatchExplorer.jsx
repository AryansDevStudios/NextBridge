import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ArrowLeft, 
  ChevronRight, 
  Search, 
  Play, 
  FileText, 
  Video, 
  Calendar, 
  Check, 
  CheckCircle2, 
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
  ExternalLink, 
  X,
  Layers,
  FileCheck
} from 'lucide-react';
import { pwApiService } from '../services/PwApiService';

/**
 * Subject visual config matching authentic PW palette and icons (Screenshot 1)
 */
function getSubjectVisual(name = '') {
  const n = name.toLowerCase();

  if (n.includes('notice')) {
    return {
      icon: Megaphone,
      bg: '#FEF3C7',
      color: '#D97706'
    };
  }
  if (n.includes('physics')) {
    return {
      icon: Sparkles,
      bg: '#FEE2E2',
      color: '#DC2626'
    };
  }
  if (n.includes('chemistry')) {
    return {
      icon: FlaskConical,
      bg: '#FEF3C7',
      color: '#D97706'
    };
  }
  if (n.includes('biology')) {
    return {
      icon: Leaf,
      bg: '#DCFCE7',
      color: '#16A34A'
    };
  }
  if (n.includes('math')) {
    return {
      icon: Divide,
      bg: '#FFEDD5',
      color: '#EA580C'
    };
  }
  if (n.includes('english')) {
    return {
      icon: BookOpen,
      bg: '#FDE68A',
      color: '#B45309'
    };
  }
  if (n.includes('sst') || n.includes('social')) {
    return {
      icon: Globe,
      bg: '#FED7AA',
      color: '#C2410C'
    };
  }
  if (n.includes('computer') || n.includes('information')) {
    return {
      icon: Laptop,
      bg: '#DBEAFE',
      color: '#2563EB'
    };
  }
  if (n.includes('artificial') || n.includes('ai')) {
    return {
      icon: Cpu,
      bg: '#E0E7FF',
      color: '#4F46E5'
    };
  }
  if (n.includes('hindi') || n.includes('sanskrit')) {
    return {
      icon: Languages,
      bg: '#FFE4E6',
      color: '#E11D48'
    };
  }
  return {
    icon: Award,
    bg: '#F3E8FF',
    color: '#9333EA'
  };
}

export default function PwBatchExplorer({
  batch,
  user,
  onPlayVideo,
  onBackToBatches,
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

  // Watched state tracking
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
      next.add(String(id));
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
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#FAF7F2',
      color: '#2D2218',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      paddingBottom: '90px'
    }}>
      {/* ── TOP HEADER ── */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        backgroundColor: '#FAF7F2',
        borderBottom: '1px solid #ECE3D4',
        padding: '12px 16px 0 16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
          {/* Round Back Button */}
          <button
            onClick={handleBack}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5DCD0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#2D2218',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'all 0.15s ease'
            }}
            title="Back"
          >
            <ArrowLeft size={18} />
          </button>

          {/* View Title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#2B1E12',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {level === 'subjects' ? 'Subjects' :
               level === 'chapters' ? (selectedSubject?.subject_name || 'Chapters') :
               (selectedChapter?.title || 'Chapter Content')}
            </h1>
          </div>
        </div>

        {/* ── TABS BAR ── */}
        {/* Level 1: Subjects Tabs (All Classes | Resources) */}
        {level === 'subjects' && (
          <div style={{ display: 'flex', gap: '24px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            <button
              onClick={() => setActiveSubjectTab('classes')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 4px 10px 4px',
                fontSize: '0.9rem',
                fontWeight: 700,
                color: activeSubjectTab === 'classes' ? '#C2611D' : '#8A7B6D',
                borderBottom: activeSubjectTab === 'classes' ? '2.5px solid #C2611D' : '2.5px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
            >
              All Classes
            </button>
            <button
              onClick={() => setActiveSubjectTab('resources')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 4px 10px 4px',
                fontSize: '0.9rem',
                fontWeight: 700,
                color: activeSubjectTab === 'resources' ? '#C2611D' : '#8A7B6D',
                borderBottom: activeSubjectTab === 'resources' ? '2.5px solid #C2611D' : '2.5px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
            >
              Resources
            </button>
          </div>
        )}

        {/* Level 2: Chapters Tabs (Chapters | Study Material) */}
        {level === 'chapters' && (
          <div style={{ display: 'flex', gap: '24px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            <button
              onClick={() => setActiveChapterTab('chapters')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 4px 10px 4px',
                fontSize: '0.9rem',
                fontWeight: 700,
                color: activeChapterTab === 'chapters' ? '#C2611D' : '#8A7B6D',
                borderBottom: activeChapterTab === 'chapters' ? '2.5px solid #C2611D' : '2.5px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
            >
              Chapters
            </button>
            <button
              onClick={() => setActiveChapterTab('study_material')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 4px 10px 4px',
                fontSize: '0.9rem',
                fontWeight: 700,
                color: activeChapterTab === 'study_material' ? '#C2611D' : '#8A7B6D',
                borderBottom: activeChapterTab === 'study_material' ? '2.5px solid #C2611D' : '2.5px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
            >
              Study Material
            </button>
          </div>
        )}

        {/* Level 3: Content Filter Tabs (All | Lectures | DPPs | Notes | DPP PDFs | DPP Videos) */}
        {level === 'content' && (
          <div style={{ 
            display: 'flex', 
            gap: '18px', 
            overflowX: 'auto', 
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: '2px'
          }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'lectures', label: 'Lectures' },
              { id: 'dpps', label: 'DPPs' },
              { id: 'notes', label: 'Notes' },
              { id: 'dpp_pdfs', label: 'DPP PDFs' },
              { id: 'dpp_videos', label: 'DPP Videos' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveContentFilter(tab.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '8px 2px 10px 2px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: activeContentFilter === tab.id ? '#C2611D' : '#8A7B6D',
                  borderBottom: activeContentFilter === tab.id ? '2.5px solid #C2611D' : '2.5px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.18s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT CONTAINER ── */}
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '16px 14px' }}>
        {/* Loading Spinner */}
        {loading && (
          <div style={{
            padding: '48px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Loader2 size={36} className="animate-spin" style={{ color: '#C2611D', marginBottom: '12px' }} />
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#7C6F61' }}>
              Fetching from Physics Wallah...
            </span>
          </div>
        )}

        {/* ── LEVEL 1: SUBJECTS LIST (Screenshot 1) ── */}
        {!loading && level === 'subjects' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredSubjects.length === 0 ? (
              <div style={{
                padding: '48px 20px',
                textAlign: 'center',
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #EBE3D5'
              }}>
                <BookOpen size={36} style={{ color: '#8D7B68', opacity: 0.4, margin: '0 auto 10px' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#2B1E12', margin: '0 0 4px' }}>No Subjects Found</h3>
                <p style={{ fontSize: '0.8rem', color: '#7C6F61', margin: 0 }}>There are no items currently available in this tab.</p>
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
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #ECE3D4',
                      borderRadius: '16px',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.borderColor = '#DFD3BF';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.borderColor = '#ECE3D4';
                    }}
                  >
                    {/* Subject Icon */}
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '12px',
                      backgroundColor: visual.bg,
                      color: visual.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <IconComponent size={20} />
                    </div>

                    {/* Subject Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: '#2B1E12',
                        margin: '0 0 2px 0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {sub.subject_name}
                      </h3>
                      <p style={{ fontSize: '0.78rem', color: '#8A7B6D', margin: 0 }}>
                        Tap to view chapters
                      </p>
                    </div>

                    {/* Chevron Right */}
                    <ChevronRight size={18} style={{ color: '#8A7B6D', flexShrink: 0 }} />
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── LEVEL 2: CHAPTERS LIST (Screenshots 2 & 3) ── */}
        {!loading && level === 'chapters' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeChapters.length === 0 ? (
              <div style={{
                padding: '48px 20px',
                textAlign: 'center',
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #EBE3D5'
              }}>
                <Layers size={36} style={{ color: '#8D7B68', opacity: 0.4, margin: '0 auto 10px' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#2B1E12', margin: '0 0 4px' }}>No Chapters Found</h3>
                <p style={{ fontSize: '0.8rem', color: '#7C6F61', margin: 0 }}>This subject currently has no registered chapters.</p>
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
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #ECE3D4',
                      borderRadius: '16px',
                      padding: '16px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.borderColor = '#DFD3BF';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.borderColor = '#ECE3D4';
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Pill Tag (CH - 01 / SM - 01) */}
                      <span style={{
                        display: 'inline-block',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        backgroundColor: '#FDF1DF',
                        color: '#C2611D',
                        marginBottom: '6px'
                      }}>
                        {pillLabel}
                      </span>

                      {/* Chapter Title */}
                      <h3 style={{
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#2B1E12',
                        margin: '0 0 4px 0',
                        lineHeight: 1.35
                      }}>
                        {chap.title}
                      </h3>

                      {/* Chapter Stats */}
                      <div style={{ fontSize: '0.8rem', color: '#7C6F61', fontWeight: 500 }}>
                        {chap.itemCount}
                      </div>
                    </div>

                    {/* Chevron Right */}
                    <ChevronRight size={18} style={{ color: '#8A7B6D', flexShrink: 0 }} />
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── LEVEL 3: CHAPTER CONTENT LIST (Screenshot 4) ── */}
        {!loading && level === 'content' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {activeContentItems.length === 0 ? (
              <div style={{
                padding: '48px 20px',
                textAlign: 'center',
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #EBE3D5'
              }}>
                <Video size={36} style={{ color: '#8D7B68', opacity: 0.4, margin: '0 auto 10px' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#2B1E12', margin: '0 0 4px' }}>No Content Found</h3>
                <p style={{ fontSize: '0.8rem', color: '#7C6F61', margin: 0 }}>There are no items matching this category filter.</p>
              </div>
            ) : (
              activeContentItems.map((item, idx) => {
                const isVideo = item.type === 'video' || item.subCategory === 'LECTURE';
                const isWatched = watchedSet.has(String(item.id));

                return (
                  <div
                    key={item.id || idx}
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #ECE3D4',
                      borderRadius: '16px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                    }}
                  >
                    {/* Top Row: Thumbnail + Details + Status Checkmark */}
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      {/* Left: Thumbnail container */}
                      <div style={{
                        width: '105px',
                        aspectRatio: '16 / 9',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        backgroundColor: '#1E1610',
                        flexShrink: 0,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {item.thumbnail ? (
                          <img
                            src={item.thumbnail}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            loading="lazy"
                          />
                        ) : isVideo ? (
                          <Video size={22} style={{ color: '#C2611D' }} />
                        ) : (
                          <FileText size={22} style={{ color: '#2563EB' }} />
                        )}
                      </div>

                      {/* Middle: Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Tag Pill (VIDEO / NOTES / DPP PDF) */}
                        <div style={{ marginBottom: '4px' }}>
                          <span style={{
                            display: 'inline-block',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: isVideo ? '#FDF1DF' : '#E8F5E9',
                            color: isVideo ? '#C2611D' : '#2E7D32',
                            letterSpacing: '0.4px'
                          }}>
                            {item.badgeText || (isVideo ? 'VIDEO' : 'PDF')}
                          </span>
                        </div>

                        {/* Title */}
                        <h4 style={{
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          color: '#2B1E12',
                          margin: '0 0 6px 0',
                          lineHeight: 1.35,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {item.title}
                        </h4>

                        {/* Date info */}
                        {item.dateStr && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: '#8A7B6D' }}>
                            <Calendar size={12} />
                            <span>{item.dateStr}</span>
                          </div>
                        )}
                      </div>

                      {/* Right: Circular Checkmark */}
                      <div
                        onClick={() => markWatched(item.id)}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: isWatched ? '#22C55E' : '#EFEAE2',
                          color: isWatched ? '#FFFFFF' : '#8A7B6D',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          flexShrink: 0
                        }}
                        title={isWatched ? 'Completed' : 'Mark as completed'}
                      >
                        <Check size={14} strokeWidth={2.5} />
                      </div>
                    </div>

                    {/* Bottom Row: Full Width CTA Button (Screenshot 4) */}
                    <div>
                      {isVideo ? (
                        <button
                          type="button"
                          onClick={() => {
                            markWatched(item.id);
                            if (onPlayVideo) onPlayVideo(item);
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            backgroundColor: '#2D1D13', // Signature rich dark brown button
                            color: '#FFFFFF',
                            fontSize: '0.86rem',
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 6px rgba(45, 29, 19, 0.25)',
                            transition: 'background-color 0.15s ease'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1D130C'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#2D1D13'}
                        >
                          <Play size={15} fill="#FFFFFF" />
                          <span>Watch</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            markWatched(item.id);
                            if (item.url) window.open(item.url, '_blank');
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            backgroundColor: '#2D1D13',
                            color: '#FFFFFF',
                            fontSize: '0.86rem',
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 6px rgba(45, 29, 19, 0.25)',
                            transition: 'background-color 0.15s ease'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1D130C'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#2D1D13'}
                        >
                          <FileText size={15} />
                          <span>View Notes</span>
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
    </div>
  );
}
