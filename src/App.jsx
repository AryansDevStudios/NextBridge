import { useEffect, useState } from 'react';
import { db } from './firebase';
import LearningHub from './components/LearningHub';
import { collection, query, where, getDocs, updateDoc, doc, addDoc } from 'firebase/firestore';
import { Device } from '@capacitor/device';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor } from '@capacitor/core';
import { ShieldAlert, CheckCircle, Loader2, Download } from 'lucide-react';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [updateMsg, setUpdateMsg] = useState('');
  const [user, setUser] = useState(null);
  const [deviceInfo, setDeviceInfo] = useState(null);
  
  // Login Form State
  const [patInput, setPatInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isDeviceBound, setIsDeviceBound] = useState(false);

  useEffect(() => {
    const init = async () => {
      await checkForUpdates();
      await checkAutoLogin();
    };
    init();
  }, []);

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
          addDoc(collection(db, 'students', targetStudent.id, 'login_logs'), {
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

      await addDoc(collection(db, 'students', studentDoc.id, 'login_logs'), {
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
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col p-6 text-[#f3f4f6]">
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold text-[#f59e0b] mb-2">Next Bridge</h1>
          <p className="text-[#9ca3af]">Student Learning Platform</p>
        </div>

        {errorMsg && (
          <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444] p-4 rounded-xl mb-6 flex items-start space-x-3 text-sm">
            <ShieldAlert size={20} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {isDeviceBound ? (
          <div className="space-y-4">
            <button
              onClick={() => {
                setLoading(true);
                checkAutoLogin();
              }}
              className="w-full bg-[#f59e0b] text-[#0a0a0a] font-bold py-3.5 rounded-xl hover:bg-[#fbbf24] transition-colors"
            >
              Check Status Again
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-2">Permanent Access Token (PAT)</label>
              <input
                type="text"
                value={patInput}
                onChange={e => setPatInput(e.target.value.toUpperCase())}
                placeholder="e.g. A7X9BQ"
                className="w-full px-4 py-3 bg-[#121212] border border-[#262626] rounded-xl focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent outline-none transition-all text-lg font-mono uppercase text-[#f3f4f6] placeholder-[#9ca3af]/50"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading || !patInput}
              className="w-full bg-[#f59e0b] text-[#0a0a0a] font-bold py-3.5 rounded-xl hover:bg-[#fbbf24] transition-colors disabled:opacity-50"
            >
              Authenticate Device
            </button>
          </form>
        )}

        {!isDeviceBound && (
            <p className="mt-8 text-center text-xs text-[#262626]">
              Secure connection established.<br/>v1.0.1 (OTA Test)
            </p>
        )}
      </div>
    </div>
  );
}
