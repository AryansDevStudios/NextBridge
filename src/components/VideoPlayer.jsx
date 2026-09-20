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
import { Download, X, Calendar, Clock, CheckCircle, Loader2, ArrowLeft } from 'lucide-react';

const ImmersiveMode = registerPlugin('ImmersiveMode');

function HlsPlayer({ url, item, user }) {
  const videoRef = useRef(null);
  const wrapperRef = useRef(null);
  const totalWatchTime = useRef(0);
  const lastPlayTime = useRef(null);
  const [offlineUrl, setOfflineUrl] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [skipIndicator, setSkipIndicator] = useState(null);

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
    </div>
  );
}

function VideoDownloader({ url, item, user }) {
  const [state, setState] = useState('idle'); // idle | fetchingOptions | selecting | downloading | done | error
  const [variants, setVariants] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [errorMsg, setErrorMsg] = useState('');
  const abortRef = useRef(null);

  useEffect(() => {
    const checkDownloaded = async () => {
      try {
        const m3u8Stat = await Filesystem.stat({ path: `downloads/${item.id}/index.m3u8`, directory: Directory.Data });
        if (m3u8Stat) { setState('done'); return; }
      } catch (e) {}

      try {
        const mp4Stat = await Filesystem.stat({ path: `downloads/${item.id}/video.mp4`, directory: Directory.Data });
        if (mp4Stat) { setState('done'); return; }
      } catch (e) {}

      setState('idle');
    };
    checkDownloaded();
  }, [item.id]);

  const fetchOptions = async () => {
    if (!url.includes('.m3u8')) {
      // Direct MP4 - download immediately
      startDownloadDirect();
      return;
    }

    try {
      setState('fetchingOptions');
      setErrorMsg('');

      let masterText = '';
      try {
        const res = await fetch(url);
        if (res.ok) masterText = await res.text();
        else throw new Error('Fetch status ' + res.status);
      } catch (e) {
        const { CapacitorHttp } = await import('@capacitor/core');
        const masterRes = await CapacitorHttp.request({ method: 'GET', url });
        masterText = masterRes.data;
      }

      const lines = masterText.split('\n').map(l => l.trim());
      let parsedVariants = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
          const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/);
          const height = resMatch ? parseInt(resMatch[1]) : 0;
          const nextLine = lines[i + 1];
          if (nextLine && !nextLine.startsWith('#')) {
            parsedVariants.push({ height: height || 720, path: nextLine });
          }
        }
      }

      if (parsedVariants.length === 0) {
        parsedVariants = [{ height: 720, path: url }];
      } else {
        parsedVariants.sort((a, b) => b.height - a.height);
      }

      setVariants(parsedVariants);
      const savedQuality = parseInt(localStorage.getItem('global_quality') || '720');
      let initialSelected = parsedVariants[0];
      const matched = parsedVariants.find(v => v.height === savedQuality);
      if (matched) initialSelected = matched;

      setSelectedVariant(initialSelected);
      setState('selecting');
    } catch (err) {
      console.error('[Download] Failed to fetch qualities:', err);
      // If fetching variants fails, fallback to direct download
      startDownloadDirect();
    }
  };

  const startDownloadDirect = async () => {
    setState('downloading');
    setErrorMsg('');
    setProgress({ current: 0, total: 1, percent: 10 });
    abortRef.current = new AbortController();

    try {
      const baseDir = `downloads/${item.id}`;
      await Filesystem.mkdir({ path: 'downloads', directory: Directory.Data, recursive: true }).catch(() => {});
      await Filesystem.mkdir({ path: baseDir, directory: Directory.Data, recursive: true }).catch(() => {});

      await Filesystem.downloadFile({
        url,
        path: `${baseDir}/video.mp4`,
        directory: Directory.Data
      });

      // Register in downloaded_lectures
      saveToDownloadRegistry('Direct');

      setState('done');
      if (user) {
        addDoc(collection(db, 'students', user.id, 'logs'), {
          type: 'download',
          videoId: item.id || '',
          videoTitle: item.title || 'Unknown Video',
          timestamp: new Date().toISOString()
        }).catch(console.error);
      }
    } catch (err) {
      console.error('[Download] Direct download failed:', err);
      setErrorMsg('Download failed. Check your internet.');
      setState('error');
    }
  };

  const startDownload = async (variant) => {
    setState('downloading');
    setErrorMsg('');
    setProgress({ current: 0, total: 0, percent: 0 });
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      const baseDir = `downloads/${item.id}`;
      await Filesystem.mkdir({ path: 'downloads', directory: Directory.Data, recursive: true }).catch(() => {});
      await Filesystem.mkdir({ path: baseDir, directory: Directory.Data, recursive: true }).catch(() => {});

      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      const variantUrl = variant.path.startsWith('http') ? variant.path : baseUrl + variant.path;

      let mediaText = '';
      try {
        const fetchRes = await fetch(variantUrl, { signal });
        if (fetchRes.ok) mediaText = await fetchRes.text();
        else throw new Error('Fetch status ' + fetchRes.status);
      } catch (e) {
        const { CapacitorHttp } = await import('@capacitor/core');
        const mediaRes = await CapacitorHttp.request({ method: 'GET', url: variantUrl });
        mediaText = mediaRes.data;
      }

      const mediaBase = variantUrl.substring(0, variantUrl.lastIndexOf('/') + 1);
      const mediaLines = mediaText.split('\n');

      let modifiedPlaylist = [];
      let segmentUrls = [];
      let segCount = 0;

      for (let line of mediaLines) {
        line = line.trim();
        if (!line) continue;
        if (line.startsWith('#')) {
          modifiedPlaylist.push(line);
        } else {
          const absoluteUrl = line.startsWith('http') ? line : mediaBase + line;
          const localName = `${segCount}.ts`;
          segmentUrls.push({ url: absoluteUrl, localName });
          modifiedPlaylist.push(localName);
          segCount++;
        }
      }

      if (segmentUrls.length === 0) throw new Error('No video segments found');

      setProgress({ current: 0, total: segmentUrls.length, percent: 0 });

      // Parallel download in batches of 5
      const CONCURRENCY = 5;
      let completed = 0;

      for (let i = 0; i < segmentUrls.length; i += CONCURRENCY) {
        if (signal.aborted) throw new Error('Aborted');
        const batch = segmentUrls.slice(i, i + CONCURRENCY);

        await Promise.all(batch.map(seg => Filesystem.downloadFile({
          url: seg.url,
          path: `${baseDir}/${seg.localName}`,
          directory: Directory.Data
        })));

        completed += batch.length;
        const pct = Math.round((completed / segmentUrls.length) * 100);
        setProgress({ current: completed, total: segmentUrls.length, percent: pct });
      }

      // Write relative index.m3u8
      await Filesystem.writeFile({
        path: `${baseDir}/index.m3u8`,
        data: modifiedPlaylist.join('\n'),
        directory: Directory.Data,
        encoding: 'utf8'
      });

      // Save to download registry
      saveToDownloadRegistry(`${variant.height}p`);

      setState('done');

      if (user) {
        addDoc(collection(db, 'students', user.id, 'logs'), {
          type: 'download',
          videoId: item.id || '',
          videoTitle: item.title || 'Unknown Video',
          quality: `${variant.height}p`,
          timestamp: new Date().toISOString()
        }).catch(console.error);
      }
    } catch (err) {
      if (err.message === 'Aborted') {
        setState('idle');
      } else {
        console.error('[Download] Execution failed:', err);
        setErrorMsg(err.message || 'Download failed');
        setState('error');
      }
    }
  };

  const saveToDownloadRegistry = (qualityLabel) => {
    try {
      const existing = JSON.parse(localStorage.getItem('downloaded_lectures') || '[]');
      const updated = existing.filter(d => String(d.id) !== String(item.id));
      updated.unshift({
        id: item.id,
        title: item.title,
        subjectName: item.unified_path || item.folder_path || 'Class Lecture',
        folderPath: item.folder_path || '',
        duration: item.duration || 0,
        thumbnail: item.thumbnail || null,
        downloadedAt: new Date().toISOString(),
        path: `downloads/${item.id}`,
        quality: qualityLabel
      });
      localStorage.setItem('downloaded_lectures', JSON.stringify(updated));
    } catch (e) {
      console.warn('[Download] Failed to update download registry:', e);
    }
  };

  const cancelDownload = () => {
    if (abortRef.current) abortRef.current.abort();
    setState('idle');
  };

  if (state === 'idle') {
    return (
      <button className="yt-download-btn" onClick={fetchOptions}>
        <Download size={18} /> Download Lecture
      </button>
    );
  }

  if (state === 'fetchingOptions') {
    return (
      <div className="download-progress-container">
        <Loader2 size={16} className="spin-icon text-amber-500" />
        <div className="download-progress-text">Preparing download...</div>
      </div>
    );
  }

  if (state === 'selecting') {
    return (
      <div className="download-progress-container" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px', padding: '10px 14px' }}>
        <div className="download-progress-text" style={{ color: '#f3f4f6', fontWeight: '600' }}>
          Select Quality to Download:
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {variants.map(v => (
            <button
              key={v.height}
              onClick={() => setSelectedVariant(v)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: '600',
                border: selectedVariant?.height === v.height ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                background: selectedVariant?.height === v.height ? 'rgba(245, 158, 11, 0.2)' : '#1a1a1a',
                color: selectedVariant?.height === v.height ? 'var(--accent)' : '#9ca3af',
                cursor: 'pointer'
              }}
            >
              {v.height}p
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button 
            className="yt-download-btn" 
            style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            onClick={() => startDownload(selectedVariant || variants[0])}
          >
            Start Download
          </button>
          <button 
            onClick={() => setState('idle')}
            style={{ background: 'transparent', border: '1px solid var(--border-color)', color: '#9ca3af', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (state === 'downloading') {
    return (
      <div className="download-progress-container">
        <div className="download-progress-bar-track">
          <div className="download-progress-bar-fill" style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="download-progress-text">
          {progress.percent}% ({progress.current}/{progress.total})
        </div>
        <button className="download-cancel-btn" onClick={cancelDownload} title="Cancel Download">
          <X size={14} />
        </button>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="download-progress-container">
        <div className="download-progress-text" style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle size={16} /> Saved to Device
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="download-progress-container">
        <div className="download-progress-text" style={{ color: 'var(--danger)' }}>
          {errorMsg || 'Download failed'}
        </div>
        <button 
          onClick={fetchOptions}
          style={{ background: 'var(--accent)', color: '#000', border: 'none', padding: '3px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    );
  }

  return null;
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
