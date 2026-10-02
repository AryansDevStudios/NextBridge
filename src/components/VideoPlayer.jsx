import React, { useEffect, useState, useCallback } from 'react';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, increment } from 'firebase/firestore';
import {
  Download,
  X,
  Calendar,
  Clock,
  CheckCircle,
  Loader2,
  ArrowLeft,
  Share2,
  HardDrive,
  Smartphone,
  Check,
  MoreVertical,
  Headphones,
  Bookmark,
  Eye,
  EyeOff,
  RefreshCw,
  FileText,
  ExternalLink
} from 'lucide-react';
import { downloadManager } from '../services/DownloadManager';
import { pwApiService, toProxiedPdfUrl, getPdfProxyCandidates } from '../services/PwApiService';
import { ntApiService } from '../services/NtApiService';
import YouTubePlayerCore from './YouTubePlayerCore';
import { formatSeekTime, convertDownloadUrlToHls } from '../utils/playerHelpers';
import RightSidePanel from './RightSidePanel';
import NotesTaker from './NotesTaker';
import './YouTubePlayer.css';

export { formatSeekTime, convertDownloadUrlToHls };

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

const VideoPlayer = ({ item, onClose, user }) => {
  // ── PDF Mode States ──
  const [isPdfDownloaded, setIsPdfDownloaded] = useState(() => downloadManager.isDownloaded(item.id));
  const [isPdfDownloading, setIsPdfDownloading] = useState(() => downloadManager.isDownloading(item.id));
  const [pdfDownloadError, setPdfDownloadError] = useState('');

  // ── Video Resolution State ──
  const [resolvedVideoItem, setResolvedVideoItem] = useState(item);
  const [isResolvingVideo, setIsResolvingVideo] = useState(false);
  const [videoResolveError, setVideoResolveError] = useState('');

  useEffect(() => {
    let isMounted = true;
    if (item.type !== 'pdf' && item.isDynamicPw && (!item.url || item.url === '')) {
      setIsResolvingVideo(true);
      pwApiService.getVideoPlaybackInfo(item).then(({ manifestUrl, clearKeys }) => {
        if (isMounted) {
          setResolvedVideoItem({
            ...item,
            url: manifestUrl,
            clearKeys,
            isDash: true
          });
          setIsResolvingVideo(false);
        }
      }).catch(err => {
        console.error('Failed to resolve PW video stream:', err);
        if (isMounted) {
          setVideoResolveError('Unable to load video stream from Physics Wallah.');
          setIsResolvingVideo(false);
        }
      });
    }
    return () => { isMounted = false; };
  }, [item]);

  const isDirectCloudFrontPdf = Boolean(
    item.type === 'pdf' &&
    item.url &&
    item.url.includes('cloudfront.net') &&
    item.url.toLowerCase().includes('.pdf')
  );

  const isNtPdfNeedingResolution = Boolean(
    item.type === 'pdf' &&
    !isDirectCloudFrontPdf && (
      item.isDynamicNt ||
      item.needsResolve ||
      !item.url ||
      (item.url || '').includes('/dl/r/') ||
      (item.url || '').includes('course.nexttoppers.com') ||
      (item.courseId && !item.isDynamicPw && !item.provider?.includes('Physics Wallah'))
    )
  );

  const needsResolution = Boolean(
    item.type === 'pdf' && (
      item.isDynamicPw || 
      (item.url || '').includes('lxpdf') || 
      (item.url || '').includes('space-z.ai') || 
      (item.url || '').includes('static.pw.live') ||
      isNtPdfNeedingResolution
    )
  );
  const [resolvedPdfUrl, setResolvedPdfUrl] = useState(() => {
    if (item.type !== 'pdf') return '';
    if (needsResolution) return '';
    return item.url || '';
  });
  const [isResolvingPdf, setIsResolvingPdf] = useState(needsResolution);
  const [pdfResolveError, setPdfResolveError] = useState('');
  const [showPdfDownloadMenu, setShowPdfDownloadMenu] = useState(false);
  const [pdfActionToast, setPdfActionToast] = useState('');
  const [isSavingToDevice, setIsSavingToDevice] = useState(false);
  const [isSharingPdf, setIsSharingPdf] = useState(false);

  // ── Video & Panel States ──
  const [isAudioOnlyMode, setIsAudioOnlyMode] = useState(false);
  const [activePanel, setActivePanel] = useState(null); // null | 'notes' | 'download'
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(() => {
    return parseFloat(localStorage.getItem(`lecture_pos_${item.id}`)) || 0;
  });

  const [isHistoryHidden, setIsHistoryHidden] = useState(() => {
    try {
      const rawId = item?.id != null ? String(item.id) : '';
      const cleanId = rawId.replace(/[./#[\]$]/g, '_');
      const rawHidden = localStorage.getItem('hidden_watch_history');
      const hiddenList = rawHidden ? JSON.parse(rawHidden) : [];
      return hiddenList.includes(rawId) || hiddenList.includes(cleanId);
    } catch {
      return false;
    }
  });

  const [notes, setNotes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`video_notes_${item.id}`) || '[]');
    } catch {
      return [];
    }
  });

  // Track live playback time for timestamp notes
  useEffect(() => {
    let videoEl = document.querySelector('.yt-video-element') || document.querySelector('video');
    const updateTime = () => {
      if (videoEl && !isNaN(videoEl.currentTime)) {
        setCurrentPlaybackTime(videoEl.currentTime);
      }
    };

    const interval = setInterval(() => {
      if (!videoEl) {
        videoEl = document.querySelector('.yt-video-element') || document.querySelector('video');
      }
      if (videoEl && !videoEl.paused) {
        updateTime();
      }
    }, 500);

    const onTimeUpdate = () => updateTime();
    videoEl?.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      clearInterval(interval);
      videoEl?.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [item?.id]);

  const handleAddNote = (presetText) => {
    const textToAdd = (presetText || '').trim();
    if (!textToAdd) return;
    const video = document.querySelector('.yt-video-element') || document.querySelector('video');
    const pos = (video && !isNaN(video.currentTime) && video.currentTime > 0)
      ? video.currentTime
      : (currentPlaybackTime || parseFloat(localStorage.getItem(`lecture_pos_${item.id}`)) || 0);
    const newNote = {
      id: Date.now().toString(),
      time: pos,
      text: textToAdd,
      createdAt: new Date().toISOString()
    };
    const updated = [newNote, ...notes].sort((a, b) => a.time - b.time);
    setNotes(updated);
    localStorage.setItem(`video_notes_${item.id}`, JSON.stringify(updated));
  };

  const handleDeleteNote = (noteId) => {
    const updated = notes.filter((n) => n.id !== noteId);
    setNotes(updated);
    localStorage.setItem(`video_notes_${item.id}`, JSON.stringify(updated));
  };

  const handleSeekToNote = (time) => {
    const video = document.querySelector('.yt-video-element') || document.querySelector('video');
    if (video) {
      video.currentTime = time;
      video.play().catch(() => {});
    }
    window.dispatchEvent(new CustomEvent('player:seek-to', { detail: { time } }));
  };

  const handleToggleHistoryHide = () => {
    try {
      const rawId = item?.id != null ? String(item.id) : '';
      const cleanId = rawId.replace(/[./#[\]$]/g, '_');
      const rawHidden = localStorage.getItem('hidden_watch_history');
      const hiddenList = rawHidden ? JSON.parse(rawHidden) : [];
      const alreadyHidden = hiddenList.includes(rawId) || hiddenList.includes(cleanId);

      if (alreadyHidden) {
        const filtered = hiddenList.filter((id) => id !== rawId && id !== cleanId);
        localStorage.setItem('hidden_watch_history', JSON.stringify(filtered));
        setIsHistoryHidden(false);
        showToast('Restored to watch history');
      } else {
        const nextHidden = Array.from(new Set([...hiddenList, rawId, cleanId].filter(Boolean)));
        localStorage.setItem('hidden_watch_history', JSON.stringify(nextHidden));

        const rawRecents = localStorage.getItem('recent_watched_lectures');
        if (rawRecents) {
          const recents = JSON.parse(rawRecents);
          const filtered = recents.filter((r) => {
            const rId = String(r.id || '');
            const rClean = rId.replace(/[./#[\]$]/g, '_');
            return rId !== rawId && rClean !== cleanId;
          });
          localStorage.setItem('recent_watched_lectures', JSON.stringify(filtered));
        }

        localStorage.removeItem(`lecture_pos_${rawId}`);
        localStorage.removeItem(`video_pos_${rawId}`);
        if (cleanId !== rawId) {
          localStorage.removeItem(`lecture_pos_${cleanId}`);
          localStorage.removeItem(`video_pos_${cleanId}`);
        }

        setIsHistoryHidden(true);
        showToast('Hidden from watch history');
      }
    } catch (_) {}
  };

  const handleNotesPillClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      const el = document.querySelector('.yt-mobile-notes-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        const input = el.querySelector('.notes-text-input');
        if (input) input.focus();
      }
    } else {
      setActivePanel(activePanel === 'notes' ? null : 'notes');
    }
  };

  // PDF Permissions
  const allowPdfDownload = user?.allowedSections?.pdfDownload ?? user?.pdfDownload ?? true;
  const allowPdfExportShare = user?.allowedSections?.pdfExportShare ?? user?.pdfExportShare ?? true;
  const hasPdfActions = allowPdfDownload || allowPdfExportShare;

  const showToast = (msg) => {
    setPdfActionToast(msg);
    setTimeout(() => setPdfActionToast(''), 3500);
  };

  // Dynamic Screenshot & Screen Recording Protection (FLAG_SECURE)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const isProtected = Boolean(item?.isSecure || item?.preventScreenshots || item?.secureVideo);
    if (isProtected) {
      PrivacyScreen.enable().catch(console.warn);
    } else {
      PrivacyScreen.disable().catch(console.warn);
    }

    return () => {
      if (Capacitor.isNativePlatform()) {
        PrivacyScreen.disable().catch(console.warn);
      }
    };
  }, [item?.id, item?.isSecure, item?.preventScreenshots, item?.secureVideo]);

// Module-level in-memory cache for resolved PDF blob URLs (0ms instant re-opening across lectures & notes)
const pdfBlobCache = new Map();

async function fetchVerifiedPdfBlob(candidates, signal) {
  for (const url of candidates) {
    if (!url) continue;
    if (url.startsWith('blob:') || url.startsWith('file:') || url.startsWith('capacitor:')) {
      return { blobUrl: url, blob: null };
    }
    try {
      const res = await fetch(url, {
        signal,
        headers: { Accept: 'application/pdf,application/octet-stream,*/*' }
      });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob || blob.size < 100) continue;
      // Validate PDF header magic bytes "%PDF-"
      const head = await blob.slice(0, 5).text().catch(() => '');
      if (head.startsWith('%PDF') || blob.type === 'application/pdf') {
        const blobUrl = URL.createObjectURL(blob);
        return { blobUrl, blob };
      }
    } catch (_) {
      // try next candidate URL
    }
  }
  return null;
}

  // PDF reading tracker
  useEffect(() => {
    if (item.type === 'pdf') {
      let isMounted = true;
      const abortCtrl = new AbortController();

      const syncPdfUrl = async () => {
        try {
          setPdfResolveError('');
          const cacheKey = String(item.id || item.url || '');
          if (cacheKey && pdfBlobCache.has(cacheKey)) {
            setResolvedPdfUrl(pdfBlobCache.get(cacheKey));
            setIsResolvingPdf(false);
            return;
          }

          setIsResolvingPdf(true);

          // 1. Check local offline download first
          const localUrl = await downloadManager.getPdfLocalUrl(item);
          if (isMounted && localUrl && localUrl !== item.url) {
            if (cacheKey) pdfBlobCache.set(cacheKey, localUrl);
            setResolvedPdfUrl(localUrl);
            setIsResolvingPdf(false);
            return;
          }

          let resolvedDirectUrl = item.url || '';

          // 2. Resolve NextToppers on-demand PDFs via edge pipeline
          if (isNtPdfNeedingResolution) {
            resolvedDirectUrl = await ntApiService.resolvePdfUrl(item);
            if (!resolvedDirectUrl || resolvedDirectUrl.includes('/dl/r/')) {
              throw new Error('Unable to resolve direct PDF document from NextToppers edge pipeline.');
            }
          } else if (item.isDynamicPw || (item.url || '').includes('lxpdf') || (item.url || '').includes('space-z.ai') || (item.url || '').includes('static.pw.live')) {
            // 3. Resolve PW on-demand PDFs
            resolvedDirectUrl = await pwApiService.resolvePdfUrl(item);
            if (!resolvedDirectUrl) {
              throw new Error('Unable to resolve document stream from Physics Wallah gateway.');
            }
          }

          // Build candidate URLs with 4-tier proxy fallbacks (Cloudflare -> Netlify -> Render -> Archive)
          const cleanUrl = resolvedDirectUrl.startsWith('/api/lxpdf/') 
            ? decodeURIComponent(resolvedDirectUrl.replace('/api/lxpdf/', ''))
            : resolvedDirectUrl;

          const candidates = Array.from(new Set([
            resolvedDirectUrl,
            ...getPdfProxyCandidates(cleanUrl)
          ].filter(Boolean)));

          const result = await fetchVerifiedPdfBlob(candidates, abortCtrl.signal);
          if (!isMounted) return;

          if (result && result.blobUrl) {
            if (cacheKey) pdfBlobCache.set(cacheKey, result.blobUrl);
            setResolvedPdfUrl(result.blobUrl);
            setIsResolvingPdf(false);
          } else {
            // Fallback to proxied URL if blob creation failed
            const fallbackProxied = isNtPdfNeedingResolution 
              ? ntApiService.toProxiedUrl(resolvedDirectUrl)
              : toProxiedPdfUrl(resolvedDirectUrl);
            setResolvedPdfUrl(fallbackProxied);
            setIsResolvingPdf(false);
          }
        } catch (e) {
          console.warn('[VideoPlayer] PDF resolution error:', e);
          if (isMounted) {
            setIsResolvingPdf(false);
            setPdfResolveError(e.message || 'Failed to load PDF document');
            if (item.url) {
              const fallbackUrl = isNtPdfNeedingResolution ? ntApiService.toProxiedUrl(item.url) : toProxiedPdfUrl(item.url);
              setResolvedPdfUrl(fallbackUrl);
            }
          }
        }
      };
      let pdfStartTime = Date.now();
      const flushPdfTime = () => {
        const elapsedSecs = Math.floor((Date.now() - pdfStartTime) / 1000);
        const studentId = user?.id || user?.uid;
        if (elapsedSecs >= 3 && studentId) {
          pdfStartTime = Date.now();
          const cleanDocId = String(item.id || 'doc_' + Math.random().toString(36).slice(2, 8)).replace(/[./#[\]$]/g, '_');
          addDoc(collection(db, 'students', studentId, 'logs'), {
            type: 'notes',
            noteId: item.id || '',
            noteTitle: item.title || 'Study Material / Notes',
            subjectName: item.subject_name || item.subjectName || '',
            durationSecs: elapsedSecs,
            timestamp: new Date().toISOString()
          }).catch(() => {});

          const todayKey = new Date().toISOString().slice(0, 10);
          updateDoc(doc(db, 'students', studentId), {
            totalNotesTime: increment(elapsedSecs),
            lastActive: new Date().toISOString(),
            [`dailyNotesTime.${todayKey}`]: increment(elapsedSecs),
            [`notesStats.${cleanDocId}.title`]: item.title || 'Study Material / Notes',
            [`notesStats.${cleanDocId}.subjectName`]: item.subject_name || item.subjectName || '',
            [`notesStats.${cleanDocId}.readTimeSecs`]: increment(elapsedSecs),
            [`notesStats.${cleanDocId}.lastRead`]: new Date().toISOString(),
            [`notesStats.${cleanDocId}.openCount`]: increment(1)
          }).catch(() => {});
        }
      };

      const pdfInterval = setInterval(flushPdfTime, 30000);
      const unsub = downloadManager.subscribe(() => {
        setIsPdfDownloaded(downloadManager.isDownloaded(item.id));
        setIsPdfDownloading(downloadManager.isDownloading(item.id));
        syncPdfUrl();
      });

      return () => {
        isMounted = false;
        try { abortCtrl.abort(); } catch (_) {}
        clearInterval(pdfInterval);
        flushPdfTime();
        unsub();
      };
    }
  }, [item.type, item.id, isPdfDownloaded]);

  const handleDownloadPdfToApp = async () => {
    if (!allowPdfDownload) return;
    setShowPdfDownloadMenu(false);
    setPdfDownloadError('');
    try {
      const itemToDownload = resolvedPdfUrl ? { ...item, url: resolvedPdfUrl } : item;
      await downloadManager.downloadPdf(itemToDownload);
      showToast('Saved to App for offline reading!');
    } catch (err) {
      setPdfDownloadError(err.message || 'Failed to download PDF');
    }
  };

  const handleSavePdfToDevice = async () => {
    if (!allowPdfExportShare) return;
    setShowPdfDownloadMenu(false);
    setIsSavingToDevice(true);
    setPdfDownloadError('');
    try {
      const itemToSave = resolvedPdfUrl ? { ...item, url: resolvedPdfUrl } : item;
      await downloadManager.saveToDevice(itemToSave);
      showToast('Saved to device Downloads folder!');
    } catch (err) {
      setPdfDownloadError(err.message || 'Failed to save to device');
    } finally {
      setIsSavingToDevice(false);
    }
  };

  const handleSharePdf = async () => {
    if (!allowPdfExportShare) return;
    setIsSharingPdf(true);
    setPdfDownloadError('');
    try {
      const itemToShare = resolvedPdfUrl ? { ...item, url: resolvedPdfUrl } : item;
      await downloadManager.sharePdf(itemToShare);
    } catch (err) {
      setPdfDownloadError(err.message || 'Failed to share PDF');
    } finally {
      setIsSharingPdf(false);
    }
  };

  const handleOpenExternalPdf = async () => {
    const downloaded = downloadManager.getDownloadedItem(item.id);
    await downloadManager.openPdf(downloaded || item);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 1. PDF Mode Rendering
  // ──────────────────────────────────────────────────────────────────────────
  if (item.type === 'pdf') {
    return (
      <div 
        className="viewer-overlay pdf-mode selectable" 
        style={{ 
          position: 'fixed', 
          inset: 0, 
          width: '100vw', 
          height: '100vh', 
          zIndex: 9999, 
          background: '#121212',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          userSelect: 'text',
          WebkitUserSelect: 'text'
        }}
      >
        {pdfActionToast && (
          <div style={{
            position: 'absolute',
            top: '56px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(24, 24, 27, 0.95)',
            border: '1px solid #38bdf8',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            fontSize: '0.8rem',
            fontWeight: 600,
            zIndex: 10005,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'none'
          }}>
            <CheckCircle size={15} style={{ color: '#38bdf8' }} />
            <span>{pdfActionToast}</span>
          </div>
        )}

        <div style={{ 
          padding: '0 10px', 
          background: '#121212', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          borderBottom: '1px solid #262626',
          width: '100%',
          height: '42px',
          flexShrink: 0,
          gap: '6px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
            <button 
              onClick={onClose}
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: '#f3f4f6', 
                cursor: 'pointer', 
                padding: '5px', 
                display: 'flex', 
                alignItems: 'center', 
                borderRadius: '6px',
                flexShrink: 0
              }}
              title="Go Back"
              aria-label="Go Back"
            >
              <ArrowLeft size={17} />
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
              <h1 
                className="text-sm font-bold text-white truncate" 
                style={{ margin: 0, lineHeight: 1.2, fontSize: '0.82rem' }}
                title={item.title || item.name}
              >
                {item.title || item.name}
              </h1>
              {(item.subject_name || item.subjectName) && (
                <span style={{ fontSize: '0.68rem', color: '#9ca3af', lineHeight: 1.1 }} className="truncate">
                  {item.subject_name || item.subjectName}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, position: 'relative' }}>
            {hasPdfActions && (
              <button
                onClick={() => setShowPdfDownloadMenu((prev) => !prev)}
                style={{
                  background: showPdfDownloadMenu ? '#262626' : 'rgba(255, 255, 255, 0.07)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f3f4f6',
                  padding: '5px 7px',
                  borderRadius: '7px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
                title="More Actions"
                aria-label="More Actions"
              >
                <MoreVertical size={16} />
              </button>
            )}

            {hasPdfActions && showPdfDownloadMenu && (
              <>
                <div 
                  style={{ position: 'fixed', inset: 0, zIndex: 10000 }} 
                  onClick={() => setShowPdfDownloadMenu(false)} 
                />
                <div 
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    width: '230px',
                    background: '#1a1a1c',
                    border: '1px solid #333',
                    borderRadius: '10px',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.8)',
                    padding: '6px',
                    zIndex: 10001,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    animation: 'modalFadeIn 0.15s ease-out'
                  }}
                >
                  {allowPdfExportShare && (
                    <button
                      onClick={() => { setShowPdfDownloadMenu(false); handleSharePdf(); }}
                      disabled={isSharingPdf}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '9px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        color: '#f3f4f6',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        cursor: isSharingPdf ? 'default' : 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#28282b'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {isSharingPdf ? <Loader2 size={16} className="spin-icon text-[#f59e0b]" /> : <Share2 size={16} className="text-[#38bdf8]" />}
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{isSharingPdf ? 'Sharing...' : 'Share Document'}</span>
                        <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>Via WhatsApp, Telegram, etc.</span>
                      </div>
                    </button>
                  )}

                  {allowPdfExportShare && allowPdfDownload && (
                    <div style={{ height: '1px', background: '#262626', margin: '3px 6px' }} />
                  )}

                  {allowPdfDownload && (
                    <button
                      onClick={handleDownloadPdfToApp}
                      disabled={isPdfDownloading}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '9px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        color: '#f3f4f6',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        cursor: isPdfDownloading ? 'default' : 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#28282b'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {isPdfDownloading ? <Loader2 size={16} className="spin-icon text-[#f59e0b]" /> : <Smartphone size={16} className="text-[#f59e0b]" />}
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <span style={{ fontWeight: 600 }}>{isPdfDownloaded ? 'Downloaded to App' : 'Download to App'}</span>
                        <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>Read 100% offline inside app</span>
                      </div>
                      {isPdfDownloaded && <Check size={14} style={{ color: '#4ade80', marginLeft: 'auto' }} />}
                    </button>
                  )}

                  {allowPdfExportShare && (
                    <>
                      {allowPdfDownload && <div style={{ height: '1px', background: '#262626', margin: '3px 6px' }} />}
                      <button
                        onClick={handleSavePdfToDevice}
                        disabled={isSavingToDevice}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '9px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'transparent',
                          color: '#f3f4f6',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          cursor: isSavingToDevice ? 'default' : 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#28282b'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        {isSavingToDevice ? <Loader2 size={16} className="spin-icon text-[#38bdf8]" /> : <HardDrive size={16} className="text-[#38bdf8]" />}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>Save to Device</span>
                          <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>Public Downloads folder</span>
                        </div>
                      </button>
                    </>
                  )}

                  {isPdfDownloaded && Capacitor.isNativePlatform() && (
                    <>
                      <div style={{ height: '1px', background: '#262626', margin: '3px 6px' }} />
                      <button
                        onClick={() => { setShowPdfDownloadMenu(false); handleOpenExternalPdf(); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '9px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'transparent',
                          color: '#f3f4f6',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#28282b'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <ExternalLink size={16} className="text-[#a78bfa]" />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>Open in System App</span>
                          <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>External PDF viewer</span>
                        </div>
                      </button>
                    </>
                  )}
                </div>
              </>
            )}

            <button 
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.07)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f3f4f6',
                padding: '5px 7px',
                borderRadius: '7px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
              title="Close Viewer"
              aria-label="Close Viewer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {isResolvingPdf && !resolvedPdfUrl ? (
          <div style={{ 
            flex: 1, 
            width: '100%', 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            background: '#121214',
            color: '#e5e7eb',
            padding: '24px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px'
            }}>
              <Loader2 size={32} className="spin-icon text-[#38bdf8]" />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#f3f4f6', marginBottom: '8px' }}>
              Loading Document...
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', maxWidth: '360px', lineHeight: 1.5 }}>
              Connecting to secure reader and preparing pages...
            </p>
          </div>
        ) : pdfResolveError && !resolvedPdfUrl ? (
          <div style={{ 
            flex: 1, 
            width: '100%', 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            background: '#121214',
            color: '#e5e7eb',
            padding: '24px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              color: '#ef4444'
            }}>
              <FileText size={32} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#f3f4f6', marginBottom: '8px' }}>
              Document Currently Unavailable
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', maxWidth: '380px', lineHeight: 1.5, marginBottom: '20px' }}>
              {pdfResolveError}
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setPdfResolveError('');
                  setIsResolvingPdf(true);
                  const resolvePromise = isNtPdfNeedingResolution 
                    ? ntApiService.resolvePdfUrl(item) 
                    : pwApiService.resolvePdfUrl(item);

                  resolvePromise.then(async url => {
                    if (url && !url.includes('/dl/r/')) {
                      const cleanUrl = url.startsWith('/api/lxpdf/') ? decodeURIComponent(url.replace('/api/lxpdf/', '')) : url;
                      const candidates = Array.from(new Set([
                        url,
                        ...getPdfProxyCandidates(cleanUrl)
                      ].filter(Boolean)));
                      const res = await fetchVerifiedPdfBlob(candidates);
                      const finalUrl = res?.blobUrl || (isNtPdfNeedingResolution ? ntApiService.toProxiedUrl(url) : toProxiedPdfUrl(url));
                      const cacheKey = String(item.id || item.url || '');
                      if (cacheKey && res?.blobUrl) pdfBlobCache.set(cacheKey, res.blobUrl);
                      setResolvedPdfUrl(finalUrl);
                      setIsResolvingPdf(false);
                    } else {
                      setPdfResolveError('Retry failed. Upstream source unavailable.');
                      setIsResolvingPdf(false);
                    }
                  }).catch(e => {
                    setPdfResolveError(e.message || 'Retry failed');
                    setIsResolvingPdf(false);
                  });
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={16} />
                <span>Retry</span>
              </button>
              {item.url && (
                <button
                  type="button"
                  onClick={() => window.open(item.url, '_blank')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#e5e7eb',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: '10px 20px',
                    borderRadius: '10px',
                    fontWeight: 500,
                    fontSize: '0.88rem',
                    cursor: 'pointer'
                  }}
                >
                  <ExternalLink size={16} />
                  <span>Open Direct Link</span>
                </button>
              )}
            </div>
          </div>
        ) : (!resolvedPdfUrl && (item.url || '').includes('/dl/r/')) ? (
          <div style={{ 
            flex: 1, 
            width: '100%', 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '24px',
            background: '#121214',
            textAlign: 'center'
          }}>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '20px',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              color: '#38bdf8'
            }}>
              <ExternalLink size={34} />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f3f4f6', marginBottom: '8px', maxWidth: '520px' }}>
              {item.title || 'Study Material / Notes'}
            </h3>

            {(item.subject_name || item.subjectName) && (
              <span style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '16px', background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '12px' }}>
                {item.subject_name || item.subjectName}
              </span>
            )}

            <p style={{ color: '#9ca3af', fontSize: '0.88rem', maxWidth: '440px', lineHeight: 1.5, marginBottom: '24px' }}>
              This study document is hosted via NextToppers portal. Tap below to view the official document in your browser.
            </p>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  const targetUrl = item.url || resolvedPdfUrl;
                  if (targetUrl) window.open(targetUrl, '_blank', 'noopener,noreferrer');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)'
                }}
              >
                <ExternalLink size={18} />
                <span>Open in Browser</span>
              </button>

              <button
                onClick={() => {
                  const targetUrl = item.url || resolvedPdfUrl;
                  if (targetUrl) {
                    navigator.clipboard?.writeText(targetUrl);
                    setPdfActionToast('Link copied to clipboard');
                    setTimeout(() => setPdfActionToast(''), 3000);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(255, 255, 255, 0.07)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#e5e7eb',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  fontWeight: 500,
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                <Share2 size={16} />
                <span>Copy Link</span>
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#202124', userSelect: 'text', WebkitUserSelect: 'text' }}>
            <iframe 
              key={resolvedPdfUrl || item.url}
              src={`${window.location.origin || ''}/pdfjs/web/viewer.html?file=${encodeURIComponent(resolvedPdfUrl || item.url)}#zoom=page-width`} 
              style={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%', 
                height: '100%', 
                minWidth: '100%',
                minHeight: '100%', 
                border: 'none', 
                display: 'block',
                userSelect: 'text',
                WebkitUserSelect: 'text'
              }} 
              title={item.title}
              allowFullScreen
            />
          </div>
        )}
      </div>
    );
  }

  const isPwVideo = Boolean(
    item?.isDynamicPw ||
    item?.is_dynamic_pw ||
    item?.isDash ||
    item?.clearKeys ||
    String(item?.batchId || '').startsWith('pw_') ||
    String(item?.id || '').startsWith('pw_') ||
    item?.provider === 'Physics Wallah'
  );

  return (
    <div className="viewer-overlay video-mode">
      <div className="viewer-content">
        <div className={`yt-desktop-page ${activePanel ? 'with-side-panel' : ''}`}>
          {/* ── Main Left Column (Video Surface + Details + Action Pills) ── */}
          <div className="yt-primary-col">
            {isResolvingVideo ? (
              <div style={{ width: '100%', aspectRatio: '16/9', background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                <Loader2 size={32} className="spin-icon" style={{ marginBottom: '16px' }} />
                <span>Loading video stream...</span>
              </div>
            ) : videoResolveError ? (
              <div style={{ width: '100%', aspectRatio: '16/9', background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                <span style={{ marginBottom: '8px' }}>{videoResolveError}</span>
                <button onClick={onClose} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '4px' }}>Close</button>
              </div>
            ) : (
              <YouTubePlayerCore
                item={resolvedVideoItem}
                url={resolvedVideoItem.url}
              user={user}
              onClose={onClose}
              notes={notes}
              onAddNote={handleAddNote}
              onDeleteNote={handleDeleteNote}
              activePanel={activePanel}
              setActivePanel={setActivePanel}
              isAudioOnly={isAudioOnlyMode}
              onToggleAudioOnly={() => setIsAudioOnlyMode(!isAudioOnlyMode)}
            />
            )}

            <div className="yt-info-section" style={{ padding: '16px 4px' }}>
              <h1 className="yt-title" style={{ fontSize: '1.25rem', marginBottom: 6 }}>
                {item.title}
              </h1>

              <div className="yt-meta" style={{ marginBottom: 14 }}>
                {(item.subject_name || item.subjectName) && (
                  <span className="yt-meta-item" style={{ fontWeight: 600, color: 'var(--accent, #f59e0b)' }}>
                    {item.subject_name || item.subjectName}
                  </span>
                )}
                {item.created_at && (
                  <span className="yt-meta-item">
                    <Calendar size={15} />
                    {formatDate(item.created_at)}
                  </span>
                )}
                {item.duration > 0 && (
                  <span className="yt-meta-item">
                    <Clock size={15} />
                    {formatDuration(item.duration)}
                  </span>
                )}
              </div>

              {/* YouTube Action Pill Carousel */}
              <div className="yt-action-carousel">
                {/* Download Button -> Toggles Right Side Panel (Hidden for PW lectures) */}
                {!isPwVideo && (
                  <button
                    className={`yt-action-pill ${activePanel === 'download' ? 'active' : ''}`}
                    onClick={() => setActivePanel(activePanel === 'download' ? null : 'download')}
                    title="Download lecture to device for offline playback"
                  >
                    <Download size={15} />
                    <span>Download Lecture</span>
                  </button>
                )}

                {/* Notes Button -> Toggles Right Side Panel on desktop or scrolls to notes on mobile */}
                <button 
                  onClick={handleNotesPillClick}
                  className={`yt-action-pill ${activePanel === 'notes' ? 'active' : ''}`}
                  title="Lecture notes and bookmarks"
                >
                  <Bookmark size={15} />
                  <span>Notes ({notes.length})</span>
                </button>

                {/* Audio-only battery saver */}
                <button 
                  onClick={() => {
                    const nextState = !isAudioOnlyMode;
                    setIsAudioOnlyMode(nextState);
                    window.dispatchEvent(new CustomEvent('player:toggle-audio', { detail: { active: nextState } }));
                  }}
                  className={`yt-action-pill ${isAudioOnlyMode ? 'active' : ''}`}
                  title="Toggle battery-saving background audio mode"
                >
                  <Headphones size={15} />
                  <span>{isAudioOnlyMode ? 'Video Mode' : 'Audio Mode'}</span>
                </button>

                {/* Hide from Watch History */}
                <button 
                  onClick={handleToggleHistoryHide}
                  className={`yt-action-pill ${isHistoryHidden ? 'active' : ''}`}
                  title={isHistoryHidden ? "Hidden from your watch history (click to restore)" : "Hide from your watch history"}
                >
                  {isHistoryHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  <span>{isHistoryHidden ? 'Hidden from History' : 'Hide from History'}</span>
                </button>

                {/* Close Player */}
                <button className="yt-action-pill" onClick={onClose} title="Exit player">
                  <X size={15} />
                  <span>Close Player</span>
                </button>
              </div>
            </div>

            {/* ── Mobile-Only Default Notes Taker Section (Utilises space below video viewport) ── */}
            <div className="yt-mobile-notes-section">
              <NotesTaker
                notes={notes}
                currentTime={currentPlaybackTime}
                onAddNote={handleAddNote}
                onDeleteNote={handleDeleteNote}
                onSeek={handleSeekToNote}
                isMobile={true}
              />
            </div>
          </div>

          {/* ── Dedicated Right Side Panel (Desktop Viewport & Mobile Drawer) ── */}
          {activePanel && (
            <div className="yt-side-panel-col">
              <RightSidePanel
                type={activePanel}
                onClose={() => setActivePanel(null)}
                item={item}
                url={item.url}
                user={user}
                notes={notes}
                currentTime={currentPlaybackTime}
                onAddNote={handleAddNote}
                onDeleteNote={handleDeleteNote}
                onSeek={handleSeekToNote}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
