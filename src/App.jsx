import { useEffect, useState, useRef } from 'react';
import { db } from './firebase';
import LearningHub from './components/LearningHub';
import { collection, query, where, getDocs, updateDoc, doc, addDoc } from 'firebase/firestore';
import { Device } from '@capacitor/device';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor } from '@capacitor/core';
import { ShieldAlert, Loader2, Download, Lock, RefreshCw, KeyRound } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [updateMsg, setUpdateMsg] = useState('');
  const [user, setUser] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  
  // Login Form State
  const [patInput, setPatInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isDeviceBound, setIsDeviceBound] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Ref to hold the timestamp of when the app became active
  const sessionStartTime = useRef(null);

  useEffect(() => {
    const init = async () => {
      // 1. Instant Cache Check for seamless offline playback
      const cached = localStorage.getItem('student_user');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.id) {
            setUser(parsed);
            setLoading(false); // UI opens immediately!
          }
        } catch (e) {
          console.error("Failed to parse cached user:", e);
        }
      }

      // 2. Background OTA check
      checkForUpdates();

      // 3. Verify authentication state & device binding with Firestore
      await checkAutoLogin();
    };
    init();
  }, []);

  useEffect(() => {
    // Setup Capacitor App State Listener for Screen Time Tracking
    const appStateListener = CapApp.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        sessionStartTime.current = Date.now();
      } else {
        if (sessionStartTime.current && user) {
          const durationSecs = Math.floor((Date.now() - sessionStartTime.current) / 1000);
          try {
            const userRef = doc(db, 'students', user.id);
            const userDoc = await getDocs(query(collection(db, 'students'), where('__name__', '==', user.id)));
            if (!userDoc.empty) {
              const currentTotal = userDoc.docs[0].data().totalScreenTime || 0;
              await updateDoc(userRef, {
                lastActive: new Date().toISOString(),
                totalScreenTime: currentTotal + durationSecs
              });
            }
          } catch (err) {
            console.error("Failed to update screen time:", err);
          }
        }
      }
    });

    return () => {
      appStateListener.then(listener => listener.remove());
    };
  }, [user]);

  const checkForUpdates = async () => {
    if (Capacitor.getPlatform() !== 'android' && Capacitor.getPlatform() !== 'ios') {
      return;
    }
    
    try {
      const response = await fetch('https://nextbridgeweb.netlify.app/buildcode/version.json?t=' + Date.now());
      const data = await response.json();
      
      const currentVersion = localStorage.getItem('app_version') || '0';
      if (data.version && String(data.version) !== String(currentVersion)) {
        setUpdateMsg('Downloading new update...');
        const downloadUrl = 'https://nextbridgeweb.netlify.app' + data.url;
        const update = await CapacitorUpdater.download({
          url: downloadUrl,
          version: String(data.version)
        });
        setUpdateMsg('Applying update...');
        localStorage.setItem('app_version', String(data.version));
        await CapacitorUpdater.set(update);
      }
    } catch (err) {
      console.error('[OTA] Error during update process:', err);
    }
  };

  const getDeviceData = async () => {
    try {
      let identifier = null;
      let model = 'Android Device';
      let osVersion = '14';

      try {
        const info = await Device.getId();
        identifier = info.identifier;
      } catch (e) {
        console.warn("Device.getId failed:", e);
      }

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
      console.warn("Capacitor device data error, using fallback:", e);
      const fallbackId = localStorage.getItem('_app_device_id') || 'dev_fallback_' + Date.now();
      localStorage.setItem('_app_device_id', fallbackId);
      return { androidId: fallbackId, model: 'Android', osVersion: '14' };
    }
  };

  const checkAutoLogin = async () => {
    const dev = await getDeviceData();
    const savedPat = localStorage.getItem('student_pat');

    try {
      let targetStudent = null;

      // Check by saved PAT first if available
      if (savedPat) {
        const qPat = query(collection(db, 'students'), where('pat', '==', savedPat));
        const snapPat = await getDocs(qPat);
        if (!snapPat.empty) {
          const docData = snapPat.docs[0].data();
          targetStudent = { id: snapPat.docs[0].id, ...docData };
        }
      }

      // Otherwise check by registered device ID
      if (!targetStudent && dev?.androidId) {
        const qDev = query(collection(db, 'students'), where('device.androidId', '==', dev.androidId));
        const snapDev = await getDocs(qDev);
        if (!snapDev.empty) {
          snapDev.forEach(doc => {
            const data = doc.data();
            if (data.status === 'active') targetStudent = { id: doc.id, ...data };
            else if (!targetStudent) targetStudent = { id: doc.id, ...data };
          });
        }
      }

      if (targetStudent) {
        if (targetStudent.status === 'active') {
          // Verify device matches
          if (!targetStudent.device || targetStudent.device.androidId === dev?.androidId) {
            setUser(targetStudent);
            localStorage.setItem('student_user', JSON.stringify(targetStudent));
            localStorage.setItem('student_pat', targetStudent.pat);
            setIsDeviceBound(false);
            setErrorMsg('');

            // Silently log login
            addDoc(collection(db, 'students', targetStudent.id, 'logs'), {
              type: 'login',
              timestamp: new Date().toISOString(),
              device: dev
            }).catch(console.error);
          } else {
            setErrorMsg('This account is registered to another device.');
            localStorage.removeItem('student_user');
            setUser(null);
          }
        } else {
          // Status is revoked
          setErrorMsg(targetStudent.customMessage || 'Your access has been revoked by the admin.');
          localStorage.removeItem('student_user');
          setUser(null);
          setIsDeviceBound(true);
        }
      }
    } catch (err) {
      console.error("Auto-login error (possibly offline):", err);
      // Keep cached user if offline
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanPat = patInput.trim().toUpperCase();
    if (!cleanPat) return;

    setIsVerifying(true);
    try {
      const q = query(collection(db, 'students'), where('pat', '==', cleanPat));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setErrorMsg('Invalid Access Token. Please check and try again.');
        setIsVerifying(false);
        return;
      }

      const studentDoc = querySnapshot.docs[0];
      const studentData = studentDoc.data();

      if (studentData.status !== 'active') {
        setErrorMsg(studentData.customMessage || 'Your access has been revoked by the admin.');
        setIsVerifying(false);
        setIsDeviceBound(true);
        return;
      }

      const dev = await getDeviceData();

      // Check if already bound to another device
      if (studentData.device && studentData.device.androidId && studentData.device.androidId !== dev.androidId) {
        setErrorMsg('This Access Token is already authenticated on another device.');
        setIsVerifying(false);
        return;
      }

      // Bind device if not bound yet
      if (!studentData.device || !studentData.device.androidId) {
        await updateDoc(doc(db, 'students', studentDoc.id), {
          device: dev
        });
      }

      // Log successful login
      addDoc(collection(db, 'students', studentDoc.id, 'logs'), {
        type: 'login',
        timestamp: new Date().toISOString(),
        device: dev
      }).catch(console.error);

      const authedStudent = { id: studentDoc.id, ...studentData, device: dev };
      localStorage.setItem('student_user', JSON.stringify(authedStudent));
      localStorage.setItem('student_pat', cleanPat);
      setUser(authedStudent);
      setIsDeviceBound(false);
    } catch (err) {
      console.error(err);
      setErrorMsg('An error occurred during authentication. Check your internet connection.');
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
  };

  if (loading || updateMsg) {
    return (
      <div className="login-container">
        <div className="login-card" style={{ padding: '48px 32px' }}>
          <div className="login-icon">
            {updateMsg ? <Download size={32} className="animate-bounce" /> : <Loader2 size={32} className="spin-icon" />}
          </div>
          <h2>{updateMsg ? 'Updating App' : 'Authenticating'}</h2>
          <p>{updateMsg || 'Verifying device credentials...'}</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <LearningHub user={user} onLogout={handleLogout} />;
  }

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Logo */}
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
            color: '#f87171'
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
            <button
              type="button"
              onClick={() => {
                setIsDeviceBound(false);
                setErrorMsg('');
                setPatInput('');
              }}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                padding: '10px',
                borderRadius: '8px',
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              Enter Another Token
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
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', marginTop: '32px' }}>
        <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
          Secure Device-Bound Portal
        </p>
      </div>
    </div>
  );
}
