import React, { useEffect, useRef, useState } from 'react';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App as CapApp } from '@capacitor/app';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, increment } from 'firebase/firestore';
import Hls from 'hls.js';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { Download, X, Calendar, Clock, CheckCircle, Loader2, ArrowLeft, Play, Pause, AlertCircle, RefreshCw, ExternalLink, Share2, ChevronDown, HardDrive, Smartphone, Check, MoreVertical, Headphones, Bookmark, BookmarkPlus, Trash2, Sparkles, Volume2, Tv } from 'lucide-react';
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

export function convertDownloadUrlToHls(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  if (rawUrl.includes('.m3u8')) return rawUrl;
  
  // Convert NextToppers /download/ or /file_library/videos/download/ to CloudFront HLS
  const match = rawUrl.match(/(?:file_library\/videos\/download|\/download\/)\/(\d+)\/([a-zA-Z0-9_-]+)/);
  if (match) {
    const vdcPrefix = match[1];
    const fileHash = match[2];
    const hashSuffix = fileHash.length >= 7 ? fileHash.slice(-7) : fileHash;
    return `https://dbil3go8szhu6.cloudfront.net/file_library/videos/channel_vod_non_drm_hls/${vdcPrefix}/${fileHash}/${fileHash}_${hashSuffix}.m3u8`;
  }
  return rawUrl;
}

function HlsPlayer({ url, item, user }) {
  const videoRef = useRef(null);
  const wrapperRef = useRef(null);
  const totalWatchTime = useRef(0);
  const lastPlayTime = useRef(null);
  const userRef = useRef(user);
  const itemRef = useRef(item);
  const [offlineUrl, setOfflineUrl] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [skipIndicator, setSkipIndicator] = useState(null);
  const [seekPreview, setSeekPreview] = useState(null);
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const previewVideoRef = useRef(null);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { itemRef.current = item; }, [item]);

  useEffect(() => {
    const handleToggleAudio = (e) => {
      if (e.detail?.toggle !== undefined) {
        setIsAudioOnly(prev => !prev);
      } else if (e.detail?.active !== undefined) {
        setIsAudioOnly(e.detail.active);
      }
    };
    const handleSeek = (e) => {
      if (videoRef.current && typeof e.detail?.time === 'number') {
        videoRef.current.currentTime = e.detail.time;
        videoRef.current.play().catch(() => {});
      }
    };
    window.addEventListener('player:toggle-audio', handleToggleAudio);
    window.addEventListener('player:seek-to', handleSeek);
    return () => {
      window.removeEventListener('player:toggle-audio', handleToggleAudio);
      window.removeEventListener('player:seek-to', handleSeek);
    };
  }, []);

  useEffect(() => {
    const checkOffline = async () => {
      // ── Native path ──────────────────────────────────────────────────────
      if (Capacitor.isNativePlatform()) {
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
        return;
      }

      // ── Web path — use Service Worker /sw-hls/ URL ─────────────────────
      // Check if a sw-playlist URL was stored in the download record
      try {
        const downloaded = JSON.parse(localStorage.getItem('downloaded_lectures') || '[]');
        const record = downloaded.find(d => String(d.id) === String(item.id));
        if (record) {
          // Use sw_index.m3u8 served by SW; fall back to swPlaylistUrl if present
          const swUrl = record.swPlaylistUrl || `/sw-hls/${item.id}/index.m3u8`;
          setOfflineUrl(swUrl);
        }
      } catch (e) {}

      setIsReady(true);
    };
    checkOffline();
  }, [item.id]);


  useEffect(() => {
    if (!isReady) return;

    // Do NOT enable PrivacyScreen during video playback: setting FLAG_SECURE on
    // Android causes hardware MediaCodec video buffer loss ('Null anb' GPU error)
    // and turns the video black/unresponsive after buffer exhaustion (~10s).

    const video = videoRef.current;
    const wrapper = wrapperRef.current;
    if (!video || !wrapper) return;

    const rawTargetUrl = offlineUrl || url;
    const finalUrl = offlineUrl ? offlineUrl : convertDownloadUrlToHls(rawTargetUrl);
    const currentItemId = itemRef.current?.id;
    const storageKey = currentItemId ? `lecture_pos_${currentItemId}` : null;
    let saveInterval = null;

    const restorePosition = () => {
      if (!storageKey) return;
      const saved = parseFloat(localStorage.getItem(storageKey));
      if (saved && saved > 0 && isFinite(saved)) {
        const dur = video.duration || itemRef.current?.duration || 0;
        // If saved position is within 5 seconds of the end, reset to 0
        if (dur > 0 && saved >= dur - 5) {
          localStorage.removeItem(storageKey);
          return;
        }
        video.currentTime = saved;
      }
    };

    const savePosition = () => {
      if (!storageKey || !video || (video.paused && video.currentTime === 0)) return;
      if (video.currentTime > 0 && isFinite(video.currentTime)) {
        try {
          const curItem = itemRef.current;
          if (curItem) {
            const rawHidden = localStorage.getItem('hidden_watch_history');
            const hiddenList = rawHidden ? JSON.parse(rawHidden) : [];
            const curId = String(curItem.id || '');
            const cleanId = curId.replace(/[./#[\]$]/g, '_');
            if (hiddenList.includes(curId) || hiddenList.includes(cleanId)) {
              return;
            }
          }
        } catch (_) {}

        localStorage.setItem(storageKey, video.currentTime.toString());
        try {
          const curItem = itemRef.current;
          if (curItem) {
            const rawRecents = localStorage.getItem('recent_watched_lectures');
            const recents = rawRecents ? JSON.parse(rawRecents) : [];
            const filtered = recents.filter(r => String(r.id) !== String(curItem.id));
            const entry = {
              id: curItem.id,
              title: curItem.title || 'Video Lecture',
              type: 'video',
              url: curItem.url,
              duration: video.duration || curItem.duration || 0,
              thumbnail: curItem.thumbnail || '',
              subject_name: curItem.subject_name || curItem.subjectName || '',
              lastPosition: video.currentTime,
              lastWatched: new Date().toISOString()
            };
            localStorage.setItem('recent_watched_lectures', JSON.stringify([entry, ...filtered].slice(0, 30)));
          }
        } catch (_) {}
      }
    };

    // ── Screen WakeLock during video playback ──
    let wakeLockSentinel = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && !wakeLockSentinel) {
          wakeLockSentinel = await navigator.wakeLock.request('screen');
          wakeLockSentinel.addEventListener('release', () => {
            wakeLockSentinel = null;
          });
        }
      } catch (err) {}
    };

    const releaseWakeLock = () => {
      try {
        if (wakeLockSentinel) {
          wakeLockSentinel.release().catch(() => {});
          wakeLockSentinel = null;
        }
      } catch (err) {}
    };

    // ── Native App State Listener (auto-pause on background / incoming call) ──
    let appStateSub = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive && video && !video.paused) {
          video.pause();
          savePosition();
          releaseWakeLock();
        }
      }).then(sub => { appStateSub = sub; }).catch(() => {});
    }

    saveInterval = setInterval(savePosition, 3000);
    video.addEventListener('pause', savePosition);

    const handlePlayTime = () => { 
      lastPlayTime.current = Date.now();
      requestWakeLock();
    };
    const handlePauseTime = () => {
      releaseWakeLock();
      if (lastPlayTime.current) {
        totalWatchTime.current += (Date.now() - lastPlayTime.current);
        lastPlayTime.current = null;
      }
    };
    const handleEnded = () => {
      if (storageKey) {
        localStorage.removeItem(storageKey);
      }
      releaseWakeLock();
      flushWatchTime();
    };

    video.addEventListener('play', handlePlayTime);
    video.addEventListener('pause', handlePauseTime);
    video.addEventListener('ended', handleEnded);

    let hls;
    let player;

    const savedSpeed = parseFloat(localStorage.getItem('app_playback_speed')) || 1;
    const defaultOptions = {
      clickToPlay: false,
      controls: ['play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
      settings: ['speed', 'quality'],
      speed: { selected: savedSpeed, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
      keyboard: { focused: true, global: true },
      fullscreen: { enabled: true, fallback: true, iosNative: false }
    };

    let qualityLevels = [];
    let qualityLabels = {};
    let hlsRef = null;
    let handleDocFullscreenChange = null;

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
      // 1. Persistent Playback Speed
      const applySpeed = () => {
        const curSpeed = parseFloat(localStorage.getItem('app_playback_speed')) || savedSpeed;
        if (plyrInstance && plyrInstance.speed !== curSpeed) {
          try { plyrInstance.speed = curSpeed; } catch (_) {}
        }
        if (video && video.playbackRate !== curSpeed) {
          try { video.playbackRate = curSpeed; } catch (_) {}
        }
      };

      try {
        applySpeed();
        plyrInstance.on('ratechange', () => {
          if (plyrInstance.speed) {
            localStorage.setItem('app_playback_speed', plyrInstance.speed.toString());
            if (video && video.playbackRate !== plyrInstance.speed) {
              video.playbackRate = plyrInstance.speed;
            }
          }
        });
        video.addEventListener('loadedmetadata', applySpeed);
        video.addEventListener('canplay', applySpeed);
        video.addEventListener('play', applySpeed);
      } catch (_) {}

      // 2. MediaSession API (Background Audio & Lockscreen Controls)
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: itemRef.current?.title || 'Video Lecture',
            artist: 'NextBridge',
            album: itemRef.current?.subject_name || itemRef.current?.subjectName || 'NextBridge Lecture',
            artwork: itemRef.current?.thumbnail ? [{ src: itemRef.current.thumbnail, sizes: '512x512', type: 'image/jpeg' }] : []
          });

          navigator.mediaSession.setActionHandler('play', () => video.play().catch(() => {}));
          navigator.mediaSession.setActionHandler('pause', () => video.pause());
          navigator.mediaSession.setActionHandler('seekbackward', (details) => {
            const skip = details.seekOffset || 10;
            video.currentTime = Math.max(0, video.currentTime - skip);
          });
          navigator.mediaSession.setActionHandler('seekforward', (details) => {
            const skip = details.seekOffset || 10;
            video.currentTime = Math.min(video.duration || Infinity, video.currentTime + skip);
          });
          navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime !== undefined) video.currentTime = details.seekTime;
          });
        } catch (_) {}
      }

      setTimeout(() => {
        if (plyrInstance && plyrInstance.elements.container) plyrInstance.elements.container.focus();
        else if (video) video.focus();
      }, 100);

      const onEnterFullscreen = () => {
        if (Capacitor.isNativePlatform()) {
          try {
            ImmersiveMode.enter().catch(() => {});
            ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {});
          } catch (e) {}
        } else if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
          window.screen.orientation.lock('landscape').catch(e => console.log('Orientation lock failed:', e));
        }
      };

      const onExitFullscreen = () => {
        if (Capacitor.isNativePlatform()) {
          try {
            ImmersiveMode.exit().catch(() => {});
            ScreenOrientation.unlock().catch(() => {});
          } catch (e) {}
        } else if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
          window.screen.orientation.unlock();
        }
      };

      plyrInstance.on('enterfullscreen', onEnterFullscreen);
      plyrInstance.on('exitfullscreen', onExitFullscreen);

      handleDocFullscreenChange = () => {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || (plyrInstance && plyrInstance.fullscreen && plyrInstance.fullscreen.active));
        if (isFs) onEnterFullscreen();
        else onExitFullscreen();
      };

      document.addEventListener('fullscreenchange', handleDocFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleDocFullscreenChange);

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
                <div class="settings-section-title">Speed: <span class="speed-label">${savedSpeed.toFixed(1)}x</span></div>
                <input type="range" min="0.5" max="4" step="0.25" value="${savedSpeed}" class="speed-slider" />
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
          if (video) video.playbackRate = val;
          localStorage.setItem('app_playback_speed', val.toString());
        });

        plyrInstance.on('ratechange', () => {
          const val = plyrInstance.speed;
          slider.value = val;
          speedLabel.textContent = val.toFixed(1) + 'x';
          localStorage.setItem('app_playback_speed', val.toString());
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
      hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 15,
        maxMaxBufferLength: 30,
        maxBufferSize: 30 * 1024 * 1024,
        maxBufferHole: 0.5,
      });
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
        console.warn('HLS Error event:', data.type, data.details, data.fatal);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('HLS Fatal Network Error, attempting reload...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('HLS Fatal Media Error, attempting recovery...');
              hls.recoverMediaError();
              break;
            default:
              console.error('HLS Unrecoverable Fatal Error:', data);
              hls.destroy();
              break;
          }
        }
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

    const flushWatchTime = () => {
      handlePauseTime();
      if (lastPlayTime.current === null && video && !video.paused) {
        lastPlayTime.current = Date.now();
      }
      const pendingMs = totalWatchTime.current;
      const currentUser = userRef.current;
      const currentItem = itemRef.current;
      if (pendingMs >= 3000) {
        totalWatchTime.current = 0;
        const durationSecs = Math.floor(pendingMs / 1000);
        const cleanVidId = String(currentItem?.id || 'vid_' + Math.random().toString(36).slice(2, 8)).replace(/[./#[\]$]/g, '_');
        const todayKey = new Date().toISOString().slice(0, 10);

        try {
          const rawDaily = localStorage.getItem('local_daily_video_time');
          const localDaily = rawDaily ? JSON.parse(rawDaily) : {};
          localDaily[todayKey] = (localDaily[todayKey] || 0) + durationSecs;
          localStorage.setItem('local_daily_video_time', JSON.stringify(localDaily));

          const rawStats = localStorage.getItem('local_video_stats');
          const localStats = rawStats ? JSON.parse(rawStats) : {};
          if (!localStats[cleanVidId]) {
            localStats[cleanVidId] = {
              id: currentItem?.id,
              title: currentItem?.title || 'Unknown Video',
              subjectName: currentItem?.subject_name || currentItem?.subjectName || '',
              watchTimeSecs: 0,
              duration: video?.duration || currentItem?.duration || 0,
              thumbnail: currentItem?.thumbnail || '',
              url: currentItem?.url || '',
              lastWatched: new Date().toISOString()
            };
          }
          localStats[cleanVidId].watchTimeSecs = (localStats[cleanVidId].watchTimeSecs || 0) + durationSecs;
          localStats[cleanVidId].lastWatched = new Date().toISOString();
          if (video?.duration) localStats[cleanVidId].duration = video.duration;
          localStorage.setItem('local_video_stats', JSON.stringify(localStats));
        } catch (_) {}

        if (currentUser?.id) {
          addDoc(collection(db, 'students', currentUser.id, 'logs'), {
            type: 'watch',
            videoId: currentItem?.id || '',
            videoTitle: currentItem?.title || 'Unknown Video',
            subjectName: currentItem?.subject_name || currentItem?.subjectName || '',
            durationSecs: durationSecs,
            timestamp: new Date().toISOString()
          }).catch(() => {});

          updateDoc(doc(db, 'students', currentUser.id), {
            totalVideoTime: increment(durationSecs),
            lastActive: new Date().toISOString(),
            [`dailyVideoTime.${todayKey}`]: increment(durationSecs),
            [`videoStats.${cleanVidId}.title`]: currentItem?.title || 'Unknown Video',
            [`videoStats.${cleanVidId}.subjectName`]: currentItem?.subject_name || currentItem?.subjectName || '',
            [`videoStats.${cleanVidId}.watchTimeSecs`]: increment(durationSecs),
            [`videoStats.${cleanVidId}.lastWatched`]: new Date().toISOString(),
            [`videoStats.${cleanVidId}.playCount`]: increment(1)
          }).catch(() => {});
        }
      }
    };

    const watchSyncInterval = setInterval(() => {
      if (video && !video.paused) {
        flushWatchTime();
      }
    }, 30000);

    const notifyNativePlaying = (playing) => {
      if (Capacitor.isNativePlatform()) {
        try {
          ImmersiveMode.setVideoPlaying({ playing }).catch(() => {});
        } catch (_) {}
      }
    };
    const onNativePlay = () => notifyNativePlaying(true);
    const onNativePause = () => notifyNativePlaying(false);
    video.addEventListener('play', onNativePlay);
    video.addEventListener('pause', onNativePause);
    video.addEventListener('ended', onNativePause);

    return () => {
      savePosition();
      clearInterval(saveInterval);
      clearInterval(watchSyncInterval);
      clearTimeout(pauseHideTimer);
      releaseWakeLock();
      if (appStateSub) {
        appStateSub.remove();
      }
      video.removeEventListener('play', onNativePlay);
      video.removeEventListener('pause', onNativePause);
      video.removeEventListener('ended', onNativePause);
      notifyNativePlaying(false);
      video.removeEventListener('pause', savePosition);
      video.removeEventListener('pause', onPauseHide);
      video.removeEventListener('play', onPlayShow);
      video.removeEventListener('play', handlePlayTime);
      video.removeEventListener('pause', handlePauseTime);
      video.removeEventListener('ended', handleEnded);
      document.removeEventListener('keydown', handleKeyboardSkip, true);
      if (handleDocFullscreenChange) {
        document.removeEventListener('fullscreenchange', handleDocFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleDocFullscreenChange);
      }
      
      if (player && player.elements && player.elements.container) {
        player.elements.container.removeEventListener('click', handleDoubleTapSkip);
        player.elements.container.removeEventListener('touchend', handleDoubleTapSkip);
        player.elements.container.removeEventListener('mousemove', onMouseMoveWhilePaused);
        player.elements.container.removeEventListener('touchstart', onMouseMoveWhilePaused);
      }
      
      if (hls) hls.destroy();
      if (player) player.destroy();

      if (Capacitor.isNativePlatform()) {
        try {
          ImmersiveMode.exit().catch(() => {});
          ScreenOrientation.unlock().catch(() => {});
        } catch (e) {}
      }
    };
  }, [isReady, offlineUrl, url]);

  if (!isReady) return <div style={{height: '100%', background: 'black'}} />;

  const isDesktopHover = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !Capacitor.isNativePlatform();

  return (
    <div ref={wrapperRef} className="hls-player-wrapper" style={{ width: '100%', height: '100%', background: 'black', position: 'relative' }}>
      <video ref={videoRef} playsInline crossOrigin="anonymous" style={{ width: '100%', height: '100%', display: isAudioOnly ? 'none' : 'block' }} />

      {isAudioOnly && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, #18181b 0%, #09090b 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          zIndex: 10
        }}>
          <div style={{
            width: 76,
            height: 76,
            borderRadius: '50%',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '2px solid rgba(245, 158, 11, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '14px',
            boxShadow: '0 0 25px rgba(245, 158, 11, 0.2)'
          }}>
            <Headphones size={36} className="text-[#f59e0b] animate-pulse" />
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#f3f4f6', margin: '0 0 6px 0', maxWidth: '320px' }}>
            {item.title}
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0 0 14px 0' }}>
            {item.subject_name || item.subjectName || 'Lecture'} • Background Audio Active
          </p>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.72rem',
            color: '#10b981',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            padding: '4px 10px',
            borderRadius: '12px'
          }}>
            <Sparkles size={12} />
            <span>Battery & Data Saver Mode</span>
          </div>
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
          {isDesktopHover && (
            <div className="seek-preview-frame">
              <video 
                ref={previewVideoRef} 
                src={finalUrl} 
                muted 
                playsInline 
                preload="metadata" 
                className="seek-preview-video"
              />
            </div>
          )}
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
    const percent = analysisProgress.total > 0 
      ? Math.min(100, Math.round((analysisProgress.completed / analysisProgress.total) * 100))
      : 0;

    return (
      <div className="download-progress-container" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.825rem', color: 'var(--accent)', fontWeight: 600 }}>
            <Loader2 size={16} className="spin-icon" />
            <span>Calculating download sizes...</span>
          </div>
          {analysisProgress.total > 0 && (
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)' }}>
              {percent}%
            </span>
          )}
        </div>
        {analysisProgress.total > 0 && (
          <div style={{ width: '100%', marginTop: 2 }}>
            <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
              <div 
                style={{ 
                  width: `${percent}%`, 
                  height: '100%', 
                  background: 'var(--accent)', 
                  transition: 'width 0.15s ease-out' 
                }} 
              />
            </div>
            <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span>Analyzing all quality streams</span>
              <span>{analysisProgress.completed} / {analysisProgress.total}</span>
            </div>
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
  const [isPdfDownloaded, setIsPdfDownloaded] = useState(() => downloadManager.isDownloaded(item.id));
  const [isPdfDownloading, setIsPdfDownloading] = useState(() => downloadManager.isDownloading(item.id));
  const [pdfDownloadError, setPdfDownloadError] = useState('');
  const [resolvedPdfUrl, setResolvedPdfUrl] = useState(item.url || '');
  const [showPdfDownloadMenu, setShowPdfDownloadMenu] = useState(false);
  const [pdfActionToast, setPdfActionToast] = useState('');
  const [isSavingToDevice, setIsSavingToDevice] = useState(false);
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [isAudioOnlyMode, setIsAudioOnlyMode] = useState(false);
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

  const handleToggleHistoryHide = () => {
    try {
      const rawId = item?.id != null ? String(item.id) : '';
      const cleanId = rawId.replace(/[./#[\]$]/g, '_');
      const rawHidden = localStorage.getItem('hidden_watch_history');
      const hiddenList = rawHidden ? JSON.parse(rawHidden) : [];
      const alreadyHidden = hiddenList.includes(rawId) || hiddenList.includes(cleanId);

      if (alreadyHidden) {
        const filtered = hiddenList.filter(id => id !== rawId && id !== cleanId);
        localStorage.setItem('hidden_watch_history', JSON.stringify(filtered));
        setIsHistoryHidden(false);
        showToast('Restored to watch history');
      } else {
        const nextHidden = Array.from(new Set([...hiddenList, rawId, cleanId].filter(Boolean)));
        localStorage.setItem('hidden_watch_history', JSON.stringify(nextHidden));

        const rawRecents = localStorage.getItem('recent_watched_lectures');
        if (rawRecents) {
          const recents = JSON.parse(rawRecents);
          const filtered = recents.filter(r => {
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

  const [isInPip, setIsInPip] = useState(false);

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
      const v = document.querySelector('.video-container video') || document.querySelector('video');
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

  // PDF Download & Device Export Permissions (Default: true)
  const allowPdfDownload = user?.allowedSections?.pdfDownload ?? user?.pdfDownload ?? true;
  const allowPdfExportShare = user?.allowedSections?.pdfExportShare ?? user?.pdfExportShare ?? true;
  const hasPdfActions = allowPdfDownload || allowPdfExportShare;
  const [notes, setNotes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`video_notes_${item.id}`) || '[]');
    } catch {
      return [];
    }
  });
  const [noteInput, setNoteInput] = useState('');
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);

  const handleAddNote = (presetText) => {
    const textToAdd = (presetText || noteInput || '').trim();
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
    setNoteInput('');
  };

  const handleDeleteNote = (noteId) => {
    const updated = notes.filter(n => n.id !== noteId);
    setNotes(updated);
    localStorage.setItem(`video_notes_${item.id}`, JSON.stringify(updated));
  };

  const handleSeekToNote = (time) => {
    window.dispatchEvent(new CustomEvent('player:seek-to', { detail: { time } }));
  };

  const showToast = (msg) => {
    setPdfActionToast(msg);
    setTimeout(() => setPdfActionToast(''), 3500);
  };

  // Dynamic Screenshot & Screen Recording Protection (FLAG_SECURE)
  // DEFAULT BEHAVIOR:
  // All media (both videos and PDFs) are UNPROTECTED by default (PrivacyScreen is disabled).
  // Older content and newly uploaded items without explicit security flags remain completely unprotected.
  // PrivacyScreen (FLAG_SECURE) is ONLY engaged if the admin explicitly toggles isSecure on.
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
        {/* PDF Toast Notice */}
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
          {/* Back & Document Title (Flexible, max area) */}
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

          {/* Right Action Icons: [⋯ More Menu] and [✕ Close] */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, position: 'relative' }}>
            {/* More Menu Trigger (rendered only if at least one PDF action is permitted) */}
            {hasPdfActions && (
              <button
                onClick={() => setShowPdfDownloadMenu(prev => !prev)}
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
                title="More Actions (Share, Save to App, Save to Device)"
                aria-label="More Actions"
              >
                <MoreVertical size={16} />
              </button>
            )}

            {/* Dropdown Menu */}
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
                  {/* Share Option (Device Export & Sharing permission) */}
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

                  {/* Download to App Option (In-App PDF Download permission) */}
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

                  {/* Save to Device Option (Device Export & Sharing permission) */}
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

                  {/* Open in External Reader Option (if available) */}
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

            {/* Close Icon Button */}
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

        {/* Dedicated view for NextToppers dynamic links (/dl/r/) vs direct Mozilla PDF.js viewer */}
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

  return (
    <div 
      className={`viewer-overlay video-mode ${isInPip ? 'pip-active' : ''}`}
      style={isInPip ? { background: '#000', padding: 0, margin: 0, overflow: 'hidden' } : {}}
    >
      {!isInPip && pdfActionToast && (
        <div style={{
          position: 'fixed',
          top: '52px',
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
      <div className="viewer-content" style={isInPip ? { padding: 0, margin: 0, height: '100vh', width: '100vw' } : {}}>
        <div className="yt-layout" style={isInPip ? { padding: 0, margin: 0, height: '100%', display: 'flex', flexDirection: 'column' } : {}}>
          {/* Mobile-friendly top header with Back navigation */}
          {!isInPip && (
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
          )}

          <div className="yt-video-section" style={isInPip ? { flex: 1, width: '100vw', height: '100vh', margin: 0, padding: 0 } : {}}>
            <div className="video-container" style={isInPip ? { width: '100%', height: '100%', borderRadius: 0 } : {}}>
              <HlsPlayer url={item.url} item={item} user={user} />
            </div>
          </div>

          {!isInPip && (
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
              <div className="yt-actions" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <VideoDownloader url={item.url} item={item} user={user} />

                <button 
                  onClick={handleTogglePip}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#f3f4f6',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title="Picture in Picture (Floating window)"
                >
                  <Tv size={15} />
                  <span>Pop-out (PiP)</span>
                </button>

                <button 
                  onClick={() => {
                    const nextState = !isAudioOnlyMode;
                    setIsAudioOnlyMode(nextState);
                    window.dispatchEvent(new CustomEvent('player:toggle-audio', { detail: { active: nextState } }));
                  }}
                  className={`yt-action-btn ${isAudioOnlyMode ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: isAudioOnlyMode ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.06)',
                    border: isAudioOnlyMode ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.12)',
                    color: isAudioOnlyMode ? '#f59e0b' : '#f3f4f6',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title="Toggle battery-saving background audio mode"
                >
                  <Headphones size={15} />
                  <span>{isAudioOnlyMode ? 'Video Mode' : 'Audio Mode'}</span>
                </button>

                <button 
                  onClick={() => setShowNotesDrawer(!showNotesDrawer)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: showNotesDrawer ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.06)',
                    border: showNotesDrawer ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.12)',
                    color: showNotesDrawer ? '#f59e0b' : '#f3f4f6',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  title="View or add timestamped lecture notes"
                >
                  <BookmarkPlus size={15} />
                  <span>Notes ({notes.length})</span>
                </button>

                <button 
                  onClick={handleToggleHistoryHide}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: isHistoryHidden ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.06)',
                    border: isHistoryHidden ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.12)',
                    color: isHistoryHidden ? '#ef4444' : '#f3f4f6',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title={isHistoryHidden ? "Hidden from your watch history (click to restore)" : "Hide from your watch history"}
                >
                  <X size={15} />
                  <span>{isHistoryHidden ? 'Hidden from History' : 'Hide from History'}</span>
                </button>

                <button className="yt-close-btn" onClick={onClose}>
                  <X size={18} /> Close Player
                </button>
              </div>

            {/* Timestamped Bookmarks & Notes Section */}
            {showNotesDrawer && (
              <div style={{
                marginTop: '16px',
                background: '#121214',
                border: '1px solid #26262b',
                borderRadius: '12px',
                padding: '16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Bookmark size={18} className="text-[#f59e0b]" />
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f3f4f6', margin: 0 }}>
                      Timestamped Notes & Bookmarks
                    </h3>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    {notes.length} saved
                  </span>
                </div>

                {/* Quick Add Input */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Add a note at current time..."
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
                    style={{
                      flex: 1,
                      background: '#18181b',
                      border: '1px solid #2e2e36',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#f3f4f6',
                      fontSize: '0.82rem',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={() => handleAddNote()}
                    style={{
                      background: 'var(--accent)',
                      color: '#000',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Add
                  </button>
                </div>

                {/* Quick Presets */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  {['📌 Formula', '⚠️ Exam Important', '❓ Review Later', '💡 Key Concept'].map((tag) => (
                    <button
                      key={tag}
                      onClick={() => handleAddNote(tag)}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '0.72rem',
                        color: '#9ca3af',
                        cursor: 'pointer'
                      }}
                    >
                      +{tag}
                    </button>
                  ))}
                </div>

                {/* Notes List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {notes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 0', fontSize: '0.8rem', color: '#6b7280' }}>
                      No bookmarks saved yet. Pause or play video and tap Add to save a moment.
                    </div>
                  ) : (
                    notes.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          background: '#18181b',
                          border: '1px solid #27272a',
                          borderRadius: '8px'
                        }}
                      >
                        <div 
                          onClick={() => handleSeekToNote(n.time)}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1, minWidth: 0 }}
                          title="Click to jump to this timestamp"
                        >
                          <span style={{
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#f59e0b',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            fontFamily: 'monospace'
                          }}>
                            {formatSeekTime(n.time)}
                          </span>
                          <span style={{ fontSize: '0.82rem', color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {n.text}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteNote(n.id)}
                          style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer', padding: '4px' }}
                          title="Delete note"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
