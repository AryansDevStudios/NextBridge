import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ChevronRight, 
  Folder, 
  Video, 
  FileText, 
  ArrowLeft, 
  Download, 
  CheckCircle, 
  Smartphone, 
  Search, 
  BookOpen, 
  Calendar, 
  Clock, 
  Trash2, 
  HardDriveDownload, 
  WifiOff,
  User,
  ExternalLink,
  Play,
  Pause,
  X,
  AlertTriangle,
  HardDrive,
  Loader2,
  Send
} from 'lucide-react';
import VideoPlayer from './VideoPlayer';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { downloadManager, formatBytes, formatSpeed, formatTimeRemaining } from '../services/DownloadManager';

const FIREBASE_DB_URL = "https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app";

function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}s`;
  return `${m}m ${s}s`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const LearningHub = ({ user, onLogout }) => {
  const [courseData, setCourseData] = useState(null);
  const [currentPath, setCurrentPath] = useState([]); // Array of folder objects
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [playingVideo, setPlayingVideo] = useState(null);
  const [activeTab, setActiveTab] = useState('courses'); // 'courses' | 'downloads'
  const [downloadedLectures, setDownloadedLectures] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineToast, setOfflineToast] = useState('');
  const [mgrState, setMgrState] = useState(downloadManager.getState());
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [deleteModalItem, setDeleteModalItem] = useState(null);

  // Subscribe to central download manager
  useEffect(() => {
    return downloadManager.subscribe((st) => {
      setMgrState(st);
      loadDownloadedLectures();
    });
  }, []);

  const totalStorageBytes = useMemo(() => {
    return downloadedLectures.reduce((acc, l) => acc + (l.sizeBytes || 0), 0);
  }, [downloadedLectures]);

  const confirmDelete = async () => {
    if (!deleteModalItem) return;
    await downloadManager.deleteDownload(deleteModalItem.id);
    const updated = downloadedLectures.filter(d => String(d.id) !== String(deleteModalItem.id));
    setDownloadedLectures(updated);
    localStorage.setItem('downloaded_lectures', JSON.stringify(updated));
    setDeleteModalItem(null);
  };

  // Refs for tracking navigation state without closure lag
  const playingVideoRef = useRef(playingVideo);
  const activeTabRef = useRef(activeTab);
  const searchQueryRef = useRef(searchQuery);
  const currentPathRef = useRef(currentPath);

  useEffect(() => { playingVideoRef.current = playingVideo; }, [playingVideo]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { searchQueryRef.current = searchQuery; }, [searchQuery]);
  useEffect(() => { currentPathRef.current = currentPath; }, [currentPath]);

  // Load downloaded lectures from device registry
  const loadDownloadedLectures = async () => {
    await downloadManager.syncCompletedFromRegistry();
    try {
      const raw = localStorage.getItem('downloaded_lectures');
      if (raw) {
        setDownloadedLectures(JSON.parse(raw));
      } else {
        setDownloadedLectures([]);
      }
    } catch (e) {
      console.warn('Failed to parse downloaded_lectures:', e);
      setDownloadedLectures([]);
    }
  };

  useEffect(() => {
    loadDownloadedLectures();
  }, [activeTab]);

  // Online / Offline monitor
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Native Android back navigation gesture & button support
  useEffect(() => {
    let backListener = null;

    const setupBackButton = async () => {
      try {
        backListener = await App.addListener('backButton', () => {
          // 1. If video or PDF player is open
          if (playingVideoRef.current) {
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => {});
              return;
            }
            setPlayingVideo(null);
            return;
          }

          // 2. If in Downloads tab, return to courses
          if (activeTabRef.current === 'downloads') {
            setActiveTab('courses');
            return;
          }

          // 3. If searching, clear search query
          if (searchQueryRef.current) {
            setSearchQuery('');
            return;
          }

          // 4. If inside a folder hierarchy, go up one folder
          if (currentPathRef.current && currentPathRef.current.length > 0) {
            setCurrentPath(prev => prev.slice(0, -1));
            return;
          }

          // 5. At root, exit app
          App.exitApp();
        });
      } catch (e) {
        console.warn('Capacitor App backButton listener registration error:', e);
      }
    };

    setupBackButton();

    return () => {
      if (backListener) {
        backListener.remove();
      }
    };
  }, []);

  // Web fallback for browser popstate
  useEffect(() => {
    const handlePop = () => {
      if (playingVideoRef.current) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
          return;
        }
        setPlayingVideo(null);
        return;
      }
      if (activeTabRef.current === 'downloads') {
        setActiveTab('courses');
        return;
      }
      if (searchQueryRef.current) {
        setSearchQuery('');
        return;
      }
      if (currentPathRef.current && currentPathRef.current.length > 0) {
        setCurrentPath(prev => prev.slice(0, -1));
      }
    };

    if (!Capacitor.isNativePlatform()) {
      window.addEventListener('popstate', handlePop);
      return () => window.removeEventListener('popstate', handlePop);
    }
  }, []);

  useEffect(() => {
    fetchCourseData();
  }, [user.class]);

  const fetchCourseData = async () => {
    setLoading(true);
    const classId = (user.class === "9" || user.class === "9th") ? "9" : "10";
    const cacheKey = `course_data_${classId}`;
    
    // 1. Instant Load from Cache
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        setCourseData(JSON.parse(cached));
        setLoading(false); // UI renders instantly
      } catch (e) {
        console.error("Cache parse error", e);
      }
    }

    // 2. Background Fetch (Update Cache silently)
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/classes/class_${classId}.json`);
      const data = await res.json();
      if (data) {
        localStorage.setItem(cacheKey, JSON.stringify(data));
        setCourseData(data);
      }
    } catch (err) {
      console.error("Failed to fetch latest course data:", err);
    }
    setLoading(false);
  };

  const handleFolderClick = (subjectId, itemOrFolder) => {
    if (!Capacitor.isNativePlatform()) {
      window.history.pushState({ folder: true }, '');
    }
    setCurrentPath([...currentPath, { subjectId, ...itemOrFolder }]);
    setSearchQuery('');
  };

  const handlePlayVideo = (item) => {
    if (!isOnline) {
      // Check if downloaded
      const isDownloaded = downloadedLectures.some(d => String(d.id) === String(item.id));
      if (!isDownloaded) {
        setOfflineToast('This lecture is not downloaded. Connect to internet or view Downloaded tab.');
        setTimeout(() => setOfflineToast(''), 4000);
        return;
      }
    }

    if (!Capacitor.isNativePlatform()) {
      window.history.pushState({ player: true }, '');
    }
    setPlayingVideo(item);
  };

  const handlePlayDownloaded = (item) => {
    if (!Capacitor.isNativePlatform()) {
      window.history.pushState({ player: true }, '');
    }
    setPlayingVideo({
      id: item.id,
      title: item.title,
      type: 'video',
      url: `downloads/${item.id}/index.m3u8`,
      duration: item.duration,
      thumbnail: item.thumbnail
    });
  };

  const handleDeleteDownload = async (item, e) => {
    if (e) e.stopPropagation();
    try {
      await Filesystem.rmdir({
        path: `downloads/${item.id}`,
        directory: Directory.Data,
        recursive: true
      });
    } catch (err) {
      console.warn('Failed to delete download folder:', err);
    }
    const updated = downloadedLectures.filter(d => String(d.id) !== String(item.id));
    setDownloadedLectures(updated);
    localStorage.setItem('downloaded_lectures', JSON.stringify(updated));
  };

  const closeVideo = () => {
    setPlayingVideo(null);
  };

  // Flatten all items across all subjects into one big array for search
  const allItems = useMemo(() => {
    let items = [];
    if (!courseData || !courseData.subjects) return items;
    
    const subjectsList = Array.isArray(courseData.subjects) 
      ? courseData.subjects.filter(Boolean) 
      : Object.values(courseData.subjects).filter(Boolean);
    
    subjectsList.forEach(subject => {
      const itemsList = Array.isArray(subject.items) 
        ? subject.items.filter(Boolean) 
        : (subject.items ? Object.values(subject.items).filter(Boolean) : []);
        
      itemsList.forEach(item => {
        const unifiedPath = item.folder_path 
          ? `${subject.subject_name}/${item.folder_path}` 
          : subject.subject_name;
        
        items.push({ ...item, unified_path: unifiedPath });
      });
    });
    return items;
  }, [courseData]);

  if (loading && !courseData) {
    return (
      <div className="flex-1 flex justify-center items-center h-full min-h-screen bg-[#0a0a0a]">
        <p className="text-[#9ca3af]">Loading learning materials...</p>
      </div>
    );
  }

  if (!courseData || !courseData.subjects) {
    return (
      <div className="flex-1 p-6 text-center text-[#9ca3af] min-h-screen bg-[#0a0a0a] pt-20">
        <Smartphone size={48} className="mx-auto mb-4 opacity-50" />
        <p>No course data found for Class {user.class}.</p>
      </div>
    );
  }

  // --- Breadcrumb & Hierarchy Logic ---
  let currentItems = [];

  if (searchQuery.trim().length > 0) {
    const q = searchQuery.toLowerCase();
    currentItems = allItems.filter(item => 
      (item.title && item.title.toLowerCase().includes(q)) || 
      (item.unified_path && item.unified_path.toLowerCase().includes(q))
    ).sort((a, b) => {
      const timeA = typeof a.created_at === 'number' ? a.created_at : 0;
      const timeB = typeof b.created_at === 'number' ? b.created_at : 0;
      if (timeB !== timeA) return timeB - timeA;
      return a.title.localeCompare(b.title);
    });
  } else if (currentPath.length === 0) {
    // Root level: show subjects
    currentItems = Object.values(courseData.subjects)
      .filter(sub => !sub.isHidden)
      .map(sub => ({
        ...sub,
        isRootSubject: true,
        displayTitle: sub.subject_name
      }));
  } else {
    // Inside a folder/subject
    const currentFolder = currentPath[currentPath.length - 1];
    const subject = courseData.subjects[currentFolder.subjectId];
    
    if (subject && subject.items) {
      let targetPath = "";
      if (!currentFolder.isRootSubject) {
         targetPath = currentFolder.folder_path ? `${currentFolder.folder_path}/${currentFolder.title}` : currentFolder.title;
      }
      
      const subjectItems = Object.values(subject.items);
      const directChildren = [];
      const folders = new Set();

      subjectItems.forEach(item => {
        if (item.isHidden) return; // Hide locked content

        if (item.folder_path === targetPath) {
          directChildren.push(item);
        } else if (item.folder_path && item.folder_path.startsWith(targetPath)) {
          const remainingPath = targetPath === "" ? item.folder_path : item.folder_path.substring(targetPath.length + 1);
          const nextFolder = remainingPath.split('/')[0];
          if (nextFolder) folders.add(nextFolder);
        }
      });

      currentItems = [
        ...Array.from(folders).map(f => ({ title: f, isFolder: true, subjectId: currentFolder.subjectId, folder_path: targetPath })),
        ...directChildren.sort((a, b) => {
           const timeA = typeof a.created_at === 'number' ? a.created_at : 0;
           const timeB = typeof b.created_at === 'number' ? b.created_at : 0;
           if (timeB !== timeA) return timeB - timeA;
           return a.title.localeCompare(b.title);
        })
      ];
    }
  }

  if (playingVideo) {
    return <VideoPlayer item={playingVideo} onClose={closeVideo} user={user} />;
  }

  return (
    <div className="app-container">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="offline-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <WifiOff size={16} />
            <span>You are offline. Open downloaded lectures to continue studying.</span>
          </div>
          {activeTab !== 'downloads' && (
            <button 
              className="offline-banner-btn"
              onClick={() => setActiveTab('downloads')}
            >
              View Downloads
            </button>
          )}
        </div>
      )}

      {/* Offline Toast Notification */}
      {offlineToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#ef4444',
          color: '#fff',
          padding: '10px 18px',
          borderRadius: '8px',
          zIndex: 9999,
          fontSize: '0.85rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          maxWidth: '90%'
        }}>
          <WifiOff size={16} />
          <span>{offlineToast}</span>
        </div>
      )}

      {/* Compact Top Navbar */}
      <nav className="navbar" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
        <div className="nav-left">
          <div 
            className="logo" 
            onClick={() => { setCurrentPath([]); setSearchQuery(''); setActiveTab('courses'); }} 
            style={{ cursor: 'pointer' }}
          >
            <BookOpen size={20} />
            <span>NextBridge</span>
          </div>

          {/* Compact Navigation Tabs */}
          <div className="nav-tabs">
            <button 
              className={`nav-tab-btn ${activeTab === 'courses' ? 'active' : ''}`}
              onClick={() => { setActiveTab('courses'); setSearchQuery(''); }}
            >
              Courses
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'downloads' ? 'active' : ''}`}
              onClick={() => { setActiveTab('downloads'); setSearchQuery(''); }}
            >
              <HardDriveDownload size={14} />
              Downloaded
              {downloadedLectures.length > 0 && (
                <span className="badge-count">{downloadedLectures.length}</span>
              )}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {activeTab === 'courses' && (
            <div className="search-container">
              <Search size={16} className="search-icon" />
              <input 
                type="text" 
                className="search-input" 
                placeholder="Search..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}
          <button 
            className="student-avatar-btn" 
            onClick={() => setShowProfileModal(true)}
            title="Student Profile & Support"
            aria-label="Student Profile"
          >
            <span className="student-avatar-text">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'ST'}
            </span>
          </button>
        </div>
      </nav>

      {/* DOWNLOADED TAB VIEW */}
      {activeTab === 'downloads' && (
        <div className="main-content pb-24">
          <div className="breadcrumbs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                onClick={() => setActiveTab('courses')}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: 'var(--accent)', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '4px', 
                  borderRadius: '4px' 
                }}
                title="Back to Courses"
              >
                <ArrowLeft size={18} />
              </button>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Downloaded Lectures</span>
              <span className="badge-count">{downloadedLectures.length}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--accent)', background: 'rgba(245, 158, 11, 0.1)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <HardDrive size={14} />
              <span>{formatBytes(totalStorageBytes)} Device Storage</span>
            </div>
          </div>

          {/* Active & Queued Downloads Panel */}
          {(mgrState.active.length > 0 || mgrState.queued.length > 0) && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                <Loader2 size={16} className="spin-icon" style={{ color: 'var(--accent)' }} />
                <span>Downloading Now ({mgrState.active.length + mgrState.queued.length})</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {mgrState.active.map((task) => {
                  const isPaused = task.status === 'paused';
                  return (
                    <div key={task.id} className="active-download-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {task.title}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', marginTop: '2px' }}>
                            <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                              {task.quality}
                            </span>
                            <span style={{ color: isPaused ? '#f59e0b' : '#38bdf8', fontWeight: 600 }}>
                              {isPaused ? 'Paused' : 'Downloading'}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          <button
                            onClick={() => isPaused ? downloadManager.resumeDownload(task.id) : downloadManager.pauseDownload(task.id)}
                            className="active-task-action-btn"
                            title={isPaused ? "Resume Download" : "Pause Download"}
                          >
                            {isPaused ? <Play size={13} /> : <Pause size={13} />}
                            <span>{isPaused ? 'Resume' : 'Pause'}</span>
                          </button>
                          <button
                            onClick={() => downloadManager.cancelDownload(task.id)}
                            className="active-task-cancel-btn"
                            title="Cancel Download"
                          >
                            <X size={13} />
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="download-progress-bar-track">
                        <div 
                          className="download-progress-bar-fill" 
                          style={{ 
                            width: `${task.percent}%`,
                            background: isPaused ? '#f59e0b' : 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                          }} 
                        />
                      </div>

                      {/* Stats footer */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                        <span>
                          {task.formattedDownloaded} / {task.formattedTotal} ({task.percent}%)
                        </span>
                        <span>
                          {!isPaused && task.speed && `${task.speed} • ETA ${task.eta || 'calculating...'}`}
                          {isPaused && 'Paused'}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {mgrState.queued.map((q) => (
                  <div key={q.item.id} className="active-download-card" style={{ opacity: 0.8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {q.item.title}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                          Queued • Waiting for download slot
                        </span>
                      </div>
                      <button
                        onClick={() => downloadManager.cancelDownload(q.item.id)}
                        className="active-task-cancel-btn"
                      >
                        <X size={13} /> Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="list-container">
            {downloadedLectures.length === 0 && mgrState.active.length === 0 && mgrState.queued.length === 0 ? (
              <div style={{ padding: '64px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px dashed var(--border-color)', margin: '16px 0' }}>
                <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '18px', borderRadius: '50%', marginBottom: '16px', color: 'var(--accent)' }}>
                  <HardDriveDownload size={36} />
                </div>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: '600' }}>No Downloaded Lectures</h3>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: '1.5', fontSize: '0.875rem', marginBottom: '20px' }}>
                  Lectures you download will be stored securely on your device for offline studying without internet.
                </p>
                <button 
                  className="nav-tab-btn active"
                  onClick={() => setActiveTab('courses')}
                  style={{ padding: '8px 18px', fontSize: '0.875rem' }}
                >
                  Browse Courses
                </button>
              </div>
            ) : (
              downloadedLectures.map((item) => (
                <div 
                  key={item.id} 
                  className="download-card"
                  onClick={() => handlePlayDownloaded(item)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                    <div className="item-thumbnail-container" style={{ width: '100px', height: '60px', margin: 0 }}>
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" className="item-thumbnail" />
                      ) : (
                        <Video size={24} style={{ color: 'var(--accent)' }} />
                      )}
                    </div>
                    <div className="item-details" style={{ minWidth: 0 }}>
                      <div className="item-title" style={{ fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.title}
                      </div>
                      <div className="item-meta" style={{ gap: '10px', fontSize: '0.8rem', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{item.subjectName}</span>
                        {item.quality && (
                          <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600 }}>
                            {item.quality}
                          </span>
                        )}
                        {item.sizeBytes > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#38bdf8', fontWeight: 500 }}>
                            <HardDrive size={12} />
                            {formatBytes(item.sizeBytes)}
                          </span>
                        )}
                        {item.duration > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={12} />
                            {formatDuration(item.duration)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteModalItem(item);
                      }}
                      style={{ 
                        background: 'rgba(239, 68, 68, 0.1)', 
                        border: '1px solid rgba(239, 68, 68, 0.3)', 
                        color: '#ef4444', 
                        padding: '6px 10px', 
                        borderRadius: '6px', 
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}
                      title="Delete Download"
                    >
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* COURSES TAB VIEW */}
      {activeTab === 'courses' && (
        <div className="main-content pb-24">
          {/* Breadcrumbs with Back Arrow */}
          {!searchQuery && (
            <div className="breadcrumbs">
              {currentPath.length > 0 && (
                <button 
                  onClick={() => setCurrentPath(prev => prev.slice(0, -1))}
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
              )}
              <span className="breadcrumb-item" onClick={() => setCurrentPath([])}>
                Home
              </span>
              {currentPath.map((part, idx) => (
                <React.Fragment key={idx}>
                  <ChevronRight size={16} className="breadcrumb-separator" />
                  <span 
                    className="breadcrumb-item" 
                    onClick={() => setCurrentPath(currentPath.slice(0, idx + 1))}
                  >
                    {part.displayTitle || part.title}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}
          
          {searchQuery && (
            <div className="breadcrumbs" style={{ color: 'var(--accent)' }}>
              Search Results for "{searchQuery}"
            </div>
          )}

          {/* List Container */}
          <div className="list-container">
            {currentItems.length === 0 && (
              <div style={{ padding: '64px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px dashed var(--border-color)', margin: '16px 0' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '50%', marginBottom: '16px' }}>
                  <Search size={32} style={{ color: 'var(--text-secondary)' }} />
                </div>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: '600' }}>No Content Found</h3>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: '1.5' }}>
                  We couldn't find any items matching your request.
                </p>
              </div>
            )}
            
            {currentItems.map((item, idx) => {
              if (item.isRootSubject || item.isFolder) {
                return (
                  <div 
                    key={idx} 
                    className="list-item"
                    onClick={() => handleFolderClick(item.subject_id || item.subjectId, item)}
                  >
                    <div className="item-icon-container folder">
                      <Folder size={24} />
                    </div>
                    <div className="item-details">
                      <div className="item-title">{item.isRootSubject ? item.subject_name : item.title}</div>
                      <div className="item-meta">
                         {item.isRootSubject && item.items ? Object.keys(item.items).length : ''} {item.isRootSubject ? 'items' : 'Folder'}
                      </div>
                    </div>
                  </div>
                );
              }

              // File / Video Item
              return (
                <div 
                  key={item.id || idx} 
                  className="list-item"
                  onClick={() => handlePlayVideo(item)}
                >
                  <div className={item.type === 'video' && item.thumbnail ? "item-thumbnail-container" : `item-icon-container ${item.type}`}>
                    {item.type === 'video' && item.thumbnail ? (
                      <img src={item.thumbnail} alt="Thumbnail" className="item-thumbnail" />
                    ) : item.type === 'video' ? (
                      <Video size={24} />
                    ) : (
                      <FileText size={24} />
                    )}
                  </div>
                  
                  <div className="item-details">
                    <div className="item-title">{item.title}</div>
                    <div className="item-meta">
                      {item.type === 'video' && item.duration > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={14} />
                          {formatDuration(item.duration)}
                        </span>
                      )}
                      {item.created_at && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={14} />
                          {formatDate(item.created_at)}
                        </span>
                      )}
                      <span style={{ textTransform: 'uppercase', fontSize: '0.75rem', opacity: 0.8, background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                        {item.type}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Student Profile & Support Modal */}
      {showProfileModal && (
        <div className="modal-backdrop" onClick={() => setShowProfileModal(false)}>
          <div className="profile-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Student Profile
              </span>
              <button 
                onClick={() => setShowProfileModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '24px' }}>
              <div className="profile-avatar-large">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'ST'}
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '12px', marginBottom: '4px' }}>
                {user?.name || 'Enrolled Student'}
              </h3>
              <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent)', padding: '2px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 }}>
                Class {user?.class || 'N/A'}
              </span>
            </div>

            <div className="profile-details-list">
              <div className="profile-detail-row">
                <span className="profile-detail-label">Access Token (PAT)</span>
                <span className="profile-detail-value monospace">{user?.pat || user?.id || 'Active'}</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-detail-label">Device Status</span>
                <span className="profile-detail-value" style={{ color: '#4ade80' }}>● Bound & Verified</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-detail-label">Offline Storage</span>
                <span className="profile-detail-value">{downloadedLectures.length} files ({formatBytes(totalStorageBytes)})</span>
              </div>
              <div className="profile-detail-row">
                <span className="profile-detail-label">App Version</span>
                <span className="profile-detail-value">v2.0.0</span>
              </div>
            </div>

            <div style={{ marginTop: '24px' }}>
              <button
                className="telegram-support-btn"
                onClick={() => window.open('https://t.me/nextbridge19', '_blank')}
              >
                <Send size={16} />
                <span>Contact Admin on Telegram</span>
                <ExternalLink size={14} style={{ opacity: 0.7, marginLeft: 'auto' }} />
              </button>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', marginTop: '8px' }}>
                Support, token queries & device transfer: @nextbridge19
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalItem && (
        <div className="modal-backdrop" onClick={() => setDeleteModalItem(null)}>
          <div className="delete-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '10px', borderRadius: '50%' }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Delete Download?
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Frees storage space on this device</span>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '20px' }}>
              Are you sure you want to remove <strong style={{ color: 'var(--text-primary)' }}>"{deleteModalItem.title}"</strong>
              {deleteModalItem.quality ? ` (${deleteModalItem.quality})` : ''} from your device storage?
              {deleteModalItem.sizeBytes > 0 && ` This will free up ${formatBytes(deleteModalItem.sizeBytes)} of space.`}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setDeleteModalItem(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  background: '#ef4444',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Trash2 size={15} />
                <span>Delete Video</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LearningHub;
