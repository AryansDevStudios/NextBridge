import React, { useEffect, useRef, useState } from 'react';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import Hls from 'hls.js';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import { Download, X, Calendar, Clock, CheckCircle } from 'lucide-react';

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
        const path = `downloads/${item.id}/index.m3u8`;
        const stat = await Filesystem.stat({ path, directory: Directory.Data });
        if (stat) {
          const uriInfo = await Filesystem.getUri({ path, directory: Directory.Data });
          setOfflineUrl(Capacitor.convertFileSrc(uriInfo.uri));
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
        setTimeout(() => {
          if (Capacitor.isNativePlatform()) {
            ScreenOrientation.lock({ orientation: 'landscape' }).catch(console.error);
          } else if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
            window.screen.orientation.lock('landscape').catch(e => console.log('Orientation lock failed:', e));
          }
        }, 600);
      });
      plyrInstance.on('exitfullscreen', () => {
        if (Capacitor.isNativePlatform()) {
          ScreenOrientation.unlock().catch(console.error);
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
        ScreenOrientation.unlock().catch(console.error);
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
  const [state, setState] = useState('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const abortRef = useRef(null);
  
  useEffect(() => {
    Filesystem.stat({ path: `downloads/${item.id}/index.m3u8`, directory: Directory.Data })
      .then(() => setState('done'))
      .catch(() => setState('idle'));
  }, [item.id]);

  const startDownload = async () => {
    setState('downloading');
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      if (!url.includes('.m3u8')) {
        await Filesystem.downloadFile({
          url,
          path: `downloads/${item.id}/video.mp4`,
          directory: Directory.Data
        });
        await Filesystem.writeFile({
          path: `downloads/${item.id}/index.m3u8`,
          data: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:99999\n#EXTINF:99999,\nvideo.mp4\n#EXT-X-ENDLIST',
          directory: Directory.Data, encoding: 'utf8'
        });
        setState('done');
        return;
      }

      const { CapacitorHttp } = await import('@capacitor/core');
      const masterRes = await CapacitorHttp.request({ method: 'GET', url });
      const masterText = masterRes.data;
      
      let mediaPlaylistUrl = url;
      const lines = masterText.split('\n');
      for (let i = 0; i < lines.length; i++) {
         if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
            const nextLine = lines[i+1]?.trim();
            if (nextLine && !nextLine.startsWith('#')) {
               mediaPlaylistUrl = nextLine.startsWith('http') ? nextLine : url.substring(0, url.lastIndexOf('/') + 1) + nextLine;
               break; 
            }
         }
      }

      const mediaRes = await CapacitorHttp.request({ method: 'GET', url: mediaPlaylistUrl });
      const mediaText = mediaRes.data;
      const mediaBase = mediaPlaylistUrl.substring(0, mediaPlaylistUrl.lastIndexOf('/') + 1);
      
      let modifiedPlaylist = [];
      let segmentUrls = [];
      const mediaLines = mediaText.split('\n');
      
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

      setProgress({ current: 0, total: segmentUrls.length });
      
      let completed = 0;
      for (const seg of segmentUrls) {
        if (signal.aborted) throw new Error('Aborted');
        
        await Filesystem.downloadFile({
          url: seg.url,
          path: `downloads/${item.id}/${seg.localName}`,
          directory: Directory.Data
        });
        
        completed++;
        setProgress({ current: completed, total: segmentUrls.length });
      }

      await Filesystem.writeFile({
        path: `downloads/${item.id}/index.m3u8`,
        data: modifiedPlaylist.join('\n'),
        directory: Directory.Data,
        encoding: 'utf8'
      });

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
      if (err.message !== 'Aborted') {
        console.error(err);
        setState('idle');
      }
    }
  };

  if (state === 'idle') {
    return (
      <button className="yt-download-btn" onClick={startDownload}>
        <Download size={18} /> Download Lecture
      </button>
    );
  }

  if (state === 'downloading') {
    return (
      <div className="download-progress-container">
         <div className="download-progress-text">
           Downloading: {progress.current} / {progress.total} chunks
         </div>
         <button className="download-cancel-btn" onClick={() => { if(abortRef.current) abortRef.current.abort(); setState('idle'); }}>
           <X size={14} /> Cancel
         </button>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="download-progress-container">
         <div className="download-progress-text" style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 }}>
           <CheckCircle size={16} /> Downloaded Securely
         </div>
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
  if (item.type === 'pdf') {
    return (
      <div className={`viewer-overlay pdf-mode`} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: '#121212' }}>
        <div className="viewer-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
          <div style={{ padding: '12px 16px', background: '#1e1e1e', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
            <h1 className="text-lg font-bold text-white truncate">{item.title}</h1>
            <button className="flex items-center gap-2 bg-[#262626] text-white px-4 py-2 rounded-lg font-bold hover:bg-[#333]" onClick={onClose}>
              <X size={18} /> Close
            </button>
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <iframe 
              src={`https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(item.url)}`} 
              style={{ width: '100%', height: '100%', border: 'none' }} 
              title={item.title}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="viewer-overlay video-mode">
      <div className="viewer-content">
        <div className="yt-layout">
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
