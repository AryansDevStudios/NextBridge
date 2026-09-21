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
  Send,
  PieChart
} from 'lucide-react';
import VideoPlayer from './VideoPlayer';
import NcertTextbookHub from './NcertTextbookHub';
import CbsePyqHub from './CbsePyqHub';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';
import { downloadManager, formatBytes, formatSpeed, formatTimeRemaining, parseDownloadSubjectAndFolder } from '../services/DownloadManager';

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

const LearningHub = ({ user, onLogout, onOpenAdmin }) => {
  const [courseData, setCourseData] = useState(null);
  const [currentPath, setCurrentPath] = useState([]); // Array of folder objects
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [playingVideo, setPlayingVideo] = useState(null);
  const [activeTab, setActiveTab] = useState('courses'); // 'courses' | 'textbook' | 'pyq' | 'downloads'
  const [downloadedLectures, setDownloadedLectures] = useState([]);
  const [downloadPath, setDownloadPath] = useState([]); // Hierarchical path for Downloaded tab
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineToast, setOfflineToast] = useState('');
  const [mgrState, setMgrState] = useState(downloadManager.getState());
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [deleteModalItem, setDeleteModalItem] = useState(null);

  // Admin panel 5s long-press on avatar
  const adminHoldTimer = useRef(null);
  const [adminHoldActive, setAdminHoldActive] = useState(false);

  // Class 10 only for textbook content
  const isClass10 = String(user?.class || user?.className || '').trim() === '10';

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

  const storageDetails = useMemo(() => {
    return downloadManager.getStorageDetails();
  }, [downloadedLectures]);

  const subInfo = useMemo(() => {
    if (!user) return { status: 'none', text: 'Enrolled' };
    if (!user.subscriptionExpiresAt) {
      return { status: 'unlimited', text: 'Unlimited Full Access', badge: 'Active' };
    }
    const expiry = new Date(user.subscriptionExpiresAt).getTime();
    const diff = expiry - Date.now();
    if (diff <= 0) {
      return { 
        status: 'expired', 
        text: 'Access Expired', 
        badge: 'Expired', 
        isExpired: true,
        formattedDate: new Date(user.subscriptionExpiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      };
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    let text = `${days}d ${hours}h remaining`;
    if (days === 0 && hours > 0) text = `${hours}h ${mins}m remaining`;
    if (days === 0 && hours === 0) text = `${mins}m remaining`;

    const badge = days > 0 ? `${days}d left` : `${hours}h left`;

    return {
      status: 'active',
      text,
      badge,
      days,
      hours,
      mins,
      isExpired: false,
      formattedDate: new Date(user.subscriptionExpiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    };
  }, [user?.subscriptionExpiresAt]);

  const normalizedDownloads = useMemo(() => {
    return downloadedLectures.map(item => {
      const { subject, folder } = parseDownloadSubjectAndFolder(item);
      return {
        ...item,
        subjectName: subject,
        folderPath: folder
      };
    });
  }, [downloadedLectures]);

  const downloadSubjectGroups = useMemo(() => {
    const map = {};
    normalizedDownloads.forEach(item => {
      const sub = item.subjectName || 'General Studies';
      if (!map[sub]) {
        map[sub] = { name: sub, items: [], totalBytes: 0 };
      }
      map[sub].items.push(item);
      map[sub].totalBytes += (item.sizeBytes || 0);
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [normalizedDownloads]);

  const searchedDownloads = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return normalizedDownloads.filter(item => 
      (item.title || '').toLowerCase().includes(q) || 
      (item.subjectName || '').toLowerCase().includes(q) ||
      (item.folderPath || '').toLowerCase().includes(q)
    );
  }, [normalizedDownloads, searchQuery]);

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
  const downloadPathRef = useRef(downloadPath);

  useEffect(() => { playingVideoRef.current = playingVideo; }, [playingVideo]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { searchQueryRef.current = searchQuery; }, [searchQuery]);
  useEffect(() => { currentPathRef.current = currentPath; }, [currentPath]);
  useEffect(() => { downloadPathRef.current = downloadPath; }, [downloadPath]);

  // Load downloaded lectures from device registry
  const loadDownloadedLectures = async () => {
    await downloadManager.syncCompletedFromRegistry();
    try {
      const raw = localStorage.getItem('downloaded_lectures');
      if (raw) {
        const parsed = JSON.parse(raw);
        let changed = false;
        const normalized = parsed.map(item => {
          const { subject, folder } = parseDownloadSubjectAndFolder(item);
          if (item.subjectName !== subject || item.folderPath !== folder) {
            changed = true;
            return {
              ...item,
              subjectName: subject,
              folderPath: folder
            };
          }
          return item;
        });
        if (changed) {
          localStorage.setItem('downloaded_lectures', JSON.stringify(normalized));
        }
        setDownloadedLectures(normalized);
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
            closeVideo();
            return;
          }

          // 2. If in Downloads tab
          if (activeTabRef.current === 'downloads') {
            if (downloadPathRef.current && downloadPathRef.current.length > 0) {
              setDownloadPath(prev => prev.slice(0, -1));
              return;
            }
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
        if (downloadPathRef.current && downloadPathRef.current.length > 0) {
          setDownloadPath(prev => prev.slice(0, -1));
          return;
        }
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

  const handlePlayDownloaded = async (item) => {
    if (!Capacitor.isNativePlatform()) {
      window.history.pushState({ player: true }, '');
    }

    if (item.type === 'pdf') {
      let pdfUrl = item.url;
      try {
        const localBlobOrRemote = await downloadManager.getPdfLocalUrl(item);
        if (localBlobOrRemote) {
          pdfUrl = localBlobOrRemote;
        }
      } catch (e) {
        console.warn('Failed to resolve local PDF uri:', e);
      }
      setPlayingVideo({
        id: item.id,
        title: item.title,
        type: 'pdf',
        url: pdfUrl,
        path: item.path,
        source: item.source,
        subject_name: item.subject_name || item.subjectName,
        book_title: item.book_title,
        chapter_title: item.chapter_title
      });
      return;
    }

    // For web: use the Service-Worker–served playlist URL.
    // For native: use the bare relative path (Capacitor localhost serves it).
    const videoUrl = Capacitor.isNativePlatform()
      ? `downloads/${item.id}/index.m3u8`
      : (item.swPlaylistUrl || `/sw-hls/${item.id}/index.m3u8`);

    setPlayingVideo({
      id: item.id,
      title: item.title,
      type: 'video',
      url: videoUrl,
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
    if (Capacitor.isNativePlatform()) {
      PrivacyScreen.disable().catch(() => {});
    }
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
        
        items.push({ 
          ...item, 
          subject_name: subject.subject_name,
          unified_path: unifiedPath 
        });
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
          directChildren.push({
            ...item,
            subject_name: subject.subject_name,
            subjectId: currentFolder.subjectId || subject.subject_id || subject.subject_name
          });
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

          {/* Compact Navigation Tabs — horizontally scrollable */}
          <div className="nav-tabs">
            <button 
              className={`nav-tab-btn ${activeTab === 'courses' ? 'active' : ''}`}
              onClick={() => { setActiveTab('courses'); setSearchQuery(''); }}
            >
              Courses
            </button>
            {isClass10 && (
              <button 
                className={`nav-tab-btn ${activeTab === 'textbook' ? 'active' : ''}`}
                onClick={() => { setActiveTab('textbook'); setSearchQuery(''); }}
              >
                Textbook
              </button>
            )}
            {isClass10 && (
              <button 
                className={`nav-tab-btn ${activeTab === 'pyq' ? 'active' : ''}`}
                onClick={() => { setActiveTab('pyq'); setSearchQuery(''); }}
              >
                PYQ
              </button>
            )}
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
          <div className="search-container">
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              className="search-input" 
              placeholder={
                activeTab === 'courses' ? "Search courses..." : 
                activeTab === 'textbook' ? "Search textbooks..." : 
                activeTab === 'pyq' ? "Search PYQs..." : 
                "Search downloads..."
              } 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {subInfo.badge && (
            <div 
              onClick={() => setShowProfileModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '4px 9px',
                borderRadius: '12px',
                background: subInfo.isExpired ? 'rgba(239, 68, 68, 0.15)' : 'rgba(74, 222, 128, 0.15)',
                color: subInfo.isExpired ? '#ef4444' : '#4ade80',
                border: `1px solid ${subInfo.isExpired ? 'rgba(239, 68, 68, 0.3)' : 'rgba(74, 222, 128, 0.3)'}`,
                cursor: 'pointer'
              }}
              title={subInfo.text}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: subInfo.isExpired ? '#ef4444' : '#4ade80' }} />
              <span>{subInfo.badge}</span>
            </div>
          )}
          {/* Avatar button — long-press 5s to unlock admin panel */}
          <button 
            className="student-avatar-btn" 
            onClick={() => setShowProfileModal(true)}
            onPointerDown={() => {
              adminHoldTimer.current = setTimeout(() => {
                setAdminHoldActive(false);
                if (onOpenAdmin) onOpenAdmin();
              }, 5000);
              setAdminHoldActive(true);
            }}
            onPointerUp={() => {
              clearTimeout(adminHoldTimer.current);
              setAdminHoldActive(false);
            }}
            onPointerLeave={() => {
              clearTimeout(adminHoldTimer.current);
              setAdminHoldActive(false);
            }}
            title="Student Profile & Support"
            aria-label="Student Profile"
            style={{
              outline: adminHoldActive ? '2px solid rgba(106,163,255,0.6)' : 'none',
              transition: 'outline 0.2s ease'
            }}
          >
            <span className="student-avatar-text">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'ST'}
            </span>
          </button>
        </div>
      </nav>

      {/* TEXTBOOK TAB (Class 10 only) */}
      {activeTab === 'textbook' && isClass10 && (
        <div style={{ flex: 1, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <NcertTextbookHub
            showRsAggarwal={true}
            onOpenPdf={(item) => {
              if (!Capacitor.isNativePlatform()) {
                window.history.pushState({ player: true }, '');
              }
              setPlayingVideo(item);
            }}
          />
        </div>
      )}

      {/* CBSE PYQ TAB (Class 10 only) */}
      {activeTab === 'pyq' && isClass10 && (
        <div style={{ flex: 1, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <CbsePyqHub
            onOpenPdf={(item) => {
              if (!Capacitor.isNativePlatform()) {
                window.history.pushState({ player: true }, '');
              }
              setPlayingVideo(item);
            }}
          />
        </div>
      )}

      {/* DOWNLOADED TAB VIEW */}
      {activeTab === 'downloads' && (
        <div className="main-content pb-24">
          <div className="breadcrumbs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
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
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Downloaded Content</span>
              <span className="badge-count">{downloadedLectures.length}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--accent)', background: 'rgba(245, 158, 11, 0.1)', padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                <HardDrive size={14} />
                <span>{storageDetails.formattedTotalSize} Storage</span>
              </div>
              <button
                onClick={() => setShowStorageModal(true)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: 'var(--text-primary)',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title="View detailed storage breakdown"
              >
                <PieChart size={13} style={{ color: 'var(--accent)' }} />
                <span>Details</span>
              </button>
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

          {/* Breadcrumbs inside Downloaded Tab when navigated into a subject/folder or searching */}
          {searchQuery.trim().length > 0 ? (
            <div className="breadcrumbs" style={{ color: 'var(--accent)', marginTop: '8px', marginBottom: '12px' }}>
              <span>Search Results in Downloads for "{searchQuery}"</span>
            </div>
          ) : downloadPath.length > 0 ? (
            <div className="breadcrumbs" style={{ marginTop: '8px', marginBottom: '12px' }}>
              <button 
                onClick={() => setDownloadPath(prev => prev.slice(0, -1))}
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
                onClick={() => setDownloadPath([])}
                style={{ cursor: 'pointer' }}
              >
                Downloaded
              </span>
              {downloadPath.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  <ChevronRight size={14} className="breadcrumb-separator" />
                  <span 
                    className={`breadcrumb-item ${idx === downloadPath.length - 1 ? 'active' : ''}`}
                    onClick={() => {
                      if (idx < downloadPath.length - 1) {
                        setDownloadPath(downloadPath.slice(0, idx + 1));
                      }
                    }}
                    style={{ cursor: idx === downloadPath.length - 1 ? 'default' : 'pointer' }}
                  >
                    {crumb.title}
                  </span>
                </React.Fragment>
              ))}
            </div>
          ) : null}

          <div className="list-container">
            {downloadedLectures.length === 0 && mgrState.active.length === 0 && mgrState.queued.length === 0 ? (
              <div style={{ padding: '64px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px dashed var(--border-color)', margin: '16px 0' }}>
                <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '18px', borderRadius: '50%', marginBottom: '16px', color: 'var(--accent)' }}>
                  <HardDriveDownload size={36} />
                </div>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: '600' }}>No Downloaded Content</h3>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: '1.5', fontSize: '0.875rem', marginBottom: '20px' }}>
                  Lectures and notes you download will be stored securely on your device for offline studying without internet.
                </p>
                <button 
                  className="nav-tab-btn active"
                  onClick={() => setActiveTab('courses')}
                  style={{ padding: '8px 18px', fontSize: '0.875rem' }}
                >
                  Browse Courses
                </button>
              </div>
            ) : searchQuery.trim().length > 0 ? (
              /* Search Mode: Render matching downloaded items */
              searchedDownloads.length === 0 ? (
                <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px dashed var(--border-color)', margin: '16px 0' }}>
                  <FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.5, color: 'var(--accent)' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>No matching downloaded items</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Check your search keyword or clear search to browse folders.</p>
                </div>
              ) : (
                searchedDownloads.map((item) => (
                  <div 
                    key={item.id} 
                    className="download-card"
                    onClick={() => handlePlayDownloaded(item)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                      <div className={item.type === 'video' && item.thumbnail ? "item-thumbnail-container" : `item-icon-container ${item.type || 'video'}`} style={{ width: '100px', height: '60px', margin: 0, flexShrink: 0 }}>
                        {item.type === 'video' && item.thumbnail ? (
                          <img src={item.thumbnail} alt="" className="item-thumbnail" />
                        ) : item.type === 'pdf' ? (
                          <FileText size={24} style={{ color: '#ef4444' }} />
                        ) : (
                          <Video size={24} style={{ color: 'var(--accent)' }} />
                        )}
                      </div>
                      <div className="item-details" style={{ minWidth: 0 }}>
                        <div className="item-title" style={{ fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.title}
                        </div>
                        <div className="item-meta" style={{ gap: '8px', fontSize: '0.78rem', flexWrap: 'wrap', marginTop: '3px' }}>
                          <span style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#d1d5db', padding: '1px 7px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 500 }}>
                            {item.subjectName} {item.folderPath ? `• ${item.folderPath}` : ''}
                          </span>
                          {item.type === 'pdf' ? (
                            <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '1px 6px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600 }}>
                              PDF Document
                            </span>
                          ) : (
                            item.quality && (
                              <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600 }}>
                                {item.quality}
                              </span>
                            )
                          )}
                          {item.sizeBytes > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#38bdf8', fontWeight: 500 }}>
                              <HardDrive size={12} />
                              {formatBytes(item.sizeBytes)}
                            </span>
                          )}
                          {item.type === 'video' && item.duration > 0 && (
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
              )
            ) : downloadPath.length === 0 ? (
              /* Root Level: Render only subjects that have downloaded content */
              downloadSubjectGroups.length === 0 ? (
                <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px dashed var(--border-color)', margin: '16px 0' }}>
                  <FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.5, color: 'var(--accent)' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>No downloaded content</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Browse courses to download lectures and study materials.</p>
                </div>
              ) : (
                downloadSubjectGroups.map((group) => (
                  <div 
                    key={group.name}
                    className="list-item"
                    onClick={() => setDownloadPath([{ title: group.name, isRootSubject: true }])}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="item-icon-container folder">
                      <BookOpen size={24} />
                    </div>
                    <div className="item-details">
                      <div className="item-title">{group.name}</div>
                      <div className="item-meta">
                        <span>{group.items.length} downloaded {group.items.length === 1 ? 'item' : 'items'}</span>
                        {group.totalBytes > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#38bdf8' }}>
                            <HardDrive size={12} />
                            {formatBytes(group.totalBytes)}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={20} style={{ color: '#6b7280', flexShrink: 0 }} />
                  </div>
                ))
              )
            ) : (
              /* Sub-level: Render folders and files inside selected subject / folder */
              (() => {
                const rootSubject = downloadPath[0].title;
                const subjectItems = normalizedDownloads.filter(d => d.subjectName === rootSubject);
                const currentRelPath = downloadPath.slice(1).map(p => p.title).join('/');

                const directChildren = [];
                const subfoldersMap = {};

                subjectItems.forEach(item => {
                  const fPath = (item.folderPath || '').trim().replace(/^\/+|\/+$/g, '');
                  if (fPath === currentRelPath) {
                    directChildren.push(item);
                  } else if (currentRelPath === "") {
                    const nextSegment = fPath.split('/')[0];
                    if (nextSegment) {
                      if (!subfoldersMap[nextSegment]) {
                        subfoldersMap[nextSegment] = { count: 0, bytes: 0 };
                      }
                      subfoldersMap[nextSegment].count++;
                      subfoldersMap[nextSegment].bytes += (item.sizeBytes || 0);
                    }
                  } else if (fPath.startsWith(currentRelPath + "/")) {
                    const remaining = fPath.substring(currentRelPath.length + 1);
                    const nextSegment = remaining.split('/')[0];
                    if (nextSegment) {
                      if (!subfoldersMap[nextSegment]) {
                        subfoldersMap[nextSegment] = { count: 0, bytes: 0 };
                      }
                      subfoldersMap[nextSegment].count++;
                      subfoldersMap[nextSegment].bytes += (item.sizeBytes || 0);
                    }
                  }
                });

                const subfolders = Object.entries(subfoldersMap).map(([title, data]) => ({
                  title,
                  ...data,
                  isFolder: true
                })).sort((a, b) => a.title.localeCompare(b.title));

                if (subfolders.length === 0 && directChildren.length === 0) {
                  return (
                    <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px dashed var(--border-color)', margin: '16px 0' }}>
                      <Folder size={32} style={{ margin: '0 auto 12px', opacity: 0.5, color: 'var(--accent)' }} />
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Empty Folder</h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No downloaded items in this folder.</p>
                    </div>
                  );
                }

                return (
                  <>
                    {/* Subfolders */}
                    {subfolders.map((folder) => (
                      <div
                        key={folder.title}
                        className="list-item"
                        onClick={() => setDownloadPath(prev => [...prev, { title: folder.title, isFolder: true }])}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="item-icon-container folder">
                          <Folder size={24} />
                        </div>
                        <div className="item-details">
                          <div className="item-title">{folder.title}</div>
                          <div className="item-meta">
                            <span>{folder.count} {folder.count === 1 ? 'item' : 'items'}</span>
                            {folder.bytes > 0 && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#38bdf8' }}>
                                <HardDrive size={12} />
                                {formatBytes(folder.bytes)}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={20} style={{ color: '#6b7280', flexShrink: 0 }} />
                      </div>
                    ))}

                    {/* Direct Files (Videos & PDFs) */}
                    {directChildren.map((item) => (
                      <div 
                        key={item.id} 
                        className="download-card"
                        onClick={() => handlePlayDownloaded(item)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                          <div className={item.type === 'video' && item.thumbnail ? "item-thumbnail-container" : `item-icon-container ${item.type || 'video'}`} style={{ width: '100px', height: '60px', margin: 0, flexShrink: 0 }}>
                            {item.type === 'video' && item.thumbnail ? (
                              <img src={item.thumbnail} alt="" className="item-thumbnail" />
                            ) : item.type === 'pdf' ? (
                              <FileText size={24} style={{ color: '#ef4444' }} />
                            ) : (
                              <Video size={24} style={{ color: 'var(--accent)' }} />
                            )}
                          </div>
                          <div className="item-details" style={{ minWidth: 0 }}>
                            <div className="item-title" style={{ fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.title}
                            </div>
                            <div className="item-meta" style={{ gap: '8px', fontSize: '0.78rem', flexWrap: 'wrap', marginTop: '3px' }}>
                              {item.type === 'pdf' ? (
                                <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '1px 6px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600 }}>
                                  PDF Document
                                </span>
                              ) : (
                                item.quality && (
                                  <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600 }}>
                                    {item.quality}
                                  </span>
                                )
                              )}
                              {item.sizeBytes > 0 && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#38bdf8', fontWeight: 500 }}>
                                  <HardDrive size={12} />
                                  {formatBytes(item.sizeBytes)}
                                </span>
                              )}
                              {item.type === 'video' && item.duration > 0 && (
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
                    ))}
                  </>
                );
              })()
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

                  {item.type === 'pdf' && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (downloadManager.isDownloaded(item.id)) {
                          handlePlayDownloaded(downloadManager.getDownloadedItem(item.id) || item);
                        } else {
                          try {
                            await downloadManager.downloadPdf({
                              ...item,
                              subject_name: item.subject_name || (currentFolder && currentFolder.title) || 'Class Notes',
                              folder_path: item.folder_path || ''
                            });
                          } catch (err) {
                            alert('Failed to download PDF: ' + (err.message || 'Error'));
                          }
                        }
                      }}
                      style={{
                        marginLeft: 'auto',
                        padding: '6px 10px',
                        background: downloadManager.isDownloaded(item.id) ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.08)',
                        border: '1px solid ' + (downloadManager.isDownloaded(item.id) ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.15)'),
                        borderRadius: '6px',
                        color: downloadManager.isDownloaded(item.id) ? '#4ade80' : 'var(--text-primary)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                      title={downloadManager.isDownloaded(item.id) ? 'Open downloaded PDF' : 'Download PDF for offline reading'}
                    >
                      {downloadManager.isDownloading(item.id) ? (
                        <>
                          <Loader2 size={13} className="spin-icon" />
                          <span>Saving...</span>
                        </>
                      ) : downloadManager.isDownloaded(item.id) ? (
                        <>
                          <CheckCircle size={13} />
                          <span>Saved</span>
                        </>
                      ) : (
                        <>
                          <Download size={13} />
                          <span>Download</span>
                        </>
                      )}
                    </button>
                  )}
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
                <span className="profile-detail-label">Subscription</span>
                <span className="profile-detail-value" style={{ color: subInfo.isExpired ? '#ef4444' : '#4ade80', fontWeight: 600 }}>
                  {subInfo.text}
                </span>
              </div>
              {subInfo.formattedDate && (
                <div className="profile-detail-row">
                  <span className="profile-detail-label">Valid Until</span>
                  <span className="profile-detail-value" style={{ fontSize: '0.8rem' }}>
                    {subInfo.formattedDate}
                  </span>
                </div>
              )}
              <div className="profile-detail-row" style={{ alignItems: 'center' }}>
                <span className="profile-detail-label">Offline Storage</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="profile-detail-value">{downloadedLectures.length} files ({formatBytes(totalStorageBytes)})</span>
                  <button 
                    onClick={() => {
                      setShowProfileModal(false);
                      setShowStorageModal(true);
                    }}
                    style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      color: 'var(--accent)',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Details
                  </button>
                </div>
              </div>
              <div className="profile-detail-row">
                <span className="profile-detail-label">App Version</span>
                <span className="profile-detail-value">v2.4.9</span>
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

      {/* Storage Breakdown Details Modal */}
      {showStorageModal && (
        <div className="modal-backdrop" onClick={() => setShowStorageModal(false)}>
          <div className="profile-modal-card" style={{ maxWidth: '460px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HardDrive size={20} style={{ color: 'var(--accent)' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Storage Details
                </h3>
              </div>
              <button 
                onClick={() => setShowStorageModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Total Storage Overview */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Storage Used</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent)' }}>
                  {storageDetails.formattedTotalSize}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '10px' }}>
                {storageDetails.totalItems} total downloaded {storageDetails.totalItems === 1 ? 'item' : 'items'} saved on device
              </div>

              {/* Proportional visual bar */}
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                {storageDetails.totalSizeBytes > 0 && (
                  <>
                    <div 
                      style={{ 
                        width: `${(storageDetails.videoSizeBytes / storageDetails.totalSizeBytes) * 100}%`, 
                        background: '#f59e0b',
                        transition: 'width 0.3s'
                      }} 
                      title={`Videos: ${storageDetails.formattedVideoSize}`}
                    />
                    <div 
                      style={{ 
                        width: `${(storageDetails.pdfSizeBytes / storageDetails.totalSizeBytes) * 100}%`, 
                        background: '#ef4444',
                        transition: 'width 0.3s'
                      }} 
                      title={`Notes & PDFs: ${storageDetails.formattedPdfSize}`}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Cards for Videos & Notes breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)', marginBottom: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                  <Video size={14} />
                  <span>Videos</span>
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {storageDetails.formattedVideoSize}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '2px' }}>
                  {storageDetails.videoCount} {storageDetails.videoCount === 1 ? 'video' : 'videos'}
                </div>
              </div>

              <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', marginBottom: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                  <FileText size={14} />
                  <span>Notes & PDFs</span>
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {storageDetails.formattedPdfSize}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '2px' }}>
                  {storageDetails.pdfCount} {storageDetails.pdfCount === 1 ? 'document' : 'documents'}
                </div>
              </div>
            </div>

            {/* Items list sorted by size */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Downloaded Files ({storageDetails.items.length})
              </span>
              <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Sorted by size</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px', minHeight: '120px', maxHeight: '220px' }}>
              {storageDetails.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: '0.85rem' }}>
                  No downloads stored on device
                </div>
              ) : (
                [...storageDetails.items]
                  .sort((a, b) => (Number(b.sizeBytes) || 0) - (Number(a.sizeBytes) || 0))
                  .map(item => (
                    <div 
                      key={item.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        padding: '8px 10px', 
                        background: 'rgba(255,255,255,0.02)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '8px',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        {item.type === 'pdf' ? (
                          <FileText size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                        ) : (
                          <Video size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.title}
                          </div>
                          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                            {item.subjectName || 'General'}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#38bdf8' }}>
                          {item.formattedSize || formatBytes(item.sizeBytes || 0)}
                        </span>
                        <button
                          onClick={() => {
                            setShowStorageModal(false);
                            setDeleteModalItem(item);
                          }}
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: 'none',
                            color: '#ef4444',
                            borderRadius: '4px',
                            padding: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="Delete file"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowStorageModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
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
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LearningHub;
