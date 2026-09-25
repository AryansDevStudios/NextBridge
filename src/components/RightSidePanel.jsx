import React, { useState, useEffect } from 'react';
import {
  Bookmark,
  Download,
  X,
  Plus,
  Trash2,
  CheckCircle,
  Play,
  Pause,
  Loader2,
  HardDrive,
  Clock,
  Zap,
  RotateCcw
} from 'lucide-react';
import { downloadManager } from '../services/DownloadManager';
import { formatSeekTime } from '../utils/playerHelpers';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import NotesTaker from './NotesTaker';

export default function RightSidePanel({
  type, // 'notes' | 'download'
  onClose,
  item,
  url,
  user,
  notes = [],
  currentTime = 0,
  onAddNote,
  onDeleteNote,
  onSeek
}) {
  // ── Download State ──
  const [mgrState, setMgrState] = useState(downloadManager.getState());
  const [isSavedOnDevice, setIsSavedOnDevice] = useState(false);
  const [viewState, setViewState] = useState('idle'); // idle | analyzing | selecting | error
  const [variants, setVariants] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState({ completed: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Subscribe to download manager
  useEffect(() => {
    return downloadManager.subscribe(setMgrState);
  }, []);

  // Check if saved on device
  useEffect(() => {
    const checkDisk = async () => {
      if (!item?.id) return;
      const isDownloaded = downloadManager.isDownloaded(item.id);
      if (isDownloaded) {
        setIsSavedOnDevice(true);
        return;
      }
      const record = downloadManager.getDownloadedItem(item.id);
      if (record) {
        setIsSavedOnDevice(true);
        return;
      }
      setIsSavedOnDevice(false);
    };
    checkDisk();
  }, [item?.id, mgrState]);

  // Auto-analyze sizes when download panel opens if not yet downloaded or downloading
  const activeTask = mgrState.active.find((t) => String(t.id) === String(item?.id));
  const queuedTask = mgrState.queued.find((q) => String(q.item?.id) === String(item?.id));
  const currentTask = activeTask || (queuedTask ? { ...queuedTask.task.toPublicState(), status: 'queued' } : null);

  useEffect(() => {
    if (type === 'download' && !isSavedOnDevice && !currentTask && viewState === 'idle' && url) {
      handleStartAnalysis();
    }
  }, [type, isSavedOnDevice, currentTask, url]);

  const handleStartAnalysis = async () => {
    setViewState('analyzing');
    setErrorMsg('');
    try {
      const res = await downloadManager.queryAccurateResolutionSizes(
        url,
        item?.duration,
        ({ completed, total }) => {
          setAnalysisProgress({ completed, total });
        }
      );
      setVariants(res);
      setSelectedVariant(res[0]);
      setViewState('selecting');
    } catch (err) {
      console.error('Failed to query resolution sizes:', err);
      setErrorMsg('Failed to query resolutions. Check connection and retry.');
      setViewState('error');
    }
  };

  const handleTriggerDownload = () => {
    const variant = selectedVariant || variants[0];
    if (!variant) return;
    downloadManager.enqueueDownload(item, variant);
    setViewState('idle');
    if (user) {
      addDoc(collection(db, 'students', user.id, 'logs'), {
        type: 'download',
        videoId: item.id || '',
        videoTitle: item.title || 'Unknown Video',
        quality: `${variant.height}p`,
        timestamp: new Date().toISOString()
      }).catch(console.error);
    }
  };

  const handleDeleteDownloadedLecture = async () => {
    if (!item?.id) return;
    try {
      await downloadManager.deleteDownload(item.id);
      setIsSavedOnDevice(false);
      setDeleteConfirm(false);
      handleStartAnalysis();
    } catch (err) {
      console.error('Failed to delete download:', err);
    }
  };

  return (
    <div className="yt-panel-inner" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      background: '#141417',
      color: '#fff',
      overflow: 'hidden'
    }}>
      {/* ── Top Header ── */}
      <div style={{
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        background: '#121214',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {type === 'notes' ? (
            <>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Bookmark size={18} className="text-[#f59e0b]" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#f3f4f6' }}>
                  Lecture Notes
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                  {notes.length} saved moment{notes.length === 1 ? '' : 's'}
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Download size={18} className="text-[#38bdf8]" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#f3f4f6' }}>
                  Download Lecture
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                  Offline Storage & Data Saver
                </span>
              </div>
            </>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            color: '#9ca3af',
            width: 30,
            height: 30,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          title="Close Panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Content Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* ============================================================== */}
        {/* MODE 1: TIMESTAMPED NOTES & BOOKMARKS                          */}
        {/* ============================================================== */}
        {type === 'notes' && (
          <NotesTaker
            notes={notes}
            currentTime={currentTime}
            onAddNote={onAddNote}
            onDeleteNote={onDeleteNote}
            onSeek={onSeek}
            isMobile={false}
          />
        )}

        {/* ============================================================== */}
        {/* MODE 2: DOWNLOAD LECTURE                                       */}
        {/* ============================================================== */}
        {type === 'download' && (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* If Saved on Device */}
            {isSavedOnDevice ? (
              <div style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 12,
                padding: '18px 16px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10
              }}>
                <div style={{
                  width: 54,
                  height: 54,
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10b981'
                }}>
                  <CheckCircle size={30} />
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 700, color: '#f3f4f6' }}>
                    Downloaded to Device
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.4 }}>
                    Offline Ready • Playback uses 0 MB internet data.
                  </p>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.75rem',
                  color: '#4ade80',
                  background: 'rgba(74, 222, 128, 0.12)',
                  padding: '4px 10px',
                  borderRadius: 12,
                  marginTop: 4
                }}>
                  <Zap size={12} />
                  <span>Streaming directly from local offline disk</span>
                </div>

                <div style={{ width: '100%', height: 1, background: 'rgba(255, 255, 255, 0.08)', margin: '6px 0' }} />

                {deleteConfirm ? (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: '0.78rem', color: '#f87171' }}>
                      Delete this download to free up device space?
                    </span>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <button
                        onClick={handleDeleteDownloadedLecture}
                        style={{
                          background: '#ef4444',
                          border: 'none',
                          color: '#fff',
                          padding: '6px 14px',
                          borderRadius: 6,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(false)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: 'none',
                          color: '#fff',
                          padding: '6px 14px',
                          borderRadius: 6,
                          fontSize: '0.78rem',
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      padding: '6px 14px',
                      borderRadius: 6,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Delete Download</span>
                  </button>
                )}
              </div>
            ) : currentTask ? (
              /* If Actively Downloading or Queued */
              <div style={{
                background: '#1a1a1e',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 12,
                padding: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: currentTask.status === 'paused' ? '#f59e0b' : '#38bdf8'
                  }}>
                    {currentTask.status === 'queued' ? 'Queued (Waiting for slot)' : currentTask.status === 'paused' ? 'Download Paused' : `Downloading (${currentTask.quality})`}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontFamily: 'monospace', fontWeight: 600 }}>
                    {currentTask.percent}%
                  </span>
                </div>

                {/* Progress bar track */}
                <div style={{ width: '100%', height: 6, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{
                    width: `${currentTask.percent}%`,
                    height: '100%',
                    background: currentTask.status === 'paused' ? '#f59e0b' : 'var(--accent, #f59e0b)',
                    transition: 'width 0.2s ease-out'
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', color: '#9ca3af' }}>
                  <span>{currentTask.formattedDownloaded} / {currentTask.formattedTotal}</span>
                  {currentTask.speed && <span>{currentTask.speed} • {currentTask.eta || 'calculating...'}</span>}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  {currentTask.status !== 'queued' && (
                    <button
                      onClick={() => currentTask.status === 'paused' ? downloadManager.resumeDownload(item.id) : downloadManager.pauseDownload(item.id)}
                      style={{
                        flex: 1,
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: 'none',
                        color: '#fff',
                        padding: '8px 12px',
                        borderRadius: 8,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      {currentTask.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                      <span>{currentTask.status === 'paused' ? 'Resume' : 'Pause'}</span>
                    </button>
                  )}
                  <button
                    onClick={() => downloadManager.cancelDownload(item.id)}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#ef4444',
                      padding: '8px 14px',
                      borderRadius: 8,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            ) : viewState === 'analyzing' ? (
              /* Analyzing Stream Sizes */
              <div style={{
                background: '#1a1a1e',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 12,
                padding: '24px 16px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12
              }}>
                <Loader2 size={32} className="spin-icon text-[#38bdf8]" />
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '0.92rem', fontWeight: 700, color: '#f3f4f6' }}>
                    Calculating Download Sizes
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#9ca3af' }}>
                    Analyzing HLS stream segments for all resolutions...
                  </p>
                </div>
                {analysisProgress.total > 0 && (
                  <div style={{ width: '100%', marginTop: 4 }}>
                    <div style={{ width: '100%', height: 4, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.round((analysisProgress.completed / analysisProgress.total) * 100)}%`,
                        height: '100%',
                        background: '#38bdf8',
                        transition: 'width 0.15s ease'
                      }} />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4, display: 'inline-block' }}>
                      {analysisProgress.completed} of {analysisProgress.total} streams probed
                    </span>
                  </div>
                )}
              </div>
            ) : viewState === 'error' ? (
              /* Error State */
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 12,
                padding: 16,
                textAlign: 'center'
              }}>
                <p style={{ margin: '0 0 10px 0', fontSize: '0.84rem', color: '#f87171' }}>
                  {errorMsg || 'Failed to analyze resolutions.'}
                </p>
                <button
                  onClick={handleStartAnalysis}
                  style={{
                    background: 'var(--accent, #f59e0b)',
                    color: '#000',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  <RotateCcw size={14} style={{ display: 'inline', marginRight: 4 }} />
                  Retry Analysis
                </button>
              </div>
            ) : (
              /* Resolution Selection Cards */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e5e7eb' }}>
                  Select Resolution Quality:
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {variants.map((v) => (
                    <div
                      key={v.height}
                      onClick={() => setSelectedVariant(v)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: selectedVariant?.height === v.height ? '1.5px solid var(--accent, #f59e0b)' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: selectedVariant?.height === v.height ? 'rgba(245, 158, 11, 0.12)' : '#1a1a1e',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          border: selectedVariant?.height === v.height ? '5px solid var(--accent, #f59e0b)' : '2px solid #555',
                          background: '#000'
                        }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>
                            {v.height}p {v.height >= 1080 ? 'Full HD' : v.height >= 720 ? 'High Definition' : 'Standard'}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                            Optimal for {v.height >= 720 ? 'large screens' : 'mobile data'}
                          </div>
                        </div>
                      </div>

                      <span style={{
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: selectedVariant?.height === v.height ? 'var(--accent, #f59e0b)' : '#38bdf8',
                        fontFamily: 'monospace'
                      }}>
                        {v.formattedSize}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleTriggerDownload}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#000',
                    border: 'none',
                    padding: '12px 20px',
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginTop: 6,
                    boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)'
                  }}
                >
                  <Download size={18} />
                  <span>Start Download ({selectedVariant?.height || variants[0]?.height || 720}p)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
