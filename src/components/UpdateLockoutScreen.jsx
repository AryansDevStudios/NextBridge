import React, { useState, useRef } from 'react';
import { Download, RefreshCw, AlertTriangle, ShieldAlert, ExternalLink, Sparkles, CheckCircle2, Send } from 'lucide-react';
import { Capacitor, registerPlugin } from '@capacitor/core';

export default function UpdateLockoutScreen({ forcedUpdate, currentVersion, currentOtaVersion, user, onRefresh, onCheckOta }) {
  const [refreshing, setRefreshing] = useState(false);
  const [apkState, setApkState] = useState('idle'); // 'idle' | 'downloading' | 'done' | 'error'
  const [apkProgress, setApkProgress] = useState(0);
  const [apkDownloaded, setApkDownloaded] = useState('');
  const [apkTotal, setApkTotal] = useState('');
  const [apkError, setApkError] = useState('');
  const abortRef = useRef(null);
  const isNative = Capacitor.isNativePlatform();

  const downloadAndInstallApk = async () => {
    const url = forcedUpdate?.downloadUrl?.trim();
    if (!url) {
      alert('No download link was configured. Please contact the administrator.');
      return;
    }
    if (!isNative) {
      try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (e) { window.location.href = url; }
      return;
    }
    setApkState('downloading');
    setApkProgress(0);
    setApkError('');
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      setApkTotal(total ? formatMB(total) : '');
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total > 0) {
          setApkProgress(Math.min(99, Math.round((received / total) * 100)));
          setApkDownloaded(formatMB(received));
        } else {
          setApkProgress(prev => Math.min(90, prev + 2));
          setApkDownloaded(formatMB(received));
        }
      }
      setApkProgress(100);
      const fullData = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { fullData.set(chunk, offset); offset += chunk.length; }
      const base64 = uint8ToBase64(fullData);
      const DownloadService = registerPlugin('DownloadService');
      await DownloadService.installApk({ base64, fileName: 'nextbridge_update.apk' });
      setApkState('done');
    } catch (err) {
      if (err.name === 'AbortError') { setApkState('idle'); }
      else {
        console.error('[UpdateLockout] APK install error:', err);
        setApkError(err.message || 'Download failed. Check your internet connection and try again.');
        setApkState('error');
      }
    }
  };

  const cancelDownload = () => {
    if (abortRef.current) abortRef.current.abort();
    setApkState('idle');
    setApkProgress(0);
  };

  // Bug 4 fix: check OTA bundle THEN re-evaluate Firestore lockout
  const handleManualCheck = async () => {
    setRefreshing(true);
    try {
      if (onCheckOta) await onCheckOta();
      if (onRefresh) await onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 800);
    }
  };

  return (
    <div style={{ minHeight: '100vh', width: '100vw', backgroundColor: '#0a0a0a', color: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box', position: 'fixed', inset: 0, zIndex: 99999, overflowY: 'auto' }}>
      <div style={{ maxWidth: '460px', width: '100%', backgroundColor: '#121212', border: '1px solid #262626', borderRadius: '20px', padding: '32px 24px', boxShadow: '0 20px 40px rgba(0,0,0,0.8), 0 0 40px rgba(245, 158, 11, 0.08)', textAlign: 'center', margin: 'auto' }}>

        <div style={{ width: '72px', height: '72px', borderRadius: '50%', backgroundColor: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#f59e0b' }}>
          <ShieldAlert size={36} />
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '9999px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', color: '#f87171', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
          <AlertTriangle size={12} />
          Mandatory Update Required
        </div>

        <h2 style={{ fontSize: '22px', fontWeight: '800', letterSpacing: '-0.02em', margin: '0 0 10px', color: '#ffffff' }}>App Update Available</h2>

        <p style={{ fontSize: '14px', lineHeight: '1.5', color: '#9ca3af', margin: '0 0 20px' }}>
          {forcedUpdate?.message || 'A required app update is available. You must install this update to continue accessing lectures, books, and study materials.'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: '#181818', border: '1px solid #262626', borderRadius: '12px', padding: '12px 14px', marginBottom: '20px', textAlign: 'left' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 600 }}>Your Version</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#ef4444', marginTop: '2px' }}>v{currentVersion || '\u2014'}</div>
            <div style={{ fontSize: '10px', color: '#a1a1aa' }}>
              {isNative ? (currentOtaVersion && currentOtaVersion !== currentVersion ? `Android APK (OTA v${currentOtaVersion})` : 'Android App') : 'Web App'}
            </div>
          </div>
          <div style={{ borderLeft: '1px solid #262626', paddingLeft: '12px' }}>
            <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 600 }}>Required Version</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#10b981', marginTop: '2px' }}>v{forcedUpdate?.minVersion || '\u2014'}</div>
            <div style={{ fontSize: '10px', color: '#10b981' }}>Latest Release</div>
          </div>
        </div>

        {forcedUpdate?.releaseNotes && (
          <div style={{ backgroundColor: '#141414', border: '1px solid #262626', borderRadius: '12px', padding: '12px 14px', marginBottom: '20px', textAlign: 'left', maxHeight: '120px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#f59e0b', marginBottom: '6px', textTransform: 'uppercase' }}>
              <Sparkles size={12} /> What's New in this Update
            </div>
            <div style={{ fontSize: '12px', color: '#d1d5db', lineHeight: '1.5', whiteSpace: 'pre-line' }}>{forcedUpdate.releaseNotes}</div>
          </div>
        )}

        {forcedUpdate?.downloadUrl ? (
          <>
            {apkState === 'idle' && (
              <button onClick={downloadAndInstallApk} style={{ width: '100%', padding: '13px 18px', backgroundColor: '#f59e0b', color: '#0a0a0a', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)', marginBottom: '10px' }}>
                <Download size={18} />
                <span>{isNative ? 'Download & Install APK' : 'Download Update'}</span>
                <ExternalLink size={14} style={{ opacity: 0.7 }} />
              </button>
            )}
            {apkState === 'downloading' && (
              <div style={{ backgroundColor: '#181818', border: '1px solid #262626', borderRadius: '12px', padding: '14px', marginBottom: '10px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>Downloading APK&hellip;</span>
                  <span style={{ color: '#9ca3af' }}>{apkDownloaded}{apkTotal ? ` / ${apkTotal}` : ''}</span>
                </div>
                <div style={{ height: '6px', borderRadius: '3px', backgroundColor: '#262626', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${apkProgress}%`, borderRadius: '3px', background: 'linear-gradient(90deg, #f59e0b, #fbbf24)', transition: 'width 0.3s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#71717a' }}>
                  <span>{apkProgress}%</span>
                  <button onClick={cancelDownload} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>Cancel</button>
                </div>
                {isNative && <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#71717a', lineHeight: 1.4 }}>After download completes, Android will ask you to allow installing from this source &mdash; tap <strong style={{ color: '#f3f4f6' }}>Allow</strong>.</p>}
              </div>
            )}
            {apkState === 'done' && (
              <div style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '12px', padding: '12px 14px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#10b981' }}>APK ready to install</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>Follow the Android installer prompt. After installing, open the app again.</div>
                </div>
              </div>
            )}
            {apkState === 'error' && (
              <div style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '12px 14px', marginBottom: '10px', textAlign: 'left' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444', marginBottom: '4px' }}>Download failed</div>
                <div style={{ fontSize: '11px', color: '#9ca3af' }}>{apkError}</div>
                <button onClick={() => setApkState('idle')} style={{ marginTop: '8px', background: 'none', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>Try again</button>
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '12px', backgroundColor: '#181818', borderRadius: '10px', fontSize: '12px', color: '#f59e0b', marginBottom: '10px' }}>
            Please contact your teacher or administrator to receive the latest APK install file.
          </div>
        )}

        <button onClick={handleManualCheck} disabled={refreshing || apkState === 'downloading'} style={{ width: '100%', padding: '11px 16px', backgroundColor: '#1a1a1a', color: '#f3f4f6', border: '1px solid #333', borderRadius: '12px', fontSize: '13px', fontWeight: 600, cursor: (refreshing || apkState === 'downloading') ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px', opacity: apkState === 'downloading' ? 0.5 : 1 }}>
          <RefreshCw size={15} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
          <span>{refreshing ? 'Checking version\u2026' : 'I have installed it, check again'}</span>
        </button>

        <button
          onClick={() => {
            try {
              window.open('https://t.me/nextbridge19', '_blank');
            } catch (_) {
              window.location.href = 'https://t.me/nextbridge19';
            }
          }}
          style={{
            width: '100%',
            padding: '11px 16px',
            backgroundColor: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            color: '#f59e0b',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '16px'
          }}
        >
          <Send size={15} />
          <span>Need Help? Contact Admin on Telegram</span>
          <ExternalLink size={13} style={{ opacity: 0.7, marginLeft: 'auto' }} />
        </button>

        <div style={{ paddingTop: '16px', borderTop: '1px solid #222', textAlign: 'center', fontSize: '12px', color: '#71717a' }}>
          {user?.name ? <span>Logged in: <strong style={{ color: '#d1d5db' }}>{user.name}</strong></span> : <span>Device Locked</span>}
        </div>
      </div>
    </div>
  );
}

function formatMB(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function uint8ToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); }
  return window.btoa(binary);
}
