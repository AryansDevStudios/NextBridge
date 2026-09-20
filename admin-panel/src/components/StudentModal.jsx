import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, updateDoc, doc } from 'firebase/firestore';
import { X, ShieldAlert, Smartphone, Clock } from 'lucide-react';

export default function StudentModal({ student, onClose }) {
  const [activeTab, setActiveTab] = useState('access');
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Access State
  const [status, setStatus] = useState(student.status);
  const [customMessage, setCustomMessage] = useState(student.customMessage || '');
  const [saving, setSaving] = useState(false);

  // Profile Edit State
  const [name, setName] = useState(student.name);
  const [studentClass, setStudentClass] = useState(student.class);
  const [school, setSchool] = useState(student.personalDetails?.school || '');
  const [area, setArea] = useState(student.personalDetails?.area || '');
  
  // Device State
  const [currentDevice, setCurrentDevice] = useState(student.device);

  const handleUnbindDevice = async () => {
    if (!window.confirm(`Are you sure you want to unbind this device from ${student.name}? They will be able to log in from a new device using their PAT.`)) return;
    
    try {
      await updateDoc(doc(db, 'students', student.id), {
        device: null
      });
      setCurrentDevice(null);
    } catch (err) {
      console.error(err);
      alert('Failed to unbind device. Please try again.');
    }
  };

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab]);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const q = query(collection(db, 'students', student.id, 'login_logs'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    }
    setLoadingLogs(false);
  };

  const handleSaveAccess = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'students', student.id), {
        status,
        customMessage,
        name,
        class: studentClass,
        personalDetails: { school, area }
      });
      onClose();
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0a]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-[#f3f4f6]">
      <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-[#262626]">
          <div>
            <h2 className="text-xl font-bold">{student.name}</h2>
            <p className="text-sm text-[#9ca3af]">PAT: {student.pat} | Class {student.class}</p>
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#ef4444] transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#262626] px-6">
          <button 
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'access' ? 'border-[#f59e0b] text-[#f59e0b]' : 'border-transparent text-[#9ca3af] hover:text-[#f3f4f6]'}`}
            onClick={() => setActiveTab('access')}
          >
            Access & Subscription
          </button>
          <button 
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'profile' ? 'border-[#f59e0b] text-[#f59e0b]' : 'border-transparent text-[#9ca3af] hover:text-[#f3f4f6]'}`}
            onClick={() => setActiveTab('profile')}
          >
            Edit Profile
          </button>
          <button 
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'logs' ? 'border-[#f59e0b] text-[#f59e0b]' : 'border-transparent text-[#9ca3af] hover:text-[#f3f4f6]'}`}
            onClick={() => setActiveTab('logs')}
          >
            Device & Logs
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {activeTab === 'access' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-[#9ca3af] mb-2">Subscription Status</label>
                <div className="flex space-x-4">
                  <button
                    onClick={() => setStatus('active')}
                    className={`flex-1 py-2 rounded-lg border font-medium transition-colors ${status === 'active' ? 'bg-green-900/20 border-green-900/50 text-green-400' : 'border-[#262626] text-[#9ca3af] hover:bg-[#1a1a1a]'}`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setStatus('revoked')}
                    className={`flex-1 py-2 rounded-lg border font-medium transition-colors ${status === 'revoked' ? 'bg-red-900/20 border-red-900/50 text-red-400' : 'border-[#262626] text-[#9ca3af] hover:bg-[#1a1a1a]'}`}
                  >
                    Revoked
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#9ca3af] mb-2">Custom Message (Optional)</label>
                <p className="text-xs text-[#9ca3af]/70 mb-2">This message will be shown to the user on their login screen if they are blocked or if their subscription has ended.</p>
                <textarea 
                  rows="3"
                  className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent text-[#f3f4f6] placeholder-[#9ca3af]/50"
                  placeholder="e.g. Your subscription has ended. Please contact admin to renew."
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                />
              </div>

              <div className="flex justify-end pt-4">
                <button 
                  onClick={handleSaveAccess}
                  disabled={saving}
                  className="px-6 py-2 bg-[#f59e0b] text-[#0a0a0a] font-bold rounded-lg hover:bg-[#fbbf24] disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#9ca3af] mb-1">Name</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent text-[#f3f4f6]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9ca3af] mb-1">Class</label>
                <select value={studentClass} onChange={e => setStudentClass(e.target.value)} className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent text-[#f3f4f6]">
                  <option value="9">Class 9</option>
                  <option value="10">Class 10</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9ca3af] mb-1">School</label>
                <input required type="text" value={school} onChange={e => setSchool(e.target.value)} className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent text-[#f3f4f6]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9ca3af] mb-1">Area</label>
                <input required type="text" value={area} onChange={e => setArea(e.target.value)} className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent text-[#f3f4f6]" />
              </div>
              <div className="flex justify-end pt-4">
                <button 
                  onClick={handleSaveAccess}
                  disabled={saving}
                  className="px-6 py-2 bg-[#f59e0b] text-[#0a0a0a] font-bold rounded-lg hover:bg-[#fbbf24] disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-6">
              {/* Device Info */}
              <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#262626]">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-sm font-bold text-[#f3f4f6] flex items-center space-x-2">
                    <Smartphone size={16} className="text-[#f59e0b]" /> <span>Current Bound Device</span>
                  </h3>
                  {currentDevice && (
                    <button 
                      onClick={handleUnbindDevice}
                      className="text-xs px-3 py-1 bg-red-900/20 text-red-400 border border-red-900/50 rounded-lg hover:bg-red-900/40 transition-colors"
                    >
                      Unbind Device
                    </button>
                  )}
                </div>
                {currentDevice ? (
                  <div className="space-y-2 text-sm text-[#9ca3af]">
                    <div className="flex justify-between"><span className="font-medium text-[#f3f4f6]">Model:</span> <span>{currentDevice.model}</span></div>
                    <div className="flex justify-between"><span className="font-medium text-[#f3f4f6]">OS Version:</span> <span>{currentDevice.osVersion}</span></div>
                    <div className="flex justify-between"><span className="font-medium text-[#f3f4f6]">Android ID:</span> <span className="font-mono bg-[#121212] px-1 border border-[#262626] rounded text-xs break-all text-[#f59e0b]">{currentDevice.androidId}</span></div>
                  </div>
                ) : (
                  <p className="text-sm text-[#9ca3af] italic">No device bound yet.</p>
                )}
              </div>

              {/* Login Logs */}
              <div>
                <h3 className="text-sm font-bold text-[#f3f4f6] mb-3 flex items-center space-x-2">
                  <Clock size={16} className="text-[#f59e0b]" /> <span>Login History</span>
                </h3>
                {loadingLogs ? (
                  <p className="text-sm text-[#9ca3af] text-center py-4">Loading logs...</p>
                ) : logs.length > 0 ? (
                  <div className="space-y-3">
                    {logs.map(log => (
                      <div key={log.id} className="bg-[#1a1a1a] border border-[#262626] p-3 rounded-lg flex justify-between items-center text-sm">
                        <div>
                          <p className="font-medium text-[#f3f4f6]">{new Date(log.timestamp).toLocaleString()}</p>
                          <p className="text-xs text-[#9ca3af]">{log.device?.model}</p>
                        </div>
                        <span className="text-xs font-mono text-[#f59e0b] bg-[#121212] border border-[#262626] px-2 py-1 rounded">
                          {log.device?.androidId?.slice(0, 8)}...
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#9ca3af] text-center py-4 border border-dashed border-[#262626] rounded-lg bg-[#1a1a1a]">No login records found.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
