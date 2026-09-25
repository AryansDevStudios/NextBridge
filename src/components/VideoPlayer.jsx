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
  Tv,
  Eye,
  EyeOff
} from 'lucide-react';
import { downloadManager } from '../services/DownloadManager';
import YouTubePlayerCore from './YouTubePlayerCore';
import { formatSeekTime, convertDownloadUrlToHls } from '../utils/playerHelpers';
import RightSidePanel from './RightSidePanel';
import './YouTubePlayer.css';

export { formatSeekTime, convertDownloadUrlToHls };

const ImmersiveMode = registerPlugin('ImmersiveMode');

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
  const [resolvedPdfUrl, setResolvedPdfUrl] = useState(item.url || '');
  const [showPdfDownloadMenu, setShowPdfDownloadMenu] = useState(false);
  const [pdfActionToast, setPdfActionToast] = useState('');
  const [isSavingToDevice, setIsSavingToDevice] = useState(false);
  const [isSharingPdf, setIsSharingPdf] = useState(false);

  // ── Video & Panel States ──
  const [isAudioOnlyMode, setIsAudioOnlyMode] = useState(false);
  const [activePanel, setActivePanel] = useState(null); // null | 'notes' | 'download'
  const [isInPip, setIsInPip] = useState(false);

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

  const handleAddNote = (presetText) => {
    const textToAdd = (presetText || '').trim();
    if (!textToAdd) return;
    const currentPos = parseFloat(localStorage.getItem(`lecture_pos_${item.id}`)) || 0;
    const newNote = {
      id: Date.now().toString(),
      time: currentPos,
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

  useEffect(() => {
    const handlePipChange = (e) => {
      setIsInPip(Boolean(e.detail?.isPip));
    };
    window.addEventListener('app:pip-mode-change', handlePipChange);
    return () => window.removeEventListener('app:pip-mode-change', handlePipChange);
  }, []);

  const handleTogglePip = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await ImmersiveMode.enterPip();
        return;
      } catch (err) {
        console.warn('Native PiP enter error:', err);
      }
    }

    try {
      const v = document.querySelector('.yt-video-element') || document.querySelector('video');
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (v && v.requestPictureInPicture) {
        await v.requestPictureInPicture();
      } else {
        showToast('Picture-in-Picture is not supported by your browser');
      }
    } catch (e) {
      showToast('Could not start Picture-in-Picture');
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

  // PDF reading tracker
  useEffect(() => {
    if (item.type === 'pdf') {
      let isMounted = true;
      const syncPdfUrl = async () => {
        try {
          const localUrl = await downloadManager.getPdfLocalUrl(item);
          if (isMounted && localUrl) {
            setResolvedPdfUrl(localUrl);
          }
        } catch (e) {
          if (isMounted) setResolvedPdfUrl(item.url || '');
        }
      };
      let pdfStartTime = Date.now();
      const flushPdfTime = () => {
        const elapsedSecs = Math.floor((Date.now() - pdfStartTime) / 1000);
        if (elapsedSecs >= 3 && user?.id) {
          pdfStartTime = Date.now();
          const cleanDocId = String(item.id || 'doc_' + Math.random().toString(36).slice(2, 8)).replace(/[./#[\]$]/g, '_');
          addDoc(collection(db, 'students', user.id, 'logs'), {
            type: 'notes',
            noteId: item.id || '',
            noteTitle: item.title || 'Study Material / Notes',
            subjectName: item.subject_name || item.subjectName || '',
            durationSecs: elapsedSecs,
            timestamp: new Date().toISOString()
          }).catch(() => {});

          const todayKey = new Date().toISOString().slice(0, 10);
          updateDoc(doc(db, 'students', user.id), {
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
      await downloadManager.downloadPdf(item);
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
      await downloadManager.saveToDevice(item);
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
      await downloadManager.sharePdf(item);
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

        {(resolvedPdfUrl || item.url || '').includes('/dl/r/') ? (
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

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Video Mode: 2-Column Desktop Viewport & Dedicated Right Side Panel
  // ──────────────────────────────────────────────────────────────────────────
  const currentPos = parseFloat(localStorage.getItem(`lecture_pos_${item.id}`)) || 0;

  return (
    <div 
      className={`viewer-overlay video-mode ${isInPip ? 'pip-active' : ''}`}
      style={isInPip ? { background: '#000', padding: 0, margin: 0, overflow: 'hidden' } : {}}
    >
      <div className="viewer-content" style={isInPip ? { padding: 0, margin: 0, height: '100vh', width: '100vw' } : {}}>
        <div className={`yt-desktop-page ${activePanel ? 'with-side-panel' : ''}`}>
          {/* ── Main Left Column (Video Surface + Details + Action Pills) ── */}
          <div className="yt-primary-col">
            <YouTubePlayerCore
              item={item}
              url={item.url}
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

            {!isInPip && (
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
                  {/* Download Button -> Toggles Right Side Panel */}
                  <button
                    className={`yt-action-pill ${activePanel === 'download' ? 'active' : ''}`}
                    onClick={() => setActivePanel(activePanel === 'download' ? null : 'download')}
                    title="Download lecture to device for offline playback"
                  >
                    <Download size={15} />
                    <span>Download Lecture</span>
                  </button>

                  {/* Notes Button -> Toggles Right Side Panel */}
                  <button 
                    onClick={() => setActivePanel(activePanel === 'notes' ? null : 'notes')}
                    className={`yt-action-pill ${activePanel === 'notes' ? 'active' : ''}`}
                    title="Open timestamped notes panel on the right side"
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

                  {/* Picture-in-Picture */}
                  <button 
                    onClick={handleTogglePip}
                    className="yt-action-pill"
                    title="Picture in Picture (Floating window)"
                  >
                    <Tv size={15} />
                    <span>Pop-out (PiP)</span>
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
            )}
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
                currentTime={currentPos}
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
