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
  ExternalLink,
  RefreshCw,
  Paperclip
} from 'lucide-react';
import { pwApiService } from '../services/PwApiService';
import { getBatchDisplayName } from '../utils/batchConfig';
import { getUrlParams, updateUrlParams } from '../utils/navigationHelper';

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveToast, setLiveToast] = useState('');

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

  // 1. Fetch Batch Subjects & Deep-Link Hydration
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    pwApiService.getBatchSubjects(batchId)
      .then(subs => {
        if (isMounted) {
          setSubjects(subs);
          setLoading(false);

          // Deep-link hydration from URL query params
          const params = getUrlParams();
          if (params.subject && subs.length > 0) {
            const match = subs.find(s => 
              String(s.subject_id || s.id) === String(params.subject) || 
              String(s.slug) === String(params.subject) ||
              s.subject_name?.toLowerCase() === decodeURIComponent(params.subject).toLowerCase()
            );
            if (match) {
              setSelectedSubject(match);
              setLevel(params.chapter ? 'content' : 'chapters');
            }
          }
        }
      })
      .catch(err => {
        console.error('Failed to load PW batch subjects:', err);
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [batchId]);

  // 2. Fetch Chapters when entering a Subject & Hydrate Chapter from URL
  useEffect(() => {
    if (!selectedSubject) return;
    const subId = selectedSubject.subject_id || selectedSubject.id;
    if (chaptersMap[subId]) {
      const params = getUrlParams();
      if (params.chapter && !selectedChapter) {
        const chaps = chaptersMap[subId];
        const matchCh = chaps.find(c => 
          String(c.chapterId || c.id) === String(params.chapter) || 
          String(c.slug) === String(params.chapter) ||
          c.title?.toLowerCase() === decodeURIComponent(params.chapter).toLowerCase()
        );
        if (matchCh) {
          setSelectedChapter(matchCh);
          setLevel('content');
        }
      }
      return;
    }

    setLoading(true);
    pwApiService.getSubjectChapters(batchId, selectedSubject)
      .then(chaps => {
        setChaptersMap(prev => ({ ...prev, [subId]: chaps }));
        setLoading(false);

        const params = getUrlParams();
        if (params.chapter) {
          const matchCh = chaps.find(c => 
            String(c.chapterId || c.id) === String(params.chapter) || 
            String(c.slug) === String(params.chapter) ||
            c.title?.toLowerCase() === decodeURIComponent(params.chapter).toLowerCase()
          );
          if (matchCh) {
            setSelectedChapter(matchCh);
            setLevel('content');
          }
        }
      })
      .catch(err => {
        console.error('Failed to load PW chapters:', err);
        setLoading(false);
      });
  }, [selectedSubject, batchId, selectedChapter]);

  // Popstate listener to sync back navigation with URL
  useEffect(() => {
    const handlePop = () => {
      const params = getUrlParams();
      const subParam = params.subject;
      const chParam = params.chapter;

      if (!subParam) {
        setLevel('subjects');
        setSelectedSubject(null);
        setSelectedChapter(null);
      } else if (!chParam) {
        setLevel('chapters');
        setSelectedChapter(null);
        if (subjects.length > 0) {
          const match = subjects.find(s => 
            String(s.subject_id || s.id) === String(subParam) || 
            String(s.slug) === String(subParam)
          );
          if (match) setSelectedSubject(match);
        }
      } else {
        setLevel('content');
      }
    };

    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [subjects]);

  // 3. Fetch Content when entering a Chapter (SWR with Realtime Live Revalidation)
  useEffect(() => {
    if (!selectedChapter || !selectedSubject) return;
    const chId = selectedChapter.chapterId || selectedChapter.id;
    if (contentMap[chId] && !isRefreshing) return;

    if (!contentMap[chId]) setLoading(true);

    pwApiService.getChapterItems(batchId, selectedSubject, chId, selectedChapter.title, {
      forceLive: isRefreshing,
      onLiveUpdate: (freshItems, newAdditions) => {
        setContentMap(prev => ({ ...prev, [chId]: freshItems }));
        if (newAdditions && newAdditions.length > 0) {
          setLiveToast(`⚡ ${newAdditions.length} newly uploaded lecture${newAdditions.length > 1 ? 's' : ''} just arrived!`);
          setTimeout(() => setLiveToast(''), 4500);
        }
      }
    })
      .then(items => {
        setContentMap(prev => ({ ...prev, [chId]: items }));
        setLoading(false);
        setIsRefreshing(false);
      })
      .catch(err => {
        console.error('Failed to load PW chapter content:', err);
        setLoading(false);
        setIsRefreshing(false);
      });
  }, [selectedChapter, selectedSubject, batchId, isRefreshing]);

  // Handlers
  const handleOpenSubject = (subject) => {
    const subId = subject.subject_id || subject.id;
    updateUrlParams({ subject: subId, chapter: null, play: null, type: null });
    setSelectedSubject(subject);
    setSelectedChapter(null);
    setLevel('chapters');
    setActiveChapterTab('chapters');
    setSearchQuery('');
  };

  const handleOpenChapter = (chapter, defaultFilter = 'all') => {
    const subId = selectedSubject?.subject_id || selectedSubject?.id;
    const chId = chapter.chapterId || chapter.id;
    updateUrlParams({ subject: subId, chapter: chId, play: null, type: null });
    setSelectedChapter(chapter);
    setLevel('content');
    setActiveContentFilter(defaultFilter);
    setSearchQuery('');
  };

  const handleBack = () => {
    setSearchQuery('');
    if (level === 'content') {
      const params = getUrlParams();
      if (params.chapter && window.history.length > 1) {
        window.history.back();
      } else {
        updateUrlParams({ chapter: null, play: null, type: null });
        setLevel('chapters');
        setSelectedChapter(null);
      }
    } else if (level === 'chapters') {
      const params = getUrlParams();
      if (params.subject && window.history.length > 1) {
        window.history.back();
      } else {
        updateUrlParams({ subject: null, chapter: null, play: null, type: null });
        setLevel('subjects');
        setSelectedSubject(null);
      }
    } else if (level === 'subjects') {
      updateUrlParams({ subject: null, chapter: null, play: null, type: null });
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

  // Helper to extract clean lecture metadata (number, badge, short topic)
  const extractLectureMeta = (title = '') => {
    const colonMatch = title.match(/(\d{1,3})\s*:\s*([^|#]+)/);
    if (colonMatch) {
      const num = colonMatch[1];
      const topic = colonMatch[2].trim();
      return {
        num: num,
        badgeText: `LEC ${num}`,
        shortTag: `Lec ${num}: ${topic.length > 25 ? topic.substring(0, 22) + '...' : topic}`,
        topic
      };
    }

    const numMatch = title.match(/(?:Lec(?:ture)?|Session|Class|Part|#)?\s*0*(\d{1,3})\b/i);
    if (numMatch && numMatch[1]) {
      const num = numMatch[1].padStart(2, '0');
      return {
        num,
        badgeText: `LEC ${num}`,
        shortTag: `Lecture ${num}`,
        topic: ''
      };
    }

    return {
      num: '',
      badgeText: 'VIDEO',
      shortTag: 'Lecture',
      topic: ''
    };
  };

  // Structured Bundling: Lecture-First Architecture with Linked Notes & DPPs
  const {
    lectureBundles,
    allNotes,
    allDpps,
    standaloneResources,
    counts
  } = useMemo(() => {
    if (!selectedChapter) {
      return {
        lectureBundles: [],
        allNotes: [],
        allDpps: [],
        standaloneResources: [],
        counts: { totalLectures: 0, totalNotes: 0, totalDpps: 0 }
      };
    }

    const chId = selectedChapter.chapterId || selectedChapter.id;
    const rawItems = contentMap[chId] || [];

    const videos = rawItems.filter(i => i.type === 'video' || i.subCategory === 'LECTURE');
    const notes = rawItems.filter(i => i.subCategory === 'NOTES');
    const dpps = rawItems.filter(i => i.subCategory === 'DPP_PDF' || i.subCategory === 'DPP_VIDEO');

    // Robust matching between resources and lecture videos
    const isResourceLinkedToVideo = (res, vid) => {
      const rScheduleId = String(res.scheduleId || res.id || '').replace(/^(pdf_|dpp_)/, '');
      const vScheduleId = String(vid.scheduleId || vid.id || '').replace(/^(pdf_|dpp_)/, '');
      if (rScheduleId && vScheduleId && rScheduleId === vScheduleId) return true;

      if (res.url && vScheduleId && res.url.includes(vScheduleId)) return true;

      const vm = extractLectureMeta(vid.title);
      const rm = extractLectureMeta(res.title);
      if (vm.num && rm.num && vm.num === rm.num) return true;

      if (res.dateStr && vid.dateStr && res.dateStr === vid.dateStr) {
        if (vm.topic && res.title.toLowerCase().includes(vm.topic.toLowerCase())) return true;
        const sameDateVids = videos.filter(v => v.dateStr === res.dateStr);
        if (sameDateVids.length === 1) return true;
      }

      return false;
    };

    const matchedNoteIds = new Set();
    const matchedDppIds = new Set();

    // Map each video to its linked notes and DPPs
    const bundles = videos.map(vid => {
      const vidMeta = extractLectureMeta(vid.title);

      const linkedNotes = notes.filter(n => {
        if (isResourceLinkedToVideo(n, vid)) {
          matchedNoteIds.add(n.id);
          return true;
        }
        return false;
      }).map(n => ({
        ...n,
        linkedLecture: vid,
        enrichedTitle: n.title === 'Class Notes' || !n.title
          ? `Class Notes • ${vidMeta.shortTag}`
          : n.title
      }));

      const linkedDpps = dpps.filter(d => {
        if (isResourceLinkedToVideo(d, vid)) {
          matchedDppIds.add(d.id);
          return true;
        }
        return false;
      }).map(d => ({
        ...d,
        linkedLecture: vid,
        enrichedTitle: d.title === 'Daily Practice Problem (DPP)' || d.title === 'DPP' || !d.title
          ? `DPP Sheet • ${vidMeta.shortTag}`
          : d.title
      }));

      return {
        ...vid,
        lectureMeta: vidMeta,
        linkedNotes,
        linkedDpps
      };
    });

    // Enriched allNotes (for Notes tab)
    const enrichedAllNotes = notes.map(n => {
      const parentVid = videos.find(v => isResourceLinkedToVideo(n, v));
      const vidMeta = parentVid ? extractLectureMeta(parentVid.title) : null;
      return {
        ...n,
        linkedLecture: parentVid || null,
        enrichedTitle: vidMeta
          ? `Class Notes • ${vidMeta.badgeText}`
          : (n.title || 'Class Notes'),
        subtitleText: parentVid?.title || ''
      };
    });

    // Enriched allDpps (for DPPs tab)
    const enrichedAllDpps = dpps.map(d => {
      const parentVid = videos.find(v => isResourceLinkedToVideo(d, v));
      const vidMeta = parentVid ? extractLectureMeta(parentVid.title) : null;
      return {
        ...d,
        linkedLecture: parentVid || null,
        enrichedTitle: vidMeta
          ? `DPP Sheet • ${vidMeta.badgeText}`
          : (d.title || 'DPP Problem Sheet'),
        subtitleText: parentVid?.title || ''
      };
    });

    // Standalone resources not linked to any specific lecture
    const standalone = [
      ...notes.filter(n => !matchedNoteIds.has(n.id)).map(n => ({ ...n, enrichedTitle: n.title || 'Class Notes' })),
      ...dpps.filter(d => !matchedDppIds.has(d.id)).map(d => ({ ...d, enrichedTitle: d.title || 'Practice Sheet' }))
    ];

    return {
      lectureBundles: bundles,
      allNotes: enrichedAllNotes,
      allDpps: enrichedAllDpps,
      standaloneResources: standalone,
      counts: {
        totalLectures: videos.length,
        totalNotes: notes.length,
        totalDpps: dpps.length
      }
    };
  }, [selectedChapter, contentMap]);

  // Filtered lists based on search
  const filteredLectureBundles = useMemo(() => {
    if (!searchQuery.trim()) return lectureBundles;
    const q = searchQuery.toLowerCase().trim();
    return lectureBundles.filter(b => 
      b.title.toLowerCase().includes(q) || 
      b.linkedNotes.some(n => (n.title || '').toLowerCase().includes(q))
    );
  }, [lectureBundles, searchQuery]);

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return allNotes;
    const q = searchQuery.toLowerCase().trim();
    return allNotes.filter(n => 
      (n.enrichedTitle || '').toLowerCase().includes(q) || 
      (n.subtitleText || '').toLowerCase().includes(q)
    );
  }, [allNotes, searchQuery]);

  const filteredDpps = useMemo(() => {
    if (!searchQuery.trim()) return allDpps;
    const q = searchQuery.toLowerCase().trim();
    return allDpps.filter(d => 
      (d.enrichedTitle || '').toLowerCase().includes(q) || 
      (d.subtitleText || '').toLowerCase().includes(q)
    );
  }, [allDpps, searchQuery]);

  const filteredStandaloneResources = useMemo(() => {
    if (!searchQuery.trim()) return standaloneResources;
    const q = searchQuery.toLowerCase().trim();
    return standaloneResources.filter(r => 
      (r.enrichedTitle || '').toLowerCase().includes(q)
    );
  }, [standaloneResources, searchQuery]);

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
            updateUrlParams({ subject: null, chapter: null, play: null, type: null });
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
                updateUrlParams({ chapter: null, play: null, type: null });
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
            { id: 'all', label: `Lectures & Material (${counts.totalLectures})` },
            { id: 'notes', label: `Class Notes (${counts.totalNotes})` },
            { id: 'dpps', label: `DPP Sheets (${counts.totalDpps})` },
            { id: 'lectures', label: `Lectures Only (${counts.totalLectures})` },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveContentFilter(tab.id)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '8px 6px 10px 6px',
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

        {/* Live Sync Action Button in Content View */}
        {level === 'content' && (
          <button
            type="button"
            onClick={() => setIsRefreshing(true)}
            disabled={isRefreshing}
            title="Check for newly uploaded lectures right now"
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border-color)',
              color: isRefreshing ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: isRefreshing ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin text-amber-400" : ""} />
            <span>{isRefreshing ? 'Checking Live...' : 'Live Sync'}</span>
          </button>
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

      {/* ── LEVEL 3: CONTENT ITEMS CARDS (Organized Lecture-First with Linked Notes & DPPs) ── */}
      {!loading && level === 'content' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Main Grid: Either Lectures & Material OR Filtered Notes / DPPs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {/* 1. LECTURES & MATERIAL VIEW (Default & 'lectures') */}
            {(activeContentFilter === 'all' || activeContentFilter === 'lectures') && (
              filteredLectureBundles.length === 0 && counts.totalLectures > 0 ? (
                <div style={{
                  gridColumn: '1 / -1',
                  padding: '48px 20px',
                  textAlign: 'center',
                  backgroundColor: 'var(--panel-bg)',
                  borderRadius: '14px',
                  border: '1px dashed var(--border-color)'
                }}>
                  <Video size={36} style={{ color: 'var(--text-secondary)', opacity: 0.4, margin: '0 auto 10px' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>No Lectures Found</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {searchQuery ? `No lectures match "${searchQuery}".` : 'No lectures in this chapter.'}
                  </p>
                </div>
              ) : counts.totalLectures === 0 && filteredNotes.length > 0 ? (
                // PDF-Only Chapter Fallback (e.g. Study Material chapter)
                filteredNotes.map((item, idx) => {
                  const isWatched = watchedSet.has(String(item.id));
                  return (
                    <div
                      key={item.id || idx}
                      style={{
                        backgroundColor: 'var(--panel-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                        transition: 'border-color 0.18s ease'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '10px',
                          backgroundColor: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#38bdf8',
                          flexShrink: 0
                        }}>
                          <FileText size={22} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: 'inline-block',
                            fontSize: '0.66rem',
                            fontWeight: 900,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(56, 189, 248, 0.15)',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            color: '#38bdf8',
                            marginBottom: '4px'
                          }}>
                            NOTES
                          </span>
                          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                            {item.title}
                          </h4>
                          {item.dateStr && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#71717a' }}>
                              <Calendar size={11} />
                              <span>{item.dateStr}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenPdf(item)}
                        style={{
                          width: '100%',
                          marginTop: 'auto',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          color: '#38bdf8',
                          fontSize: '0.86rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <FileText size={15} />
                        <span>View Notes PDF</span>
                      </button>
                    </div>
                  );
                })
              ) : (
                filteredLectureBundles.map((bundle, idx) => {
                  const isWatched = watchedSet.has(String(bundle.id));
                  const hasLinkedNotes = bundle.linkedNotes?.length > 0;
                  const hasLinkedDpps = bundle.linkedDpps?.length > 0;

                  return (
                    <div
                      key={bundle.id || idx}
                      style={{
                        backgroundColor: 'var(--panel-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                        transition: 'border-color 0.18s ease',
                        position: 'relative'
                      }}
                    >
                      {/* Top Row: Thumbnail + Details */}
                      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                        {/* 16:9 Thumbnail */}
                        <div 
                          onClick={() => handleOpenItem(bundle)}
                          style={{
                            width: '120px',
                            aspectRatio: '16 / 9',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            backgroundColor: '#0a0a0a',
                            flexShrink: 0,
                            position: 'relative',
                            border: '1px solid rgba(255,255,255,0.08)',
                            cursor: 'pointer'
                          }}
                        >
                          {bundle.thumbnail ? (
                            <img
                              src={bundle.thumbnail}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              loading="lazy"
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Video size={26} style={{ color: 'var(--accent)' }} />
                            </div>
                          )}

                          {/* Duration Pill */}
                          {bundle.duration > 0 && (
                            <div style={{
                              position: 'absolute',
                              bottom: '4px',
                              right: '4px',
                              background: 'rgba(0,0,0,0.85)',
                              color: '#fff',
                              fontSize: '0.65rem',
                              fontWeight: 800,
                              padding: '1.5px 5px',
                              borderRadius: '4px'
                            }}>
                              {Math.floor(bundle.duration / 60)}m
                            </div>
                          )}

                          {/* Watched Indicator */}
                          {isWatched && (
                            <div style={{
                              position: 'absolute',
                              top: '4px',
                              left: '4px',
                              background: 'rgba(16, 185, 129, 0.92)',
                              color: '#fff',
                              fontSize: '0.6rem',
                              fontWeight: 900,
                              padding: '1.5px 4px',
                              borderRadius: '3px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px'
                            }}>
                              <Check size={9} strokeWidth={3} />
                            </div>
                          )}
                        </div>

                        {/* Middle Info */}
                        <div 
                          onClick={() => handleOpenItem(bundle)}
                          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                        >
                          {/* Badges */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{
                              fontSize: '0.66rem',
                              fontWeight: 900,
                              padding: '1.5px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid rgba(245, 158, 11, 0.35)',
                              color: 'var(--accent)',
                              letterSpacing: '0.4px'
                            }}>
                              {bundle.lectureMeta?.badgeText || 'LECTURE'}
                            </span>

                            {bundle.isNewlyUploaded && (
                              <span style={{
                                fontSize: '0.65rem',
                                fontWeight: 900,
                                padding: '1.5px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(245, 158, 11, 0.25)',
                                border: '1px solid rgba(245, 158, 11, 0.5)',
                                color: '#fbbf24'
                              }}>
                                🔥 NEW TODAY
                              </span>
                            )}
                          </div>

                          {/* Lecture Title */}
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
                            {bundle.title}
                          </h4>

                          {/* Date */}
                          {bundle.dateStr && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                              <Calendar size={12} />
                              <span>{bundle.dateStr}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 📎 ATTACHED STUDY MATERIAL RIBBON */}
                      {(hasLinkedNotes || hasLinkedDpps) && (
                        <div style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.07)',
                          borderRadius: '10px',
                          padding: '8px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '0.7rem',
                            color: 'var(--text-secondary)',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            <Paperclip size={11} style={{ color: 'var(--accent)' }} />
                            <span>Linked Study Material</span>
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {bundle.linkedNotes.map(note => (
                              <button
                                key={note.id}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleOpenPdf(note); }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  padding: '5px 9px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(56, 189, 248, 0.12)',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  color: '#38bdf8',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.22)';
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.12)';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                }}
                                title="Open Class Notes PDF"
                              >
                                <FileText size={12} />
                                <span>Class Notes PDF</span>
                              </button>
                            ))}

                            {bundle.linkedDpps.map(dpp => (
                              <button
                                key={dpp.id}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleOpenPdf(dpp); }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  padding: '5px 9px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(192, 132, 252, 0.12)',
                                  border: '1px solid rgba(192, 132, 252, 0.3)',
                                  color: '#c084fc',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => {
                                  e.currentTarget.style.backgroundColor = 'rgba(192, 132, 252, 0.22)';
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.backgroundColor = 'rgba(192, 132, 252, 0.12)';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                }}
                                title="Open DPP Sheet"
                              >
                                <FileText size={12} />
                                <span>DPP Sheet</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Bottom Action Row */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                        {/* Primary: Watch */}
                        <button
                          type="button"
                          onClick={() => handleOpenItem(bundle)}
                          style={{
                            flex: 1,
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
                          <span>Watch Lecture</span>
                        </button>

                        {/* Secondary: Quick View Notes Button */}
                        {hasLinkedNotes && (
                          <button
                            type="button"
                            onClick={() => handleOpenPdf(bundle.linkedNotes[0])}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '8px',
                              backgroundColor: 'rgba(56, 189, 248, 0.12)',
                              border: '1px solid rgba(56, 189, 248, 0.35)',
                              color: '#38bdf8',
                              fontSize: '0.84rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.2)';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.12)';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                            title="View Class Notes for this Lecture"
                          >
                            <FileText size={15} />
                            <span>Notes</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )
            )}

            {/* 2. CLASS NOTES TAB VIEW */}
            {activeContentFilter === 'notes' && (
              filteredNotes.length === 0 ? (
                <div style={{
                  gridColumn: '1 / -1',
                  padding: '48px 20px',
                  textAlign: 'center',
                  backgroundColor: 'var(--panel-bg)',
                  borderRadius: '14px',
                  border: '1px dashed var(--border-color)'
                }}>
                  <FileText size={36} style={{ color: 'var(--text-secondary)', opacity: 0.4, margin: '0 auto 10px' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>No Notes Found</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {searchQuery ? `No notes match "${searchQuery}".` : 'No notes in this chapter.'}
                  </p>
                </div>
              ) : (
                filteredNotes.map((item, idx) => {
                  return (
                    <div
                      key={item.id || idx}
                      style={{
                        backgroundColor: 'var(--panel-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                        transition: 'border-color 0.18s ease'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '10px',
                          backgroundColor: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#38bdf8',
                          flexShrink: 0
                        }}>
                          <FileText size={22} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{
                              fontSize: '0.66rem',
                              fontWeight: 900,
                              padding: '1.5px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(56, 189, 248, 0.15)',
                              border: '1px solid rgba(56, 189, 248, 0.35)',
                              color: '#38bdf8',
                              letterSpacing: '0.4px'
                            }}>
                              NOTES
                            </span>

                            {item.linkedLecture && (
                              <span style={{
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                padding: '1.5px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                color: 'var(--accent)',
                                letterSpacing: '0.4px'
                              }}>
                                📎 {extractLectureMeta(item.linkedLecture.title).badgeText}
                              </span>
                            )}
                          </div>

                          <h4 style={{
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            margin: '0 0 4px 0',
                            lineHeight: 1.35
                          }}>
                            {item.enrichedTitle}
                          </h4>

                          {item.subtitleText && (
                            <p style={{
                              fontSize: '0.76rem',
                              color: 'var(--text-secondary)',
                              margin: '0 0 6px 0',
                              lineHeight: 1.3,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}>
                              {item.subtitleText}
                            </p>
                          )}

                          {item.dateStr && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#71717a' }}>
                              <Calendar size={11} />
                              <span>{item.dateStr}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenPdf(item)}
                          style={{
                            flex: 1,
                            padding: '10px 12px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(56, 189, 248, 0.12)',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            color: '#38bdf8',
                            fontSize: '0.84rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <FileText size={14} />
                          <span>View Notes PDF</span>
                        </button>

                        {item.linkedLecture && (
                          <button
                            type="button"
                            onClick={() => handleOpenItem(item.linkedLecture)}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '8px',
                              backgroundColor: 'rgba(245, 158, 11, 0.12)',
                              border: '1px solid rgba(245, 158, 11, 0.35)',
                              color: 'var(--accent)',
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                            title="Jump to corresponding video lecture"
                          >
                            <Play size={13} fill="currentColor" />
                            <span>Lecture</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )
            )}

            {/* 3. DPP SHEETS TAB VIEW */}
            {activeContentFilter === 'dpps' && (
              filteredDpps.length === 0 ? (
                <div style={{
                  gridColumn: '1 / -1',
                  padding: '48px 20px',
                  textAlign: 'center',
                  backgroundColor: 'var(--panel-bg)',
                  borderRadius: '14px',
                  border: '1px dashed var(--border-color)'
                }}>
                  <FileText size={36} style={{ color: 'var(--text-secondary)', opacity: 0.4, margin: '0 auto 10px' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>No DPPs Found</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {searchQuery ? `No DPPs match "${searchQuery}".` : 'No DPPs in this chapter.'}
                  </p>
                </div>
              ) : (
                filteredDpps.map((item, idx) => {
                  return (
                    <div
                      key={item.id || idx}
                      style={{
                        backgroundColor: 'var(--panel-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                        transition: 'border-color 0.18s ease'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '10px',
                          backgroundColor: 'rgba(192, 132, 252, 0.12)',
                          border: '1px solid rgba(192, 132, 252, 0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#c084fc',
                          flexShrink: 0
                        }}>
                          <FileText size={22} />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{
                              fontSize: '0.66rem',
                              fontWeight: 900,
                              padding: '1.5px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(192, 132, 252, 0.15)',
                              border: '1px solid rgba(192, 132, 252, 0.35)',
                              color: '#c084fc',
                              letterSpacing: '0.4px'
                            }}>
                              DPP
                            </span>

                            {item.linkedLecture && (
                              <span style={{
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                padding: '1.5px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                color: 'var(--accent)',
                                letterSpacing: '0.4px'
                              }}>
                                📎 {extractLectureMeta(item.linkedLecture.title).badgeText}
                              </span>
                            )}
                          </div>

                          <h4 style={{
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            margin: '0 0 4px 0',
                            lineHeight: 1.35
                          }}>
                            {item.enrichedTitle}
                          </h4>

                          {item.subtitleText && (
                            <p style={{
                              fontSize: '0.76rem',
                              color: 'var(--text-secondary)',
                              margin: '0 0 6px 0',
                              lineHeight: 1.3,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}>
                              {item.subtitleText}
                            </p>
                          )}

                          {item.dateStr && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#71717a' }}>
                              <Calendar size={11} />
                              <span>{item.dateStr}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenPdf(item)}
                          style={{
                            flex: 1,
                            padding: '10px 12px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(192, 132, 252, 0.12)',
                            border: '1px solid rgba(192, 132, 252, 0.35)',
                            color: '#c084fc',
                            fontSize: '0.84rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <FileText size={14} />
                          <span>View DPP PDF</span>
                        </button>

                        {item.linkedLecture && (
                          <button
                            type="button"
                            onClick={() => handleOpenItem(item.linkedLecture)}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '8px',
                              backgroundColor: 'rgba(245, 158, 11, 0.12)',
                              border: '1px solid rgba(245, 158, 11, 0.35)',
                              color: 'var(--accent)',
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                            title="Jump to corresponding video lecture"
                          >
                            <Play size={13} fill="currentColor" />
                            <span>Lecture</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>

          {/* 4. STANDALONE RESOURCES SECTION (When in 'all' view) */}
          {activeContentFilter === 'all' && filteredStandaloneResources.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '14px',
                paddingBottom: '8px',
                borderBottom: '1px solid var(--border-color)'
              }}>
                <BookOpen size={18} style={{ color: 'var(--accent)' }} />
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Additional Chapter Resources ({filteredStandaloneResources.length})
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {filteredStandaloneResources.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    style={{
                      backgroundColor: 'var(--panel-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '16px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#38bdf8',
                        flexShrink: 0
                      }}>
                        <FileText size={22} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.66rem',
                          fontWeight: 900,
                          padding: '1.5px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(56, 189, 248, 0.15)',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          color: '#38bdf8',
                          marginBottom: '4px'
                        }}>
                          RESOURCE
                        </span>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                          {item.enrichedTitle || item.title}
                        </h4>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenPdf(item)}
                      style={{
                        width: '100%',
                        marginTop: 'auto',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.35)',
                        color: '#38bdf8',
                        fontSize: '0.86rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <FileText size={15} />
                      <span>View Resource</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── REALTIME LIVE TOAST NOTIFICATION ── */}
      {liveToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          backgroundColor: '#0f172a',
          border: '1px solid #f59e0b',
          boxShadow: '0 10px 25px -5px rgba(245, 158, 11, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          borderRadius: '12px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#fbbf24',
          fontSize: '0.88rem',
          fontWeight: 700,
          pointerEvents: 'none'
        }}>
          <span>{liveToast}</span>
        </div>
      )}
    </div>
  );
}
