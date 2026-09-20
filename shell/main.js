import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor } from '@capacitor/core';

// Safely notify Capgo
try {
  CapacitorUpdater.notifyAppReady().catch(() => {});
} catch (e) {}

const statusEl = document.getElementById('status-text');
const detailEl = document.getElementById('detail-text');
const progressBar = document.getElementById('progress-bar');
const retryBtn = document.getElementById('retry-btn');

function setStatus(status, detail = '') {
  if (statusEl) statusEl.textContent = status;
  if (detailEl) detailEl.textContent = detail;
}

function setProgress(percent) {
  if (!progressBar) return;
  if (percent === null) {
    progressBar.classList.add('indeterminate');
  } else {
    progressBar.classList.remove('indeterminate');
    progressBar.style.width = Math.min(100, Math.max(0, percent)) + '%';
  }
}

function showError(msg) {
  setStatus('Download Interrupted', msg);
  setProgress(0);
  if (retryBtn) retryBtn.style.display = 'block';
}

async function startUpdate() {
  if (retryBtn) retryBtn.style.display = 'none';
  setProgress(null);
  setStatus('Checking for updates...', 'Connecting to server');

  if (!Capacitor.isNativePlatform()) {
    setStatus('Ready', 'Opening web portal...');
    window.location.href = '/';
    return;
  }

  try {
    const versionUrl = 'https://nextbridgeweb.netlify.app/buildcode/version.json?t=' + Date.now();
    const res = await fetch(versionUrl);
    if (!res.ok) throw new Error('Update server returned status ' + res.status);
    
    const data = await res.json();
    if (!data.version || !data.url) throw new Error('Invalid update manifest');

    setStatus('Downloading application...', 'Fetching latest resources');
    const downloadUrl = 'https://nextbridgeweb.netlify.app' + data.url;

    // Listen to download progress
    let listener = null;
    try {
      listener = await CapacitorUpdater.addListener('download', (event) => {
        if (event && event.percent !== undefined) {
          setProgress(event.percent);
          setStatus('Downloading resources...', `${Math.round(event.percent)}% complete`);
        }
      });
    } catch (e) {
      console.warn('Progress listener not supported:', e);
    }

    const update = await CapacitorUpdater.download({
      url: downloadUrl,
      version: String(data.version)
    });

    if (listener) {
      listener.remove().catch(() => {});
    }

    setProgress(100);
    setStatus('Installing update...', 'Unpacking application bundle');
    localStorage.setItem('app_version', String(data.version));

    // Brief moment so user sees installation complete
    setTimeout(async () => {
      setStatus('Starting Next Bridge...', 'Launching application');
      try {
        await CapacitorUpdater.set(update);
      } catch (err) {
        console.error('Failed to activate update:', err);
        showError('Failed to apply update. Please retry.');
      }
    }, 400);

  } catch (err) {
    console.error('Update failed:', err);
    showError('Unable to connect to server. Check your internet.');
  }
}

window.startUpdate = startUpdate;

// Automatically initiate the download immediately on load
startUpdate();
