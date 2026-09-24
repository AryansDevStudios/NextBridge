import { useEffect, useState, useRef, useCallback } from 'react';
import { db } from './firebase';
import LearningHub from './components/LearningHub';
import AdminPanelView from './components/AdminPanelView';
import { collection, query, where, getDocs, getDoc, updateDoc, doc, addDoc, onSnapshot, increment } from 'firebase/firestore';
import { Device } from '@capacitor/device';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { ShieldAlert, Loader2, Download, Lock, RefreshCw, KeyRound, Send, ExternalLink } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';
import UpdateLockoutScreen from './components/UpdateLockoutScreen';
import { APP_VERSION, APP_VERSION_CODE, compareSemver, isUpdateRequired } from './utils/version';

const ADMIN_KEY = '_nb_admin_mode';


// CRITICAL: Notify Capgo immediately on module import that the app has booted
CapacitorUpdater.notifyAppReady().catch(e => console.warn('[OTA] notifyAppReady module-level:', e));

export default function App() {
  const [loading, setLoading] = useState(true);
  const [updateMsg, setUpdateMsg] = useState('');
  const [user, setUser] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);

  // Admin panel state — persisted across sessions by localStorage flag
  const [showAdminPanel, setShowAdminPanel] = useState(() => {
    try { return localStorage.getItem(ADMIN_KEY) === '1'; } catch { return false; }
  });

  // Login Form State
  const [patInput, setPatInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isDeviceBound, setIsDeviceBound] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [forcedUpdateInfo, setForcedUpdateInfo] = useState(null);

  // Ref to hold the timestamp of when the app became active
  const sessionStartTime = useRef(null);

  useEffect(() => {
    const init = async () => {
      // 1. Re-affirm notifyAppReady on component mount to ensure Capgo watchdog is satisfied
      try {
        await CapacitorUpdater.notifyAppReady();
        console.log('[OTA] Successfully notified Capgo that app is ready');
      } catch (err) {
        console.warn('[OTA] notifyAppReady ignored on non-native platform:', err);
      }

      // 2. Check cached user credentials for instant offline loading
      const cached = localStorage.getItem('student_user');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.id) {
            setUser(parsed);
            setLoading(false); // Render UI immediately
          }
        } catch (e) {
          console.error('[Auth] Failed to parse cached student user:', e);
        }
      }

      // 3. OTA Update Check (only on physical mobile platforms)
      await checkForUpdates();

      // 4. Validate or establish session with Firestore
      await checkAutoLogin();

      // 5. Prompt notification permission on first launch for download alerts
      if (Capacitor.isNativePlatform()) {
        try {
          PrivacyScreen.disable().catch(() => {});
        } catch (e) {}
        try {
          const DownloadService = registerPlugin('DownloadService');
          DownloadService.requestPermissions().catch(() => {});
        } catch (e) {}
      }
    };

    init();
  }, []);

  // Real-time subscription & status listener
  useEffect(() => {
    if (!user?.id) return;

    const unsub = onSnapshot(doc(db, 'students', user.id), (snap) => {
      if (!snap.exists()) {
        // Account was deleted in Firestore
        localStorage.removeItem('student_user');
        localStorage.removeItem('student_pat');
        localStorage.removeItem('student_device_bound_at');
        setUser(null);
        setErrorMsg('This account has been deleted by the administrator. Device is unlinked.');
        setIsDeviceBound(false);
        return;
      }
      const data = { id: snap.id, ...snap.data() };

      const localDeviceId = deviceInfo?.androidId || localStorage.getItem('_app_device_id');
      const localBoundAt = Number(localStorage.getItem('student_device_bound_at') || 0);
      const revokedAt = data.deviceRevokedAt ? new Date(data.deviceRevokedAt).getTime() : 0;
      const serverDeviceId = typeof data.device === 'string' ? data.device : data.device?.androidId;

      // A device unbind or replacement must invalidate the old cached session.
      if ((revokedAt && localBoundAt && revokedAt > localBoundAt) ||
          (serverDeviceId && localDeviceId && serverDeviceId !== localDeviceId)) {
        localStorage.removeItem('student_user');
        localStorage.removeItem('student_pat');
        localStorage.removeItem('student_device_bound_at');
        setErrorMsg('This device is no longer authorized for this account. Please log in again.');
        setUser(null);
        setIsDeviceBound(true);
        return;
      }

      // 1. Check if revoked by admin
      if (data.status !== 'active') {
        setErrorMsg(data.customMessage || 'Your access has been revoked by the admin.');
        localStorage.removeItem('student_user');
        setUser(null);
        setIsDeviceBound(true);
        return;
      }

      // 2. Check if subscription expired
      if (data.subscriptionExpiresAt) {
        const expiry = new Date(data.subscriptionExpiresAt).getTime();
        if (expiry <= Date.now()) {
          const formatted = new Date(data.subscriptionExpiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          setErrorMsg(data.customMessage || `Your subscription access expired on ${formatted}. Please contact admin to renew.`);
          localStorage.removeItem('student_user');
          setUser(null);
          setIsDeviceBound(true);
          return;
        }
      }

      // 3. Check if remote forced update lockout is active
      if (isUpdateRequired(data.forcedUpdate, APP_VERSION, APP_VERSION_CODE, Capacitor.isNativePlatform())) {
        setForcedUpdateInfo(data.forcedUpdate);
      } else {
        setForcedUpdateInfo(null);
      }

      // 4. Keep local user state synchronized with server
      setUser(prev => ({ ...prev, ...data }));
      try {
        const local = JSON.parse(localStorage.getItem('student_user') || '{}');
        localStorage.setItem('student_user', JSON.stringify({ ...local, ...data }));
      } catch (e) {}
    }, (err) => {
      console.warn('[Auth] Realtime listener error (safe offline fallback):', err);
    });

    return () => unsub();
  }, [user?.id]);

  // Screen Time Tracking (Periodic Heartbeat & App State Lifecycle)
  useEffect(() => {
    if (!user?.id) return;
    sessionStartTime.current = Date.now();

    const flushScreenTime = () => {
      if (sessionStartTime.current && user?.id) {
        const elapsed = Math.floor((Date.now() - sessionStartTime.current) / 1000);
        if (elapsed >= 5) {
          sessionStartTime.current = Date.now();
          const todayKey = new Date().toISOString().slice(0, 10);
          updateDoc(doc(db, 'students', user.id), {
            lastActive: new Date().toISOString(),
            totalScreenTime: increment(elapsed),
            [`dailyScreenTime.${todayKey}`]: increment(elapsed)
          }).catch(() => {});
        }
      }
    };

    // 60-second periodic heartbeat while student is active in the app
    const heartbeat = setInterval(flushScreenTime, 60000);

    // Capacitor App State Listener for background/foreground transitions
    const appStateListener = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        sessionStartTime.current = Date.now();
      } else {
        flushScreenTime();
        sessionStartTime.current = null;
      }
    });

    const handleBeforeUnload = () => {
      flushScreenTime();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushScreenTime();
      appStateListener.then(listener => listener.remove());
    };
  }, [user?.id]);

  const checkForUpdates = async () => {
    if (Capacitor.getPlatform() !== 'android' && Capacitor.getPlatform() !== 'ios') {
      return;
    }
    
    try {
      console.log('[OTA] Checking for remote updates...');
      const response = await fetch('https://nextbridgeweb.netlify.app/buildcode/version.json?t=' + Date.now());
      if (!response.ok) return;
      const data = await response.json();
      
      let runningVersion = localStorage.getItem('app_version') || '0';
      try {
        const current = await CapacitorUpdater.current();
        if (current?.bundle?.version && current.bundle.version !== 'builtin') {
          runningVersion = current.bundle.version;
          localStorage.setItem('app_version', runningVersion);
        }
      } catch (e) {}

      console.log(`[OTA] Local: ${runningVersion} | Remote: ${data.version}`);
      
      if (data.version && String(data.version) !== String(runningVersion)) {
        setUpdateMsg('Updating to latest version...');
        const downloadUrl = 'https://nextbridgeweb.netlify.app' + data.url;
        
        console.log('[OTA] Downloading bundle:', downloadUrl);
        const update = await CapacitorUpdater.download({
          url: downloadUrl,
          version: String(data.version)
        });
        
        console.log('[OTA] Download complete, applying update...');
        localStorage.setItem('app_version', String(data.version));
        
        // This reloads the WebView with the new bundle
        await CapacitorUpdater.set(update);
      }
    } catch (err) {
      console.error('[OTA] Error during update check (offline or network error):', err);
    }
  };

  const getDeviceData = async () => {
    try {
      let identifier = null;
      let model = 'Android Device';
      let osVersion = '14';

      try {
        const info = await Device.getId();
        if (info && info.identifier) {
          identifier = info.identifier;
        }
      } catch (e) {
        console.warn('[Device] Device.getId unavailable:', e);
      }

      // Robust persistent fallback for emulators or web previews
      if (!identifier) {
        identifier = localStorage.getItem('_app_device_id');
        if (!identifier) {
          identifier = 'dev_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
          localStorage.setItem('_app_device_id', identifier);
        }
      }

      try {
        const devInfo = await Device.getInfo();
        if (devInfo.model) model = devInfo.model;
        if (devInfo.osVersion) osVersion = devInfo.osVersion;
      } catch (e) {}

      const combined = { androidId: identifier, model, osVersion };
      setDeviceInfo(combined);
      return combined;
    } catch (e) {
      console.warn('[Device] getDeviceData error, fallback generated:', e);
      const fallbackId = localStorage.getItem('_app_device_id') || 'dev_fallback_' + Date.now();
      localStorage.setItem('_app_device_id', fallbackId);
      return { androidId: fallbackId, model: 'Android', osVersion: '14' };
    }
  };

  const checkAutoLogin = async () => {
    const dev = await getDeviceData();
    const savedPat = localStorage.getItem('student_pat');
    const cachedUser = localStorage.getItem('student_user');
    let cachedId = null;
    if (cachedUser) {
      try {
        const parsed = JSON.parse(cachedUser);
        if (parsed?.id) cachedId = parsed.id;
      } catch (e) {}
    }

    try {
      let targetStudent = null;

      // 1. Direct document lookup by cached ID if available
      if (cachedId) {
        try {
          const docSnap = await getDoc(doc(db, 'students', cachedId));
          if (docSnap.exists()) {
            targetStudent = { id: docSnap.id, ...docSnap.data() };
          }
        } catch (e) {
          console.warn('[Auth] Direct cached ID lookup error:', e);
        }
      }

      // 2. Look up by cached PAT
      if (!targetStudent && savedPat) {
        const qPat = query(collection(db, 'students'), where('pat', '==', savedPat.trim().toUpperCase()));
        const snapPat = await getDocs(qPat);
        if (!snapPat.empty) {
          targetStudent = { id: snapPat.docs[0].id, ...snapPat.docs[0].data() };
        }
      }

      // 3. Look up by bound Device ID
      if (!targetStudent && dev?.androidId) {
        const qDev = query(collection(db, 'students'), where('device.androidId', '==', dev.androidId));
        const snapDev = await getDocs(qDev);
        if (!snapDev.empty) {
          snapDev.forEach(d => {
            const data = d.data();
            if (data.status === 'active') targetStudent = { id: d.id, ...data };
            else if (!targetStudent) targetStudent = { id: d.id, ...data };
          });
        }
      }

      if (targetStudent) {
        // Check if subscription has expired
        const now = Date.now();
        const expiry = targetStudent.subscriptionExpiresAt ? new Date(targetStudent.subscriptionExpiresAt).getTime() : null;
        const isExpired = expiry && expiry <= now;

        if (targetStudent.status === 'active' && !isExpired) {
          const boundId = typeof targetStudent.device === 'string'
            ? targetStudent.device
            : targetStudent.device?.androidId;

          // Device match validation: allowed if unbound or bound to this device
          if (!boundId || boundId === dev?.androidId) {
            const telemetryPayload = {
              appVersion: APP_VERSION,
              versionCode: APP_VERSION_CODE,
              platform: Capacitor.isNativePlatform() ? 'android' : 'web',
              lastActive: new Date().toISOString()
            };

            // Update device info if not bound yet
            if (!boundId && dev?.androidId) {
              telemetryPayload.device = dev;
              telemetryPayload.deviceRevokedAt = null;
              targetStudent.device = dev;
              localStorage.setItem('student_device_bound_at', String(Date.now()));
            }

            await updateDoc(doc(db, 'students', targetStudent.id), telemetryPayload).catch(console.warn);

            // Check if remote forced update lockout is active
            if (isUpdateRequired(targetStudent.forcedUpdate, APP_VERSION, APP_VERSION_CODE, Capacitor.isNativePlatform())) {
              setForcedUpdateInfo(targetStudent.forcedUpdate);
            } else {
              setForcedUpdateInfo(null);
            }

            setUser(targetStudent);
            localStorage.setItem('student_user', JSON.stringify(targetStudent));
            localStorage.setItem('student_pat', targetStudent.pat || savedPat || '');
            setIsDeviceBound(false);
            setErrorMsg('');

            // Silently log login activity
            addDoc(collection(db, 'students', targetStudent.id, 'logs'), {
              type: 'login',
              timestamp: new Date().toISOString(),
              device: dev
            }).catch(console.error);
          } else {
            setErrorMsg(`This account is bound to another device (${targetStudent.device?.model || 'Device'}).`);
            localStorage.removeItem('student_user');
            setUser(null);
            setIsDeviceBound(true);
          }
        } else if (isExpired) {
          const formatted = new Date(targetStudent.subscriptionExpiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          setErrorMsg(targetStudent.customMessage || `Your subscription access expired on ${formatted}. Please contact admin to renew.`);
          localStorage.removeItem('student_user');
          setUser(null);
          setIsDeviceBound(true);
        } else {
          // Status revoked
          setErrorMsg(targetStudent.customMessage || 'Your access has been revoked by the admin.');
          localStorage.removeItem('student_user');
          setUser(null);
          setIsDeviceBound(true);
        }
      } else if (cachedId || savedPat) {
        // Account no longer exists in Firestore (deleted by admin)
        localStorage.removeItem('student_user');
        localStorage.removeItem('student_pat');
        localStorage.removeItem('student_device_bound_at');
        setUser(null);
        setIsDeviceBound(false);
      }
    } catch (err) {
      console.error('[Auth] Auto-login error (offline fallback preserved):', err);
      // If offline, keep the cached user active
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const rawInput = patInput.trim();
    const cleanPat = rawInput.toUpperCase();
    if (!rawInput) return;

    setIsVerifying(true);
    try {
      let studentDoc = null;
      let studentData = null;

      // 1. Try matching PAT uppercase (e.g. 9PBQEETM)
      const qPat = query(collection(db, 'students'), where('pat', '==', cleanPat));
      const snapPat = await getDocs(qPat);
      if (!snapPat.empty) {
        studentDoc = snapPat.docs[0];
        studentData = studentDoc.data();
      }

      // 2. Try matching PAT exact case
      if (!studentDoc && cleanPat !== rawInput) {
        const qRaw = query(collection(db, 'students'), where('pat', '==', rawInput));
        const snapRaw = await getDocs(qRaw);
        if (!snapRaw.empty) {
          studentDoc = snapRaw.docs[0];
          studentData = studentDoc.data();
        }
      }

      // 3. Try matching Document ID directly (e.g. bQsbjVAfH5dheDfMl8Qa)
      if (!studentDoc) {
        try {
          const directSnap = await getDoc(doc(db, 'students', rawInput));
          if (directSnap.exists()) {
            studentDoc = directSnap;
            studentData = directSnap.data();
          }
        } catch (err) {}
      }

      // 4. Fallback search across all students (checks PAT, ID, or Name)
      if (!studentDoc) {
        try {
          const allSnap = await getDocs(collection(db, 'students'));
          const matched = allSnap.docs.find(d => {
            const data = d.data();
            const p = data.pat ? String(data.pat).trim().toUpperCase() : '';
            const n = data.name ? String(data.name).trim().toLowerCase() : '';
            return p === cleanPat || d.id === rawInput || n === rawInput.toLowerCase();
          });
          if (matched) {
            studentDoc = matched;
            studentData = matched.data();
          }
        } catch (e) {
          console.warn('[Auth] Fallback student collection scan error:', e);
        }
      }

      if (!studentDoc || !studentData) {
        setErrorMsg('Invalid Access Token or Student ID. Please check and try again.');
        setIsVerifying(false);
        return;
      }

      // Status check
      if (studentData.status !== 'active') {
        setErrorMsg(studentData.customMessage || 'Your access has been revoked by the admin.');
        setIsVerifying(false);
        setIsDeviceBound(true);
        return;
      }

      // Subscription expiry check
      if (studentData.subscriptionExpiresAt) {
        const expiry = new Date(studentData.subscriptionExpiresAt).getTime();
        if (expiry <= Date.now()) {
          const formatted = new Date(studentData.subscriptionExpiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          setErrorMsg(studentData.customMessage || `Your subscription access expired on ${formatted}. Please contact admin to renew.`);
          setIsVerifying(false);
          setIsDeviceBound(true);
          return;
        }
      }

      const dev = await getDeviceData();

      const boundId = typeof studentData.device === 'string'
        ? studentData.device
        : studentData.device?.androidId;

      // Device binding check: if already bound to a different device
      if (boundId && boundId !== dev.androidId) {
        setErrorMsg(`This account is already registered on another device (${studentData.device?.model || 'Device'}). Contact admin to unbind.`);
        setIsVerifying(false);
        return;
      }

      // Bind device if not currently bound, and sync version telemetry
      const telemetryPayload = {
        appVersion: APP_VERSION,
        versionCode: APP_VERSION_CODE,
        platform: Capacitor.isNativePlatform() ? 'android' : 'web',
        lastActive: new Date().toISOString()
      };
      if (!boundId) {
        telemetryPayload.device = dev;
        telemetryPayload.deviceRevokedAt = null;
        localStorage.setItem('student_device_bound_at', String(Date.now()));
      }
      await updateDoc(doc(db, 'students', studentDoc.id), telemetryPayload).catch(console.warn);

      // Check remote forced update requirement
      if (isUpdateRequired(studentData.forcedUpdate, APP_VERSION, APP_VERSION_CODE, Capacitor.isNativePlatform())) {
        setForcedUpdateInfo(studentData.forcedUpdate);
      } else {
        setForcedUpdateInfo(null);
      }

      // Log successful login
      addDoc(collection(db, 'students', studentDoc.id, 'logs'), {
        type: 'login',
        timestamp: new Date().toISOString(),
        device: dev
      }).catch(console.error);

      const authedStudent = { id: studentDoc.id, ...studentData, device: dev };
      localStorage.setItem('student_user', JSON.stringify(authedStudent));
      localStorage.setItem('student_pat', studentData.pat || cleanPat);
      
      setUser(authedStudent);
      setIsDeviceBound(false);
      setErrorMsg('');
    } catch (err) {
      console.error('[Auth] Login exception:', err);
      setErrorMsg('An error occurred during authentication. Please check your internet connection.');
    }
    setIsVerifying(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('student_user');
    localStorage.removeItem('student_pat');
    setUser(null);
    setPatInput('');
    setErrorMsg('');
    setIsDeviceBound(false);
    setForcedUpdateInfo(null);
  };

  if (loading || updateMsg) {
    return (
      <div className="login-container">
        <div className="login-card" style={{ padding: '48px 32px' }}>
          <div className="login-icon">
            {updateMsg ? <Download size={32} className="animate-bounce" /> : <Loader2 size={32} className="spin-icon" />}
          </div>
          <h2>{updateMsg ? 'Updating NextBridge' : 'Authenticating'}</h2>
          <p>{updateMsg || 'Verifying credentials...'}</p>
        </div>
      </div>
    );
  }

  if (showAdminPanel) {
    return (
      <AdminPanelView 
        onExit={() => {
          try { localStorage.setItem(ADMIN_KEY, '0'); } catch (_) {}
          setShowAdminPanel(false);
        }} 
      />
    );
  }

  if (forcedUpdateInfo) {
    return (
      <UpdateLockoutScreen 
        forcedUpdate={forcedUpdateInfo}
        currentVersion={APP_VERSION}
        user={user}
        onRefresh={checkAutoLogin}
        onLogout={handleLogout}
      />
    );
  }

  if (user) {
    return (
      <LearningHub 
        user={user} 
        onLogout={handleLogout} 
        onOpenAdmin={() => {
          try { localStorage.setItem(ADMIN_KEY, '1'); } catch (_) {}
          setShowAdminPanel(true);
        }}
      />
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        {/* App Logo */}
        <div style={{ marginBottom: '20px' }}>
          <img 
            src="/favicon.png" 
            alt="Next Bridge Logo" 
            style={{ 
              width: '68px', 
              height: '68px', 
              borderRadius: '16px', 
              boxShadow: '0 8px 24px rgba(245, 158, 11, 0.25)',
              border: '2px solid rgba(245, 158, 11, 0.3)'
            }} 
          />
        </div>

        <h2>Next Bridge</h2>
        <p style={{ marginBottom: '24px' }}>
          Enter your Permanent Access Token (PAT) to access courses.
        </p>

        {errorMsg && (
          <div className="error-message" style={{ 
            background: 'rgba(239, 68, 68, 0.12)', 
            border: '1px solid rgba(239, 68, 68, 0.3)', 
            borderRadius: '10px', 
            padding: '12px 16px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px',
            width: '100%',
            textAlign: 'left',
            color: '#f87171',
            marginBottom: '16px'
          }}>
            <ShieldAlert size={20} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.875rem', lineHeight: '1.4' }}>{errorMsg}</span>
          </div>
        )}

        {isDeviceBound ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                checkAutoLogin();
              }}
              className="login-button"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <RefreshCw size={18} /> Check Status Again
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} style={{ width: '100%' }}>
            <div className="input-group">
              <div style={{ position: 'relative', width: '100%' }}>
                <KeyRound 
                  size={18} 
                  style={{ 
                    position: 'absolute', 
                    left: '14px', 
                    top: '50%', 
                    transform: 'translateY(-50%)', 
                    color: 'var(--text-secondary)',
                    pointerEvents: 'none'
                  }} 
                />
                <input
                  type="text"
                  value={patInput}
                  onChange={e => setPatInput(e.target.value.toUpperCase())}
                  placeholder="e.g. 9PBQEETM"
                  disabled={isVerifying}
                  autoFocus
                  style={{ 
                    paddingLeft: '42px',
                    fontFamily: 'monospace', 
                    textTransform: 'uppercase', 
                    letterSpacing: '2px',
                    fontWeight: '600'
                  }}
                  required
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="login-button" 
              disabled={isVerifying || !patInput.trim()}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '8px',
                marginTop: '8px' 
              }}
            >
              {isVerifying ? (
                <>
                  <Loader2 size={18} className="spin-icon" />
                  Verifying Token...
                </>
              ) : (
                <>
                  <Lock size={18} />
                  Authenticate Device
                </>
              )}
            </button>
          </form>
        )}

        {/* Telegram Admin Support Link */}
        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', width: '100%', textAlign: 'center' }}>
          <a
            href="https://t.me/nextbridge19"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              color: 'var(--accent)',
              textDecoration: 'none',
              fontWeight: 500,
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
            <Send size={14} />
            <span>Need access or support? Contact Admin</span>
            <ExternalLink size={12} style={{ opacity: 0.7, marginLeft: 'auto' }} />
          </a>
        </div>
      </div>

      {/* Anonymous Footer */}
      <div style={{ textAlign: 'center', marginTop: '32px' }}>
        <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
          Secure Device-Bound Portal • v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
