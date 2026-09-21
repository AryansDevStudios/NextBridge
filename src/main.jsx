import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { CapacitorUpdater } from '@capgo/capacitor-updater'

// CRITICAL: Immediately inform Capgo that this version has booted successfully.
// Without this call, Capgo will assume the update failed and roll back to the base APK after a few seconds!
CapacitorUpdater.notifyAppReady().catch(e => console.warn('[OTA] notifyAppReady:', e));

// Register Service Worker for PWA offline support + HLS segment serving
// Only register on the web (not inside native Capacitor WebView)
if ('serviceWorker' in navigator && !window.Capacitor?.isNativePlatform?.()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[SW] Registered, scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
