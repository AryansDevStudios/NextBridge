import { useEffect, useState, useRef } from 'react';
import { db } from './firebase';
import LearningHub from './components/LearningHub';
import { collection, query, where, getDocs, updateDoc, doc, addDoc } from 'firebase/firestore';
import { Device } from '@capacitor/device';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor } from '@capacitor/core';
import { ShieldAlert, CheckCircle, Loader2, Download } from 'lucide-react';
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

  // Ref to hold the timestamp of when the app became active
  const sessionStartTime = useRef(null);

  useEffect(() => {
    const init = async () => {
      await checkForUpdates();
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
        // App went to background, calculate session duration
        if (sessionStartTime.current && user) {
          const durationSecs = Math.floor((Date.now() - sessionStartTime.current) / 1000);
          
          try {
            // Retrieve current total from Firestore to increment safely
            // Note: In production, increment() from firestore is better, but this works
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
    console.log('[OTA] Starting OTA Update Check...');
    if (Capacitor.getPlatform() !== 'android' && Capacitor.getPlatform() !== 'ios') {
      console.log('[OTA] Skipping OTA check because platform is', Capacitor.getPlatform());
      return;
    }
    
    try {
      console.log('[OTA] Fetching version.json from Netlify...');
      const response = await fetch('https://nextbridgeweb.netlify.app/buildcode/version.json?t=' + Date.now());
      const data = await response.json();
      
      const currentVersion = localStorage.getItem('app_version') || '0';
      console.log(`[OTA] Local Version: ${currentVersion} | Remote Version: ${data.version}`);
      
      if (data.version && String(data.version) !== String(currentVersion)) {
        console.log(`[OTA] New version found! Preparing to download update from ${data.url}...`);
        setUpdateMsg('Downloading new update...');
        
        const downloadUrl = 'https://nextbridgeweb.netlify.app' + data.url;
        console.log(`[OTA] Initiating CapacitorUpdater.download with URL: ${downloadUrl}`);
        
        const update = await CapacitorUpdater.download({
          url: downloadUrl,
          version: String(data.version)
        });
        
        console.log('[OTA] Download successful! Applying update now...', update);
        setUpdateMsg('Applying update...');
        localStorage.setItem('app_version', String(data.version));
        
        await CapacitorUpdater.set(update);
        console.log('[OTA] Update applied successfully! App should reload now.');
      } else {
        console.log('[OTA] App is already up-to-date.');
      }
    } catch (err) {
      console.error('[OTA] Error during OTA update process:', err);
    }
  };

  const getDeviceData = async () => {
    try {
      const info = await Device.getId();
      const devInfo = await Device.getInfo();
      const combined = { androidId: info.identifier, model: devInfo.model, osVersion: devInfo.osVersion };
      setDeviceInfo(combined);
      return combined;
    } catch (e) {
      console.warn("Capacitor not available or failed", e);
      return null;
    }
  };

  const checkAutoLogin = async () => {
    const dev = await getDeviceData();
    if (!dev?.androidId) {
      setLoading(false);
      return;
    }

    try {
      const q = query(collection(db, 'students'), where('device.androidId', '==', dev.androidId));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        let activeStudent = null;
        let revokedStudent = null;

        querySnapshot.forEach(doc => {
          const data = doc.data();
          if (data.status === 'active') activeStudent = { id: doc.id, ...data };
          else revokedStudent = { id: doc.id, ...data };
        });

        const targetStudent = activeStudent || revokedStudent;
        
        if (targetStudent.status === 'active') {
          setUser(targetStudent);
          // Log login silently
          addDoc(collection(db, 'students', targetStudent.id, 'logs'), {
            type: 'login',
            timestamp: new Date().toISOString(),
            device: dev
          });
        } else {
          setErrorMsg(targetStudent.customMessage || 'Your access has been revoked by the admin.');
          setIsDeviceBound(true);
        }
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!patInput) return;

    setLoading(true);
    try {
      const q = query(collection(db, 'students'), where('pat', '==', patInput));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setErrorMsg('Invalid Access Token. Please check and try again.');
        setLoading(false);
        return;
      }

      const studentDoc = querySnapshot.docs[0];
      const studentData = studentDoc.data();

      if (studentData.status !== 'active') {
        setErrorMsg(studentData.customMessage || 'Your access has been revoked by the admin.');
        setLoading(false);
        return;
      }

      const dev = await getDeviceData();
      if (!dev?.androidId) {
        setErrorMsg('Could not fetch Device ID. Please run this app on a supported device.');
        setLoading(false);
        return;
      }

      if (studentData.device && studentData.device.androidId !== dev.androidId) {
        setErrorMsg('This Access Token is already authenticated on another device.');
        setLoading(false);
        return;
      }

      if (!studentData.device) {
        await updateDoc(doc(db, 'students', studentDoc.id), {
          device: dev
        });
      }

      await addDoc(collection(db, 'students', studentDoc.id, 'logs'), {
        type: 'login',
        timestamp: new Date().toISOString(),
        device: dev
      });

      setUser({ id: studentDoc.id, ...studentData, device: dev });
    } catch (err) {
      console.error(err);
      setErrorMsg('An error occurred during login. Check connection.');
    }
    setLoading(false);
  };

  const handleLogoutLocal = () => {
    // Just for testing/dev, real app might not have logout if it's strictly device bound.
    setUser(null);
    setPatInput('');
  };

  if (loading || updateMsg) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center">
        {updateMsg ? (
          <Download className="animate-bounce text-[#f59e0b] mb-4" size={40} />
        ) : (
          <Loader2 className="animate-spin text-[#f59e0b] mb-4" size={40} />
        )}
        <p className="text-[#9ca3af] font-medium">{updateMsg || 'Authenticating Device...'}</p>
      </div>
    );
  }

  if (user) {
    return <LearningHub user={user} />;
  }

  return (
    <div className="login-container">
      <form className="login-card" onSubmit={handleLogin}>
        <div className="login-icon">
          <ShieldAlert size={32} />
        </div>
        <h2>Next Bridge</h2>
        <p>Enter your Permanent Access Token to unlock course materials.</p>
        
        {errorMsg && <div className="error-message">{errorMsg}</div>}

        {isDeviceBound ? (
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              checkAutoLogin();
            }}
            className="login-button"
          >
            Check Status Again
          </button>
        ) : (
          <>
            <div className="input-group">
              <input
                type="text"
                value={patInput}
                onChange={e => setPatInput(e.target.value.toUpperCase())}
                placeholder="e.g. A7X9BQ"
                disabled={loading}
                autoFocus
                style={{ fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '2px' }}
              />
            </div>
            <button type="submit" className="login-button" disabled={loading || !patInput}>
              {loading ? 'Verifying...' : 'Authenticate Device'}
            </button>
          </>
        )}
      </form>

      {!isDeviceBound && (
        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
            Secure connection established.<br/>
            Built by <span style={{ fontWeight: '500', color: '#fff' }}>AryansDevStudios</span>
          </p>
        </div>
      )}
    </div>
  );
}
