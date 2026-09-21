import React, { useEffect, useRef, useState } from 'react';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import Hls from 'hls.js';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { Download, X, Calendar, Clock, CheckCircle, Loader2, ArrowLeft, Play, Pause, AlertCircle, RefreshCw } from 'lucide-react';
import { downloadManager, formatBytes, formatSpeed, formatTimeRemaining } from '../services/DownloadManager';

const ImmersiveMode = registerPlugin('ImmersiveMode');

export function formatSeekTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function HlsPlayer({ url, item, user }) {
  const videoRef = useRef(null);
  const wrapperRef = useRef(null);
  const totalWatchTime = useRef(0);
  const lastPlayTime = useRef(null);
  const [offlineUrl, setOfflineUrl] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [skipIndicator, setSkipIndicator] = useState(null);
  const [seekPreview, setSeekPreview] = useState(null);
  const previewVideoRef = useRef(null);

  useEffect(() => {
    const checkOffline = async () => {
      try {
        const m3u8Path = `downloads/${item.id}/index.m3u8`;
        const stat = await Filesystem.stat({ path: m3u8Path, directory: Directory.Data });
        if (stat) {
          const uriInfo = await Filesystem.getUri({ path: m3u8Path, directory: Directory.Data });
          setOfflineUrl(Capacitor.convertFileSrc(uriInfo.uri));
          setIsReady(true);
          return;
        }
      } catch (e) {}

      try {
        const mp4Path = `downloads/${item.id}/video.mp4`;
        const statMp4 = await Filesystem.stat({ path: mp4Path, directory: Directory.Data });
        if (statMp4) {
          const uriInfo = await Filesystem.getUri({ path: mp4Path, directory: Directory.Data });
          setOfflineUrl(Capacitor.convertFileSrc(uriInfo.uri));
          setIsReady(true);
          return;
        }
      } catch (e) {}

      setIsReady(true);
    };
    checkOffline();
  }, [item.id]);

  useEffect(() => {
    if (!isReady) return;

    if (Capacitor.isNativePlatform()) {
      PrivacyScreen.enable().catch(console.error);
    }

    const video = videoRef.current;
    const wrapper = wrapperRef.current;
    if (!video || !wrapper) return;

    const finalUrl = offlineUrl || url;
    const storageKey = item.id ? `lecture_pos_${item.id}` : null;
    let saveInterval = null;

    const restorePosition = () => {
      if (!storageKey) return;
      const saved = parseFloat(localStorage.getItem(storageKey));
      if (saved && saved > 0 && isFinite(saved)) {
        video.currentTime = saved;
      }
    };

    const savePosition = () => {
      if (!storageKey || !video || (video.paused && video.currentTime === 0)) return;
      if (video.currentTime > 0 && isFinite(video.currentTime)) {
        localStorage.setItem(storageKey, video.currentTime.toString());
      }
    };

    saveInterval = setInterval(savePosition, 3000);
    video.addEventListener('pause', savePosition);

    const handlePlayTime = () => { lastPlayTime.current = Date.now(); };
    const handlePauseTime = () => {
      if (lastPlayTime.current) {
        totalWatchTime.current += (Date.now() - lastPlayTime.current);
        lastPlayTime.current = null;
      }
    };
    video.addEventListener('play', handlePlayTime);
    video.addEventListener('pause', handlePauseTime);

    let hls;
    let player;

    const defaultOptions = {
      clickToPlay: false,
      controls: ['play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'pip', 'airplay', 'fullscreen'],
      keyboard: { focused: true, global: true }
    };

    let qualityLevels = [];
    let qualityLabels = {};
    let hlsRef = null;

    let pauseHideTimer = null;
    const PAUSE_HIDE_DELAY = 5000;

    const showControls = () => {
      if (player && player.elements && player.elements.container) {
        player.elements.container.classList.remove('plyr--hide-controls-paused');
      }
    };

    const scheduleHideOnPause = () => {
      clearTimeout(pauseHideTimer);
      if (video.paused && player && player.elements && player.elements.container) {
        pauseHideTimer = setTimeout(() => {
          if (video.paused) player.elements.container.classList.add('plyr--hide-controls-paused');
        }, PAUSE_HIDE_DELAY);
      }
    };

    const onPauseHide = () => {
      showControls();
      scheduleHideOnPause();
    };

    const onPlayShow = () => {
      clearTimeout(pauseHideTimer);
      showControls();
    };

    const onMouseMoveWhilePaused = () => {
      if (video.paused) {
        showControls();
        scheduleHideOnPause();
      }
    };

    let skipIndicatorKey = 0;
    const showSkipIndicator = (side, seconds) => {
      skipIndicatorKey++;
      setSkipIndicator({ side, seconds, key: skipIndicatorKey });
    };

    const handleKeyboardSkip = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      e.stopPropagation();
      const skipAmount = 5;
      if (e.key === 'ArrowRight') {
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + skipAmount);
        showSkipIndicator('right', skipAmount);
      } else if (e.key === 'ArrowLeft') {
        video.currentTime = Math.max(0, video.currentTime - skipAmount);
        showSkipIndicator('left', skipAmount);
      }
      if (video.paused) {
        showControls();
        scheduleHideOnPause();
      }
    };

    let lastTapTime = 0;
    let lastTapSide = null;
    let lastTapType = null;
    let singleTapTimer = null;

    const handleDoubleTapSkip = (e) => {
      if (e.target.closest('.plyr__controls') || e.target.closest('.custom-settings-container')) return;
      const now = Date.now();
      if (e.type === 'click' && lastTapType === 'touchend' && (now - lastTapTime) < 500) return;
      
      const rect = wrapper.getBoundingClientRect();
      let clientX = e.clientX;
      if (e.changedTouches && e.changedTouches.length > 0) clientX = e.changedTouches[0].clientX;
      else if (e.touches && e.touches.length > 0) clientX = e.touches[0].clientX;
      const x = (clientX || 0) - rect.left;
      const side = x < rect.width / 2 ? 'left' : 'right';

      if (now - lastTapTime < 400 && lastTapSide === side) {
        clearTimeout(singleTapTimer);
        e.preventDefault();
        e.stopPropagation();
        const skipAmount = 5;
        if (side === 'right') {
          video.currentTime = Math.min(video.duration || Infinity, video.currentTime + skipAmount);
          showSkipIndicator('right', skipAmount);
        } else {
          video.currentTime = Math.max(0, video.currentTime - skipAmount);
          showSkipIndicator('left', skipAmount);
        }
        lastTapTime = 0;
        lastTapSide = null;
        lastTapType = null;
        if (video.paused) {
          showControls();
          scheduleHideOnPause();
        }
      } else {
        lastTapTime = now;
        lastTapSide = side;
        lastTapType = e.type;
        singleTapTimer = setTimeout(() => {
          lastTapTime = 0;
          lastTapSide = null;
          lastTapType = null;
          if (video.paused) video.play();
          else video.pause();
        }, 400);
      }
    };

    const setupPlayerFeatures = (plyrInstance) => {
      setTimeout(() => {
        if (plyrInstance && plyrInstance.elements.container) plyrInstance.elements.container.focus();
        else if (video) video.focus();
      }, 100);

      plyrInstance.on('enterfullscreen', () => {
        if (Capacitor.isNativePlatform()) {
          try {
            ImmersiveMode.enter().catch(() => {});
            ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {});
          } catch (e) {}
        } else if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
          window.screen.orientation.lock('landscape').catch(e => console.log('Orientation lock failed:', e));
        }
      });
      plyrInstance.on('exitfullscreen', () => {
        if (Capacitor.isNativePlatform()) {
          try {
            ImmersiveMode.exit().catch(() => {});
            ScreenOrientation.unlock().catch(() => {});
          } catch (e) {}
        } else if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
          window.screen.orientation.unlock();
        }
      });

      document.addEventListener('keydown', handleKeyboardSkip, true);
      if (plyrInstance.elements.container) {
        plyrInstance.elements.container.addEventListener('click', handleDoubleTapSkip);
        plyrInstance.elements.container.addEventListener('touchend', handleDoubleTapSkip);
      }

      video.addEventListener('pause', onPauseHide);
      video.addEventListener('play', onPlayShow);
      if (plyrInstance.elements.container) {
        plyrInstance.elements.container.addEventListener('mousemove', onMouseMoveWhilePaused);
        plyrInstance.elements.container.addEventListener('touchstart', onMouseMoveWhilePaused);

        // YouTube-style frame preview on scrub / hover
        const progressEl = plyrInstance.elements.container.querySelector('.plyr__progress');
        if (progressEl) {
          const onScrubMove = (e) => {
            const rect = progressEl.getBoundingClientRect();
            const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
            if (clientX < rect.left || clientX > rect.right) {
              setSeekPreview(null);
              return;
            }
            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const dur = video.duration || item.duration || 0;
            const targetTime = ratio * dur;

            const wrapRect = wrapper.getBoundingClientRect();
            const relX = clientX - wrapRect.left;

            setSeekPreview({
              time: targetTime,
              x: Math.max(80, Math.min(wrapRect.width - 80, relX))
            });

            if (previewVideoRef.current) {
              try {
                if (previewVideoRef.current.fastSeek) {
                  previewVideoRef.current.fastSeek(targetTime);
                } else {
                  previewVideoRef.current.currentTime = targetTime;
                }
              } catch (err) {}
            }
          };

          const onScrubLeave = () => {
            setSeekPreview(null);
          };

          progressEl.addEventListener('mousemove', onScrubMove);
          progressEl.addEventListener('touchmove', onScrubMove);
          progressEl.addEventListener('mouseleave', onScrubLeave);
          progressEl.addEventListener('touchend', onScrubLeave);
        }
      }

      setTimeout(() => {
        if (!plyrInstance.elements.controls) return;
        if (plyrInstance.elements.controls.querySelector('.custom-settings-container')) return;

        let qualityHTML = '';
        const savedQuality = parseInt(localStorage.getItem('global_quality') || '0');
        const activeQuality = qualityLevels.includes(savedQuality) ? savedQuality : 0;
        if (qualityLevels.length > 0) {
          const qualityBtnsHTML = qualityLevels.map((q) =>
            `<button class="quality-option${q === activeQuality ? ' active' : ''}" data-quality="${q}">${qualityLabels[q] || q}</button>`
          ).join('');
          qualityHTML = `
            <div class="settings-section">
              <div class="settings-section-title">Quality</div>
              <div class="quality-options">${qualityBtnsHTML}</div>
            </div>
          `;
        }

        const settingsHTML = `
          <div class="custom-settings-container">
            <button class="plyr__controls__item plyr__control custom-settings-btn" type="button">
              <svg role="presentation" focusable="false" style="width: 18px; height: 18px; fill: currentColor;"><use href="#plyr-settings"></use></svg>
            </button>
            <div class="custom-settings-popup">
              <div class="settings-section">
                <div class="settings-section-title">Speed: <span class="speed-label">1.0x</span></div>
                <input type="range" min="0.5" max="4" step="0.25" value="1" class="speed-slider" />
              </div>
              ${qualityHTML}
            </div>
          </div>
        `;

        const template = document.createElement('template');
        template.innerHTML = settingsHTML.trim();
        const container = template.content.firstChild;

        const btn = container.querySelector('.custom-settings-btn');
        const popup = container.querySelector('.custom-settings-popup');
        const slider = container.querySelector('.speed-slider');
        const speedLabel = container.querySelector('.speed-label');

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          popup.classList.toggle('visible');
        });

        document.addEventListener('click', (e) => {
          if (!container.contains(e.target)) {
            popup.classList.remove('visible');
          }
        });

        slider.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          speedLabel.textContent = val.toFixed(1) + 'x';
          plyrInstance.speed = val;
        });

        plyrInstance.on('ratechange', () => {
          const val = plyrInstance.speed;
          slider.value = val;
          speedLabel.textContent = val.toFixed(1) + 'x';
        });

        if (hlsRef) {
          const qualityBtns = container.querySelectorAll('.quality-option');
          if (activeQuality !== 0) {
            const idx = hlsRef.levels.findIndex((l) => l._plyrId === activeQuality || l.height === activeQuality);
            if (idx !== -1) hlsRef.currentLevel = idx;
          }

          qualityBtns.forEach((qBtn) => {
            qBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const qVal = parseInt(qBtn.dataset.quality);
              qualityBtns.forEach((b) => b.classList.remove('active'));
              qBtn.classList.add('active');
              localStorage.setItem('global_quality', qVal.toString());
              if (qVal === 0) {
                hlsRef.currentLevel = -1;
              } else {
                const idx = hlsRef.levels.findIndex((l) => l._plyrId === qVal || l.height === qVal);
                if (idx !== -1) hlsRef.currentLevel = idx;
              }
            });
          });
        }

        const fullscreenBtn = plyrInstance.elements.controls.querySelector('[data-plyr="fullscreen"]');
        if (fullscreenBtn) {
          fullscreenBtn.parentNode.insertBefore(container, fullscreenBtn);
        } else {
          plyrInstance.elements.controls.appendChild(container);
        }
      }, 500);
    };

    if (Hls.isSupported() && finalUrl.includes('.m3u8')) {
      hls = new Hls({ debug: false });
      hls.loadSource(finalUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        const levels = data.levels || hls.levels || [];
        hlsRef = hls;
        const opts = [0];
        const labels = { 0: 'Auto' };
        levels.forEach((level, index) => {
          let id = level.height && level.height > 0 ? level.height : null;
          let label = level.name || (level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1024)} kbps`);
          if (!id || opts.includes(id)) {
            id = id ? id + index + 1 : (Math.round(level.bitrate / 1024) || index + 1);
          }
          if (!opts.includes(id)) {
            opts.push(id);
            labels[id] = label;
          }
          level._plyrId = id;
        });
        qualityLevels = [0, ...opts.slice(1).sort((a, b) => b - a)];
        qualityLabels = labels;
        player = new Plyr(video, defaultOptions);
        restorePosition();
        video.play().catch(e => console.error("Auto-play blocked", e));
        setupPlayerFeatures(player);
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data);
      });
    } else {
      video.src = finalUrl;
      video.addEventListener('loadedmetadata', () => {
        player = new Plyr(video, defaultOptions);
        restorePosition();
        video.play().catch(e => console.error("Auto-play blocked", e));
        setupPlayerFeatures(player);
      });
    }

    return () => {
      savePosition();
      handlePauseTime();
      clearInterval(saveInterval);
      clearTimeout(pauseHideTimer);
      
      if (totalWatchTime.current > 1000 && user) {
        const watchDurationSecs = Math.floor(totalWatchTime.current / 1000);
        addDoc(collection(db, 'students', user.id, 'logs'), {
          type: 'watch',
          videoId: item.id || '',
          videoTitle: item.title || 'Unknown Video',
          durationSecs: watchDurationSecs,
          timestamp: new Date().toISOString()
        }).catch(console.error);
      }

      video.removeEventListener('pause', savePosition);
      video.removeEventListener('pause', onPauseHide);
      video.removeEventListener('play', onPlayShow);
      video.removeEventListener('play', handlePlayTime);
      video.removeEventListener('pause', handlePauseTime);
      document.removeEventListener('keydown', handleKeyboardSkip, true);
      
      if (player && player.elements && player.elements.container) {
        player.elements.container.removeEventListener('click', handleDoubleTapSkip);
        player.elements.container.removeEventListener('touchend', handleDoubleTapSkip);
        player.elements.container.removeEventListener('mousemove', onMouseMoveWhilePaused);
        player.elements.container.removeEventListener('touchstart', onMouseMoveWhilePaused);
      }
      
      if (hls) hls.destroy();
      if (player) player.destroy();

      if (Capacitor.isNativePlatform()) {
        PrivacyScreen.disable().catch(console.error);
        try {
          ImmersiveMode.exit().catch(() => {});
          ScreenOrientation.unlock().catch(() => {});
        } catch (e) {}
      }
    };
  }, [isReady, offlineUrl, url, item, user]);

  if (!isReady) return <div style={{height: '100%', background: 'black'}} />;

  return (
    <div ref={wrapperRef} className="hls-player-wrapper" style={{ width: '100%', height: '100%', background: 'black', position: 'relative' }}>
      <video ref={videoRef} playsInline crossOrigin="anonymous" style={{ width: '100%', height: '100%' }} />
      
      {offlineUrl && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(74,222,128,0.2)', color: '#4ade80', padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 'bold', zIndex: 50, display: 'flex', alignItems: 'center', gap: 4 }}>
          <CheckCircle size={14} /> PLAYING OFFLINE
        </div>
      )}

      {/* Skip indicator overlays */}
      {skipIndicator && (
        <React.Fragment key={skipIndicator.key}>
          <div className={`skip-ripple-zone skip-ripple-${skipIndicator.side}`}>
            <div className="skip-ripple-circle" />
            <div className="skip-ripple-content">
              <svg className="skip-arrow-icon" viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                {skipIndicator.side === 'right' ? (
                  <>
                    <polygon points="4,4 12,12 4,20" opacity="0.5" />
                    <polygon points="12,4 20,12 12,20" />
                  </>
                ) : (
                  <>
                    <polygon points="20,4 12,12 20,20" opacity="0.5" />
                    <polygon points="12,4 4,12 12,20" />
                  </>
                )}
              </svg>
              <span className="skip-seconds-label">{skipIndicator.seconds} seconds</span>
            </div>
          </div>
        </React.Fragment>
      )}

      {/* YouTube-Style Seek Preview Tooltip */}
      {seekPreview && (
        <div 
          className="seek-preview-tooltip"
          style={{ left: `${seekPreview.x}px` }}
        >
          <div className="seek-preview-frame">
            <video 
              ref={previewVideoRef} 
              src={offlineUrl || url} 
              muted 
              playsInline 
              preload="auto" 
              className="seek-preview-video"
            />
          </div>
          <div className="seek-preview-time">
            {formatSeekTime(seekPreview.time)}
          </div>
        </div>
      )}
    </div>
  );
}

function VideoDownloader({ url, item, user }) {
  const [mgrState, setMgrState] = useState(downloadManager.getState());
  const [isSavedOnDevice, setIsSavedOnDevice] = useState(false);
  const [viewState, setViewState] = useState('idle'); // idle | analyzing | selecting | error
  const [variants, setVariants] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState({ completed: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState('');

  // Subscribe to central download manager
  useEffect(() => {
    return downloadManager.subscribe(setMgrState);
  }, []);

  // Check if downloaded on disk
  useEffect(() => {
    const checkDisk = async () => {
      try {
        const stat = await Filesystem.stat({ path: `downloads/${item.id}/index.m3u8`, directory: Directory.Data });
        if (stat) { setIsSavedOnDevice(true); return; }
      } catch (e) {}
      try {
        const statMp4 = await Filesystem.stat({ path: `downloads/${item.id}/video.mp4`, directory: Directory.Data });
        if (statMp4) { setIsSavedOnDevice(true); return; }
      } catch (e) {}
      setIsSavedOnDevice(false);
    };
    checkDisk();
  }, [item.id, mgrState]);

  // Find active task or queued task
  const activeTask = mgrState.active.find(t => String(t.id) === String(item.id));
  const queuedTask = mgrState.queued.find(q => String(q.item.id) === String(item.id));
  const currentTask = activeTask || (queuedTask ? { ...queuedTask.task.toPublicState(), status: 'queued' } : null);

  // If already downloading or queued in downloadManager:
  if (currentTask) {
    const isPaused = currentTask.status === 'paused';
    const isQueued = currentTask.status === 'queued';

    return (
      <div className="download-active-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isPaused ? '#f59e0b' : '#38bdf8' }}>
            {isQueued ? 'Queued (Waiting for slot)' : isPaused ? 'Download Paused' : `Downloading (${currentTask.quality})`}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>
            {currentTask.formattedDownloaded} / {currentTask.formattedTotal}
          </span>
        </div>

        <div className="download-progress-bar-track">
          <div 
            className="download-progress-bar-fill" 
            style={{ 
              width: `${currentTask.percent}%`,
              background: isPaused ? '#f59e0b' : 'var(--accent)'
            }} 
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: '0.75rem', color: '#9ca3af' }}>
          <div>
            {!isPaused && !isQueued && currentTask.speed && (
              <span>{currentTask.speed} • {currentTask.eta || 'calculating...'}</span>
            )}
            {(isPaused || isQueued) && (
              <span>{isPaused ? 'Paused' : 'Waiting in queue...'}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!isQueued && (
              <button 
                onClick={() => isPaused ? downloadManager.resumeDownload(item.id) : downloadManager.pauseDownload(item.id)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 600 }}
              >
                {isPaused ? <Play size={12} /> : <Pause size={12} />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>
            )}
            <button 
              onClick={() => downloadManager.cancelDownload(item.id)}
              style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#ef4444', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 600 }}
            >
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If saved on device
  if (isSavedOnDevice) {
    return (
      <div className="download-progress-container" style={{ justifyContent: 'space-between' }}>
        <div className="download-progress-text" style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle size={16} /> Saved to Device (Offline Ready)
        </div>
      </div>
    );
  }

  // Analyze sizes (50 concurrent HEAD requests)
  const handleStartAnalysis = async () => {
    setViewState('analyzing');
    setErrorMsg('');
    try {
      const res = await downloadManager.queryAccurateResolutionSizes(
        url,
        item.duration,
        ({ completed, total }) => {
          setAnalysisProgress({ completed, total });
        }
      );
      setVariants(res);
      setSelectedVariant(res[0]);
      setViewState('selecting');
    } catch (err) {
      console.error('Failed to query resolution sizes:', err);
      setErrorMsg('Failed to query resolutions. Try again.');
      setViewState('error');
    }
  };

  if (viewState === 'analyzing') {
    return (
      <div className="download-progress-container" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.825rem', color: 'var(--accent)', fontWeight: 600 }}>
          <Loader2 size={16} className="spin-icon" />
          <span>Calculating download sizes...</span>
        </div>
        {analysisProgress.total > 0 && (
          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            Checking available resolutions ({Math.round((analysisProgress.completed / Math.max(1, analysisProgress.total)) * 100)}%)...
          </div>
        )}
      </div>
    );
  }

  if (viewState === 'selecting') {
    return (
      <div className="download-progress-container" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '12px 14px' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f3f4f6' }}>
          Select Resolution to Download:
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {variants.map(v => (
            <button
              key={v.height}
              onClick={() => setSelectedVariant(v)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: selectedVariant?.height === v.height ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                background: selectedVariant?.height === v.height ? 'rgba(245, 158, 11, 0.2)' : '#1a1a1a',
                color: selectedVariant?.height === v.height ? 'var(--accent)' : '#9ca3af',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>{v.height}p</span>
              <span style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 500 }}>
                • {v.formattedSize}
              </span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button 
            className="yt-download-btn"
            style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            onClick={() => {
              downloadManager.enqueueDownload(item, selectedVariant || variants[0]);
              setViewState('idle');
              if (user) {
                addDoc(collection(db, 'students', user.id, 'logs'), {
                  type: 'download',
                  videoId: item.id || '',
                  videoTitle: item.title || 'Unknown Video',
                  quality: `${(selectedVariant || variants[0]).height}p`,
                  timestamp: new Date().toISOString()
                }).catch(console.error);
              }
            }}
          >
            Start Download
          </button>
          <button 
            onClick={() => setViewState('idle')}
            style={{ background: 'transparent', border: '1px solid var(--border-color)', color: '#9ca3af', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (viewState === 'error') {
    return (
      <div className="download-progress-container">
        <div className="download-progress-text" style={{ color: 'var(--danger)' }}>
          {errorMsg}
        </div>
        <button 
          onClick={handleStartAnalysis}
          style={{ background: 'var(--accent)', color: '#000', border: 'none', padding: '3px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Idle state
  return (
    <button className="yt-download-btn" onClick={handleStartAnalysis}>
      <Download size={18} /> Download Lecture
    </button>
  );
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const VideoPlayer = ({ item, onClose, user }) => {
  useEffect(() => {
    if (item.type === 'pdf' && Capacitor.isNativePlatform()) {
      // Explicitly allow screenshots on PDF files as requested
      PrivacyScreen.disable().catch(console.error);
    }
  }, [item.type]);

  if (item.type === 'pdf') {
    return (
      <div 
        className="viewer-overlay pdf-mode" 
        style={{ 
          position: 'fixed', 
          inset: 0, 
          width: '100vw', 
          height: '100vh', 
          zIndex: 9999, 
          background: '#121212',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div style={{ 
          padding: '10px 16px', 
          background: '#181818', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderBottom: '1px solid #262626',
          width: '100%',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
            <button 
              onClick={onClose}
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: '#f3f4f6', 
                cursor: 'pointer', 
                padding: '6px', 
                display: 'flex', 
                alignItems: 'center', 
                borderRadius: '6px' 
              }}
              title="Go Back"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-sm font-semibold text-white truncate" style={{ margin: 0 }}>
              {item.title}
            </h1>
          </div>
          <button 
            className="flex items-center gap-1.5 bg-[#262626] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#333]" 
            onClick={onClose}
          >
            <X size={16} /> Close
          </button>
        </div>
        <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#202124' }}>
          <iframe 
            src={`https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(item.url)}#zoom=page-width`} 
            style={{ 
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%', 
              height: '100%', 
              minWidth: '100%',
              minHeight: '100%',
              border: 'none', 
              display: 'block' 
            }} 
            title={item.title}
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  return (
    <div className="viewer-overlay video-mode">
      <div className="viewer-content">
        <div className="yt-layout">
          {/* Mobile-friendly top header with Back navigation */}
          <div style={{ 
            padding: '8px 12px', 
            background: '#0e0e0e', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            gap: '8px', 
            borderBottom: '1px solid #222',
            flexShrink: 0
          }}>
            <button 
              onClick={onClose}
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: '#f3f4f6', 
                cursor: 'pointer', 
                padding: '6px', 
                display: 'flex', 
                alignItems: 'center', 
                borderRadius: '6px' 
              }}
              title="Go Back"
            >
              <ArrowLeft size={20} />
            </button>
            <span style={{ 
              fontSize: '0.875rem', 
              fontWeight: 600, 
              color: '#f3f4f6', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis', 
              whiteSpace: 'nowrap',
              flex: 1,
              margin: '0 8px'
            }}>
              {item.title}
            </span>
            <button 
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                color: '#9ca3af',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <X size={14} /> Close
            </button>
          </div>
          <div className="yt-video-section">
            <div className="video-container">
              <HlsPlayer url={item.url} item={item} user={user} />
            </div>
          </div>
          <div className="yt-info-section">
            <h1 className="yt-title">{item.title}</h1>
            <div className="yt-meta">
              {item.created_at && (
                <span className="yt-meta-item">
                  <Calendar size={16} />
                  {formatDate(item.created_at)}
                </span>
              )}
              {item.duration > 0 && (
                <span className="yt-meta-item">
                  <Clock size={16} />
                  {formatDuration(item.duration)}
                </span>
              )}
            </div>
            <div className="yt-actions">
              <VideoDownloader url={item.url} item={item} user={user} />
              <button className="yt-close-btn" onClick={onClose}>
                <X size={18} /> Close Player
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
