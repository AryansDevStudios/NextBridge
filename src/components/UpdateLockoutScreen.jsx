import React, { useState } from 'react';
import { Download, RefreshCw, AlertTriangle, ShieldAlert, LogOut, ExternalLink, Sparkles } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

export default function UpdateLockoutScreen({ forcedUpdate, currentVersion, user, onRefresh, onLogout }) {
  const [refreshing, setRefreshing] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  const handleDownload = () => {
    if (!forcedUpdate?.downloadUrl) {
      alert('No download link was configured. Please contact the administrator.');
      return;
    }
    const url = forcedUpdate.downloadUrl.trim();
    try {
      if (isNative) {
        window.open(url, '_system');
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      window.location.href = url;
    }
  };

  const handleManualCheck = async () => {
    setRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 800);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      backgroundColor: '#0a0a0a',
      color: '#f3f4f6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      boxSizing: 'border-box',
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      overflowY: 'auto'
    }}>
      <div style={{
        maxWidth: '460px',
        width: '100%',
        backgroundColor: '#121212',
        border: '1px solid #262626',
        borderRadius: '20px',
        padding: '32px 24px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.8), 0 0 40px rgba(245, 158, 11, 0.08)',
        textAlign: 'center',
        margin: 'auto'
      }}>
        {/* Animated Icon Badge */}
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          color: '#f59e0b'
        }}>
          <ShieldAlert size={36} />
        </div>

        {/* Title & Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 12px',
          borderRadius: '9999px',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          color: '#f87171',
          fontSize: '11px',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '12px'
        }}>
          <AlertTriangle size={12} />
          Mandatory Update Required
        </div>

        <h2 style={{
          fontSize: '22px',
          fontWeight: '800',
          letterSpacing: '-0.02em',
          margin: '0 0 10px',
          color: '#ffffff'
        }}>
          App Update Available
        </h2>

        <p style={{
          fontSize: '14px',
          lineHeight: '1.5',
          color: '#9ca3af',
          margin: '0 0 20px'
        }}>
          {forcedUpdate?.message || 'A required app update is available. You must install this update to continue accessing lectures, books, and study materials.'}
        </p>

        {/* Version Comparison Box */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10px',
          backgroundColor: '#181818',
          border: '1px solid #262626',
          borderRadius: '12px',
          padding: '12px 14px',
          marginBottom: '20px',
          textAlign: 'left'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 600 }}>Your Version</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#ef4444', marginTop: '2px' }}>
              v{currentVersion || '2.6.x'}
            </div>
            <div style={{ fontSize: '10px', color: '#a1a1aa' }}>{isNative ? 'Android App' : 'Web App'}</div>
          </div>
          <div style={{ borderLeft: '1px solid #262626', paddingLeft: '12px' }}>
            <div style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 600 }}>Required Version</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#10b981', marginTop: '2px' }}>
              v{forcedUpdate?.minVersion || '2.7.0'}
            </div>
            <div style={{ fontSize: '10px', color: '#10b981' }}>Latest Release</div>
          </div>
        </div>

        {/* Release Notes (if present) */}
        {forcedUpdate?.releaseNotes && (
          <div style={{
            backgroundColor: '#141414',
            border: '1px solid #262626',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '20px',
            textAlign: 'left',
            maxHeight: '120px',
            overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#f59e0b',
              marginBottom: '6px',
              textTransform: 'uppercase'
            }}>
              <Sparkles size={12} />
              What's New in this Update
            </div>
            <div style={{
              fontSize: '12px',
              color: '#d1d5db',
              lineHeight: '1.5',
              whiteSpace: 'pre-line'
            }}>
              {forcedUpdate.releaseNotes}
            </div>
          </div>
        )}

        {/* Primary CTA: Download Update */}
        {forcedUpdate?.downloadUrl ? (
          <button
            onClick={handleDownload}
            style={{
              width: '100%',
              padding: '13px 18px',
              backgroundColor: '#f59e0b',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)',
              marginBottom: '10px',
              transition: 'background-color 0.2s'
            }}
          >
            <Download size={18} />
            <span>Download & Install APK</span>
            <ExternalLink size={14} style={{ opacity: 0.7 }} />
          </button>
        ) : (
          <div style={{
            padding: '12px',
            backgroundColor: '#181818',
            borderRadius: '10px',
            fontSize: '12px',
            color: '#f59e0b',
            marginBottom: '10px'
          }}>
            Please contact your teacher or administrator to receive the latest APK install file.
          </div>
        )}

        {/* Secondary Action: Recheck */}
        <button
          onClick={handleManualCheck}
          disabled={refreshing}
          style={{
            width: '100%',
            padding: '11px 16px',
            backgroundColor: '#1a1a1a',
            color: '#f3f4f6',
            border: '1px solid #333',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: refreshing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '16px'
          }}
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          <span>{refreshing ? 'Checking version...' : 'I have installed it, check again'}</span>
        </button>

        {/* Student info and sign out */}
        <div style={{
          paddingTop: '16px',
          borderTop: '1px solid #222',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: '#71717a'
        }}>
          <div style={{ textAlign: 'left', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name ? (
              <span>Logged in: <strong style={{ color: '#d1d5db' }}>{user.name}</strong></span>
            ) : (
              <span>Device Locked</span>
            )}
          </div>
          <button
            onClick={onLogout}
            style={{
              background: 'none',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: 600,
              padding: '4px 6px'
            }}
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
