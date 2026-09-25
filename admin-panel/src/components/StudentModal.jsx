import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
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
  Infinity as InfinityIcon,
  BarChart2,
  Video,
  FileText,
  Filter,
  Download,
  ExternalLink,
  Trash2
} from 'lucide-react';
import { formatDuration, getStudentTimeForPeriod, getLast7DaysBreakdown } from '../utils/timeFormat';
import { 
  CURRENT_LATEST_VERSION, 
  CURRENT_LATEST_CODE, 
  DEFAULT_ANDROID_VERSION_CONFIG, 
  getAndroidVersionStatus, 
  compareSemver,
  isStudentUpdateLocked 
} from '../utils/version';
import BatchPermissionSelector from './BatchPermissionSelector';
import { 
  CLASS_OPTIONS, 
  STREAM_OPTIONS, 
  getRecommendedBatchIds, 
  getStreamLabel 
} from '../utils/batchConfig';

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

export default function StudentModal({ student, versionConfig = DEFAULT_ANDROID_VERSION_CONFIG, onClose }) {
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
  const [deleting, setDeleting] = useState(false);
  const [allowedSections, setAllowedSections] = useState({
    courses: student.allowedSections?.courses ?? true,
    textbooks: student.allowedSections?.textbooks ?? true,
    pyqs: student.allowedSections?.pyqs ?? true,
    pdfDownload: student.allowedSections?.pdfDownload ?? student.pdfDownload ?? true,
    pdfExportShare: student.allowedSections?.pdfExportShare ?? student.pdfExportShare ?? true,
  });

  // Remote Forced Update Lockout State
  const [forcedUpdateEnabled, setForcedUpdateEnabled] = useState(
    isStudentUpdateLocked(student)
  );
  const [minVersion, setMinVersion] = useState(
    student.forcedUpdate?.minVersion || CURRENT_LATEST_VERSION
  );
  const [minVersionCode, setMinVersionCode] = useState(
    student.forcedUpdate?.minVersionCode || CURRENT_LATEST_CODE
  );
  const [downloadUrl, setDownloadUrl] = useState(
    student.forcedUpdate?.downloadUrl || ''
  );
  const [updateMessage, setUpdateMessage] = useState(
    student.forcedUpdate?.message || `A mandatory app update (v${CURRENT_LATEST_VERSION}) is required to continue using NextBridge.`
  );
  const [releaseNotes, setReleaseNotes] = useState(
    student.forcedUpdate?.releaseNotes || '• High-performance immersive full-screen mode\n• Video player stability enhancements\n• Offline PDF & document improvements'
  );
  const [targetPlatform, setTargetPlatform] = useState(
    student.forcedUpdate?.targetPlatform || 'android'
  );

  // Profile Edit State
  const [name, setName] = useState(student.name);
  const [studentClass, setStudentClass] = useState(String(student.class || '10'));
  const [studentStream, setStudentStream] = useState(student.stream || student.section || '');
  const [selectedBatchIds, setSelectedBatchIds] = useState(() => {
    if (Array.isArray(student.allowedBatches) && student.allowedBatches.length > 0) {
      return student.allowedBatches.map(String);
    }
    return getRecommendedBatchIds(student.class || '10', student.stream || student.section);
  });
  const [school, setSchool] = useState(student.personalDetails?.school || '');
  const [area, setArea] = useState(student.personalDetails?.area || '');

  const handleClassChange = (newClass) => {
    setStudentClass(newClass);
    const defaultStream = (newClass === '11' || newClass === '12') ? (studentStream || 'science_pcmb') : '';
    setSelectedBatchIds(getRecommendedBatchIds(newClass, defaultStream));
  };

  const handleStreamChange = (newStream) => {
    setStudentStream(newStream);
    setSelectedBatchIds(getRecommendedBatchIds(studentClass, newStream));
  };
  
  // Device State
  const [currentDevice, setCurrentDevice] = useState(student.device);

  // Analytics & Logs State
  const [analyticsPeriod, setAnalyticsPeriod] = useState('today'); // 'today', 'week', 'all'
  const [logFilter, setLogFilter] = useState('all'); // 'all', 'watch', 'notes', 'login', 'download'

  // Bug 5 fix: sync lockout state from parent prop when Firestore updates arrive via onSnapshot
  // (e.g. a batch broadcast was applied while this modal was open)
  const prevForcedUpdateRef = useRef(student.forcedUpdate);
  useEffect(() => {
    const prev = prevForcedUpdateRef.current;
    const next = student.forcedUpdate;
    // Only resync if the lockout data itself actually changed to avoid overwriting in-flight edits
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      prevForcedUpdateRef.current = next;
      setForcedUpdateEnabled(isStudentUpdateLocked(student));
      setMinVersion(next?.minVersion || CURRENT_LATEST_VERSION);
      setMinVersionCode(next?.minVersionCode || CURRENT_LATEST_CODE);
      setDownloadUrl(next?.downloadUrl || '');
      setUpdateMessage(next?.message || `A mandatory app update (v${CURRENT_LATEST_VERSION}) is required to continue using NextBridge.`);
      setReleaseNotes(next?.releaseNotes || '• High-performance immersive full-screen mode\n• Video player stability enhancements\n• Offline PDF & document improvements');
      setTargetPlatform(next?.targetPlatform || 'android');
    }
  }, [student.forcedUpdate]);

  // Period stats calculation for this individual student
  const periodStats = useMemo(() => {
    return getStudentTimeForPeriod(student, analyticsPeriod);
  }, [student, analyticsPeriod]);

  // 7-day usage breakdown for bar chart
  const sevenDaysBreakdown = useMemo(() => {
    return getLast7DaysBreakdown(student);
  }, [student]);

  // Filtered logs based on logFilter and analyticsPeriod
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (logFilter !== 'all' && log.type !== logFilter) {
        if (logFilter === 'login' && log.type && log.type !== 'login') return false;
        if (logFilter !== 'login' && log.type !== logFilter) return false;
      }
      if (analyticsPeriod === 'today') {
        const todayKey = new Date().toISOString().slice(0, 10);
        return (log.timestamp || '').slice(0, 10) === todayKey;
      }
      if (analyticsPeriod === 'week') {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        return (log.timestamp || '') >= weekAgo;
      }
      return true;
    });
  }, [logs, logFilter, analyticsPeriod]);

  // Remaining subscription info calculation
  const subInfo = useMemo(() => {
    if (status === 'suspended') {
      return {
        badge: 'Account Suspended',
        colorClass: 'text-amber-400 bg-amber-950/40 border-amber-800',
        icon: <ShieldAlert size={16} className="text-amber-400" />,
        isExpired: true,
        summary: 'Access is temporarily frozen/suspended. Device binding & history are preserved.'
      };
    }

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
        device: null,
        deviceRevokedAt: new Date().toISOString()
      });
      setCurrentDevice(null);
    } catch (err) {
      console.error(err);
      alert('Failed to unbind device. Please try again.');
    }
  };

  const handleDeleteStudent = async () => {
    const confirmMsg = `Are you sure you want to completely delete ${student.name} (PAT: ${student.pat})?\n\n` +
      `⚠️ CRITICAL ACTIONS:\n` +
      `1. The device currently linked to this student will be immediately UNBOUND so it is free to log into another account.\n` +
      `2. All student activity history, watch sessions, and logs will be permanently wiped.\n` +
      `3. The student document will be removed entirely from the database.`;

    if (!window.confirm(confirmMsg)) return;

    setDeleting(true);
    try {
      // 1. Unbind device and revoke status first to signal any live app session
      await updateDoc(doc(db, 'students', student.id), {
        device: null,
        deviceRevokedAt: new Date().toISOString(),
        status: 'revoked'
      }).catch(() => {});

      // 2. Query and delete all subcollection documents in students/{id}/logs
      const logsSnap = await getDocs(collection(db, 'students', student.id, 'logs'));
      const deletePromises = logsSnap.docs.map(logDoc => deleteDoc(logDoc.ref));
      await Promise.all(deletePromises);

      // 3. Delete the parent student document
      await deleteDoc(doc(db, 'students', student.id));

      alert(`Student ${student.name} and all associated records have been completely deleted.`);
      onClose();
    } catch (err) {
      console.error('Failed to delete student:', err);
      alert('Failed to delete student: ' + err.message);
    } finally {
      setDeleting(false);
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
        stream: (studentClass === '11' || studentClass === '12') ? studentStream : '',
        allowedBatches: selectedBatchIds,
        personalDetails: { school, area },
        allowedSections,
        forcedUpdate: forcedUpdateEnabled ? {
          enabled: true,
          minVersion: minVersion.trim(),
          minVersionCode: Number(minVersionCode) || CURRENT_LATEST_CODE,
          downloadUrl: downloadUrl.trim(),
          message: updateMessage.trim(),
          releaseNotes: releaseNotes.trim(),
          targetPlatform,
          updatedAt: new Date().toISOString()
        } : {
          enabled: false,
          minVersion: '',
          minVersionCode: 0,
          downloadUrl: '',
          message: '',
          releaseNotes: '',
          targetPlatform: 'android',
          updatedAt: new Date().toISOString()
        }
      });
      onClose();
    } catch (err) {
      console.error('Failed to update student access/subscription:', err);
      alert('Failed to save changes. Please try again.');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-[#0c0c0c] z-50 text-[#f3f4f6] flex flex-col w-full h-full h-[100dvh] overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-4 sm:px-8 py-3.5 sm:py-4 border-b border-[#262626] bg-[#141414] shrink-0">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#1a1a1a] border border-[#262626] flex items-center justify-center font-bold text-[#f59e0b] text-base sm:text-lg shrink-0">
            {student.name ? student.name.charAt(0).toUpperCase() : 'S'}
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2 truncate">
              <span className="truncate">{student.name}</span>
              <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full border shrink-0 ${subInfo.colorClass}`}>
                {subInfo.badge}
              </span>
            </h2>
            <p className="text-xs text-[#9ca3af] truncate">PAT: <code className="text-[#f59e0b] font-mono">{student.pat}</code> | Class {student.class}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={async () => {
              const newStatus = status === 'suspended' ? 'active' : 'suspended';
              setStatus(newStatus);
              await updateDoc(doc(db, 'students', student.id), { status: newStatus }).catch(() => {});
            }}
            className={`flex items-center space-x-1.5 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg border transition ${
              status === 'suspended'
                ? 'text-green-400 bg-green-950/20 border-green-900/50 hover:bg-green-950/40'
                : 'text-amber-400 bg-amber-950/20 border-amber-900/50 hover:bg-amber-950/40'
            }`}
            title={status === 'suspended' ? "Reactivate student account" : "Temporarily freeze/suspend student account"}
          >
            <span>{status === 'suspended' ? 'Unfreeze' : 'Freeze'}</span>
          </button>
          <button 
            onClick={handleDeleteStudent}
            disabled={deleting}
            className="flex items-center space-x-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-950/20 hover:bg-red-950/50 border border-red-900/50 px-2.5 sm:px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            title="Delete Student & Unbind Device"
          >
            <Trash2 size={13} />
            <span className="hidden sm:inline">{deleting ? 'Deleting...' : 'Delete Student'}</span>
          </button>
          <button 
            onClick={onClose} 
            className="text-[#9ca3af] hover:text-[#ef4444] transition-colors p-2 rounded-lg hover:bg-[#1f1f1f] border border-transparent hover:border-[#333] shrink-0"
            title="Close Manage Panel"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#262626] px-4 sm:px-8 bg-[#111111] shrink-0 overflow-x-auto scrollbar-none gap-2 sm:gap-6">
        <button 
          className={`py-3 px-2 sm:px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'access' ? 'border-[#f59e0b] text-[#f59e0b]' : 'border-transparent text-[#9ca3af] hover:text-[#f3f4f6]'}`}
          onClick={() => setActiveTab('access')}
        >
          Access & Subscription
        </button>
        <button 
          className={`py-3 px-2 sm:px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'profile' ? 'border-[#f59e0b] text-[#f59e0b]' : 'border-transparent text-[#9ca3af] hover:text-[#f3f4f6]'}`}
          onClick={() => setActiveTab('profile')}
        >
          Edit Profile
        </button>
        <button 
          className={`py-3 px-2 sm:px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'logs' ? 'border-[#f59e0b] text-[#f59e0b]' : 'border-transparent text-[#9ca3af] hover:text-[#f3f4f6]'}`}
          onClick={() => setActiveTab('logs')}
        >
          Device & Activity Logs
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-8">
        <div className="max-w-4xl mx-auto w-full">
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

              {/* Feature Access Permissions */}
              <div className="bg-[#181818] p-4 rounded-xl border border-[#262626]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#f3f4f6]">Section Access Control</h3>
                    <p className="text-xs text-[#9ca3af]">Toggle which sections this student is permitted to access</p>
                  </div>
                  <span className="text-[11px] text-[#f59e0b] font-medium bg-[#f59e0b]/10 px-2 py-0.5 rounded border border-[#f59e0b]/30">Tier Pricing</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className={`flex flex-col p-3 rounded-lg border transition-all cursor-pointer ${allowedSections.courses ? 'bg-[#121212] border-[#f59e0b]/50 text-white shadow-sm' : 'bg-[#141414] border-[#262626] text-[#71717a]'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">Courses</span>
                      <input 
                        type="checkbox" 
                        checked={allowedSections.courses} 
                        onChange={e => setAllowedSections(prev => ({ ...prev, courses: e.target.checked }))}
                        className="w-4 h-4 rounded border-[#333] text-[#f59e0b] focus:ring-[#f59e0b] bg-[#1a1a1a]"
                      />
                    </div>
                    <span className="text-[11px] opacity-75">Lectures & Notes</span>
                  </label>

                  <label className={`flex flex-col p-3 rounded-lg border transition-all cursor-pointer ${allowedSections.textbooks ? 'bg-[#121212] border-[#f59e0b]/50 text-white shadow-sm' : 'bg-[#141414] border-[#262626] text-[#71717a]'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">Textbooks</span>
                      <input 
                        type="checkbox" 
                        checked={allowedSections.textbooks} 
                        onChange={e => setAllowedSections(prev => ({ ...prev, textbooks: e.target.checked }))}
                        className="w-4 h-4 rounded border-[#333] text-[#f59e0b] focus:ring-[#f59e0b] bg-[#1a1a1a]"
                      />
                    </div>
                    <span className="text-[11px] opacity-75">NCERT Textbooks</span>
                  </label>

                  <label className={`flex flex-col p-3 rounded-lg border transition-all cursor-pointer ${allowedSections.pyqs ? 'bg-[#121212] border-[#f59e0b]/50 text-white shadow-sm' : 'bg-[#141414] border-[#262626] text-[#71717a]'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">CBSE PYQs</span>
                      <input 
                        type="checkbox" 
                        checked={allowedSections.pyqs} 
                        onChange={e => setAllowedSections(prev => ({ ...prev, pyqs: e.target.checked }))}
                        className="w-4 h-4 rounded border-[#333] text-[#f59e0b] focus:ring-[#f59e0b] bg-[#1a1a1a]"
                      />
                    </div>
                    <span className="text-[11px] opacity-75">Past Year Papers</span>
                  </label>
                </div>

                {/* PDF Download & Share Capabilities */}
                <div className="mt-3 pt-3 border-t border-[#262626]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[#f3f4f6]">PDF Permissions</span>
                    <span className="text-[11px] text-[#38bdf8] font-medium bg-[#38bdf8]/10 px-2 py-0.5 rounded border border-[#38bdf8]/30">Document Rights</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className={`flex flex-col p-3 rounded-lg border transition-all cursor-pointer ${allowedSections.pdfDownload ? 'bg-[#121212] border-[#38bdf8]/50 text-white shadow-sm' : 'bg-[#141414] border-[#262626] text-[#71717a]'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm">In-App PDF Download</span>
                        <input 
                          type="checkbox" 
                          checked={allowedSections.pdfDownload} 
                          onChange={e => setAllowedSections(prev => ({ ...prev, pdfDownload: e.target.checked }))}
                          className="w-4 h-4 rounded border-[#333] text-[#38bdf8] focus:ring-[#38bdf8] bg-[#1a1a1a]"
                        />
                      </div>
                      <span className="text-[11px] opacity-75">Save & read offline inside app</span>
                    </label>

                    <label className={`flex flex-col p-3 rounded-lg border transition-all cursor-pointer ${allowedSections.pdfExportShare ? 'bg-[#121212] border-[#38bdf8]/50 text-white shadow-sm' : 'bg-[#141414] border-[#262626] text-[#71717a]'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm">Download to Device & Share</span>
                        <input 
                          type="checkbox" 
                          checked={allowedSections.pdfExportShare} 
                          onChange={e => setAllowedSections(prev => ({ ...prev, pdfExportShare: e.target.checked }))}
                          className="w-4 h-4 rounded border-[#333] text-[#38bdf8] focus:ring-[#38bdf8] bg-[#1a1a1a]"
                        />
                      </div>
                      <span className="text-[11px] opacity-75">Save to Downloads folder & share externally</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Batch Permissions & Access Control */}
              <BatchPermissionSelector 
                studentClass={studentClass}
                studentStream={studentStream}
                selectedBatchIds={selectedBatchIds}
                onChange={setSelectedBatchIds}
              />

              {/* Stackable Quick Action Buttons */}
              <div>
                <label className="block text-sm font-medium text-[#f3f4f6] mb-1">
                  Stackable Duration Adjustment
                </label>
                <p className="text-xs text-[#9ca3af] mb-3">
                  Click repeatedly to stack duration (e.g. clicking +1 Month 5 times extends subscription by 150 days).
                </p>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddDays(30)}
                    className="flex items-center justify-center space-x-1 py-2 px-2 sm:px-3 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] hover:border-[#f59e0b]/60 text-[#f3f4f6] text-xs sm:text-sm font-medium rounded-lg transition active:scale-95 text-center"
                  >
                    <Plus size={13} className="text-[#f59e0b] shrink-0" />
                    <span>+30d<span className="hidden sm:inline"> (+1 Mo)</span></span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddDays(5)}
                    className="flex items-center justify-center space-x-1 py-2 px-2 sm:px-3 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] hover:border-[#f59e0b]/60 text-[#f3f4f6] text-xs sm:text-sm font-medium rounded-lg transition active:scale-95 text-center"
                  >
                    <Plus size={13} className="text-[#f59e0b] shrink-0" />
                    <span>+5 Days</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddDays(1)}
                    className="flex items-center justify-center space-x-1 py-2 px-2 sm:px-3 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] hover:border-[#f59e0b]/60 text-[#f3f4f6] text-xs sm:text-sm font-medium rounded-lg transition active:scale-95 text-center"
                  >
                    <Plus size={13} className="text-[#f59e0b] shrink-0" />
                    <span>+1 Day</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSubtractDays(30)}
                    className="flex items-center justify-center space-x-1 py-2 px-2 sm:px-3 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] hover:border-red-500/50 text-[#9ca3af] hover:text-red-300 text-xs sm:text-sm font-medium rounded-lg transition active:scale-95 text-center"
                  >
                    <Minus size={13} className="text-red-400 shrink-0" />
                    <span>-30d<span className="hidden sm:inline"> (-1 Mo)</span></span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubtractDays(5)}
                    className="flex items-center justify-center space-x-1 py-2 px-2 sm:px-3 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] hover:border-red-500/50 text-[#9ca3af] hover:text-red-300 text-xs sm:text-sm font-medium rounded-lg transition active:scale-95 text-center"
                  >
                    <Minus size={13} className="text-red-400 shrink-0" />
                    <span>-5 Days</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubtractDays(1)}
                    className="flex items-center justify-center space-x-1 py-2 px-2 sm:px-3 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] hover:border-red-500/50 text-[#9ca3af] hover:text-red-300 text-xs sm:text-sm font-medium rounded-lg transition active:scale-95 text-center"
                  >
                    <Minus size={13} className="text-red-400 shrink-0" />
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
                      className="w-20 sm:w-24 px-2 sm:px-3 py-2 bg-[#121212] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] text-[#f3f4f6] text-sm text-center"
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
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
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
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus('active')}
                    className={`py-2 px-2 text-xs sm:text-sm rounded-lg border font-medium transition-colors ${status === 'active' ? 'bg-green-900/20 border-green-900/50 text-green-400 font-bold' : 'border-[#262626] text-[#9ca3af] hover:bg-[#1a1a1a]'}`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('suspended')}
                    className={`py-2 px-2 text-xs sm:text-sm rounded-lg border font-medium transition-colors ${status === 'suspended' ? 'bg-amber-900/20 border-amber-900/50 text-amber-400 font-bold' : 'border-[#262626] text-[#9ca3af] hover:bg-[#1a1a1a]'}`}
                  >
                    Freeze / Suspend
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('revoked')}
                    className={`py-2 px-2 text-xs sm:text-sm rounded-lg border font-medium transition-colors ${status === 'revoked' ? 'bg-red-900/20 border-red-900/50 text-red-400 font-bold' : 'border-[#262626] text-[#9ca3af] hover:bg-[#1a1a1a]'}`}
                  >
                    Revoke / Block
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

              {/* App Version & Remote APK Update Lockout Card */}
              <div className="bg-[#181818] p-4 rounded-xl border border-[#262626] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#262626] pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#f3f4f6] flex items-center space-x-2">
                      <Download size={16} className="text-[#f59e0b]" />
                      <span>App Version & Remote APK Update</span>
                    </h3>
                    <p className="text-xs text-[#9ca3af]">Track installed version and remotely require APK updates</p>
                  </div>

                  {/* Student App Telemetry Pills */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] px-2 py-0.5 rounded-full border bg-[#141414] border-[#333] text-[#9ca3af]">
                      Platform: <strong className="text-white uppercase">{student.platform || (student.device ? 'android' : 'web')}</strong>
                    </span>
                    {(() => {
                      const vStatus = getAndroidVersionStatus(student, versionConfig);
                      if (vStatus.status === 'web') {
                        return (
                          <span className="text-[11px] px-2 py-0.5 rounded-full border bg-zinc-900/60 text-zinc-400 border-zinc-800 font-mono">
                            Web Browser
                          </span>
                        );
                      }
                      return (
                        <>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${vStatus.badgeClass}`}>
                            {vStatus.label}
                          </span>
                          {student.otaVersion && student.otaVersion !== student.appVersion && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full border font-mono bg-blue-950/40 text-blue-300 border-blue-800" title={`Over-The-Air Web Bundle: v${student.otaVersion}`}>
                              OTA Bundle: v{student.otaVersion}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Lockout Activation Toggle */}
                <div className="flex items-center justify-between bg-[#121212] p-3 rounded-lg border border-[#262626]">
                  <div>
                    <label className="text-sm font-medium text-[#f3f4f6] cursor-pointer flex items-center gap-2" htmlFor="lockout-toggle">
                      <span>Require App Update (Lockout Access)</span>
                      {forcedUpdateEnabled && (
                        <span className="text-[10px] bg-red-950/40 text-red-400 border border-red-800 px-1.5 py-0.5 rounded font-bold uppercase animate-pulse">
                          Lockout Active
                        </span>
                      )}
                      {!forcedUpdateEnabled && student.forcedUpdate?.enabled && !isStudentUpdateLocked(student) && (
                        <span className="text-[10px] bg-emerald-950/40 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded font-semibold">
                          Update Fulfilled (v{student.appVersion || minVersion})
                        </span>
                      )}
                    </label>
                    <p className="text-xs text-[#9ca3af] mt-0.5">
                      Locks student out with download instructions until they install the required version
                    </p>
                  </div>
                  <input
                    id="lockout-toggle"
                    type="checkbox"
                    checked={forcedUpdateEnabled}
                    onChange={e => setForcedUpdateEnabled(e.target.checked)}
                    className="w-5 h-5 rounded border-[#333] text-[#f59e0b] focus:ring-[#f59e0b] bg-[#1a1a1a] cursor-pointer"
                  />
                </div>

                {/* Lockout Configuration Inputs */}
                <div className={`space-y-3 transition-opacity ${forcedUpdateEnabled ? 'opacity-100' : 'opacity-60'}`}>
                  {/* Database Presets Quick Fill */}
                  <div className="flex items-center justify-between text-xs pb-1">
                    <span className="text-[#9ca3af] text-[11px]">Database Presets:</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setMinVersion(versionConfig?.latestAppVersion || CURRENT_LATEST_VERSION);
                          setMinVersionCode(versionConfig?.latestVersionCode || CURRENT_LATEST_CODE);
                          if (versionConfig?.apkDownloadUrl) setDownloadUrl(versionConfig.apkDownloadUrl);
                        }}
                        className="px-2 py-0.5 rounded bg-[#262626] hover:bg-[#333] text-emerald-400 border border-emerald-900/40 text-[10px] font-semibold"
                      >
                        Set to Latest (v{versionConfig?.latestAppVersion || CURRENT_LATEST_VERSION})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMinVersion(versionConfig?.minAppVersion || '2.7.0');
                          setMinVersionCode(versionConfig?.minVersionCode || 20700);
                          if (versionConfig?.apkDownloadUrl) setDownloadUrl(versionConfig.apkDownloadUrl);
                        }}
                        className="px-2 py-0.5 rounded bg-[#262626] hover:bg-[#333] text-red-400 border border-red-900/40 text-[10px] font-semibold"
                      >
                        Set to Min (v{versionConfig?.minAppVersion || '2.7.0'})
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#9ca3af] mb-1">Target Platform</label>
                      <select
                        value={targetPlatform}
                        onChange={e => setTargetPlatform(e.target.value)}
                        className="w-full px-3 py-2 bg-[#121212] border border-[#262626] rounded-lg text-xs text-[#f3f4f6] outline-none focus:border-[#f59e0b]"
                      >
                        <option value="android">Android App Only</option>
                        <option value="all">All Platforms (Android & Web)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#9ca3af] mb-1">Required Min Version</label>
                      <input
                        type="text"
                        value={minVersion}
                        onChange={e => setMinVersion(e.target.value)}
                        placeholder="2.7.0"
                        className="w-full px-3 py-2 bg-[#121212] border border-[#262626] rounded-lg text-xs text-[#f3f4f6] outline-none focus:border-[#f59e0b]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#9ca3af] mb-1">Required Build Code</label>
                      <input
                        type="number"
                        value={minVersionCode}
                        onChange={e => setMinVersionCode(e.target.value)}
                        placeholder="20700"
                        className="w-full px-3 py-2 bg-[#121212] border border-[#262626] rounded-lg text-xs text-[#f3f4f6] outline-none focus:border-[#f59e0b]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#9ca3af] mb-1">APK Download URL</label>
                    <input
                      type="url"
                      value={downloadUrl}
                      onChange={e => setDownloadUrl(e.target.value)}
                      placeholder="https://... (Direct APK link, Google Drive, Netlify, etc.)"
                      className="w-full px-3 py-2 bg-[#121212] border border-[#262626] rounded-lg text-xs text-[#f3f4f6] outline-none focus:border-[#f59e0b]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#9ca3af] mb-1">Lockout Message Shown to Student</label>
                    <textarea
                      rows={2}
                      value={updateMessage}
                      onChange={e => setUpdateMessage(e.target.value)}
                      placeholder="A mandatory app update is required to continue using NextBridge."
                      className="w-full px-3 py-2 bg-[#121212] border border-[#262626] rounded-lg text-xs text-[#f3f4f6] outline-none focus:border-[#f59e0b] resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#9ca3af] mb-1">Release Notes / Highlights</label>
                    <textarea
                      rows={2}
                      value={releaseNotes}
                      onChange={e => setReleaseNotes(e.target.value)}
                      placeholder="• Feature 1\n• Feature 2"
                      className="w-full px-3 py-2 bg-[#121212] border border-[#262626] rounded-lg text-xs text-[#f3f4f6] outline-none focus:border-[#f59e0b] resize-none font-mono"
                    />
                  </div>

                  <p className="text-[11px] text-[#71717a] italic">
                    ℹ️ Note: As soon as the student installs and opens v{minVersion}, the app automatically reports the new version and removes the lockout restriction.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-[#262626]">
                <button 
                  onClick={handleSaveAccess}
                  disabled={saving}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#f59e0b] text-[#0a0a0a] font-bold rounded-lg hover:bg-[#fbbf24] disabled:opacity-50 transition-colors shadow-lg shadow-amber-500/10 text-center"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#9ca3af] mb-1">Class</label>
                  <select 
                    value={studentClass} 
                    onChange={e => handleClassChange(e.target.value)} 
                    className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent text-[#f3f4f6]"
                  >
                    {CLASS_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {(studentClass === '11' || studentClass === '12') && (
                  <div>
                    <label className="block text-sm font-medium text-[#9ca3af] mb-1">Stream / Section</label>
                    <select 
                      value={studentStream} 
                      onChange={e => handleStreamChange(e.target.value)} 
                      className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent text-[#f3f4f6]"
                    >
                      {STREAM_OPTIONS.map(st => (
                        <option key={st.id} value={st.id}>{st.label}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#f59e0b] text-[#0a0a0a] font-bold rounded-lg hover:bg-[#fbbf24] disabled:opacity-50 transition-colors text-center"
                >
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>

              {/* Danger Zone: Permanent Account Deletion & Device Unbind */}
              <div className="mt-8 pt-6 border-t border-red-950/40">
                <div className="bg-red-950/15 border border-red-900/40 rounded-xl p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-red-400 flex items-center gap-2">
                        <Trash2 size={16} />
                        <span>Delete Student & Unbind Device</span>
                      </h4>
                      <p className="text-xs text-[#9ca3af] mt-1 max-w-lg">
                        Permanently erases this student, all usage analytics, and activity logs from the database. The bound device will be immediately unlinked so it can be registered to any other student without conflict.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDeleteStudent}
                      disabled={deleting}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition disabled:opacity-50 flex items-center space-x-1.5 shrink-0 shadow-md shadow-red-900/20"
                    >
                      <Trash2 size={14} />
                      <span>{deleting ? 'Deleting...' : 'Delete Student Permanently'}</span>
                    </button>
                  </div>
                </div>
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
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-[#f3f4f6]">App Version:</span>
                      {(() => {
                        const vStatus = getAndroidVersionStatus(student, versionConfig);
                        if (vStatus.status === 'web') return <span className="font-mono text-xs text-zinc-400">Web App</span>;
                        return <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${vStatus.badgeClass}`}>{vStatus.label}</span>;
                      })()}
                    </div>
                    <div className="flex justify-between"><span className="font-medium text-[#f3f4f6]">Platform:</span> <span className="uppercase text-xs font-semibold text-white">{student.platform || (student.device ? 'android' : 'web')}</span></div>
                    {student.lastActive && (
                      <div className="flex justify-between"><span className="font-medium text-[#f3f4f6]">Last Active:</span> <span className="text-xs">{new Date(student.lastActive).toLocaleString()}</span></div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[#9ca3af] italic">No device bound yet.</p>
                )}
              </div>

              {/* Analytics Header & Time Period Selector */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-1">
                <div>
                  <h3 className="text-sm font-bold text-[#f3f4f6] flex items-center space-x-2">
                    <BarChart2 size={16} className="text-[#f59e0b]" />
                    <span>App Usage & Activity</span>
                  </h3>
                  <p className="text-xs text-[#9ca3af]">Track screen time and learning engagement across time periods.</p>
                </div>
                <div className="flex items-center space-x-2 bg-[#141414] border border-[#262626] rounded-lg px-2.5 py-1 text-xs text-[#f3f4f6]">
                  <Calendar size={13} className="text-[#f59e0b]" />
                  <span className="text-[#9ca3af]">Period:</span>
                  <select
                    value={analyticsPeriod}
                    onChange={(e) => setAnalyticsPeriod(e.target.value)}
                    aria-label="Filter analytics by time period"
                    className="bg-transparent border-none text-[#f3f4f6] font-semibold text-xs focus:outline-none cursor-pointer pr-1"
                  >
                    <option value="today" className="bg-[#1a1a1a] text-white">Today (Day View)</option>
                    <option value="week" className="bg-[#1a1a1a] text-white">This Week (Last 7 Days)</option>
                    <option value="all" className="bg-[#1a1a1a] text-white">All Time (Lifetime)</option>
                  </select>
                </div>
              </div>

              {/* Analytics Summary Cards (Hours & Minutes) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                 <div className="bg-[#1a1a1a] p-3.5 rounded-xl border border-[#262626]">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Screen Time</p>
                      <Clock size={13} className="text-[#4ade80]" />
                    </div>
                    <p className="text-lg sm:text-xl font-bold text-[#4ade80]">
                       {formatDuration(periodStats.screenTime)}
                    </p>
                    <p className="text-[11px] text-[#6b7280] mt-0.5">
                       {Math.floor(periodStats.screenTime / 60)} mins total
                    </p>
                 </div>

                 <div className="bg-[#1a1a1a] p-3.5 rounded-xl border border-[#262626]">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Video Watched</p>
                      <Video size={13} className="text-blue-400" />
                    </div>
                    <p className="text-lg sm:text-xl font-bold text-blue-400">
                       {formatDuration(periodStats.videoTime)}
                    </p>
                    <p className="text-[11px] text-[#6b7280] mt-0.5">
                       {Math.floor(periodStats.videoTime / 60)} mins total
                    </p>
                 </div>

                 <div className="bg-[#1a1a1a] p-3.5 rounded-xl border border-[#262626]">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Notes & Books</p>
                      <FileText size={13} className="text-purple-400" />
                    </div>
                    <p className="text-lg sm:text-xl font-bold text-purple-400">
                       {formatDuration(periodStats.notesTime)}
                    </p>
                    <p className="text-[11px] text-[#6b7280] mt-0.5">
                       {Math.floor(periodStats.notesTime / 60)} mins total
                    </p>
                 </div>

                 <div className="bg-[#1a1a1a] p-3.5 rounded-xl border border-[#262626]">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-[#9ca3af] uppercase tracking-wider font-semibold">Last Active</p>
                      <Zap size={13} className="text-[#f59e0b]" />
                    </div>
                    <p className="text-xs sm:text-sm font-semibold text-[#f3f4f6] truncate">
                       {student.lastActive ? new Date(student.lastActive).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                    </p>
                    <p className="text-[11px] text-[#6b7280] mt-0.5">
                       Study: {formatDuration(periodStats.studyTime)}
                    </p>
                 </div>
              </div>

              {/* 7-Day Usage Visual Bar Chart */}
              <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#262626]">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-bold text-[#f3f4f6] uppercase tracking-wider flex items-center space-x-1.5">
                    <BarChart2 size={13} className="text-[#4ade80]" />
                    <span>7-Day App Activity Trend</span>
                  </h4>
                  <span className="text-[11px] text-[#6b7280]">Daily Screen Time</span>
                </div>
                
                {(() => {
                  const maxSecs = Math.max(...sevenDaysBreakdown.map(d => d.screenSecs), 1800);
                  return (
                    <div className="grid grid-cols-7 gap-1.5 sm:gap-2 pt-4 pb-1 items-end h-28 border-b border-[#262626]">
                      {sevenDaysBreakdown.map((day, idx) => {
                        const heightPct = Math.max(6, Math.min(100, Math.round((day.screenSecs / maxSecs) * 100)));
                        const isNonZero = day.screenSecs > 0;
                        return (
                          <div key={idx} className="flex flex-col items-center h-full justify-end group relative">
                            <span className="text-[10px] font-mono text-[#9ca3af] mb-1 group-hover:text-white transition-colors">
                              {isNonZero ? formatDuration(day.screenSecs, { compact: true }) : '-'}
                            </span>
                            <div className="w-full bg-[#121212] rounded-t-md h-full flex items-end overflow-hidden">
                              <div 
                                style={{ height: `${heightPct}%` }}
                                className={`w-full rounded-t-sm transition-all duration-300 ${
                                  day.isToday 
                                    ? 'bg-gradient-to-t from-[#22c55e] to-[#4ade80]' 
                                    : (isNonZero ? 'bg-gradient-to-t from-[#0284c7] to-[#38bdf8]' : 'bg-[#262626]')
                                }`}
                              />
                            </div>
                            <span className={`text-[10px] sm:text-[11px] mt-1.5 truncate ${day.isToday ? 'font-bold text-[#4ade80]' : 'text-[#6b7280]'}`}>
                              {day.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Activity Timeline with Filter */}
              <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                  <h3 className="text-sm font-bold text-[#f3f4f6] flex items-center space-x-2">
                    <Clock size={16} className="text-[#f59e0b]" /> 
                    <span>Activity Timeline</span>
                    <span className="text-xs font-normal text-[#6b7280]">({filteredLogs.length} events)</span>
                  </h3>

                  <div className="flex items-center space-x-1.5 bg-[#141414] border border-[#262626] rounded-lg px-2 py-1 text-xs">
                    <Filter size={12} className="text-[#9ca3af]" />
                    <select
                      value={logFilter}
                      onChange={(e) => setLogFilter(e.target.value)}
                      aria-label="Filter activity timeline by type"
                      className="bg-transparent border-none text-[#f3f4f6] text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="all" className="bg-[#1a1a1a] text-white">All Events</option>
                      <option value="watch" className="bg-[#1a1a1a] text-white">Video Watched</option>
                      <option value="notes" className="bg-[#1a1a1a] text-white">Notes / Books Read</option>
                      <option value="login" className="bg-[#1a1a1a] text-white">Logins</option>
                      <option value="download" className="bg-[#1a1a1a] text-white">Downloads</option>
                    </select>
                  </div>
                </div>

                {loadingLogs ? (
                  <p className="text-sm text-[#9ca3af] text-center py-4">Loading activity logs...</p>
                ) : filteredLogs.length > 0 ? (
                  <div className="space-y-2.5 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                    {filteredLogs.map(log => (
                      <div key={log.id} className="bg-[#1a1a1a] border border-[#262626] p-3 rounded-lg flex justify-between items-center text-sm hover:border-[#3b3b3b] transition-colors">
                        <div className="min-w-0 pr-3">
                          <p className="font-medium text-[#f3f4f6] flex items-center space-x-2 truncate">
                             {log.type === 'watch' && <span className="text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded text-xs font-bold shrink-0">WATCHED</span>}
                             {log.type === 'notes' && <span className="text-purple-400 bg-purple-900/20 px-2 py-0.5 rounded text-xs font-bold shrink-0">READ</span>}
                             {log.type === 'download' && <span className="text-green-400 bg-green-900/20 px-2 py-0.5 rounded text-xs font-bold shrink-0">DOWNLOADED</span>}
                             {(!log.type || log.type === 'login') && <span className="text-[#f59e0b] bg-[#f59e0b]/20 px-2 py-0.5 rounded text-xs font-bold shrink-0">LOGIN</span>}
                             <span className="truncate">{log.videoTitle || log.noteTitle || (log.type === 'login' ? 'App Login' : 'Study Action')}</span>
                          </p>
                          <div className="flex items-center gap-2 text-xs text-[#6b7280] mt-1">
                            <span>{new Date(log.timestamp).toLocaleString()}</span>
                            {log.subjectName && (
                              <>
                                <span>•</span>
                                <span className="text-[#9ca3af]">{log.subjectName}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-mono text-[#f59e0b] bg-[#121212] border border-[#262626] px-2 py-1 rounded shrink-0">
                          {log.durationSecs ? formatDuration(log.durationSecs, { compact: true, showSeconds: true }) : (log.device?.model || 'Device')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#9ca3af] text-center py-6 border border-dashed border-[#262626] rounded-lg bg-[#1a1a1a]">
                    No activity records found for this filter.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
