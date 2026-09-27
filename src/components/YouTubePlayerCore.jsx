import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Hls from 'hls.js';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App as CapApp } from '@capacitor/app';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, increment } from 'firebase/firestore';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Lock,
  Unlock,
  BarChart2,
  Clock,
  X,
  ArrowLeft,
  Tv,
  Bookmark,
  Zap,
  Headphones,
  SkipBack,
  SkipForward,
  Download
} from 'lucide-react';
import { formatSeekTime, convertDownloadUrlToHls } from '../utils/playerHelpers';
import RightSidePanel from './RightSidePanel';
import './YouTubePlayer.css';

const ImmersiveMode = registerPlugin('ImmersiveMode');

export default function YouTubePlayerCore({
  item,
  url,
  user,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  notes = [],
  onAddNote,
  onDeleteNote,
  activePanel = null,
  setActivePanel,
  isAudioOnly = false,
  onToggleAudioOnly
}) {
  const videoRef = useRef(null);
  const playerShellRef = useRef(null);
  const hlsRef = useRef(null);
  const shakaRef = useRef(null);

  const isPwVideo = Boolean(
    item?.isDynamicPw ||
    item?.is_dynamic_pw ||
    item?.isDash ||
    item?.clearKeys ||
    String(item?.batchId || '').startsWith('pw_') ||
    String(item?.id || '').startsWith('pw_') ||
    item?.provider === 'Physics Wallah'
  );

  // Playback & Timing
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(item?.duration || 0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [showRemainingTime, setShowRemainingTime] = useState(false);

  // Audio / Volume
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('app_player_volume');
    return saved !== null ? parseFloat(saved) : 1;
  });
  const [isMuted, setIsMuted] = useState(false);

  // Quality & Speed
  const savedSpeed = parseFloat(localStorage.getItem('app_playback_speed')) || 1;
  const [playbackSpeed, setPlaybackSpeed] = useState(savedSpeed);
  const playbackSpeedRef = useRef(savedSpeed);
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  const [qualityLevels, setQualityLevels] = useState([]);
  const [currentQuality, setCurrentQuality] = useState(() => {
    return parseInt(localStorage.getItem('global_quality') || '0', 10);
  });
  const currentQualityRef = useRef(currentQuality);
  useEffect(() => {
    currentQualityRef.current = currentQuality;
  }, [currentQuality]);

  const [isBuffering, setIsBuffering] = useState(false);
  const scrubTargetTimeRef = useRef(0);

  // Centralized playback speed applicator
  const applySpeed = useCallback((targetSpeed) => {
    const s = parseFloat(targetSpeed) || playbackSpeedRef.current || 1;
    setPlaybackSpeed(s);
    playbackSpeedRef.current = s;
    localStorage.setItem('app_playback_speed', s.toString());
    const video = videoRef.current;
    if (video) {
      try {
        video.preservesPitch = true;
        if ('webkitPreservesPitch' in video) video.webkitPreservesPitch = true;
        if ('mozPreservesPitch' in video) video.mozPreservesPitch = true;
        video.defaultPlaybackRate = s;
        video.playbackRate = s;
      } catch (err) {
        console.warn('Error setting playback speed:', err);
      }
    }
  }, []);

  // Centralized quality changer
  const handleQualityChange = useCallback((lvl) => {
    const isAuto = lvl.id === -1;
    const targetVal = isAuto ? -1 : (lvl.height || lvl.id);
    setCurrentQuality(targetVal);
    currentQualityRef.current = targetVal;
    localStorage.setItem('global_quality', targetVal.toString());

    if (hlsRef.current) {
      hlsRef.current.currentLevel = isAuto ? -1 : lvl.id;
    } else if (shakaRef.current) {
      if (isAuto) {
        shakaRef.current.configure({ abr: { enabled: true } });
      } else {
        shakaRef.current.configure({ abr: { enabled: false } });
        const tracks = shakaRef.current.getVariantTracks()
          .filter(t => t.height === (lvl.height || lvl.id))
          .sort((a, b) => (b.videoBandwidth || b.bandwidth || 0) - (a.videoBandwidth || a.bandwidth || 0));
        if (tracks.length > 0) {
          shakaRef.current.selectVariantTrack(tracks[0], false /* false avoids buffer wipe and stutter */);
        }
      }
    } else if (lvl.url && videoRef.current) {
      const video = videoRef.current;
      const curTime = video.currentTime;
      const wasPlaying = !video.paused;
      video.src = lvl.url;
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = curTime;
        applySpeed(playbackSpeedRef.current);
        if (wasPlaying) video.play().catch(() => {});
      }, { once: true });
    }
  }, [applySpeed]);

  // Offline stream detection (Zero bandwidth waste)
  const [offlineUrl, setOfflineUrl] = useState(null);
  const [isOfflineStream, setIsOfflineStream] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Scrim Overlay & Visibility
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const controlsTimeoutRef = useRef(null);

  // Gestures & Micro-interactions
  const [skipRipple, setSkipRipple] = useState(null);
  const [speedHud, setSpeedHud] = useState(false);
  const isLongPressing = useRef(false);
  const longPressTimer = useRef(null);
  const lastTapRef = useRef({ time: 0, x: 0 });
  const singleTapTimer = useRef(null);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });

  // Viewport Modes
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [showUnlockPill, setShowUnlockPill] = useState(false);
  const unlockPillTimer = useRef(null);

  // Scrubber & Seeking
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPreview, setScrubPreview] = useState(null);
  const scrubberRef = useRef(null);

  // Modals & Panels
  const [showSettings, setShowSettings] = useState(false);
  const [showStatsHud, setShowStatsHud] = useState(false);

  // Sleep Timer
  const [sleepTimerOption, setSleepTimerOption] = useState(0); // minutes (0 = off)
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState(0);
  const sleepTimerRef = useRef(null);

  // Stats for Nerds
  const [statsData, setStatsData] = useState({
    resolution: '',
    codec: 'HLS / AVC1',
    droppedFrames: 0,
    totalFrames: 0,
    bufferLength: '0s'
  });

  // Firestore & Position Tracking
  const totalWatchTime = useRef(0);
  const lastPlayTime = useRef(null);
  const userRef = useRef(user);
  const itemRef = useRef(item);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { itemRef.current = item; }, [item]);

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Offline Stream Resolution
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const checkOffline = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const m3u8Path = `downloads/${item.id}/index.m3u8`;
          const stat = await Filesystem.stat({ path: m3u8Path, directory: Directory.Data });
          if (stat) {
            const uriInfo = await Filesystem.getUri({ path: m3u8Path, directory: Directory.Data });
            setOfflineUrl(Capacitor.convertFileSrc(uriInfo.uri));
            setIsOfflineStream(true);
            setIsReady(true);
            return;
          }
        } catch (_) {}

        try {
          const mp4Path = `downloads/${item.id}/video.mp4`;
          const statMp4 = await Filesystem.stat({ path: mp4Path, directory: Directory.Data });
          if (statMp4) {
            const uriInfo = await Filesystem.getUri({ path: mp4Path, directory: Directory.Data });
            setOfflineUrl(Capacitor.convertFileSrc(uriInfo.uri));
            setIsOfflineStream(true);
            setIsReady(true);
            return;
          }
        } catch (_) {}
      }

      // Web path: check downloaded_lectures in localStorage
      try {
        const downloaded = JSON.parse(localStorage.getItem('downloaded_lectures') || '[]');
        const record = downloaded.find((d) => String(d.id) === String(item.id));
        if (record) {
          const swUrl = record.swPlaylistUrl || `/sw-hls/${item.id}/index.m3u8`;
          setOfflineUrl(swUrl);
          setIsOfflineStream(true);
          setIsReady(true);
          return;
        }
      } catch (_) {}

      setIsOfflineStream(false);
      setIsReady(true);
    };
    checkOffline();
  }, [item.id]);

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Position Restoration & Tracking
  // ──────────────────────────────────────────────────────────────────────────
  const storageKey = item?.id ? `lecture_pos_${item.id}` : null;

  const restorePosition = useCallback(() => {
    const video = videoRef.current;
    if (!video || !storageKey) return;
    const saved = parseFloat(localStorage.getItem(storageKey));
    if (saved && saved > 0 && isFinite(saved)) {
      const dur = video.duration || itemRef.current?.duration || 0;
      if (dur > 0 && saved >= dur - 5) {
        localStorage.removeItem(storageKey);
        return;
      }
      video.currentTime = saved;
    }
  }, [storageKey]);

  const savePosition = useCallback(() => {
    const video = videoRef.current;
    if (!video || !storageKey || (video.paused && video.currentTime === 0)) return;
    if (video.currentTime > 0 && isFinite(video.currentTime)) {
      try {
        const rawHidden = localStorage.getItem('hidden_watch_history');
        const hiddenList = rawHidden ? JSON.parse(rawHidden) : [];
        const curId = String(itemRef.current?.id || '');
        if (hiddenList.includes(curId) || hiddenList.includes(curId.replace(/[./#[\]$]/g, '_'))) {
          return;
        }
      } catch (_) {}

      localStorage.setItem(storageKey, video.currentTime.toString());

      try {
        const curItem = itemRef.current;
        if (curItem) {
          const rawRecents = localStorage.getItem('recent_watched_lectures');
          const recents = rawRecents ? JSON.parse(rawRecents) : [];
          const filtered = recents.filter((r) => String(r.id) !== String(curItem.id));
          const entry = {
            ...curItem,
            id: curItem.id,
            title: curItem.title || 'Video Lecture',
            type: 'video',
            url: curItem.isDynamicPw ? '' : curItem.url,
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
  }, [storageKey]);

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Firestore Student Watch Time Sync
  // ──────────────────────────────────────────────────────────────────────────
  const flushWatchTime = useCallback(() => {
    const video = videoRef.current;
    if (lastPlayTime.current && video && !video.paused) {
      totalWatchTime.current += Date.now() - lastPlayTime.current;
      lastPlayTime.current = Date.now();
    }
    const pendingMs = totalWatchTime.current;
    const currentUser = userRef.current;
    const curItem = itemRef.current;

    if (pendingMs >= 3000) {
      totalWatchTime.current = 0;
      const durationSecs = Math.floor(pendingMs / 1000);
      const cleanVidId = String(curItem?.id || 'vid_' + Math.random().toString(36).slice(2, 8)).replace(/[./#[\]$]/g, '_');
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
            id: curItem?.id,
            title: curItem?.title || 'Unknown Video',
            subjectName: curItem?.subject_name || curItem?.subjectName || '',
            watchTimeSecs: 0,
            duration: video?.duration || curItem?.duration || 0,
            thumbnail: curItem?.thumbnail || '',
            url: curItem?.url || '',
            lastWatched: new Date().toISOString()
          };
        }
        localStats[cleanVidId].watchTimeSecs = (localStats[cleanVidId].watchTimeSecs || 0) + durationSecs;
        localStats[cleanVidId].lastWatched = new Date().toISOString();
        if (video?.duration) localStats[cleanVidId].duration = video.duration;
        localStorage.setItem('local_video_stats', JSON.stringify(localStats));
      } catch (_) {}

      const studentId = currentUser?.id || currentUser?.uid;
      if (studentId) {
        addDoc(collection(db, 'students', studentId, 'logs'), {
          type: 'watch',
          videoId: curItem?.id || '',
          videoTitle: curItem?.title || 'Unknown Video',
          subjectName: curItem?.subject_name || curItem?.subjectName || '',
          durationSecs,
          timestamp: new Date().toISOString()
        }).catch(() => {});

        updateDoc(doc(db, 'students', studentId), {
          totalVideoTime: increment(durationSecs),
          lastActive: new Date().toISOString(),
          [`dailyVideoTime.${todayKey}`]: increment(durationSecs),
          [`videoStats.${cleanVidId}.title`]: curItem?.title || 'Unknown Video',
          [`videoStats.${cleanVidId}.subjectName`]: curItem?.subject_name || curItem?.subjectName || '',
          [`videoStats.${cleanVidId}.watchTimeSecs`]: increment(durationSecs),
          [`videoStats.${cleanVidId}.lastWatched`]: new Date().toISOString(),
          [`videoStats.${cleanVidId}.playCount`]: increment(1)
        }).catch(() => {});
      }
    }
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Video Engine Initialization
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isReady) return;
    const video = videoRef.current;
    if (!video) return;

    const targetUrl = offlineUrl || (item?.hlsUrl && item.hlsUrl.includes('.m3u8') ? item.hlsUrl : convertDownloadUrlToHls(url || item?.url));

    // Apply initial speed, volume, and pitch preservation
    applySpeed(playbackSpeedRef.current);
    video.volume = volume;
    video.muted = isMuted;

    let hls;
    let shakaPlayer = null;
    let isDisposed = false;

    // Resolve saved seek position ahead of time to stream directly to that point without thrashing
    let initialSeek = 0;
    if (storageKey) {
      const saved = parseFloat(localStorage.getItem(storageKey));
      const dur = itemRef.current?.duration || item?.duration || 0;
      if (saved && saved > 0 && isFinite(saved)) {
        if (dur > 0 && saved >= dur - 5) {
          localStorage.removeItem(storageKey);
        } else {
          initialSeek = saved;
        }
      }
    }

    const isMpd = targetUrl && (targetUrl.includes('.mpd') || item?.isDash);

    if (isMpd) {
      const initShaka = async () => {
        try {
          const shakaModule = await import('shaka-player/dist/shaka-player.compiled.js');
          const shaka = shakaModule.default || shakaModule;
          shaka.polyfill.installAll();
          if (!shaka.Player.isBrowserSupported()) {
            console.error('Shaka Player is not supported on this browser/environment');
            return;
          }
          if (isDisposed) return;
          shakaPlayer = new shaka.Player();
          shakaRef.current = shakaPlayer;
          await shakaPlayer.attach(video);

          // Configure ClearKeys DRM safely
          let keys = item?.clearKeys || item?.pwClearKeys;
          if (typeof keys === 'string') {
            try { keys = JSON.parse(keys); } catch (_) {}
          }

          // Auto-resolve ClearKeys from MPD if missing or empty on item
          if ((!keys || Object.keys(keys).length === 0) && (targetUrl.includes('.mpd') || targetUrl.includes('/manifest/'))) {
            try {
              const mpdProbe = await fetch(targetUrl);
              if (mpdProbe.ok) {
                const mpdStr = await mpdProbe.text();
                const kidMatch = mpdStr.match(/default_KID="([0-9a-fA-F-]{32,36})"/i);
                if (kidMatch) {
                  const kid = kidMatch[1];
                  const urlObj = new URL(targetUrl.startsWith('http') ? targetUrl : window.location.href);
                  const gatewayOrigin = urlObj.origin.includes('workers.dev') ? urlObj.origin : 'https://nextbridgeapi.adsbackend01.workers.dev';
                  const otpUrls = [
                    `${gatewayOrigin}/pw/api/get-otp?kid=${encodeURIComponent(kid)}`,
                    `https://nextbridgeapi.adsbackend01.workers.dev/pw/api/get-otp?kid=${encodeURIComponent(kid)}`,
                    `https://www.learnxpw.site/api/get-otp?kid=${encodeURIComponent(kid)}`
                  ];
                  for (const oUrl of otpUrls) {
                    try {
                      const oRes = await fetch(oUrl, {
                        headers: {
                          'Origin': 'https://www.learnxpw.site',
                          'Referer': 'https://www.learnxpw.site/study/batches'
                        }
                      });
                      if (oRes.ok) {
                        const oData = await oRes.json();
                        if (oData?.clearKeys && typeof oData.clearKeys === 'object') {
                          keys = { ...oData.clearKeys };
                          break;
                        }
                      }
                    } catch (_) {}
                  }
                }
              }
            } catch (_) {}
          }

          const finalClearKeys = {};
          if (keys && typeof keys === 'object') {
            for (const [k, v] of Object.entries(keys)) {
              finalClearKeys[k] = v;
              if (!k.includes('-') && k.length === 32) {
                const hyphenated = `${k.slice(0, 8)}-${k.slice(8, 12)}-${k.slice(12, 16)}-${k.slice(16, 20)}-${k.slice(20)}`;
                finalClearKeys[hyphenated] = v;
              } else if (k.includes('-')) {
                finalClearKeys[k.replace(/-/g, '')] = v;
              }
            }
          }

          const drmConfig = Object.keys(finalClearKeys).length > 0
            ? { clearKeys: finalClearKeys }
            : {};

          const savedQuality = parseInt(localStorage.getItem('global_quality') || '0', 10);

          shakaPlayer.configure({
            drm: drmConfig,
            streaming: {
              bufferingGoal: 60, // 60s (1 minute max) forward prefetch buffer prevents stalls
              rebufferingGoal: 2, // 2s resume threshold for snappy recovery
              bufferBehind: 30, // 30s backward buffer for instant rewind
              retryParameters: {
                maxAttempts: 4,
                baseDelay: 1000,
                backoffFactor: 2,
                timeout: 12000
              },
              gapDetectionThreshold: 0.25,
              stallEnabled: true,
              stallThreshold: 1.0,
              stallSkip: 0.1,
              safeSeekOffset: 0,
              inaccurateManifestTolerance: 1.0
            },
            abr: {
              enabled: savedQuality <= 0 || savedQuality === -1,
              defaultBandwidthEstimate: 2500000, // 2.5 Mbps avoids initial 144p drop & rebuffer
              switchInterval: 8, // Prevent frantic track jumping
              bandwidthUpgradeTarget: 0.85,
              bandwidthDowngradeTarget: 0.95
            },
            manifest: {
              dash: {
                ignoreMinBufferTime: true, // Crucial: ignore manifest minBufferTime like 1.5s that throttles buffer
                autoCorrectDrift: true
              }
            }
          });

          shakaPlayer.addEventListener('error', (event) => {
            const err = event.detail || event;
            console.warn('Shaka Player warning/error:', err);
          });

          shakaPlayer.addEventListener('buffering', (event) => {
            setIsBuffering(Boolean(event.buffering));
          });

          // Load manifest directly at initialSeek
          await shakaPlayer.load(targetUrl, initialSeek > 0 ? initialSeek : undefined);
          if (isDisposed) return;

          // Re-apply playback speed right after load to override browser reset
          applySpeed(playbackSpeedRef.current);

          const tracks = shakaPlayer.getVariantTracks() || [];
          const uniqueHeights = [...new Set(tracks.map(t => t.height).filter(Boolean))].sort((a, b) => b - a);
          const opts = [{ id: -1, label: 'Auto' }];
          uniqueHeights.forEach(h => {
            opts.push({ id: h, label: `${h}p`, height: h });
          });
          setQualityLevels(opts);

          // Restore Quality Preset consistently
          if (savedQuality > 0) {
            const matchingTracks = tracks
              .filter(t => t.height === savedQuality)
              .sort((a, b) => (b.videoBandwidth || b.bandwidth || 0) - (a.videoBandwidth || a.bandwidth || 0));
            if (matchingTracks.length > 0) {
              shakaPlayer.configure({ abr: { enabled: false } });
              shakaPlayer.selectVariantTrack(matchingTracks[0], false);
              setCurrentQuality(savedQuality);
            } else {
              shakaPlayer.configure({ abr: { enabled: true } });
            }
          } else {
            shakaPlayer.configure({ abr: { enabled: true } });
          }

          if (initialSeek > 0 && Math.abs(video.currentTime - initialSeek) > 2) {
            video.currentTime = initialSeek;
            setCurrentTime(initialSeek);
          }

          video.play().catch(() => {});
        } catch (err) {
          console.error('Failed to initialize Shaka Player:', err);
        }
      };
      initShaka();
    } else if (Hls.isSupported() && targetUrl.includes('.m3u8')) {
      hls = new Hls({
        debug: false,
        enableWorker: true,
        backBufferLength: 30,
        maxBufferLength: 60, // 60s (1 minute max) forward prefetch buffer
        maxMaxBufferLength: 60, // Enforce strict 60s maximum forward buffer
        maxBufferSize: 60 * 1024 * 1024,
        startPosition: initialSeek > 0 ? initialSeek : -1
      });
      hlsRef.current = hls;
      hls.loadSource(targetUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (e, data) => {
        applySpeed(playbackSpeedRef.current);
        const levels = data.levels || [];
        const opts = [{ id: -1, label: 'Auto' }];
        levels.forEach((lvl, idx) => {
          opts.push({
            id: idx,
            label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)} kbps`,
            height: lvl.height
          });
        });
        setQualityLevels(opts);

        const savedQuality = parseInt(localStorage.getItem('global_quality') || '0', 10);
        if (savedQuality > 0) {
          const matched = levels.findIndex((l) => l.height === savedQuality);
          if (matched !== -1) {
            hls.currentLevel = matched;
            setCurrentQuality(savedQuality);
          } else {
            hls.currentLevel = -1;
          }
        } else {
          hls.currentLevel = -1;
        }

        if (initialSeek > 0 && Math.abs(video.currentTime - initialSeek) > 2) {
          video.currentTime = initialSeek;
          setCurrentTime(initialSeek);
        }

        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (e, data) => {
        if (data.fatal) {
          const isManifestFailure =
            data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT ||
            data.response?.code === 403 ||
            data.response?.code === 404;

          if (isManifestFailure) {
            console.warn('[Player] HLS manifest load failed, attempting direct MP4 stream fallback...', data);
            try { hls.destroy(); } catch (_) {}
            hlsRef.current = null;

            let dlList = [];
            if (Array.isArray(item?.downloadUrls)) {
              dlList = item.downloadUrls;
            } else if (typeof item?.downloadUrls === 'string') {
              try { dlList = JSON.parse(item.downloadUrls); } catch (_) {}
            }

            const savedQuality = parseInt(localStorage.getItem('global_quality') || '0', 10);
            let preferredQualityUrl = null;
            if (savedQuality > 0 && dlList.length > 0) {
              const matched = dlList.find(u => {
                const num = parseInt(u.title || u.quality || 0, 10);
                return num === savedQuality;
              });
              if (matched?.url) preferredQualityUrl = matched.url;
            }

            const fallbackMp4 =
              preferredQualityUrl ||
              (dlList.length > 0 && (
                dlList.find(u => String(u.title || u.quality || '').includes('720'))?.url ||
                dlList.find(u => String(u.title || u.quality || '').includes('480'))?.url ||
                dlList.find(u => String(u.title || u.quality || '').includes('360'))?.url ||
                dlList[0]?.url
              )) ||
              (item?.url && !item.url.includes('.m3u8') ? item.url : null) ||
              (url && !url.includes('.m3u8') ? url : null);

            if (fallbackMp4) {
              const resumeTime = (video.currentTime && video.currentTime > 2) ? video.currentTime : initialSeek;
              video.src = fallbackMp4;
              video.addEventListener('loadedmetadata', () => {
                applySpeed(playbackSpeedRef.current);
                if (resumeTime > 0) {
                  video.currentTime = resumeTime;
                  setCurrentTime(resumeTime);
                }
                video.play().catch(() => {});
              }, { once: true });

              if (dlList.length > 0) {
                const opts = dlList.map((u) => {
                  const num = parseInt(u.title || u.quality || 0, 10);
                  const h = !isNaN(num) && num > 0 ? num : 720;
                  return { id: h, label: `${h}p`, height: h, url: u.url };
                }).sort((a, b) => b.height - a.height);
                setQualityLevels(opts);
                if (savedQuality > 0) {
                  const matched = opts.find(o => o.height === savedQuality);
                  if (matched) setCurrentQuality(savedQuality);
                }
              }
              return;
            }
          }

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else hls.destroy();
        }
      });
    } else {
      video.src = targetUrl;
      video.addEventListener('loadedmetadata', () => {
        applySpeed(playbackSpeedRef.current);
        if (initialSeek > 0) {
          video.currentTime = initialSeek;
          setCurrentTime(initialSeek);
        }
        video.play().catch(() => {});
      }, { once: true });

      let dlList = [];
      if (Array.isArray(item?.downloadUrls)) {
        dlList = item.downloadUrls;
      } else if (typeof item?.downloadUrls === 'string') {
        try { dlList = JSON.parse(item.downloadUrls); } catch (_) {}
      }
      if (dlList.length > 0) {
        const opts = dlList.map((u) => {
          const num = parseInt(u.title || u.quality || 0, 10);
          const h = !isNaN(num) && num > 0 ? num : 720;
          return { id: h, label: `${h}p`, height: h, url: u.url };
        }).sort((a, b) => b.height - a.height);
        setQualityLevels(opts);

        const savedQuality = parseInt(localStorage.getItem('global_quality') || '0', 10);
        if (savedQuality > 0) {
          const matched = opts.find((o) => o.height === savedQuality);
          if (matched && matched.url && matched.url !== targetUrl) {
            video.src = matched.url;
            setCurrentQuality(savedQuality);
          } else {
            setCurrentQuality(opts[0]?.height || 720);
          }
        } else {
          setCurrentQuality(opts[0]?.height || 720);
        }
      }
    }

    // Screen WakeLock
    let wakeLockSentinel = null;
    const acquireLock = async () => {
      try {
        if ('wakeLock' in navigator && !wakeLockSentinel) {
          wakeLockSentinel = await navigator.wakeLock.request('screen');
        }
      } catch (_) {}
    };
    const releaseLock = () => {
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
      }
    };

    // App State
    let appStateSub = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive && video && !video.paused) {
          video.pause();
          savePosition();
          releaseLock();
        }
      }).then((sub) => { appStateSub = sub; }).catch(() => {});
    }

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        let currentEnd = 0;
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) <= video.currentTime + 0.5 && video.buffered.end(i) >= video.currentTime - 0.5) {
            currentEnd = video.buffered.end(i);
            break;
          }
        }
        setBufferedEnd(currentEnd || video.buffered.end(video.buffered.length - 1));
      }
    };
    const onDurationChange = () => setDuration(video.duration || item.duration || 0);

    const onPlay = () => {
      setIsPlaying(true);
      lastPlayTime.current = Date.now();
      acquireLock();
      if (!isLongPressing.current && videoRef.current) {
        applySpeed(playbackSpeedRef.current);
      }
      if (Capacitor.isNativePlatform()) {
        ImmersiveMode.setVideoPlaying({ playing: true }).catch(() => {});
      }
    };

    const onPlaying = () => {
      setIsPlaying(true);
      setIsBuffering(false);
      if (!isLongPressing.current && videoRef.current) {
        applySpeed(playbackSpeedRef.current);
      }
    };

    const onWaiting = () => {
      setIsBuffering(true);
    };

    const onSeeking = () => {
      setIsBuffering(true);
    };

    const onSeeked = () => {
      setIsBuffering(false);
      if (!isLongPressing.current && videoRef.current) {
        applySpeed(playbackSpeedRef.current);
      }
    };

    const onRateChange = () => {
      if (isLongPressing.current) return;
      const targetSpeed = playbackSpeedRef.current;
      if (video && Math.abs(video.playbackRate - 1.0) < 0.01 && Math.abs(targetSpeed - 1.0) > 0.01) {
        video.playbackRate = targetSpeed;
      }
    };

    const onPause = () => {
      setIsPlaying(false);
      releaseLock();
      savePosition();
      flushWatchTime();
      if (Capacitor.isNativePlatform()) {
        ImmersiveMode.setVideoPlaying({ playing: false }).catch(() => {});
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      releaseLock();
      if (storageKey) localStorage.removeItem(storageKey);
      flushWatchTime();
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('play', onPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ratechange', onRateChange);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    const posInterval = setInterval(savePosition, 3000);
    const watchInterval = setInterval(() => {
      if (video && !video.paused) flushWatchTime();
    }, 30000);

    // MediaSession
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
          video.currentTime = Math.max(0, video.currentTime - (details.seekOffset || 10));
        });
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          video.currentTime = Math.min(video.duration || Infinity, video.currentTime + (details.seekOffset || 10));
        });
      } catch (_) {}
    }

    return () => {
      savePosition();
      flushWatchTime();
      releaseLock();
      clearInterval(posInterval);
      clearInterval(watchInterval);
      if (appStateSub) appStateSub.remove();
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ratechange', onRateChange);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      isDisposed = true;
      if (hls) hls.destroy();
      if (shakaPlayer) shakaPlayer.destroy().catch(() => {});
      if (shakaRef.current) {
        shakaRef.current.destroy().catch(() => {});
        shakaRef.current = null;
      }
      if (Capacitor.isNativePlatform()) {
        ImmersiveMode.setVideoPlaying({ playing: false }).catch(() => {});
      }
    };
  }, [isReady, offlineUrl, url, item?.hlsUrl, storageKey, savePosition, flushWatchTime, item?.duration, applySpeed]);

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Scrim Auto-Hide Timer
  // ──────────────────────────────────────────────────────────────────────────
  const showControls = useCallback(() => {
    setIsControlsVisible(true);
    clearTimeout(controlsTimeoutRef.current);
    const video = videoRef.current;
    if (video && !video.paused) {
      controlsTimeoutRef.current = setTimeout(() => {
        if (!isScrubbing && !showSettings && !(isFullscreen && activePanel)) {
          setIsControlsVisible(false);
        }
      }, 3000);
    }
  }, [isScrubbing, showSettings, isFullscreen, activePanel]);

  const toggleControls = useCallback(() => {
    if (isScreenLocked) {
      setShowUnlockPill(true);
      clearTimeout(unlockPillTimer.current);
      unlockPillTimer.current = setTimeout(() => setShowUnlockPill(false), 3000);
      return;
    }
    if (isControlsVisible) {
      setIsControlsVisible(false);
      clearTimeout(controlsTimeoutRef.current);
    } else {
      showControls();
    }
  }, [isControlsVisible, isScreenLocked, showControls]);

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Touch Gestures (Double-tap 10s, Long-press 2x, Swipes)
  // ──────────────────────────────────────────────────────────────────────────
  const handlePointerDown = (e) => {
    if (isScreenLocked) return;
    if (e.target.closest('.yt-scrim-interactive') || e.target.closest('.yt-bottom-sheet-panel') || e.target.closest('.yt-panel-inner')) return;

    longPressTimer.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused) {
        isLongPressing.current = true;
        video.playbackRate = 2.0;
        setSpeedHud(true);
      }
    }, 350);
  };

  const handlePointerUpOrCancel = () => {
    clearTimeout(longPressTimer.current);
    if (isLongPressing.current) {
      isLongPressing.current = false;
      const video = videoRef.current;
      if (video) video.playbackRate = playbackSpeed;
      setSpeedHud(false);
    }
  };

  const handleTap = (e) => {
    if (isScreenLocked) {
      setShowUnlockPill(true);
      clearTimeout(unlockPillTimer.current);
      unlockPillTimer.current = setTimeout(() => setShowUnlockPill(false), 3000);
      return;
    }
    if (e.target.closest('.yt-scrim-interactive') || e.target.closest('.yt-bottom-sheet-panel') || e.target.closest('.yt-panel-inner')) return;

    const shell = playerShellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const clientX = e.clientX || (e.changedTouches && e.changedTouches[0]?.clientX) || 0;
    const relX = clientX - rect.left;
    const width = rect.width;
    const now = Date.now();

    if (now - lastTapRef.current.time < 300) {
      const side = relX < width * 0.4 ? 'left' : relX > width * 0.6 ? 'right' : 'center';
      if (side === 'left' || side === 'right') {
        clearTimeout(singleTapTimer.current);
        const video = videoRef.current;
        if (video) {
          const seekAmt = 10;
          if (side === 'left') {
            video.currentTime = Math.max(0, video.currentTime - seekAmt);
          } else {
            video.currentTime = Math.min(video.duration || Infinity, video.currentTime + seekAmt);
          }
          setSkipRipple({ side, seconds: 10, key: now });
          setTimeout(() => setSkipRipple(null), 650);
          showControls();
        }
        lastTapRef.current = { time: 0, x: 0 };
        return;
      }
    }

    lastTapRef.current = { time: now, x: relX };
    singleTapTimer.current = setTimeout(() => {
      toggleControls();
    }, 300);
  };

  const handleTouchStart = (e) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    };
  };

  const handleTouchEnd = (e) => {
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    const deltaX = e.changedTouches[0].clientX - touchStartRef.current.x;

    if (Math.abs(deltaY) > 50 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
      if (deltaY < -50 && !isFullscreen) {
        handleToggleFullscreen(true);
      } else if (deltaY > 50 && isFullscreen) {
        handleToggleFullscreen(false);
      }
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Fullscreen
  // ──────────────────────────────────────────────────────────────────────────
  const handleToggleFullscreen = async (force) => {
    const targetFs = force !== undefined ? force : !isFullscreen;

    if (Capacitor.isNativePlatform()) {
      try {
        if (targetFs) {
          await ImmersiveMode.enter();
          await ScreenOrientation.lock({ orientation: 'landscape' });
        } else {
          await ImmersiveMode.exit();
          await ScreenOrientation.unlock();
        }
      } catch (_) {}
    } else {
      if (targetFs) {
        if (playerShellRef.current?.requestFullscreen) {
          playerShellRef.current.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    }
    setIsFullscreen(targetFs);
  };

  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(document.fullscreenElement);
      setIsFullscreen(isFs);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Desktop Keyboard Shortcuts
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          if (video.paused) video.play();
          else video.pause();
          showControls();
          break;
        case 'j':
        case 'J':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          setSkipRipple({ side: 'left', seconds: 10, key: Date.now() });
          setTimeout(() => setSkipRipple(null), 650);
          showControls();
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
          setSkipRipple({ side: 'right', seconds: 10, key: Date.now() });
          setTimeout(() => setSkipRipple(null), 650);
          showControls();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          showControls();
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
          showControls();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume((prev) => {
            const next = Math.min(1, prev + 0.05);
            video.volume = next;
            localStorage.setItem('app_player_volume', next.toString());
            return next;
          });
          showControls();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume((prev) => {
            const next = Math.max(0, prev - 0.05);
            video.volume = next;
            localStorage.setItem('app_player_volume', next.toString());
            return next;
          });
          showControls();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          setIsMuted((prev) => {
            video.muted = !prev;
            return !prev;
          });
          showControls();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          handleToggleFullscreen();
          break;
        case 't':
        case 'T':
          e.preventDefault();
          setIsTheaterMode((prev) => !prev);
          break;
        case '<':
          e.preventDefault();
          applySpeed(Math.max(0.25, Math.round((playbackSpeedRef.current - 0.25) * 100) / 100));
          showControls();
          break;
        case '>':
          e.preventDefault();
          applySpeed(Math.min(2.5, Math.round((playbackSpeedRef.current + 0.25) * 100) / 100));
          showControls();
          break;
        default:
          if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            const pct = parseInt(e.key, 10) * 0.1;
            video.currentTime = (video.duration || 0) * pct;
            showControls();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showControls, applySpeed]);

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Precision Scrubber
  // ──────────────────────────────────────────────────────────────────────────
  const handleScrubberPreview = (clientX) => {
    const rail = scrubberRef.current;
    const shell = playerShellRef.current;
    if (!rail || !shell) return;
    const rect = rail.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const dur = videoRef.current?.duration || duration || item.duration || 0;
    const targetTime = ratio * dur;
    const relX = clientX - shellRect.left;

    scrubTargetTimeRef.current = targetTime;
    setCurrentTime(targetTime);
    setScrubPreview({
      x: Math.max(75, Math.min(shellRect.width - 75, relX)),
      time: targetTime
    });
  };

  const commitScrubberSeek = (clientX) => {
    const rail = scrubberRef.current;
    const video = videoRef.current;
    if (!rail || !video) return;
    const rect = rail.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const dur = video.duration || duration || item.duration || 0;
    const targetTime = ratio * dur;
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
    savePosition();
  };

  // ──────────────────────────────────────────────────────────────────────────
  // 10. Sleep Timer Countdown
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sleepTimerOption <= 0) {
      clearInterval(sleepTimerRef.current);
      setSleepTimerRemaining(0);
      return;
    }
    const endTimestamp = Date.now() + sleepTimerOption * 60 * 1000;
    setSleepTimerRemaining(sleepTimerOption * 60);

    sleepTimerRef.current = setInterval(() => {
      const remainingSecs = Math.max(0, Math.round((endTimestamp - Date.now()) / 1000));
      setSleepTimerRemaining(remainingSecs);
      if (remainingSecs <= 0) {
        clearInterval(sleepTimerRef.current);
        const video = videoRef.current;
        if (video) video.pause();
        setSleepTimerOption(0);
      }
    }, 1000);

    return () => clearInterval(sleepTimerRef.current);
  }, [sleepTimerOption]);

  // ──────────────────────────────────────────────────────────────────────────
  // 11. Stats for Nerds Updater
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showStatsHud) return;
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      let dropped = 0;
      let total = 0;
      if (video.getVideoPlaybackQuality) {
        const q = video.getVideoPlaybackQuality();
        dropped = q.droppedVideoFrames;
        total = q.totalVideoFrames;
      }
      let bufSecs = '0s';
      if (video.buffered.length > 0) {
        const buf = Math.max(0, video.buffered.end(video.buffered.length - 1) - video.currentTime);
        bufSecs = buf.toFixed(1) + 's';
      }
      setStatsData({
        resolution: `${video.videoWidth}x${video.videoHeight}`,
        codec: isOfflineStream ? 'Local Storage / MP4' : (isPwVideo ? 'DASH / ClearKeys (Shaka)' : 'CloudFront / HLS.js'),
        droppedFrames: dropped,
        totalFrames: total,
        bufferLength: bufSecs
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showStatsHud, isOfflineStream]);

  // Timestamp Toggle: Watched vs Remaining
  const formattedTimeDisplay = useMemo(() => {
    if (showRemainingTime) {
      const rem = Math.max(0, duration - currentTime);
      return `-${formatSeekTime(rem)} / ${formatSeekTime(duration)}`;
    }
    return `${formatSeekTime(currentTime)} / ${formatSeekTime(duration)}`;
  }, [currentTime, duration, showRemainingTime]);

  const progressRatio = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferRatio = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  const isFullscreenPanelOpen = isFullscreen && Boolean(activePanel);

  return (
    <div
      ref={playerShellRef}
      className={`yt-player-shell ${isTheaterMode ? 'theater' : ''} ${isFullscreen ? 'fullscreen' : ''} ${!isControlsVisible ? 'controls-hidden' : ''}`}
      onMouseMove={showControls}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleTap}
    >
      <div className={`yt-media-surface ${isFullscreenPanelOpen ? 'with-side-panel' : ''}`}>
        <video
          ref={videoRef}
          playsInline
          webkit-playsinline="true"
          crossOrigin="anonymous"
          preload="auto"
          className="yt-video-element"
          style={{ display: isAudioOnly ? 'none' : 'block' }}
        />

        {isBuffering && !isAudioOnly && (
          <div className="yt-buffering-overlay">
            <div className="yt-buffering-spinner" />
          </div>
        )}

        {/* Audio-Only Mode Card */}
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
          </div>
        )}
      </div>

      {/* ── Layer 2: Gesture Plane ── */}
      <div className="yt-gesture-plane" />

      {/* ── Layer 4: Floating HUDs & Micro-Interactions ── */}
      {/* 2x Speed Pill HUD */}
      {speedHud && (
        <div className="yt-speed-hud-pill">
          <span>⚡ Playing at 2x speed</span>
        </div>
      )}

      {/* Double Tap Seek Ripple */}
      {skipRipple && (
        <div key={skipRipple.key} className={`yt-seek-ripple ${skipRipple.side}`}>
          <div className="yt-seek-ripple-content">
            <div className="yt-seek-ripple-arrows">
              {skipRipple.side === 'left' ? <RotateCcw size={28} /> : <RotateCcw size={28} style={{ transform: 'scaleX(-1)' }} />}
            </div>
            <span className="yt-seek-ripple-label">{skipRipple.seconds} seconds</span>
          </div>
        </div>
      )}

      {/* Lock Screen Unlock Pill */}
      {isScreenLocked && showUnlockPill && (
        <button
          className="yt-unlock-pill yt-scrim-interactive"
          onClick={(e) => {
            e.stopPropagation();
            setIsScreenLocked(false);
            setShowUnlockPill(false);
          }}
        >
          <Unlock size={16} />
          <span>Screen Locked • Tap to Unlock</span>
        </button>
      )}

      {/* Stats for Nerds HUD */}
      {showStatsHud && (
        <div className="yt-stats-hud yt-scrim-interactive">
          <div className="yt-stats-hud-header">
            <span>Stats for Nerds</span>
            <button onClick={() => setShowStatsHud(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
          <div><strong>Viewport:</strong> {statsData.resolution}</div>
          <div><strong>Stream:</strong> {statsData.codec}</div>
          <div><strong>Buffer:</strong> {statsData.bufferLength}</div>
          <div><strong>Dropped Frames:</strong> {statsData.droppedFrames} / {statsData.totalFrames}</div>
          <div><strong>Speed:</strong> {playbackSpeed}x</div>
        </div>
      )}

      {/* ── Layer 3: Scrim Overlay Controls ── */}
      <div className={`yt-scrim-overlay ${!isControlsVisible || isScreenLocked ? 'hidden' : ''}`}>
        {/* Top Control Bar */}
        <div className="yt-top-bar yt-scrim-interactive">
          <div className="yt-top-left">
            <button className="yt-icon-btn" onClick={onClose} title="Go Back">
              <ArrowLeft size={20} />
            </button>
            <span className="yt-top-title">{item.title}</span>
            {isOfflineStream && (
              <span className="yt-badge-offline" title="Streaming from offline device storage. Zero bandwidth used!">
                <Zap size={11} /> Offline Storage
              </span>
            )}
          </div>
          <div className="yt-top-right">
            <button
              className="yt-icon-btn"
              onClick={() => setIsScreenLocked(true)}
              title="Lock Screen"
            >
              <Lock size={18} />
            </button>
            <button
              className="yt-icon-btn"
              onClick={() => setShowSettings((prev) => !prev)}
              title="Settings"
            >
              <Settings size={18} />
            </button>
            <button className="yt-icon-btn" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Center Stage Playback Cluster */}
        <div className="yt-center-cluster yt-scrim-interactive">
          <button
            className="yt-center-skip-btn"
            disabled={!hasPrev}
            onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
            title="Previous Lecture"
          >
            <SkipBack size={20} />
          </button>

          <button
            className="yt-big-play-btn"
            onClick={(e) => {
              e.stopPropagation();
              const video = videoRef.current;
              if (video) {
                if (video.paused) video.play();
                else video.pause();
              }
              showControls();
            }}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={34} /> : <Play size={34} style={{ marginLeft: 3 }} />}
          </button>

          <button
            className="yt-center-skip-btn"
            disabled={!hasNext}
            onClick={(e) => { e.stopPropagation(); onNext?.(); }}
            title="Next Lecture"
          >
            <SkipForward size={20} />
          </button>
        </div>

        {/* Bottom Timeline & Controls */}
        <div className="yt-bottom-bar yt-scrim-interactive">
          {/* Scrubber Rail */}
          <div
            ref={scrubberRef}
            className={`yt-scrubber-container ${isScrubbing ? 'scrubbing' : ''}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch (_) {}
              setIsScrubbing(true);
              handleScrubberPreview(e.clientX);
            }}
            onPointerMove={(e) => {
              if (isScrubbing) {
                handleScrubberPreview(e.clientX);
              }
            }}
            onPointerUp={(e) => {
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch (_) {}
              setIsScrubbing(false);
              setScrubPreview(null);
              commitScrubberSeek(e.clientX);
            }}
            onPointerCancel={(e) => {
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch (_) {}
              setIsScrubbing(false);
              setScrubPreview(null);
            }}
          >
            {scrubPreview && (
              <div className="yt-scrubber-preview" style={{ left: `${scrubPreview.x}px` }}>
                <span className="yt-preview-time">{formatSeekTime(scrubPreview.time)}</span>
              </div>
            )}

            <div className="yt-scrubber-rail">
              <div className="yt-scrubber-buffer" style={{ width: `${bufferRatio}%` }} />
              <div className="yt-scrubber-progress" style={{ width: `${progressRatio}%` }} />
              <div className="yt-scrubber-thumb" style={{ left: `${progressRatio}%` }} />
            </div>
          </div>

          {/* Bottom Controls Row */}
          <div className="yt-bottom-row">
            <div className="yt-bottom-left">
              <button
                className="yt-icon-btn"
                onClick={() => {
                  const video = videoRef.current;
                  if (video) {
                    if (video.paused) video.play();
                    else video.pause();
                  }
                }}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>

              {/* Volume Slider (Desktop) */}
              <div className="yt-volume-cluster">
                <button
                  className="yt-icon-btn"
                  onClick={() => {
                    const video = videoRef.current;
                    if (video) {
                      video.muted = !isMuted;
                      setIsMuted(!isMuted);
                    }
                  }}
                  title={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <div className="yt-volume-slider-wrap">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setVolume(v);
                      setIsMuted(v === 0);
                      if (videoRef.current) {
                        videoRef.current.volume = v;
                        videoRef.current.muted = v === 0;
                      }
                      localStorage.setItem('app_player_volume', v.toString());
                    }}
                    className="yt-volume-slider"
                  />
                </div>
              </div>

              {/* Timestamp Toggle (Watched vs Remaining) */}
              <button
                className={`yt-timestamp-btn ${showRemainingTime ? 'yt-timestamp-remaining' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRemainingTime((prev) => !prev);
                }}
                title={showRemainingTime ? 'Click to show watched time' : 'Click to show remaining time (-)'}
              >
                <span>{formattedTimeDisplay}</span>
              </button>
            </div>

            <div className="yt-bottom-right">
              {/* Fullscreen Notes Panel Button */}
              {isFullscreen && (
                <button
                  className="yt-icon-btn"
                  onClick={() => setActivePanel?.(activePanel === 'notes' ? null : 'notes')}
                  title="Timestamped Notes Panel"
                  style={{ color: activePanel === 'notes' ? 'var(--accent, #f59e0b)' : '#fff' }}
                >
                  <Bookmark size={18} />
                </button>
              )}

              {/* Fullscreen Download Panel Button (Hidden for PW lectures) */}
              {isFullscreen && !isPwVideo && (
                <button
                  className="yt-icon-btn"
                  onClick={() => setActivePanel?.(activePanel === 'download' ? null : 'download')}
                  title="Download Lecture Panel"
                  style={{ color: activePanel === 'download' ? '#38bdf8' : '#fff' }}
                >
                  <Download size={18} />
                </button>
              )}

              {/* Theater Mode Toggle (Desktop only) */}
              <button
                className="yt-icon-btn"
                onClick={() => setIsTheaterMode((prev) => !prev)}
                title="Theater Mode (t)"
                style={{ color: isTheaterMode ? 'var(--accent, #f59e0b)' : '#fff' }}
              >
                <Tv size={18} />
              </button>

              {/* Fullscreen Toggle */}
              <button
                className="yt-icon-btn"
                onClick={() => handleToggleFullscreen()}
                title="Fullscreen (f)"
              >
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Layer 5: Modal & Drawer Layer ── */}
      {/* Settings Bottom Sheet */}
      {showSettings && (
        <div
          className="yt-bottom-sheet-backdrop yt-scrim-interactive"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="yt-bottom-sheet-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="yt-sheet-drag-handle" />
            <div className="yt-sheet-header">
              <h4 className="yt-sheet-title">Playback Settings</h4>
              <button
                className="yt-icon-btn"
                onClick={() => setShowSettings(false)}
              >
                <X size={16} />
              </button>
            </div>

            {/* Quality Section */}
            {qualityLevels.length > 1 && (
              <div className="yt-sheet-row">
                <span className="yt-sheet-row-label">Quality</span>
                <div className="yt-chips-container">
                  {qualityLevels.map((lvl) => {
                    const isAuto = lvl.id === -1;
                    const isActive = isAuto
                      ? (currentQuality <= 0 || currentQuality === -1)
                      : (currentQuality === (lvl.height || lvl.id));
                    return (
                      <button
                        key={lvl.id}
                        className={`yt-chip-btn ${isActive ? 'active' : ''}`}
                        onClick={() => handleQualityChange(lvl)}
                      >
                        {lvl.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Playback Speed Section */}
            <div className="yt-sheet-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span className="yt-sheet-row-label">Playback Speed</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--accent, #f59e0b)', fontWeight: 700 }}>
                  {playbackSpeed.toFixed(2)}x
                </span>
              </div>
              <div className="yt-chips-container" style={{ width: '100%' }}>
                {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => (
                  <button
                    key={s}
                    className={`yt-chip-btn ${Math.abs(playbackSpeed - s) < 0.01 ? 'active' : ''}`}
                    onClick={() => applySpeed(s)}
                  >
                    {s === 1 ? 'Normal' : `${s}x`}
                  </button>
                ))}
              </div>
            </div>

            {/* Sleep Timer Section */}
            <div className="yt-sheet-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span className="yt-sheet-row-label">
                  <Clock size={16} /> Sleep Timer
                </span>
                {sleepTimerRemaining > 0 && (
                  <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
                    {formatSeekTime(sleepTimerRemaining)} remaining
                  </span>
                )}
              </div>
              <div className="yt-chips-container" style={{ width: '100%' }}>
                {[
                  { label: 'Off', val: 0 },
                  { label: '15m', val: 15 },
                  { label: '30m', val: 30 },
                  { label: '45m', val: 45 },
                  { label: '60m', val: 60 }
                ].map((opt) => (
                  <button
                    key={opt.val}
                    className={`yt-chip-btn ${sleepTimerOption === opt.val ? 'active' : ''}`}
                    onClick={() => setSleepTimerOption(opt.val)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lock Screen */}
            <div className="yt-sheet-row">
              <span className="yt-sheet-row-label">
                <Lock size={16} /> Lock Screen
              </span>
              <button
                className="yt-chip-btn"
                onClick={() => {
                  setShowSettings(false);
                  setIsScreenLocked(true);
                }}
              >
                Lock Controls
              </button>
            </div>

            {/* Stats for Nerds */}
            <div className="yt-sheet-row">
              <span className="yt-sheet-row-label">
                <BarChart2 size={16} /> Stats for Nerds
              </span>
              <button
                className={`yt-chip-btn ${showStatsHud ? 'active' : ''}`}
                onClick={() => {
                  setShowStatsHud(!showStatsHud);
                  setShowSettings(false);
                }}
              >
                {showStatsHud ? 'Hide HUD' : 'Show HUD'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Right Side Panel (When in Fullscreen Mode) */}
      {isFullscreenPanelOpen && (
        <div className="yt-fullscreen-side-panel yt-scrim-interactive" onClick={(e) => e.stopPropagation()}>
          <RightSidePanel
            type={activePanel}
            onClose={() => setActivePanel?.(null)}
            item={item}
            url={url}
            user={user}
            notes={notes}
            currentTime={currentTime}
            onAddNote={onAddNote}
            onDeleteNote={onDeleteNote}
            onSeek={(t) => {
              if (videoRef.current) {
                videoRef.current.currentTime = t;
                videoRef.current.play().catch(() => {});
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
