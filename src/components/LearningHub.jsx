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
  PieChart,
  Lock,
  History,
  RotateCcw,
  BarChart2,
  Check,
  Bell,
  Megaphone,
  Layers,
  Settings,
  Code2
} from 'lucide-react';
import VideoPlayer from './VideoPlayer';
import NcertTextbookHub from './NcertTextbookHub';
import CbsePyqHub from './CbsePyqHub';
import BatchesHub from './BatchesHub';
import PwBatchExplorer from './PwBatchExplorer';
import { 
  BATCH_CATALOG, 
  getAllowedBatchIdsForUser, 
  getBatchById, 
  getBatchDisplayName
} from '../utils/batchConfig';
import { pwApiService } from '../services/PwApiService';
import { ntApiService } from '../services/NtApiService';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';
import { downloadManager, formatBytes, formatSpeed, formatTimeRemaining, parseDownloadSubjectAndFolder } from '../services/DownloadManager';
import { APP_VERSION } from '../utils/version';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { notificationService } from '../services/NotificationService';

const FIREBASE_DB_URL = "https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app";

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '';
  const totalSecs = Math.round(Number(seconds));
  if (totalSecs <= 0) return '0s';
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) {
    if (m === 0 && s === 0) return `${h}h`;
    if (s === 0) return `${h}h ${m}m`;
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    if (s === 0) return `${m}m`;
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const LearningHub = ({ user, runtimeVersion, onOpenAdmin }) => {
  const [courseData, setCourseData] = useState(null);
  const [currentPath, setCurrentPath] = useState([]); // Array of folder objects
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [playingVideo, setPlayingVideo] = useState(null);
  const [activeTab, setActiveTab] = useState('courses'); // 'batches' | 'courses' | 'textbook' | 'pyq' | 'history' | 'downloads'

  // Batch Permissions & Active Batch State
  const allowedBatchIds = useMemo(() => {
    return getAllowedBatchIdsForUser(user);
  }, [user]);

  const allowedBatchObjects = useMemo(() => {
    return allowedBatchIds.map(id => getBatchById(id)).filter(Boolean);
  }, [allowedBatchIds]);

  const [activeBatchId, setActiveBatchId] = useState(() => {
    try {
      const saved = localStorage.getItem('last_selected_batch_id');
      if (saved && allowedBatchIds.includes(String(saved))) {
        return String(saved);
      }
    } catch (_) {}
    return allowedBatchIds[0] || '176';
  });

  const activeBatchObj = useMemo(() => {
    return getBatchById(activeBatchId) || null;
  }, [activeBatchId]);

  useEffect(() => {
    if (!allowedBatchIds.includes(String(activeBatchId)) && allowedBatchIds.length > 0) {
      setActiveBatchId(allowedBatchIds[0]);
    }
  }, [allowedBatchIds]);

  const [pwItemsMap, setPwItemsMap] = useState({});
  const [pwLoading, setPwLoading] = useState(false);
  const [ntFoldersMap, setNtFoldersMap] = useState({});
  const [ntLoading, setNtLoading] = useState(false);

  const [downloadedLectures, setDownloadedLectures] = useState([]);
  const [downloadPath, setDownloadPath] = useState([]); // Hierarchical path for Downloaded tab
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineToast, setOfflineToast] = useState('');
  const [mgrState, setMgrState] = useState(downloadManager.getState());
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [deleteModalItem, setDeleteModalItem] = useState(null);
  const [blockedDownloadItem, setBlockedDownloadItem] = useState(null);

  // ── Notice Board & Announcements ──
  const [announcements, setAnnouncements] = useState([]);
  const [showNoticeBoard, setShowNoticeBoard] = useState(false);
  const [unreadNoticesCount, setUnreadNoticesCount] = useState(0);

  useEffect(() => {
    try {
      const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(q, (snapshot) => {
        const list = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        setAnnouncements(list);

        try {
          const notifiedIds = JSON.parse(localStorage.getItem('notified_announcement_ids') || '[]');
          const lastReadTime = parseInt(localStorage.getItem('last_read_announcement_time') || '0', 10);
          
          let unread = 0;
          let newlyNotified = [...notifiedIds];

          list.forEach((item) => {
            const itemTime = item.timestamp || (item.createdAt ? new Date(item.createdAt).getTime() : 0);
            if (itemTime > lastReadTime) {
              unread++;
            }

            if (!notifiedIds.includes(item.id)) {
              newlyNotified.push(item.id);
              notificationService.sendImmediateNotification(
                item.title || 'NextBridge Notice',
                item.message || 'You have a new announcement from your teacher.'
              );
            }
          });

          localStorage.setItem('notified_announcement_ids', JSON.stringify(newlyNotified));
          setUnreadNoticesCount(unread);
        } catch (_) {}
      }, (err) => {
        console.warn('[LearningHub] Announcements listener error:', err);
      });

      return () => unsub();
    } catch (e) {
      console.warn('[LearningHub] Announcements setup error:', e);
    }
  }, []);

  const handleMarkAnnouncementsRead = () => {
    try {
      localStorage.setItem('last_read_announcement_time', Date.now().toString());
      setUnreadNoticesCount(0);
    } catch (_) {}
  };

  const getDownloadItemSection = (item) => {
    if (!item) return 'courses';
    if (item.source === 'ncert' || item.source === 'rsa' || (item.subjectName && item.subjectName.toLowerCase().includes('ncert'))) {
      return 'textbooks';
    }
    if (item.source === 'pyq' || (item.subjectName && item.subjectName.toLowerCase().includes('pyq'))) {
      return 'pyqs';
    }
    return 'courses';
  };

  const isDownloadItemAllowed = (item) => {
    const sec = getDownloadItemSection(item);
    return allowedSections[sec] ?? true;
  };

  // Admin panel 5s long-press on avatar
  const adminHoldTimer = useRef(null);
  const [adminHoldActive, setAdminHoldActive] = useState(false);

  // Class 10 only for textbook content
  const isClass10 = String(user?.class || user?.className || '').trim() === '10';

  // Granular section & feature access control (defaults to true for backwards compatibility)
  const allowedSections = useMemo(() => ({
    courses: user?.allowedSections?.courses ?? true,
    textbooks: user?.allowedSections?.textbooks ?? true,
    pyqs: user?.allowedSections?.pyqs ?? true,
    pdfDownload: user?.allowedSections?.pdfDownload ?? user?.pdfDownload ?? true,
    pdfExportShare: user?.allowedSections?.pdfExportShare ?? user?.pdfExportShare ?? true,
  }), [user?.allowedSections, user?.pdfDownload, user?.pdfExportShare]);

  // If default 'courses' tab is not permitted, auto-switch to first accessible tab on initial load
  const hasAutoSwitchedRef = useRef(false);
  useEffect(() => {
    if (!hasAutoSwitchedRef.current && activeTab === 'courses' && !allowedSections.courses) {
      hasAutoSwitchedRef.current = true;
      if (allowedSections.textbooks && isClass10) {
        setActiveTab('textbook');
      } else if (allowedSections.pyqs && isClass10) {
        setActiveTab('pyq');
      } else {
        setActiveTab('downloads');
      }
    }
  }, [activeTab, allowedSections.courses, allowedSections.textbooks, allowedSections.pyqs, isClass10]);

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

  // ── Watch History & Study Activity (Last 7 Days) ──
  const [localRecents, setLocalRecents] = useState([]);
  const [localDailyTime, setLocalDailyTime] = useState({});
  const [localStats, setLocalStats] = useState({});
  const [hiddenHistoryIds, setHiddenHistoryIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('hidden_watch_history') || '[]');
    } catch {
      return [];
    }
  });
  const [historyToast, setHistoryToast] = useState('');

  const isHistoryHidden = (id) => {
    if (!id || !hiddenHistoryIds.length) return false;
    const strId = String(id);
    const cleanId = strId.replace(/[./#[\]$]/g, '_');
    return hiddenHistoryIds.includes(strId) || hiddenHistoryIds.includes(cleanId);
  };

  const handleRemoveFromHistory = (item, e) => {
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    if (!item) return;
    const rawId = item.id != null ? String(item.id) : '';
    const cleanId = rawId.replace(/[./#[\]$]/g, '_');

    // 1. Add to hidden history in state and localStorage (client-side only, backend untouched)
    const currentHidden = JSON.parse(localStorage.getItem('hidden_watch_history') || '[]');
    const nextHidden = Array.from(new Set([...currentHidden, rawId, cleanId].filter(Boolean)));
    localStorage.setItem('hidden_watch_history', JSON.stringify(nextHidden));
    setHiddenHistoryIds(nextHidden);

    // 2. Remove from recent_watched_lectures in localStorage
    try {
      const rawRecents = localStorage.getItem('recent_watched_lectures');
      if (rawRecents) {
        const recents = JSON.parse(rawRecents);
        const filtered = recents.filter(r => {
          const rId = String(r.id || '');
          const rClean = rId.replace(/[./#[\]$]/g, '_');
          return rId !== rawId && rClean !== cleanId;
        });
        localStorage.setItem('recent_watched_lectures', JSON.stringify(filtered));
        setLocalRecents(filtered);
      }
    } catch (_) {}

    // 3. Clear local video resume position
    try {
      localStorage.removeItem(`lecture_pos_${rawId}`);
      localStorage.removeItem(`video_pos_${rawId}`);
      if (cleanId !== rawId) {
        localStorage.removeItem(`lecture_pos_${cleanId}`);
        localStorage.removeItem(`video_pos_${cleanId}`);
      }
    } catch (_) {}

    setHistoryToast('Removed from watch history');
    setTimeout(() => setHistoryToast(''), 2500);
  };

  const reloadWatchHistory = () => {
    try {
      const rec = JSON.parse(localStorage.getItem('recent_watched_lectures') || '[]');
      setLocalRecents(rec);
      const d = JSON.parse(localStorage.getItem('local_daily_video_time') || '{}');
      setLocalDailyTime(d);
      const s = JSON.parse(localStorage.getItem('local_video_stats') || '{}');
      setLocalStats(s);
      const hidden = JSON.parse(localStorage.getItem('hidden_watch_history') || '[]');
      setHiddenHistoryIds(hidden);
    } catch (_) {}
  };

  useEffect(() => {
    reloadWatchHistory();
  }, [activeTab, playingVideo]);

  // Generate 7-day timeline report
  const sevenDayReport = useMemo(() => {
    const days = [];
    const now = new Date();
    let total7DaySecs = 0;

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      
      const firestoreSecs = user?.dailyVideoTime?.[dateKey] || 0;
      const localSecs = localDailyTime[dateKey] || 0;
      const secs = Math.max(firestoreSecs, localSecs);
      total7DaySecs += secs;

      let dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
      if (i === 0) dayLabel = 'Today';
      else if (i === 1) dayLabel = 'Yest';

      days.push({
        dateKey,
        dayLabel,
        dateFormatted: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        seconds: secs,
        isToday: i === 0
      });
    }

    const maxDaySecs = Math.max(...days.map(d => d.seconds), 3600);
    return { days, total7DaySecs, maxDaySecs };
  }, [user?.dailyVideoTime, localDailyTime]);

  // Watched lectures list (combined from localStorage and firestore videoStats)
  const watchedLecturesList = useMemo(() => {
    const map = new Map();

    localRecents.forEach(item => {
      if (item && item.id && !isHistoryHidden(item.id)) {
        const cleanId = String(item.id).replace(/[./#[\]$]/g, '_');
        map.set(String(item.id), {
          ...item,
          watchTimeSecs: item.watchTimeSecs || (localStats[cleanId]?.watchTimeSecs || 0)
        });
      }
    });

    if (user?.videoStats) {
      Object.entries(user.videoStats).forEach(([cleanId, stat]) => {
        if (isHistoryHidden(cleanId) || (stat?.id && isHistoryHidden(stat.id))) return;
        const existing = Array.from(map.values()).find(
          v => String(v.id).replace(/[./#[\]$]/g, '_') === cleanId
        );
        if (existing) {
          existing.watchTimeSecs = Math.max(existing.watchTimeSecs || 0, stat.watchTimeSecs || 0);
          if (stat.lastWatched && (!existing.lastWatched || stat.lastWatched > existing.lastWatched)) {
            existing.lastWatched = stat.lastWatched;
          }
        } else {
          map.set(cleanId, {
            id: cleanId,
            title: stat.title || 'Video Lecture',
            type: 'video',
            subject_name: stat.subjectName || '',
            watchTimeSecs: stat.watchTimeSecs || 0,
            lastWatched: stat.lastWatched || '',
            duration: stat.duration || 0,
            lastPosition: 0
          });
        }
      });
    }

    Object.entries(localStats).forEach(([cleanId, stat]) => {
      if (isHistoryHidden(cleanId) || (stat?.id && isHistoryHidden(stat.id))) return;
      const existing = Array.from(map.values()).find(
        v => String(v.id).replace(/[./#[\]$]/g, '_') === cleanId
      );
      if (existing) {
        existing.watchTimeSecs = Math.max(existing.watchTimeSecs || 0, stat.watchTimeSecs || 0);
      } else {
        map.set(cleanId, {
          id: stat.id || cleanId,
          title: stat.title || 'Video Lecture',
          type: 'video',
          subject_name: stat.subjectName || '',
          watchTimeSecs: stat.watchTimeSecs || 0,
          lastWatched: stat.lastWatched || '',
          duration: stat.duration || 0,
          url: stat.url || '',
          thumbnail: stat.thumbnail || '',
          lastPosition: 0
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.lastWatched || 0).getTime();
      const timeB = new Date(b.lastWatched || 0).getTime();
      return timeB - timeA;
    });
  }, [localRecents, localStats, user?.videoStats, hiddenHistoryIds]);

  const displayWatchedLectures = useMemo(() => {
    if (!searchQuery.trim()) return watchedLecturesList;
    const q = searchQuery.toLowerCase().trim();
    const parts = q.split(' ').filter(Boolean);
    return watchedLecturesList.filter(l => {
      const searchTarget = `${l.title || ''} ${l.name || ''} ${l.subject_name || ''} ${l.subjectName || ''} ${l.chapter || ''} ${l.chapter_title || ''} ${l.folder_path || ''} ${l.unified_path || ''}`.toLowerCase();
      return parts.every(part => searchTarget.includes(part));
    });
  }, [watchedLecturesList, searchQuery]);

  // "Continue Watching" carousel items (home screen)
  const continueWatchingItems = useMemo(() => {
    return localRecents.filter(item => {
      if (!item || item.type !== 'video' || isHistoryHidden(item.id)) return false;
      const pos = item.lastPosition || 0;
      const dur = item.duration || 0;
      return pos > 10 && (dur === 0 || pos < dur * 0.92);
    }).slice(0, 6);
  }, [localRecents, hiddenHistoryIds]);

  // Subject-wise Storage Breakdown
  const subjectStorageBreakdown = useMemo(() => {
    const map = {};
    downloadedLectures.forEach(item => {
      const subj = item.subjectName || 'General';
      if (!map[subj]) {
        map[subj] = { name: subj, totalBytes: 0, count: 0, videoCount: 0, pdfCount: 0 };
      }
      map[subj].totalBytes += (item.sizeBytes || 0);
      map[subj].count += 1;
      if (item.type === 'pdf') map[subj].pdfCount += 1;
      else map[subj].videoCount += 1;
    });
    return Object.values(map).sort((a, b) => b.totalBytes - a.totalBytes);
  }, [downloadedLectures]);

  // Finished downloaded videos (watched >= 90%)
  const finishedDownloadedVideos = useMemo(() => {
    return downloadedLectures.filter(item => {
      if (item.type === 'pdf') return false;
      const dur = item.duration || 0;
      const savedPos = parseFloat(localStorage.getItem('video_pos_' + item.id) || '0');
      if (dur > 0 && (savedPos / dur) >= 0.90) return true;
      try {
        const match = localRecents.find(r => String(r.id) === String(item.id));
        if (match && match.duration > 0 && (match.lastPosition / match.duration) >= 0.90) {
          return true;
        }
      } catch (_) {}
      return false;
    });
  }, [downloadedLectures, localRecents]);

  const handleCleanFinishedVideos = async () => {
    if (finishedDownloadedVideos.length === 0) return;
    for (const vid of finishedDownloadedVideos) {
      await downloadManager.deleteDownload(vid.id);
    }
    loadDownloadedLectures();
  };

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
    const tokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return normalizedDownloads.filter(item => {
      const target = `${item.title || ''} ${item.name || ''} ${item.subjectName || ''} ${item.folderPath || ''}`.toLowerCase();
      return tokens.every(token => target.includes(token));
    });
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

  const closeVideo = () => {
    if (Capacitor.isNativePlatform()) {
      PrivacyScreen.disable().catch(() => {});
    }
    setPlayingVideo(null);
  };

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

  // Online / Offline monitor with auto-resume for interrupted downloads
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      downloadManager.resumeInterrupted();
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (activeTabRef.current !== 'history') {
        setActiveTab('downloads');
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let netListener = null;
    const setupNet = async () => {
      try {
        const status = await Network.getStatus();
        setIsOnline(status.connected);
        if (!status.connected && activeTabRef.current !== 'history') {
          setActiveTab('downloads');
        }
        netListener = await Network.addListener('networkStatusChange', (s) => {
          setIsOnline(s.connected);
          if (s.connected) {
            downloadManager.resumeInterrupted();
          } else if (activeTabRef.current !== 'history') {
            setActiveTab('downloads');
          }
        });
      } catch (e) {
        console.warn('Network plugin status check:', e);
      }
    };
    setupNet();

    if (!navigator.onLine) {
      setIsOnline(false);
      if (activeTabRef.current !== 'history') {
        setActiveTab('downloads');
      }
    }
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (netListener) netListener.remove();
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

          // 2. If in Batches tab
          if (activeTabRef.current === 'batches') {
            if (navigator.onLine && allowedSections.courses) {
              setActiveTab('courses');
            } else {
              setActiveTab('downloads');
            }
            return;
          }

          // 3. If in History tab
          if (activeTabRef.current === 'history') {
            if (navigator.onLine && allowedSections.courses) {
              setActiveTab('courses');
            } else {
              setActiveTab('downloads');
            }
            return;
          }

          // 3. If in Downloads tab
          if (activeTabRef.current === 'downloads') {
            if (downloadPathRef.current && downloadPathRef.current.length > 0) {
              setDownloadPath(prev => prev.slice(0, -1));
              return;
            }
            if (navigator.onLine && allowedSections.courses) {
              setActiveTab('courses');
            }
            return;
          }

          // 4. If searching, clear search query
          if (searchQueryRef.current) {
            setSearchQuery('');
            return;
          }

          // 5. If inside a folder hierarchy, go up one folder
          if (currentPathRef.current && currentPathRef.current.length > 0) {
            setCurrentPath(prev => prev.slice(0, -1));
            return;
          }

          // 6. At root, exit app
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
  }, [allowedSections.courses]);

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
      if (activeTabRef.current === 'batches') {
        setActiveTab(allowedSections.courses ? 'courses' : 'downloads');
        return;
      }
      if (activeTabRef.current === 'history') {
        setActiveTab(allowedSections.courses ? 'courses' : 'downloads');
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
  }, [allowedSections.courses]);

  const fetchCourseData = async (batchIdToFetch) => {
    const targetBatchId = String(batchIdToFetch || activeBatchId || '176');
    setLoading(true);

    const targetBatchObj = getBatchById(targetBatchId);
    if (targetBatchId === 'pw_udaan_2027' || targetBatchId.startsWith('pw_') || targetBatchObj?.is_dynamic_pw) {
      const pwBatchId = targetBatchObj?.pw_batch_id || '6a071d17f84ddfb496a59f76';
      const cacheKey = `pw_batch_subjects_${pwBatchId}_v1`;

      let cachedSubjects = null;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) cachedSubjects = JSON.parse(cached);
      } catch (_) {}

      if (cachedSubjects && cachedSubjects.length > 0) {
        setCourseData({
          course_id: targetBatchId,
          batch_name: targetBatchObj?.batch_name || 'Physics Wallah Batch',
          class_name: targetBatchObj?.class_name || 'Class 10',
          thumbnail: targetBatchObj?.thumbnail,
          is_dynamic_pw: true,
          pw_batch_id: pwBatchId,
          subjects: cachedSubjects
        });
        setLoading(false);
      }

      try {
        const liveSubjects = await pwApiService.getBatchSubjects(pwBatchId);
        if (liveSubjects && liveSubjects.length > 0) {
          localStorage.setItem(cacheKey, JSON.stringify(liveSubjects));
          setCourseData({
            course_id: targetBatchId,
            batch_name: targetBatchObj?.batch_name || 'Physics Wallah Batch',
            class_name: targetBatchObj?.class_name || 'Class 10',
            thumbnail: targetBatchObj?.thumbnail,
            is_dynamic_pw: true,
            pw_batch_id: pwBatchId,
            subjects: liveSubjects
          });
        }
      } catch (err) {
        console.error("Failed to fetch latest PW course data:", err);
      }
      setLoading(false);
      return;
    }

    // 1. NextToppers Real-Time Edge Fetch
    const ntCacheKey = `course_data_nt_batch_${targetBatchId}_v1`;
    let cachedNt = null;
    try {
      const cached = localStorage.getItem(ntCacheKey);
      if (cached) cachedNt = JSON.parse(cached);
    } catch (_) {}

    if (cachedNt && (cachedNt.folders?.length > 0 || cachedNt.items?.length > 0)) {
      setCourseData(cachedNt);
      setLoading(false);
    }

    try {
      const liveRoot = await ntApiService.getFolderContent(targetBatchId, '0');
      if (liveRoot && liveRoot.success && (liveRoot.folders?.length > 0 || liveRoot.items?.length > 0)) {
        const ntData = {
          course_id: targetBatchId,
          batch_name: targetBatchObj?.batch_name || `Batch ${targetBatchId}`,
          class_name: targetBatchObj?.class_name || 'Class 10',
          thumbnail: targetBatchObj?.thumbnail,
          is_dynamic_nt: true,
          folders: liveRoot.folders || [],
          items: liveRoot.items || [],
          subjects: liveRoot.folders || []
        };
        localStorage.setItem(ntCacheKey, JSON.stringify(ntData));
        setCourseData(ntData);
        setLoading(false);
        return;
      }
    } catch (edgeErr) {
      console.warn(`[LearningHub] NT Edge Gateway failed for batch ${targetBatchId}, falling back to database:`, edgeErr);
    }

    // 2. Legacy Database Fallback (if edge gateway is unreachable)
    const cacheKey = `course_data_batch_${targetBatchId}_v301`;
    
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.subjects) {
          setCourseData(parsed);
          setLoading(false);
        }
      } catch (e) {
        console.error("Cache parse error", e);
      }
    }

    try {
      let res = await fetch(`${FIREBASE_DB_URL}/nexthope_batches/batch_${targetBatchId}.json`);
      let data = await res.json();
      if (!data || !data.subjects) {
        res = await fetch(`${FIREBASE_DB_URL}/batches/batch_${targetBatchId}.json`);
        data = await res.json();
      }
      if (!data || !data.subjects) {
        // Fallback for legacy class node (e.g. class_10, class_9, class_8)
        const rawClass = String(user?.class || user?.className || '').trim();
        const cleanClass = rawClass.replace(/\D/g, '') || "10";
        const classId = (cleanClass === "8" || cleanClass === "9") ? cleanClass : "10";
        res = await fetch(`${FIREBASE_DB_URL}/classes/class_${classId}.json`);
        data = await res.json();
      }
      if (data && data.subjects) {
        localStorage.setItem(cacheKey, JSON.stringify(data));
        setCourseData(data);
      }
    } catch (err) {
      console.error("Failed to fetch latest course data:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCourseData(activeBatchId);
  }, [activeBatchId]);

  // Load PW chapters & items dynamically when navigating
  useEffect(() => {
    if (!courseData?.is_dynamic_pw) return;
    const pwBatchId = courseData.pw_batch_id;

    // Inside a Subject (load chapters)
    if (currentPath.length === 1) {
      const subject = currentPath[0];
      const mapKey = `chapters_${subject.subject_id || subject.id}`;
      if (!pwItemsMap[mapKey]) {
        setPwLoading(true);
        pwApiService.getSubjectChapters(pwBatchId, subject)
          .then(chapters => {
            setPwItemsMap(prev => ({ ...prev, [mapKey]: chapters }));
          })
          .catch(err => console.error('Failed to load PW chapters:', err))
          .finally(() => setPwLoading(false));
      }
    }

    // Inside a Chapter (load lectures & notes)
    if (currentPath.length === 2) {
      const subject = currentPath[0];
      const chapter = currentPath[1];
      const mapKey = `content_${chapter.chapterId || chapter.id}`;
      if (!pwItemsMap[mapKey]) {
        setPwLoading(true);
        pwApiService.getChapterItems(pwBatchId, subject, chapter.chapterId || chapter.id, chapter.title)
          .then(items => {
            setPwItemsMap(prev => ({ ...prev, [mapKey]: items }));
          })
          .catch(err => console.error('Failed to load PW chapter items:', err))
          .finally(() => setPwLoading(false));
      }
    }
  }, [currentPath, courseData]);

  // Load NextToppers subfolders & items dynamically when navigating
  useEffect(() => {
    if (!courseData?.is_dynamic_nt) return;
    const courseId = courseData.course_id;

    if (currentPath.length > 0) {
      const currentFolder = currentPath[currentPath.length - 1];
      const folderId = String(currentFolder.folderId || currentFolder.id);
      const folderKey = `${courseId}:${folderId}`;

      if (!ntFoldersMap[folderKey]) {
        setNtLoading(true);
        ntApiService.getFolderContent(courseId, folderId)
          .then(res => {
            if (res && res.success) {
              setNtFoldersMap(prev => ({
                ...prev,
                [folderKey]: {
                  folders: res.folders || [],
                  items: res.items || []
                }
              }));
            }
          })
          .catch(err => console.error(`Failed to load NT folder ${folderId}:`, err))
          .finally(() => setNtLoading(false));
      }
    }
  }, [currentPath, courseData]);

  const handleSelectBatch = (batchId) => {
    const strId = String(batchId);
    setActiveBatchId(strId);
    try {
      localStorage.setItem('last_selected_batch_id', strId);
    } catch (_) {}
    setCurrentPath([]);
    setSearchQuery('');
    setPwItemsMap({});
    setNtFoldersMap({});
    fetchCourseData(strId);
    setActiveTab('courses');
  };

  const handleFolderClick = (subjectId, itemOrFolder) => {
    if (!Capacitor.isNativePlatform()) {
      window.history.pushState({ folder: true }, '');
    }
    setCurrentPath([...currentPath, { subjectId, ...itemOrFolder }]);
    setSearchQuery('');
  };

  const handlePlayVideo = async (item) => {
    if (!allowedSections.courses) {
      setBlockedDownloadItem({ item, section: 'courses' });
      return;
    }

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

    if (item.type !== 'pdf' && item.isDynamicPw && (!item.url || item.url === '')) {
      try {
        setLoading(true);
        const { manifestUrl, clearKeys } = await pwApiService.getVideoPlaybackInfo(
          item.batchId,
          item.scheduleId || item.id,
          item.masterId
        );
        const enrichedItem = {
          ...item,
          url: manifestUrl,
          clearKeys,
          isDash: true
        };
        setPlayingVideo(enrichedItem);
      } catch (err) {
        console.error('Failed to resolve PW video stream:', err);
        setOfflineToast('Unable to load video stream from Physics Wallah.');
        setTimeout(() => setOfflineToast(''), 4000);
      } finally {
        setLoading(false);
      }
      return;
    }

    setPlayingVideo(item);
  };

  const handlePlayDownloaded = async (item) => {
    const section = getDownloadItemSection(item);
    if (!allowedSections[section]) {
      setBlockedDownloadItem({ item, section });
      return;
    }

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
        chapter_title: item.chapter_title,
        isSecure: item.isSecure,
        preventScreenshots: item.preventScreenshots
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
      thumbnail: item.thumbnail,
      isSecure: item.isSecure,
      preventScreenshots: item.preventScreenshots
    });
  };

  const handleWatchLecture = (item) => {
    const downloaded = downloadedLectures.find(d => String(d.id) === String(item.id));
    if (downloaded) {
      handlePlayDownloaded(downloaded);
    } else {
      handlePlayVideo(item);
    }
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

  // Flatten all items across all subjects into one big array for search
  const allItems = useMemo(() => {
    let items = [];
    if (!courseData) return items;

    if (courseData.is_dynamic_nt) {
      return [
        ...(courseData.items || []),
        ...Object.values(ntFoldersMap).flatMap(f => f.items || [])
      ];
    }

    if (!courseData.subjects) return items;
    
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
  }, [courseData, ntFoldersMap]);

  if (loading && !courseData) {
    return (
      <div className="flex-1 flex justify-center items-center h-full min-h-screen bg-[#0a0a0a]">
        <p className="text-[#9ca3af]">Loading learning materials...</p>
      </div>
    );
  }

  if (!courseData || (!courseData.subjects && !courseData.folders)) {
    return (
      <div className="flex-1 p-6 text-center text-[#9ca3af] min-h-screen bg-[#0a0a0a] pt-20">
        <Smartphone size={48} className="mx-auto mb-4 opacity-50" />
        <p>No course data found for Class {user.class}.</p>
      </div>
    );
  }

  // --- Breadcrumb & Hierarchy Logic ---
  const currentFolder = currentPath.length > 0 ? currentPath[currentPath.length - 1] : null;
  let currentItems = [];

  if (courseData?.is_dynamic_pw) {
    if (searchQuery.trim().length > 0) {
      const qTokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const allLoaded = Object.values(pwItemsMap).flat();
      currentItems = allLoaded.filter(item => {
        const target = `${item.title || ''} ${item.name || ''} ${item.folder_path || ''} ${item.subject_name || ''}`.toLowerCase();
        return qTokens.every(tok => target.includes(tok));
      });
    } else if (currentPath.length === 0) {
      currentItems = (courseData.subjects || []).map(sub => ({
        ...sub,
        isRootSubject: true,
        displayTitle: sub.subject_name
      }));
    } else if (currentPath.length === 1) {
      const subId = currentPath[0].subject_id || currentPath[0].id;
      currentItems = pwItemsMap[`chapters_${subId}`] || [];
    } else if (currentPath.length >= 2) {
      const chId = currentPath[1].chapterId || currentPath[1].id;
      currentItems = pwItemsMap[`content_${chId}`] || [];
    }
  } else if (courseData?.is_dynamic_nt) {
    if (searchQuery.trim().length > 0) {
      const qTokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const allNtLoaded = [
        ...(courseData.folders || []),
        ...(courseData.items || []),
        ...Object.values(ntFoldersMap).flatMap(f => [...(f.folders || []), ...(f.items || [])])
      ];
      const seen = new Set();
      currentItems = allNtLoaded.filter(item => {
        const id = item.id || item.contentId || item.folderId || item.title;
        if (id && seen.has(id)) return false;
        if (id) seen.add(id);
        const target = `${item.title || ''} ${item.name || ''} ${item.folder_path || ''} ${item.subject_name || ''}`.toLowerCase();
        return qTokens.every(tok => target.includes(tok));
      });
    } else if (currentPath.length === 0) {
      // Root level of NextToppers batch
      currentItems = [
        ...(courseData.folders || []).map(f => ({
          ...f,
          isFolder: true,
          displayTitle: f.title || f.name,
          subject_id: f.id || f.folderId
        })),
        ...(courseData.items || []).map(it => ({
          ...it,
          isFolder: false,
          displayTitle: it.title || it.name
        }))
      ];
    } else if (currentFolder) {
      // Inside a NextToppers folder
      const folderKey = `${courseData.course_id}:${currentFolder.folderId || currentFolder.id}`;
      const folderContent = ntFoldersMap[folderKey];
      if (folderContent) {
        currentItems = [
          ...(folderContent.folders || []).map(f => ({
            ...f,
            isFolder: true,
            displayTitle: f.title || f.name,
            subject_id: f.id || f.folderId,
            subject_name: currentFolder.displayTitle || currentFolder.title
          })),
          ...(folderContent.items || []).map(it => ({
            ...it,
            isFolder: false,
            displayTitle: it.title || it.name,
            subject_name: currentFolder.displayTitle || currentFolder.title
          }))
        ];
      } else {
        currentItems = [];
      }
    }
  } else if (searchQuery.trim().length > 0) {
    const qTokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
    currentItems = allItems.filter(item => {
      const target = `${item.title || ''} ${item.name || ''} ${item.unified_path || ''} ${item.subject_name || ''}`.toLowerCase();
      return qTokens.every(tok => target.includes(tok));
    }).sort((a, b) => {
      const timeA = typeof a.created_at === 'number' ? a.created_at : 0;
      const timeB = typeof b.created_at === 'number' ? b.created_at : 0;
      if (timeB !== timeA) return timeB - timeA;
      return (a.title || a.name || '').localeCompare(b.title || b.name || '');
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
  } else if (currentFolder) {
    // Inside a folder/subject
    const subjectsMap = courseData.subjects || {};
    let subject = null;
    if (currentFolder.subjectId && subjectsMap[currentFolder.subjectId]) {
      subject = subjectsMap[currentFolder.subjectId];
    } else {
      const subs = Array.isArray(subjectsMap) ? subjectsMap : Object.values(subjectsMap);
      subject = subs.find(s => 
        s && (
          String(s.subject_id) === String(currentFolder.subjectId) ||
          String(s.id) === String(currentFolder.subjectId) ||
          s.subject_name === currentFolder.subject_name ||
          s.subject_name === currentFolder.title
        )
      );
    }
    
    if (subject && subject.items) {
      let targetPath = "";
      if (!currentFolder.isRootSubject) {
         targetPath = currentFolder.folder_path ? `${currentFolder.folder_path}/${currentFolder.title}` : currentFolder.title;
      }
      
      const subjectItems = Array.isArray(subject.items)
        ? subject.items.filter(Boolean)
        : Object.values(subject.items).filter(Boolean);
      const directChildren = [];
      const folders = new Set();

      subjectItems.forEach(item => {
        if (!item || item.isHidden) return; // Hide locked content or nulls

        const itemFolderPath = item.folder_path || "";
        if (itemFolderPath === targetPath) {
          directChildren.push({
            ...item,
            subject_name: subject.subject_name,
            subjectId: currentFolder.subjectId || subject.subject_id || subject.id || subject.subject_name
          });
        } else if (itemFolderPath && itemFolderPath.startsWith(targetPath)) {
          const remainingPath = targetPath === "" ? itemFolderPath : itemFolderPath.substring(targetPath.length + 1);
          const nextFolder = remainingPath.split('/')[0];
          if (nextFolder) folders.add(nextFolder);
        }
      });

      currentItems = [
        ...Array.from(folders).map(f => {
          const subPath = targetPath ? `${targetPath}/${f}` : f;
          const childCount = subjectItems.filter(it => it && !it.isHidden && (it.folder_path === subPath || (it.folder_path && it.folder_path.startsWith(subPath + '/')))).length;
          return {
            title: f,
            isFolder: true,
            itemCount: childCount,
            subjectId: currentFolder.subjectId || subject.subject_id || subject.id,
            folder_path: targetPath
          };
        }),
        ...directChildren.sort((a, b) => {
           const timeA = typeof a.created_at === 'number' ? a.created_at : 0;
           const timeB = typeof b.created_at === 'number' ? b.created_at : 0;
           if (timeB !== timeA) return timeB - timeA;
           return (a.title || '').localeCompare(b.title || '');
        })
      ];
    }
  }

  const renderLockedSection = (sectionName, description) => (
    <div className="main-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '55vh', textAlign: 'center', padding: '32px 16px' }}>
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '18px',
        color: '#f87171'
      }}>
        <Lock size={30} />
      </div>

      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
        {sectionName} Locked
      </h2>

      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: 1.5, marginBottom: '22px' }}>
        {description || `Access to ${sectionName} is not included in your current subscription plan. Contact admin to upgrade your access.`}
      </p>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '100%',
        maxWidth: '300px'
      }}>
        <button
          className="telegram-support-btn"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => window.open('https://t.me/nextbridge19', '_blank')}
        >
          <Send size={16} />
          <span>Contact Admin to Upgrade</span>
          <ExternalLink size={14} style={{ opacity: 0.7, marginLeft: '6px' }} />
        </button>

        <button
          onClick={() => {
            if (allowedSections.courses) setActiveTab('courses');
            else if (allowedSections.textbooks && isClass10) setActiveTab('textbook');
            else if (allowedSections.pyqs && isClass10) setActiveTab('pyq');
            else setActiveTab('downloads');
          }}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            borderRadius: '8px',
            padding: '9px 14px',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          Go to Accessible Content
        </button>
      </div>
    </div>
  );

  if (playingVideo) {
    return <VideoPlayer item={playingVideo} onClose={closeVideo} user={user} />;
  }

  return (
    <div className="app-container">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="offline-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 16px', background: '#dc2626', color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>
          <WifiOff size={16} />
          <span>Your device is offline. Connect to internet to get full access.</span>
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

      {/* History Removed Toast Notification */}
      {historyToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1f2937',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#f3f4f6',
          padding: '10px 18px',
          borderRadius: '8px',
          zIndex: 9999,
          fontSize: '0.85rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          maxWidth: '90%'
        }}>
          <Check size={16} style={{ color: '#22c55e' }} />
          <span>{historyToast}</span>
        </div>
      )}

      {/* Top Navbar */}
      <nav className="navbar" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
        <div className="navbar-top-row">
          <div 
            className="logo" 
            onClick={() => { setCurrentPath([]); setSearchQuery(''); setActiveTab('courses'); }} 
            style={{ cursor: 'pointer' }}
          >
            <BookOpen size={20} />
            <span>NextBridge</span>
          </div>

          <div className="navbar-actions">
            <div className="search-container" style={{ position: 'relative' }}>
              <Search size={16} className="search-icon" />
              <input 
                type="text" 
                className="search-input" 
                placeholder={
                  activeTab === 'batches' ? "Search batches..." :
                  activeTab === 'courses' ? "Search courses..." : 
                  activeTab === 'textbook' ? "Search textbooks..." : 
                  activeTab === 'pyq' ? "Search PYQs..." : 
                  activeTab === 'history' ? "Search history..." :
                  "Search downloads..."
                } 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingRight: searchQuery ? '30px' : undefined }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {subInfo.badge && (
              <div 
                onClick={() => setShowProfileModal(true)}
                className="hidden sm:flex"
                style={{
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '4px 9px',
                  borderRadius: '12px',
                  background: subInfo.isExpired ? 'rgba(239, 68, 68, 0.15)' : 'rgba(74, 222, 128, 0.15)',
                  color: subInfo.isExpired ? '#ef4444' : '#4ade80',
                  border: `1px solid ${subInfo.isExpired ? 'rgba(239, 68, 68, 0.3)' : 'rgba(74, 222, 128, 0.3)'}`,
                  cursor: 'pointer',
                  flexShrink: 0
                }}
                title={subInfo.text}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: subInfo.isExpired ? '#ef4444' : '#4ade80' }} />
                <span>{subInfo.badge}</span>
              </div>
            )}
            {/* Notice Board Bell Button */}
            <button
              className="student-notice-btn"
              onClick={() => {
                setShowNoticeBoard(true);
                setUnreadNoticesCount(0);
                localStorage.setItem('last_read_announcement_time', Date.now().toString());
              }}
              title="Announcements & Notices"
              aria-label="Announcements"
              style={{
                position: 'relative',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#e2e8f0',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <Bell size={18} />
              {unreadNoticesCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  borderRadius: '10px',
                  padding: '1px 5px',
                  minWidth: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 6px rgba(239, 68, 68, 0.8)'
                }}>
                  {unreadNoticesCount > 9 ? '9+' : unreadNoticesCount}
                </span>
              )}
            </button>

            {/* App Settings Button */}
            <button
              className="student-settings-btn"
              onClick={() => setShowProfileModal(true)}
              title="Settings"
              aria-label="Settings"
              style={{
                position: 'relative',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#e2e8f0',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <Settings size={18} />
            </button>

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
                transition: 'outline 0.2s ease',
                flexShrink: 0
              }}
            >
              <span className="student-avatar-text">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'ST'}
              </span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs — compact, full width, zero horizontal scroll */}
        <div className="nav-tabs">
          {isOnline && (
            <>
              <button 
                className={`nav-tab-btn ${activeTab === 'batches' ? 'active' : ''}`}
                onClick={() => { setActiveTab('batches'); setSearchQuery(''); }}
              >
                <span className="tab-text">Batches</span>
                {allowedBatchIds.length > 1 && (
                  <span className="badge-count" style={{ background: 'var(--accent)', color: '#000', fontWeight: 800 }}>{allowedBatchIds.length}</span>
                )}
              </button>
              <button 
                className={`nav-tab-btn ${activeTab === 'courses' ? 'active' : ''}`}
                onClick={() => { setActiveTab('courses'); setSearchQuery(''); }}
              >
                <span className="tab-text">Courses</span>
                {!allowedSections.courses && <Lock size={10} className="tab-lock-icon" />}
              </button>
              {isClass10 && (
                <button 
                  className={`nav-tab-btn ${activeTab === 'textbook' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('textbook'); setSearchQuery(''); }}
                >
                  <span className="tab-text">Textbook</span>
                  {!allowedSections.textbooks && <Lock size={10} className="tab-lock-icon" />}
                </button>
              )}
              {isClass10 && (
                <button 
                  className={`nav-tab-btn ${activeTab === 'pyq' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('pyq'); setSearchQuery(''); }}
                >
                  <span className="tab-text">PYQ</span>
                  {!allowedSections.pyqs && <Lock size={10} className="tab-lock-icon" />}
                </button>
              )}
            </>
          )}
          <button 
            className={`nav-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => { setActiveTab('history'); setSearchQuery(''); }}
          >
            <span className="tab-text">History</span>
          </button>
          <button 
            className={`nav-tab-btn ${activeTab === 'downloads' || (!isOnline && activeTab !== 'history') ? 'active' : ''}`}
            onClick={() => { setActiveTab('downloads'); setSearchQuery(''); }}
          >
            <span className="tab-text">Downloads</span>
            {downloadedLectures.length > 0 && (
              <span className="badge-count">{downloadedLectures.length}</span>
            )}
          </button>
        </div>
      </nav>

      {/* TEXTBOOK TAB (Class 10 only) */}
      {isOnline && activeTab === 'textbook' && isClass10 && (
        <div style={{ flex: 1, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <NcertTextbookHub
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showRsAggarwal={true}
            isLocked={!allowedSections.textbooks}
            allowDownload={allowedSections.pdfDownload}
            onOpenPdf={(item) => {
              if (!allowedSections.textbooks) {
                setBlockedDownloadItem({ item: { title: item.title || item.name || 'NCERT Textbook Chapter', ...item }, section: 'textbooks' });
                return;
              }
              if (!Capacitor.isNativePlatform()) {
                window.history.pushState({ player: true }, '');
              }
              setPlayingVideo(item);
            }}
          />
        </div>
      )}

      {/* CBSE PYQ TAB (Class 10 only) */}
      {isOnline && activeTab === 'pyq' && isClass10 && (
        <div style={{ flex: 1, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <CbsePyqHub
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isLocked={!allowedSections.pyqs}
            allowDownload={allowedSections.pdfDownload}
            onOpenPdf={(item) => {
              if (!allowedSections.pyqs) {
                setBlockedDownloadItem({ item: { title: item.name || item.title || 'CBSE PYQ Paper', ...item }, section: 'pyqs' });
                return;
              }
              if (!Capacitor.isNativePlatform()) {
                window.history.pushState({ player: true }, '');
              }
              setPlayingVideo(item);
            }}
          />
        </div>
      )}

      {/* DOWNLOADED TAB VIEW */}
      {(activeTab === 'downloads' || (!isOnline && activeTab !== 'history')) && (
        <div className="main-content pb-24">
          <div className="breadcrumbs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isOnline && (
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
              )}
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
                    style={{ 
                      cursor: 'pointer',
                      opacity: isDownloadItemAllowed(item) ? 1 : 0.8,
                      borderColor: isDownloadItemAllowed(item) ? undefined : 'rgba(239, 68, 68, 0.3)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                      <div className={item.type === 'video' && item.thumbnail ? "item-thumbnail-container" : `item-icon-container ${item.type || 'video'}`} style={{ width: '100px', height: '60px', margin: 0, flexShrink: 0 }}>
                        {item.type === 'video' && item.thumbnail ? (
                          <img 
                            src={item.thumbnail} 
                            alt="" 
                            className="item-thumbnail" 
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
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
                          {!isDownloadItemAllowed(item) && (
                            <span className="badge-locked">
                              <Lock size={10} /> Locked
                            </span>
                          )}
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
                        style={{ 
                          cursor: 'pointer',
                          opacity: isDownloadItemAllowed(item) ? 1 : 0.8,
                          borderColor: isDownloadItemAllowed(item) ? undefined : 'rgba(239, 68, 68, 0.3)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                          <div className={item.type === 'video' && item.thumbnail ? "item-thumbnail-container" : `item-icon-container ${item.type || 'video'}`} style={{ width: '100px', height: '60px', margin: 0, flexShrink: 0 }}>
                            {item.type === 'video' && item.thumbnail ? (
                              <img 
                                src={item.thumbnail} 
                                alt="" 
                                className="item-thumbnail" 
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
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
                              {!isDownloadItemAllowed(item) && (
                                <span className="badge-locked">
                                  <Lock size={10} /> Locked
                                </span>
                              )}
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

      {/* WATCH HISTORY & ACTIVITY TAB VIEW */}
      {activeTab === 'history' && (
        <div className="main-content pb-24 custom-scrollbar" style={{ overflowY: 'auto', flex: 1, padding: '16px' }}>
          {/* Header & 7-Day Overview — hidden while searching so search results are immediately visible */}
          {!searchQuery.trim() && (
            <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={20} style={{ color: 'var(--accent)' }} />
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                      Watch History & Activity
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Last 7 Days Study Time</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)' }}>
                    {formatDuration(sevenDayReport.total7DaySecs)}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>7-Day Total</span>
                </div>
              </div>

              {/* 7-Day Day-by-Day Activity Bar Chart */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(7, 1fr)', 
                gap: '6px', 
                alignItems: 'flex-end', 
                height: '110px', 
                paddingTop: '20px', 
                paddingBottom: '8px', 
                borderBottom: '1px solid var(--border-color)' 
              }}>
                {sevenDayReport.days.map((day, idx) => {
                  const heightPct = day.seconds > 0 
                    ? Math.max(12, Math.round((day.seconds / sevenDayReport.maxDaySecs) * 100)) 
                    : 6;
                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: '0.62rem', color: day.seconds > 0 ? 'var(--accent)' : '#6b7280', fontWeight: 600, marginBottom: '4px' }}>
                        {day.seconds > 0 ? (day.seconds >= 3600 ? `${(day.seconds / 3600).toFixed(1)}h` : `${Math.round(day.seconds / 60)}m`) : '0m'}
                      </span>
                      <div style={{ 
                        width: '100%', 
                        maxWidth: '28px', 
                        height: `${heightPct}%`, 
                        background: day.isToday 
                          ? 'var(--accent)' 
                          : (day.seconds > 0 ? 'rgba(245, 158, 11, 0.45)' : 'rgba(255, 255, 255, 0.08)'), 
                        borderRadius: '5px 5px 2px 2px',
                        transition: 'height 0.3s ease'
                      }} />
                      <span style={{ fontSize: '0.68rem', color: day.isToday ? 'var(--accent)' : '#9ca3af', fontWeight: day.isToday ? 700 : 500, marginTop: '6px' }}>
                        {day.dayLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '0.72rem', color: '#9ca3af' }}>
                <span>Day-by-day video watch time</span>
                <span>Today: <strong style={{ color: 'var(--text-primary)' }}>{formatDuration(sevenDayReport.days[6]?.seconds || 0)}</strong></span>
              </div>
            </div>
          )}

          {/* Watched Lectures Section / Search Results Header */}
          {searchQuery.trim() ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Search size={16} style={{ color: 'var(--accent)' }} />
                  <span>Search Results in Watch History</span>
                </h4>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  Found {displayWatchedLectures.length} lecture{displayWatchedLectures.length === 1 ? '' : 's'} matching "{searchQuery}"
                </span>
              </div>
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  padding: '5px 12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  color: '#9ca3af',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                Clear Search
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Watched Lectures ({displayWatchedLectures.length})
              </h4>
              {displayWatchedLectures.length > 0 && (
                <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                  Sorted by recent activity
                </span>
              )}
            </div>
          )}

          {displayWatchedLectures.length === 0 ? (
            searchQuery.trim() ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                <Search size={32} style={{ color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
                <h4 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '6px', fontWeight: 600 }}>
                  No Lectures in History Matching "{searchQuery}"
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', maxWidth: '380px', margin: '0 auto 16px', lineHeight: '1.4' }}>
                  You haven't watched any lecture matching this search yet. Would you like to search across all courses instead?
                </p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Clear Search
                  </button>
                  <button
                    onClick={() => setActiveTab('courses')}
                    style={{
                      background: 'var(--accent)',
                      color: '#000',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 18px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Search in Courses
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <History size={28} style={{ color: 'var(--text-secondary)' }} />
                </div>
                <h4 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '6px', fontWeight: 600 }}>No Watch History Yet</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', maxWidth: '340px', margin: '0 auto 16px', lineHeight: '1.4' }}>
                  Start watching video lectures from Courses or Downloads. Your study time and progress will appear here automatically.
                </p>
                <button
                  onClick={() => setActiveTab(isOnline ? 'courses' : 'downloads')}
                  style={{
                    background: 'var(--accent)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 18px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Explore Lectures
                </button>
              </div>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {displayWatchedLectures.map((item, idx) => {
                const pct = item.duration > 0 ? Math.min(100, Math.round(((item.lastPosition || 0) / item.duration) * 100)) : 0;
                return (
                  <div 
                    key={idx}
                    style={{
                      background: 'var(--panel-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}
                  >
                    {/* Thumbnail / Icon */}
                    <div 
                      onClick={() => handleWatchLecture(item)}
                      style={{
                        position: 'relative',
                        width: '76px',
                        height: '52px',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        background: '#0a0a0a',
                        flexShrink: 0,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Video size={22} style={{ color: 'var(--accent)' }} />
                      )}
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Play size={16} fill="#fff" color="#fff" />
                      </div>
                    </div>

                    {/* Lecture Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div 
                        onClick={() => handleWatchLecture(item)}
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer',
                          marginBottom: '3px'
                        }}
                      >
                        {item.title}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#9ca3af', display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                        <span>{item.subject_name || item.subjectName || 'General'}</span>
                        {item.watchTimeSecs > 0 && (
                          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                            Time spent: {formatDuration(item.watchTimeSecs)}
                          </span>
                        )}
                        {item.lastWatched && (
                          <span>• {formatDate(item.lastWatched)}</span>
                        )}
                      </div>

                      {/* Progress bar */}
                      {item.duration > 0 && (
                        <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: pct >= 90 ? '#22c55e' : 'var(--accent)' }} />
                        </div>
                      )}
                    </div>

                    {/* Action Buttons: Watch & Remove */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => handleWatchLecture(item)}
                        style={{
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                          color: 'var(--accent)',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Play size={12} fill="currentColor" />
                        <span>Watch</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleRemoveFromHistory(item, e)}
                        title="Remove from watch history"
                        aria-label="Remove from watch history"
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          color: '#ef4444',
                          borderRadius: '8px',
                          padding: '6px 8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#ef4444';
                          e.currentTarget.style.color = '#fff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                          e.currentTarget.style.color = '#ef4444';
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* BATCHES TAB VIEW */}
      {isOnline && activeTab === 'batches' && (
        <BatchesHub 
          user={user}
          activeBatchId={activeBatchId}
          onSelectBatch={handleSelectBatch}
          allowedBatches={allowedBatchObjects}
          onOpenSettings={() => setShowProfileModal(true)}
        />
      )}

      {/* COURSES TAB VIEW */}
      {isOnline && activeTab === 'courses' && (
        activeBatchObj?.is_dynamic_pw || activeBatchObj?.provider === 'Physics Wallah' ? (
          <PwBatchExplorer
            batch={activeBatchObj}
            user={user}
            onPlayVideo={handlePlayVideo}
            onBackToBatches={() => setActiveTab('batches')}
            allowedSections={allowedSections}
          />
        ) : (
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
                {activeBatchObj ? getBatchDisplayName(activeBatchObj) : 'Home'}
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

          {/* Active Batch Banner (Home Screen Only) */}
          {currentPath.length === 0 && !searchQuery && activeBatchObj && (
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
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                {activeBatchObj.thumbnail ? (
                  <img 
                    src={activeBatchObj.thumbnail} 
                    alt={activeBatchObj.name}
                    style={{ 
                      width: '48px', 
                      height: '48px', 
                      borderRadius: '10px', 
                      objectFit: 'cover',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }} 
                  />
                ) : (
                  <div style={{ 
                    width: '48px', 
                    height: '48px', 
                    borderRadius: '10px', 
                    background: 'rgba(59, 130, 246, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#60a5fa'
                  }}>
                    <Layers size={24} />
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      fontWeight: 700, 
                      padding: '2px 7px', 
                      borderRadius: '9999px',
                      background: activeBatchObj.isArchive ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                      color: activeBatchObj.isArchive ? '#fca5a5' : '#6ee7b7',
                      border: activeBatchObj.isArchive ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)'
                    }}>
                      {activeBatchObj.session || '2026-27'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      Batch #{activeBatchObj.id}
                    </span>
                  </div>
                  <div style={{ 
                    fontSize: '1rem', 
                    fontWeight: 700, 
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '420px'
                  }}>
                    {getBatchDisplayName(activeBatchObj)}
                  </div>
                </div>
              </div>

              {allowedBatchObjects.length > 1 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('batches')}
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
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.28)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)';
                  }}
                >
                  <Layers size={14} />
                  <span>Switch Batch ({allowedBatchObjects.length})</span>
                </button>
              )}
            </div>
          )}

          {/* Continue Watching Section (Home Screen Only) */}
          {currentPath.length === 0 && !searchQuery && continueWatchingItems.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RotateCcw size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Continue Watching
                  </span>
                </div>
                <button 
                  onClick={() => setActiveTab('history')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  View All
                </button>
              </div>

              <div style={{ 
                display: 'flex', 
                gap: '12px', 
                overflowX: 'auto', 
                paddingBottom: '8px',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch'
              }}>
                {continueWatchingItems.map(item => {
                  const pct = Math.min(100, Math.round(((item.lastPosition || 0) / (item.duration || 1)) * 100));
                  return (
                    <div 
                      key={item.id}
                      onClick={() => handleWatchLecture(item)}
                      style={{
                        flex: '0 0 240px',
                        background: 'var(--panel-bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                      }}
                    >
                      <div style={{ position: 'relative', width: '100%', height: '110px', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#6b7280' }}>
                            <Video size={28} />
                          </div>
                        )}
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>
                            <Play size={18} fill="#000" style={{ marginLeft: 2 }} />
                          </div>
                        </div>

                        {/* Cut / Remove Icon to Hide from Watch History */}
                        <button
                          type="button"
                          onClick={(e) => handleRemoveFromHistory(item, e)}
                          title="Remove from watch history"
                          aria-label="Remove from watch history"
                          style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            background: 'rgba(0, 0, 0, 0.75)',
                            border: '1px solid rgba(255, 255, 255, 0.25)',
                            color: '#e5e7eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            padding: 0,
                            zIndex: 10,
                            backdropFilter: 'blur(4px)',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#ef4444';
                            e.currentTarget.style.borderColor = '#ef4444';
                            e.currentTarget.style.color = '#fff';
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.75)';
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                            e.currentTarget.style.color = '#e5e7eb';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          <X size={14} />
                        </button>

                        {item.duration > 0 && (
                          <div style={{ position: 'absolute', bottom: '6px', right: '6px', background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: '0.68rem', fontWeight: 600, padding: '2px 5px', borderRadius: '4px' }}>
                            {formatDuration(item.duration)}
                          </div>
                        )}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: 'rgba(255,255,255,0.2)' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)' }} />
                        </div>
                      </div>

                      <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: '1.3', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '4px' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{item.subject_name || item.subjectName || 'Lecture'}</span>
                          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{pct}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* List Container */}
          <div className="list-container">
            {pwLoading || ntLoading ? (
              <div style={{ padding: '64px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px dashed var(--border-color)', margin: '16px 0' }}>
                <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent)', marginBottom: '14px' }} />
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '4px', fontWeight: '600' }}>
                  {pwLoading ? 'Loading from Physics Wallah...' : 'Loading folder content...'}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  {pwLoading ? 'Fetching chapters and study materials on demand' : 'Fetching lectures and notes directly from Edge Gateway'}
                </p>
              </div>
            ) : currentItems.length === 0 ? (
              <div style={{ padding: '64px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px dashed var(--border-color)', margin: '16px 0' }}>
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '50%', marginBottom: '16px' }}>
                  <Search size={32} style={{ color: 'var(--text-secondary)' }} />
                </div>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: '600' }}>No Content Found</h3>
                <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: '1.5' }}>
                  We couldn't find any items matching your request.
                </p>
              </div>
            ) : null}
            
            {currentItems.map((item, idx) => {
              if (item.isRootSubject || item.isFolder) {
                return (
                  <div 
                    key={idx} 
                    className="list-item"
                    onClick={() => handleFolderClick(item.subject_id || item.subjectId || item.id, item)}
                  >
                    <div className="item-icon-container folder">
                      <Folder size={24} />
                    </div>
                    <div className="item-details">
                      <div className="item-title">{item.isRootSubject ? item.subject_name : item.title}</div>
                      <div className="item-meta">
                        {item.isRootSubject ? (
                          `${item.items ? (Array.isArray(item.items) ? item.items.length : Object.keys(item.items).length) : 0} items`
                        ) : (
                          item.itemCount !== undefined ? `${item.itemCount} items` : 'Folder'
                        )}
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

                  {!allowedSections.courses && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      color: '#f59e0b',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      marginLeft: 'auto',
                      flexShrink: 0
                    }}>
                      <Lock size={12} />
                      <span>Locked</span>
                    </div>
                  )}

                  {item.type === 'pdf' && allowedSections.courses && (allowedSections.pdfDownload || downloadManager.isDownloaded(item.id)) && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (downloadManager.isDownloaded(item.id)) {
                          handlePlayDownloaded(downloadManager.getDownloadedItem(item.id) || item);
                        } else {
                          if (!isOnline) {
                            setOfflineToast('Your device is offline. Connect to internet to download.');
                            setTimeout(() => setOfflineToast(''), 4000);
                            return;
                          }
                          try {
                            await downloadManager.downloadPdf({
                              ...item,
                              subject_name: item.subject_name || (currentFolder && currentFolder.title) || 'Class Notes',
                              folder_path: item.folder_path || ''
                            });
                          } catch (err) {
                            setOfflineToast('Failed to download PDF: ' + (err.message || 'Error'));
                            setTimeout(() => setOfflineToast(''), 4000);
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
        )
      )}

      {/* Student Profile & Support Modal */}
      {showProfileModal && (
        <div className="modal-backdrop" onClick={() => setShowProfileModal(false)}>
          <div className="profile-modal-card custom-scrollbar" onClick={(e) => e.stopPropagation()}>
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
              <div className="profile-detail-row">
                <span className="profile-detail-label">Included Features</span>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    background: allowedSections.courses ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: allowedSections.courses ? '#4ade80' : '#f87171',
                    border: `1px solid ${allowedSections.courses ? 'rgba(74, 222, 128, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                  }}>
                    Courses {allowedSections.courses ? '✓' : '✕'}
                  </span>
                  <span style={{
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    background: allowedSections.textbooks ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: allowedSections.textbooks ? '#4ade80' : '#f87171',
                    border: `1px solid ${allowedSections.textbooks ? 'rgba(74, 222, 128, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                  }}>
                    Textbooks {allowedSections.textbooks ? '✓' : '✕'}
                  </span>
                  <span style={{
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    background: allowedSections.pyqs ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: allowedSections.pyqs ? '#4ade80' : '#f87171',
                    border: `1px solid ${allowedSections.pyqs ? 'rgba(74, 222, 128, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                  }}>
                    PYQ {allowedSections.pyqs ? '✓' : '✕'}
                  </span>
                  <span style={{
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    background: allowedSections.pdfDownload ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: allowedSections.pdfDownload ? '#4ade80' : '#f87171',
                    border: `1px solid ${allowedSections.pdfDownload ? 'rgba(74, 222, 128, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                  }}>
                    PDF Download {allowedSections.pdfDownload ? '✓' : '✕'}
                  </span>
                  <span style={{
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    background: allowedSections.pdfExportShare ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: allowedSections.pdfExportShare ? '#4ade80' : '#f87171',
                    border: `1px solid ${allowedSections.pdfExportShare ? 'rgba(74, 222, 128, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                  }}>
                    Device Export/Share {allowedSections.pdfExportShare ? '✓' : '✕'}
                  </span>
                </div>
              </div>
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
                <span className="profile-detail-value">
                  v{runtimeVersion?.appVersion || APP_VERSION}
                  {runtimeVersion?.isNative && runtimeVersion?.otaVersion && runtimeVersion?.otaVersion !== runtimeVersion?.appVersion ? (
                    <span style={{ fontSize: '0.75rem', opacity: 0.7, marginLeft: '6px' }}>(OTA v{runtimeVersion.otaVersion})</span>
                  ) : null}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '20px' }}>
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

      {/* Notice Board / Announcements Modal */}
      {showNoticeBoard && (
        <div className="modal-backdrop" onClick={() => setShowNoticeBoard(false)}>
          <div 
            className="profile-modal-card custom-scrollbar" 
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px', width: '92%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Megaphone size={20} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Notice Board
                </span>
              </div>
              <button 
                onClick={() => setShowNoticeBoard(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {announcements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-secondary)' }}>
                  <Bell size={36} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>No announcements yet</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.7 }}>You are all caught up with your classes and updates.</p>
                </div>
              ) : (
                announcements.map((notice) => {
                  const priorityColors = {
                    urgent: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' },
                    important: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' },
                    info: { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)', text: '#60a5fa' }
                  };
                  const color = priorityColors[notice.priority] || priorityColors.info;
                  const dateStr = notice.createdAt 
                    ? new Date(notice.createdAt).toLocaleString(undefined, { 
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                      }) 
                    : '';

                  return (
                    <div 
                      key={notice.id} 
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.03)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '12px', 
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ 
                          fontSize: '0.7rem', 
                          fontWeight: 700, 
                          textTransform: 'uppercase', 
                          padding: '2px 8px', 
                          borderRadius: '8px', 
                          background: color.bg, 
                          color: color.text, 
                          border: `1px solid ${color.border}` 
                        }}>
                          {notice.priority || 'Info'}
                        </span>
                        {dateStr && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {dateStr}
                          </span>
                        )}
                      </div>
                      <h4 style={{ margin: '4px 0 2px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {notice.title}
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.45', whiteSpace: 'pre-wrap' }}>
                        {notice.message}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Storage Breakdown Details Modal */}
      {showStorageModal && (
        <div className="modal-backdrop" onClick={() => setShowStorageModal(false)}>
          <div className="profile-modal-card storage-modal-card custom-scrollbar" onClick={(e) => e.stopPropagation()}>
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

            {/* 1-Tap Cleanup for Finished Videos (>=90% watched) */}
            {finishedDownloadedVideos.length > 0 && (
              <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '10px', padding: '12px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#22c55e', fontSize: '0.82rem', fontWeight: 700 }}>
                    <CheckCircle size={15} />
                    <span>Clean Finished Videos</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '2px' }}>
                    {finishedDownloadedVideos.length} {finishedDownloadedVideos.length === 1 ? 'lecture' : 'lectures'} completed (&ge;90% watched). Free up {formatBytes(finishedDownloadedVideos.reduce((a, b) => a + (b.sizeBytes || 0), 0))}.
                  </div>
                </div>
                <button
                  onClick={handleCleanFinishedVideos}
                  style={{
                    background: '#22c55e',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Clean Now
                </button>
              </div>
            )}

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

            {/* Subject Storage Breakdown */}
            {subjectStorageBreakdown.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Storage by Subject
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {subjectStorageBreakdown.map(subj => (
                    <div 
                      key={subj.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '8px 12px'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {subj.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                          {subj.videoCount > 0 ? `${subj.videoCount} video${subj.videoCount > 1 ? 's' : ''}` : ''}
                          {subj.videoCount > 0 && subj.pdfCount > 0 ? ' • ' : ''}
                          {subj.pdfCount > 0 ? `${subj.pdfCount} doc${subj.pdfCount > 1 ? 's' : ''}` : ''}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent)' }}>
                        {formatBytes(subj.totalBytes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Items list sorted by size */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Downloaded Files ({storageDetails.items.length})
              </span>
              <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Sorted by size</span>
            </div>

            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px', minHeight: '120px' }}>
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

      {/* Blocked Download Access Modal */}
      {blockedDownloadItem && (
        <div className="modal-backdrop" onClick={() => setBlockedDownloadItem(null)}>
          <div className="profile-modal-card blocked-modal-card custom-scrollbar" onClick={(e) => e.stopPropagation()}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#f87171'
            }}>
              <Lock size={30} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Access Blocked
            </h3>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '6px' }}>
              <strong style={{ color: '#fff' }}>"{blockedDownloadItem.item?.title}"</strong> belongs to the <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                {blockedDownloadItem.section === 'courses' ? 'Courses & Lectures' : blockedDownloadItem.section === 'textbooks' ? 'NCERT Textbooks' : 'CBSE PYQ Hub'}
              </span> section.
            </p>

            <p style={{ fontSize: '0.84rem', color: '#9ca3af', lineHeight: 1.4, marginBottom: '24px' }}>
              Access to this section is not included in your current subscription plan. Contact the administrator on Telegram to unlock or upgrade access.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="telegram-support-btn"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => window.open('https://t.me/nextbridge19', '_blank')}
              >
                <Send size={16} />
                <span>Contact Admin to Upgrade</span>
                <ExternalLink size={14} style={{ opacity: 0.7, marginLeft: '6px' }} />
              </button>

              <button
                onClick={() => setBlockedDownloadItem(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  borderRadius: '8px',
                  padding: '9px 14px',
                  fontSize: '0.85rem',
                  fontWeight: 500,
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
