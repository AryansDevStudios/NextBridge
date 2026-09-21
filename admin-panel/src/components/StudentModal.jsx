import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, updateDoc, doc } from 'firebase/firestore';
import { 
  X, 
  ShieldAlert, 
  Smartphone, 
  Clock, 
  Calendar, 
  Plus, 
  Minus, 
  AlertTriangle, 
  CheckCircle2, 
  Zap, 
  RotateCcw, 
  Infinity as InfinityIcon 
} from 'lucide-react';

function toDateTimeLocalString(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function StudentModal({ student, onClose }) {
  const [activeTab, setActiveTab] = useState('access');
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Access & Subscription State
  const [status, setStatus] = useState(student.status || 'active');
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState(() => {
    if (!student.subscriptionExpiresAt) return null;
    return typeof student.subscriptionExpiresAt === 'number' 
      ? student.subscriptionExpiresAt 
      : new Date(student.subscriptionExpiresAt).getTime();
  });
  const [customDaysInput, setCustomDaysInput] = useState(30);
  const [customMessage, setCustomMessage] = useState(student.customMessage || '');
  const [saving, setSaving] = useState(false);

  // Profile Edit State
  const [name, setName] = useState(student.name);
  const [studentClass, setStudentClass] = useState(student.class);
  const [school, setSchool] = useState(student.personalDetails?.school || '');
  const [area, setArea] = useState(student.personalDetails?.area || '');
  
  // Device State
  const [currentDevice, setCurrentDevice] = useState(student.device);

  // Remaining subscription info calculation
  const subInfo = useMemo(() => {
    if (status === 'revoked') {
      return {
        badge: 'Account Revoked',
        colorClass: 'text-red-400 bg-red-950/40 border-red-800',
        icon: <ShieldAlert size={16} className="text-red-400" />,
        isExpired: true,
        summary: 'Access is completely revoked by admin regardless of expiration date.'
      };
    }

    if (!subscriptionExpiresAt) {
      return {
        badge: 'Unlimited Access',
        colorClass: 'text-emerald-400 bg-emerald-950/40 border-emerald-800',
        icon: <InfinityIcon size={16} className="text-emerald-400" />,
        isExpired: false,
        summary: 'Student has permanent access without an expiration date limit.'
      };
    }

    const now = Date.now();
    const diff = subscriptionExpiresAt - now;

    const formattedDate = new Date(subscriptionExpiresAt).toLocaleString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    if (diff <= 0) {
      const expiredAgo = Math.abs(diff);
      const d = Math.floor(expiredAgo / (1000 * 60 * 60 * 24));
      const h = Math.floor((expiredAgo % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      return {
        badge: 'Expired',
        colorClass: 'text-red-400 bg-red-950/40 border-red-800',
        icon: <AlertTriangle size={16} className="text-red-400" />,
        isExpired: true,
        summary: `Expired on ${formattedDate} (${d > 0 ? `${d}d ` : ''}${h}h ago)`
      };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    let timeText = `${days}d ${hours}h remaining`;
    if (days === 0 && hours > 0) timeText = `${hours}h ${mins}m remaining`;
    if (days === 0 && hours === 0) timeText = `${mins}m remaining`;

    const isUrgent = days < 3;

    return {
      badge: `${days}d left`,
      colorClass: isUrgent ? 'text-amber-400 bg-amber-950/40 border-amber-800' : 'text-green-400 bg-green-950/40 border-green-800',
      icon: <CheckCircle2 size={16} className={isUrgent ? 'text-amber-400' : 'text-green-400'} />,
      isExpired: false,
      summary: `Valid until ${formattedDate} (${timeText})`
    };
  }, [subscriptionExpiresAt, status]);

  // Stackable duration adjustment helpers
  const handleAddDays = (days) => {
    setSubscriptionExpiresAt(prev => {
      const now = Date.now();
      // Stack on top of existing remaining time if still active in future, else start from now
      const base = (prev && prev > now) ? prev : now;
      return base + (days * 24 * 60 * 60 * 1000);
    });
    if (status === 'revoked') setStatus('active');
  };

  const handleSubtractDays = (days) => {
    setSubscriptionExpiresAt(prev => {
      const now = Date.now();
      const base = (prev && prev > now) ? prev : now;
      const next = base - (days * 24 * 60 * 60 * 1000);
      return Math.max(now, next);
    });
  };

  const handleCustomDateChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    const date = new Date(val);
    if (!isNaN(date.getTime())) {
      setSubscriptionExpiresAt(date.getTime());
      if (status === 'revoked') setStatus('active');
    }
  };

  const handleSetUnlimited = () => {
    setSubscriptionExpiresAt(null);
    setStatus('active');
  };

  const handleExpireImmediately = () => {
    setSubscriptionExpiresAt(Date.now() - 5000); // Set 5 seconds in the past
  };

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
      const q = query(collection(db, 'students', student.id, 'logs'), orderBy('timestamp', 'desc'));
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
        subscriptionExpiresAt: subscriptionExpiresAt || null,
        customMessage,
        name,
        class: studentClass,
        personalDetails: { school, area }
      });
      onClose();
    } catch (err) {
      console.error('Failed to update student access/subscription:', err);
      alert('Failed to save changes. Please try again.');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0a]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-[#f3f4f6]">
      <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-[#262626]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] border border-[#262626] flex items-center justify-center font-bold text-[#f59e0b] text-lg">
              {student.name ? student.name.charAt(0).toUpperCase() : 'S'}
            </div>
            <div>
              <h2 className="text-xl font-bold flex items-center space-x-2">
                <span>{student.name}</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full border ${subInfo.colorClass}`}>
                  {subInfo.badge}
                </span>
              </h2>
              <p className="text-sm text-[#9ca3af]">PAT: <code className="text-[#f59e0b]">{student.pat}</code> | Class {student.class}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#ef4444] transition-colors p-1">
            <X size={22} />
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
            Device & Activity Logs
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {activeTab === 'access' && (
            <div className="space-y-6">
              
              {/* Current Subscription Status Card */}
              <div className={`p-4 rounded-xl border flex items-start space-x-3 ${subInfo.colorClass}`}>
                <div className="mt-0.5">{subInfo.icon}</div>
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm tracking-wide uppercase">{subInfo.badge}</span>
                    <span className="text-xs opacity-75">Live Status</span>
                  </div>
                  <p className="text-sm mt-1 font-medium">{subInfo.summary}</p>
                </div>
              </div>

              {/* Stackable Quick Action Buttons */}
              <div>
                <label className="block text-sm font-medium text-[#f3f4f6] mb-1">
                  Stackable Duration Adjustment
                </label>
                <p className="text-xs text-[#9ca3af] mb-3">
                  Click repeatedly to stack duration (e.g. clicking +1 Month 5 times extends subscription by 150 days).
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddDays(30)}
                    className="flex items-center justify-center space-x-1 py-2 px-3 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] hover:border-[#f59e0b]/60 text-[#f3f4f6] text-sm font-medium rounded-lg transition active:scale-95"
                  >
                    <Plus size={14} className="text-[#f59e0b]" />
                    <span>+1 Month (+30d)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddDays(5)}
                    className="flex items-center justify-center space-x-1 py-2 px-3 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] hover:border-[#f59e0b]/60 text-[#f3f4f6] text-sm font-medium rounded-lg transition active:scale-95"
                  >
                    <Plus size={14} className="text-[#f59e0b]" />
                    <span>+5 Days</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddDays(1)}
                    className="flex items-center justify-center space-x-1 py-2 px-3 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] hover:border-[#f59e0b]/60 text-[#f3f4f6] text-sm font-medium rounded-lg transition active:scale-95"
                  >
                    <Plus size={14} className="text-[#f59e0b]" />
                    <span>+1 Day</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSubtractDays(30)}
                    className="flex items-center justify-center space-x-1 py-2 px-3 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] hover:border-red-500/50 text-[#9ca3af] hover:text-red-300 text-sm font-medium rounded-lg transition active:scale-95"
                  >
                    <Minus size={14} className="text-red-400" />
                    <span>-1 Month (-30d)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubtractDays(5)}
                    className="flex items-center justify-center space-x-1 py-2 px-3 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] hover:border-red-500/50 text-[#9ca3af] hover:text-red-300 text-sm font-medium rounded-lg transition active:scale-95"
                  >
                    <Minus size={14} className="text-red-400" />
                    <span>-5 Days</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubtractDays(1)}
                    className="flex items-center justify-center space-x-1 py-2 px-3 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] hover:border-red-500/50 text-[#9ca3af] hover:text-red-300 text-sm font-medium rounded-lg transition active:scale-95"
                  >
                    <Minus size={14} className="text-red-400" />
                    <span>-1 Day</span>
                  </button>
                </div>
              </div>

              {/* Exact Date-Time Picker & Custom Days Input */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#181818] p-4 rounded-xl border border-[#262626]">
                <div>
                  <label className="block text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                    <Calendar size={14} className="text-[#f59e0b]" />
                    <span>Exact Date & Time Picker</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={toDateTimeLocalString(subscriptionExpiresAt)}
                    onChange={handleCustomDateChange}
                    className="w-full px-3 py-2 bg-[#121212] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent text-[#f3f4f6] text-sm"
                  />
                  <p className="text-[11px] text-[#9ca3af]/70 mt-1">Select accurate calendar date & time.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-1 flex items-center space-x-1.5">
                    <Zap size={14} className="text-[#f59e0b]" />
                    <span>Manual Days Input</span>
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      min="1"
                      value={customDaysInput}
                      onChange={(e) => setCustomDaysInput(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-24 px-3 py-2 bg-[#121212] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] text-[#f3f4f6] text-sm text-center"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddDays(Number(customDaysInput))}
                      className="flex-1 py-2 px-3 bg-[#262626] hover:bg-[#333] border border-[#3a3a3a] text-[#f3f4f6] font-medium text-xs rounded-lg transition"
                    >
                      + Add {customDaysInput} Days
                    </button>
                  </div>
                  <p className="text-[11px] text-[#9ca3af]/70 mt-1">Adds custom number of days to current expiry.</p>
                </div>
              </div>

              {/* Instant One-Click Shortcuts: Unlimited vs Expire Immediately */}
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={handleSetUnlimited}
                  className="flex-1 py-2 px-3 bg-[#1a1a1a] hover:bg-emerald-950/30 border border-[#262626] hover:border-emerald-700/60 text-emerald-400 font-medium text-xs rounded-lg transition flex items-center justify-center space-x-2"
                >
                  <InfinityIcon size={14} />
                  <span>Grant Unlimited Access</span>
                </button>
                <button
                  type="button"
                  onClick={handleExpireImmediately}
                  className="flex-1 py-2 px-3 bg-[#1a1a1a] hover:bg-red-950/30 border border-[#262626] hover:border-red-700/60 text-red-400 font-medium text-xs rounded-lg transition flex items-center justify-center space-x-2"
                >
                  <AlertTriangle size={14} />
                  <span>Expire / Block Immediately</span>
                </button>
              </div>

              {/* Master Access Status Override */}
              <div className="pt-2 border-t border-[#262626]">
                <label className="block text-sm font-medium text-[#9ca3af] mb-2">Master Account Status</label>
                <div className="flex space-x-4">
                  <button
                    type="button"
                    onClick={() => setStatus('active')}
                    className={`flex-1 py-2 rounded-lg border font-medium transition-colors ${status === 'active' ? 'bg-green-900/20 border-green-900/50 text-green-400' : 'border-[#262626] text-[#9ca3af] hover:bg-[#1a1a1a]'}`}
                  >
                    Active Account
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('revoked')}
                    className={`flex-1 py-2 rounded-lg border font-medium transition-colors ${status === 'revoked' ? 'bg-red-900/20 border-red-900/50 text-red-400' : 'border-[#262626] text-[#9ca3af] hover:bg-[#1a1a1a]'}`}
                  >
                    Revoke / Block Account
                  </button>
                </div>
              </div>

              {/* Custom Message to Student */}
              <div>
                <label className="block text-sm font-medium text-[#9ca3af] mb-1">Custom Notice to Student (Optional)</label>
                <p className="text-xs text-[#9ca3af]/70 mb-2">
                  This message is displayed to the student on their app login screen when their access has expired or was revoked.
                </p>
                <textarea 
                  rows="2"
                  className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent text-[#f3f4f6] placeholder-[#9ca3af]/50 text-sm"
                  placeholder="e.g. Your subscription term has ended. Please contact Aryan to renew your enrollment."
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-[#262626]">
                <button 
                  onClick={handleSaveAccess}
                  disabled={saving}
                  className="px-6 py-2 bg-[#f59e0b] text-[#0a0a0a] font-bold rounded-lg hover:bg-[#fbbf24] disabled:opacity-50 transition-colors shadow-lg shadow-amber-500/10"
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

              {/* Analytics Summary */}
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#262626]">
                    <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-1">Total Screen Time</p>
                    <p className="text-xl font-bold text-[#4ade80]">
                       {student.totalScreenTime ? Math.floor(student.totalScreenTime / 60) + ' mins' : '0 mins'}
                    </p>
                 </div>
                 <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#262626]">
                    <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-1">Last Active</p>
                    <p className="text-sm font-medium text-[#f3f4f6]">
                       {student.lastActive ? new Date(student.lastActive).toLocaleString() : 'Never'}
                    </p>
                 </div>
              </div>

              {/* Login Logs */}
              <div>
                <h3 className="text-sm font-bold text-[#f3f4f6] mb-3 flex items-center space-x-2">
                  <Clock size={16} className="text-[#f59e0b]" /> <span>Activity Timeline</span>
                </h3>
                {loadingLogs ? (
                  <p className="text-sm text-[#9ca3af] text-center py-4">Loading logs...</p>
                ) : logs.length > 0 ? (
                  <div className="space-y-3">
                    {logs.map(log => (
                      <div key={log.id} className="bg-[#1a1a1a] border border-[#262626] p-3 rounded-lg flex justify-between items-center text-sm">
                        <div>
                          <p className="font-medium text-[#f3f4f6] flex items-center space-x-2">
                             {log.type === 'watch' && <span className="text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded text-xs font-bold">WATCHED</span>}
                             {log.type === 'download' && <span className="text-green-400 bg-green-900/20 px-2 py-0.5 rounded text-xs font-bold">DOWNLOADED</span>}
                             {(!log.type || log.type === 'login') && <span className="text-[#f59e0b] bg-[#f59e0b]/20 px-2 py-0.5 rounded text-xs font-bold">LOGIN</span>}
                             <span>{log.videoTitle || 'App Login'}</span>
                          </p>
                          <p className="text-xs text-[#9ca3af] mt-1">{new Date(log.timestamp).toLocaleString()}</p>
                        </div>
                        <span className="text-xs font-mono text-[#f59e0b] bg-[#121212] border border-[#262626] px-2 py-1 rounded">
                          {log.durationSecs ? `${Math.floor(log.durationSecs / 60)}m ${log.durationSecs % 60}s` : (log.device?.model || 'Device')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#9ca3af] text-center py-4 border border-dashed border-[#262626] rounded-lg bg-[#1a1a1a]">No activity records found.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
