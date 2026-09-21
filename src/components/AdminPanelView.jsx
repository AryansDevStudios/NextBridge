import React, { useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

const ADMIN_PANEL_URL = 'https://nextbridgeweb.netlify.app/admin/';
const ADMIN_KEY = '_nb_admin_mode';

/**
 * AdminPanelView
 * Full-screen iframe wrapper for the NextBridge admin panel.
 * Shown when admin mode is unlocked on this device.
 * The user exits via back gesture, Android back button, or by clearing the flag.
 */
export default function AdminPanelView({ onExit }) {
  // Handle Android hardware back button
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = App.addListener('backButton', () => {
      handleExit();
    });
    return () => {
      listenerPromise.then(l => l.remove()).catch(() => {});
    };
  }, []);

  const handleExit = useCallback(() => {
    // Set the admin mode flag to '0' so next launch opens the normal user app
    try { 
      localStorage.setItem(ADMIN_KEY, '0'); 
    } catch (_) {}
    if (onExit) onExit();
  }, [onExit]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Minimal exit strip — only visible for 3s then fades, or user can tap the 3-dot corner */}
      <ExitHint onExit={handleExit} />

      {/* Full-screen iframe */}
      <iframe
        src={ADMIN_PANEL_URL}
        title="Admin Panel"
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#0a0a0a'
        }}
        allow="fullscreen"
      />
    </div>
  );
}

// Small corner pill that auto-hides after 4 seconds to let the admin see the full panel
function ExitHint({ onExit }) {
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <button
      onClick={onExit}
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        right: '12px',
        zIndex: 100000,
        height: '30px',
        padding: '0 12px',
        borderRadius: '999px',
        background: 'rgba(10,10,10,0.92)',
        border: '1px solid rgba(255,255,255,0.15)',
        color: '#f3f4f6',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.6)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transform: visible ? 'translateY(0)' : 'translateY(-8px)'
      }}
      aria-label="Exit admin panel"
    >
      ← Exit Admin
    </button>
  );
}
