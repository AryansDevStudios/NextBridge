import { useEffect, useState } from 'react';
import { db } from './firebase';
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
    if (Capacitor.getPlatform() !== 'android' && Capacitor.getPlatform() !== 'ios') return;
    
    try {
      const response = await fetch('https://nextbridgeweb.netlify.app/buildcode/version.json?t=' + Date.now());
      const data = await response.json();
      const currentVersion = localStorage.getItem('app_version') || '0';
      
      if (data.version && data.version !== currentVersion) {
        setUpdateMsg('Downloading new update...');
        const update = await CapacitorUpdater.download({
          url: 'https://nextbridgeweb.netlify.app' + data.url,
          version: data.version
        });
        
        setUpdateMsg('Applying update...');
        localStorage.setItem('app_version', data.version);
        await CapacitorUpdater.set(update);
      }
    } catch (err) {
      console.warn('Failed to check for OTA updates', err);
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
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-6 flex flex-col text-[#f3f4f6]">
        <div className="bg-[#121212] border border-[#262626] rounded-2xl shadow-sm p-6 mb-6 mt-10 text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="text-[#f59e0b]" size={60} />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome, {user.name}!</h1>
          <p className="text-[#9ca3af] mb-6">You have successfully logged in.</p>
          
          <div className="bg-[#1a1a1a] rounded-xl p-4 text-left space-y-2 border border-[#262626]">
            <div className="flex justify-between">
              <span className="text-[#9ca3af] text-sm">Class</span>
              <span className="font-medium text-[#f3f4f6]">{user.class}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#9ca3af] text-sm">School</span>
              <span className="font-medium text-[#f3f4f6]">{user.personalDetails?.school}</span>
            </div>
          </div>
        </div>

        <div className="mt-auto pb-8 text-center">
           <button onClick={handleLogoutLocal} className="w-full text-[#9ca3af] text-sm font-medium hover:text-[#f3f4f6] transition-colors">
             (Dev) Clear local session
           </button>
        </div>
      </div>
    );
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
          <p className="text-center text-sm text-[#9ca3af] mt-8">
            Ask your admin for your access token.
          </p>
        )}
      </div>
    </div>
  );
}
