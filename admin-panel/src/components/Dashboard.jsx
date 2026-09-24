import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { 
  LogOut, 
  Users, 
  Plus, 
  Copy, 
  Check, 
  Info, 
  ShieldAlert, 
  Settings, 
  Trophy, 
  Calendar, 
  Clock,
  BookOpen,
  RefreshCw,
  Search,
  X,
  Download,
  Trash2,
  Megaphone
} from 'lucide-react';
import StudentModal from './StudentModal';
import AdminCourseLibrary from './AdminCourseLibrary';
import RenderSyncPanel from './RenderSyncPanel';
import AdminAnalytics from './AdminAnalytics';
import BroadcastUpdateModal from './BroadcastUpdateModal';
import AdminNoticeBoard from './AdminNoticeBoard';
import AppVersionSettingsModal from './AppVersionSettingsModal';
import { 
  CURRENT_LATEST_VERSION, 
  DEFAULT_ANDROID_VERSION_CONFIG, 
  getAndroidVersionStatus, 
  compareSemver 
} from '../utils/version';

function generatePAT() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function Dashboard({ onLogout }) {
  const [students, setStudents] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionConfig, setVersionConfig] = useState(DEFAULT_ANDROID_VERSION_CONFIG);
  const [copiedPAT, setCopiedPAT] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Search & Filter State
  const [searchFilter, setSearchFilter] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Form State
  const [name, setName] = useState('');
  const [studentClass, setStudentClass] = useState('9');
  const [school, setSchool] = useState('');
  const [area, setArea] = useState('');
  const [initialSubscriptionDays, setInitialSubscriptionDays] = useState(5);
  const [accessCourses, setAccessCourses] = useState(true);
  const [accessTextbooks, setAccessTextbooks] = useState(true);
  const [accessPyqs, setAccessPyqs] = useState(true);
  const [accessPdfDownload, setAccessPdfDownload] = useState(true);
  const [accessPdfExportShare, setAccessPdfExportShare] = useState(true);

  const filteredStudents = useMemo(() => {
    const q = searchFilter.toLowerCase().trim();
    const now = Date.now();
    return students.filter(s => {
      if (classFilter !== 'all' && String(s.class) !== classFilter) return false;
      
      const expiry = s.subscriptionExpiresAt 
        ? (typeof s.subscriptionExpiresAt === 'number' ? s.subscriptionExpiresAt : new Date(s.subscriptionExpiresAt).getTime())
        : null;
      const isExpired = expiry !== null && expiry <= now;

      if (statusFilter === 'active' && (s.status === 'revoked' || isExpired)) return false;
      if (statusFilter === 'expired' && !isExpired && s.status !== 'revoked') return false;

      if (!q) return true;
      return (
        (s.name || '').toLowerCase().includes(q) ||
        (s.pat || '').toLowerCase().includes(q) ||
        (s.personalDetails?.school || '').toLowerCase().includes(q) ||
        (s.personalDetails?.area || '').toLowerCase().includes(q)
      );
    });
  }, [students, searchFilter, classFilter, statusFilter]);

  useEffect(() => {
    const unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStudents(data);
    });

    // Real-time listener for Android Version Control settings in Firestore
    const unsubConfig = onSnapshot(doc(db, 'system_config', 'app_versions'), (snapshot) => {
      if (snapshot.exists()) {
        setVersionConfig({ ...DEFAULT_ANDROID_VERSION_CONFIG, ...snapshot.data() });
      }
    }, (err) => {
      console.warn('[Dashboard] Could not fetch system_config/app_versions:', err);
    });

    return () => {
      unsubStudents();
      unsubConfig();
    };
  }, []);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    const pat = generatePAT();
    const expiry = initialSubscriptionDays > 0 
      ? (Date.now() + initialSubscriptionDays * 24 * 60 * 60 * 1000) 
      : null;

    await addDoc(collection(db, 'students'), {
      name,
      class: studentClass,
      personalDetails: { school, area },
      pat,
      device: null,
      status: 'active',
      subscriptionExpiresAt: expiry,
      allowedSections: {
        courses: accessCourses,
        textbooks: accessTextbooks,
        pyqs: accessPyqs,
        pdfDownload: accessPdfDownload,
        pdfExportShare: accessPdfExportShare
      },
      customMessage: '',
      totalVideoTime: 0,
      totalNotesTime: 0,
      totalScreenTime: 0
    });
    setShowAddModal(false);
    setName(''); setSchool(''); setArea(''); setStudentClass('9'); setInitialSubscriptionDays(5);
    setAccessCourses(true); setAccessTextbooks(true); setAccessPyqs(true);
    setAccessPdfDownload(true); setAccessPdfExportShare(true);
  };

  const copyToClipboard = (pat) => {
    navigator.clipboard.writeText(pat);
    setCopiedPAT(pat);
    setTimeout(() => setCopiedPAT(null), 2000);
  };

  const handleDeleteStudent = async (studentToDelete, e) => {
    if (e) e.stopPropagation();
    const confirmMsg = `Are you sure you want to completely delete ${studentToDelete.name} (PAT: ${studentToDelete.pat})?\n\n` +
      `⚠️ This will:\n` +
      `1. Immediately UNBIND the linked device so it is free to log into another student account without conflict.\n` +
      `2. Permanently erase all their activity logs and usage history from the database.\n` +
      `3. Remove this student document entirely from the database.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      // 1. Unbind device and revoke status first to signal live app
      await updateDoc(doc(db, 'students', studentToDelete.id), {
        device: null,
        deviceRevokedAt: new Date().toISOString(),
        status: 'revoked'
      }).catch(() => {});

      // 2. Fetch and delete all logs in subcollection
      const logsSnap = await getDocs(collection(db, 'students', studentToDelete.id, 'logs'));
      const deletePromises = logsSnap.docs.map(logDoc => deleteDoc(logDoc.ref));
      await Promise.all(deletePromises);

      // 3. Delete student doc
      await deleteDoc(doc(db, 'students', studentToDelete.id));

      alert(`Student ${studentToDelete.name} and all data have been completely deleted.`);
    } catch (err) {
      console.error('Failed to delete student:', err);
      alert('Failed to delete student: ' + err.message);
    }
  };

  const [activeTab, setActiveTab] = useState('students'); // 'students', 'analytics', 'library', 'sync'

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f3f4f6]">
      {/* Navbar */}
      <nav className="bg-[#121212] border-b border-[#262626] px-3 sm:px-6 py-2.5 sm:py-3 sticky top-0 z-40">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2.5">
          {/* Top row: Logo + Logout (mobile logout right aligned) */}
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center space-x-2 text-[#f59e0b] font-bold text-base sm:text-lg">
              <img src="/favicon.png" alt="Logo" className="w-6 h-6 sm:w-7 sm:h-7 rounded" />
              <span>Next Bridge Admin</span>
            </div>
            
            <button 
              onClick={onLogout} 
              className="flex items-center space-x-1.5 text-xs text-[#9ca3af] hover:text-[#ef4444] transition md:hidden bg-[#1a1a1a] px-2.5 py-1.5 rounded-lg border border-[#262626]"
            >
              <LogOut size={13} />
              <span>Logout</span>
            </button>
          </div>

          {/* Navigation Tabs (Full width 5-column grid on mobile, inline on desktop) */}
          <div className="w-full md:w-auto flex items-center gap-2">
            <div className="grid grid-cols-5 gap-1 w-full md:flex md:w-auto bg-[#181818] md:bg-transparent p-1 md:p-0 rounded-xl md:rounded-none border md:border-0 border-[#262626]">
              <button 
                onClick={() => setActiveTab('students')}
                className={`flex items-center justify-center space-x-1 py-2 md:py-1.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition text-center ${activeTab === 'students' ? 'bg-[#262626] text-white border border-[#3a3a3a] shadow-sm' : 'text-[#9ca3af] hover:text-white'}`}
              >
                <Users size={14} />
                <span className="hidden sm:inline">Students</span>
              </button>
              <button 
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center justify-center space-x-1 py-2 md:py-1.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition text-center ${activeTab === 'analytics' ? 'bg-[#262626] text-[#f59e0b] border border-[#f59e0b]/30 shadow-sm' : 'text-[#9ca3af] hover:text-white'}`}
              >
                <Trophy size={14} />
                <span className="hidden sm:inline">Analytics</span>
              </button>
              <button 
                onClick={() => setActiveTab('library')}
                className={`flex items-center justify-center space-x-1 py-2 md:py-1.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition text-center ${activeTab === 'library' ? 'bg-[#262626] text-white border border-[#3a3a3a] shadow-sm' : 'text-[#9ca3af] hover:text-white'}`}
              >
                <BookOpen size={14} />
                <span className="hidden sm:inline">Library</span>
              </button>
              <button 
                onClick={() => setActiveTab('notices')}
                className={`flex items-center justify-center space-x-1 py-2 md:py-1.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition text-center ${activeTab === 'notices' ? 'bg-[#262626] text-amber-400 border border-amber-500/30 shadow-sm' : 'text-[#9ca3af] hover:text-white'}`}
              >
                <Megaphone size={14} />
                <span className="hidden sm:inline">Notices</span>
              </button>
              <button 
                onClick={() => setActiveTab('sync')}
                className={`flex items-center justify-center space-x-1 py-2 md:py-1.5 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition text-center ${activeTab === 'sync' ? 'bg-[#262626] text-white border border-[#3a3a3a] shadow-sm' : 'text-[#9ca3af] hover:text-white'}`}
              >
                <RefreshCw size={14} />
                <span className="hidden sm:inline">Sync</span>
              </button>
            </div>
            
            <button 
              onClick={onLogout} 
              className="hidden md:flex items-center space-x-1.5 text-sm text-[#9ca3af] hover:text-[#ef4444] transition px-3 py-1.5 rounded-lg hover:bg-[#1a1a1a] border border-transparent hover:border-[#262626]"
            >
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {activeTab === 'students' && (
          <>
            {/* Header & Add Student */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <span>Students Directory</span>
                  <span className="text-xs bg-[#1a1a1a] text-[#f59e0b] px-2.5 py-0.5 rounded-full border border-[#262626] font-semibold">
                    {filteredStudents.length}
                  </span>
                </h1>
                <p className="text-xs text-[#9ca3af] mt-0.5">Manage tokens, devices, and tiered section access</p>
              </div>
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button 
                  onClick={() => setShowVersionModal(true)}
                  className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 bg-[#181818] hover:bg-[#222] text-[#f3f4f6] border border-[#333] hover:border-[#f59e0b] px-3 py-2 rounded-lg transition font-semibold text-xs sm:text-sm shadow-md"
                  title="Configure Android app version criteria (Red, Yellow, Green)"
                >
                  <Settings size={15} className="text-[#f59e0b]" />
                  <span>Version Rules</span>
                  <span className="hidden md:inline text-[10px] text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/30 px-1.5 py-0.2 rounded font-mono">
                    v{versionConfig.latestAppVersion}
                  </span>
                </button>
                <button 
                  onClick={() => setShowBroadcastModal(true)}
                  className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 bg-[#181818] hover:bg-[#222] text-[#f59e0b] border border-[#f59e0b]/40 hover:border-[#f59e0b] px-3.5 py-2 rounded-lg transition font-semibold text-xs sm:text-sm shadow-md"
                  title="Broadcast app update requirements to students"
                >
                  <Download size={15} />
                  <span>Broadcast Update</span>
                </button>
                <button 
                  onClick={() => setShowAddModal(true)}
                  className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 bg-[#f59e0b] text-[#0a0a0a] px-4 py-2 rounded-lg hover:bg-[#fbbf24] transition font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/10"
                >
                  <Plus size={16} />
                  <span>Add New Student</span>
                </button>
              </div>
            </div>

            {/* Search and Filters Bar */}
            <div className="bg-[#121212] p-3 sm:p-4 rounded-xl border border-[#262626] mb-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                  <input 
                    type="text"
                    placeholder="Search by name, school, area, or PAT token..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg text-sm text-[#f3f4f6] placeholder-[#9ca3af]/50 outline-none focus:ring-1 focus:ring-[#f59e0b] focus:border-[#f59e0b]"
                  />
                  {searchFilter && (
                    <button 
                      onClick={() => setSearchFilter('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 scrollbar-none">
                  {['all', '9', '10'].map((cls) => (
                    <button
                      key={cls}
                      onClick={() => setClassFilter(cls)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${classFilter === cls ? 'bg-[#f59e0b] text-[#0a0a0a]' : 'bg-[#1a1a1a] text-[#9ca3af] hover:text-white border border-[#262626]'}`}
                    >
                      {cls === 'all' ? 'All Classes' : `Class ${cls}`}
                    </button>
                  ))}
                  <div className="w-[1px] h-5 bg-[#262626] mx-1" />
                  {[
                    { id: 'all', label: 'All Status' },
                    { id: 'active', label: 'Active' },
                    { id: 'expired', label: 'Expired' }
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setStatusFilter(st.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${statusFilter === st.id ? 'bg-white text-[#0a0a0a]' : 'bg-[#1a1a1a] text-[#9ca3af] hover:text-white border border-[#262626]'}`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile View: Responsive Student Cards */}
            <div className="block md:hidden space-y-3">
              {filteredStudents.length === 0 ? (
                <div className="p-8 text-center text-[#9ca3af] bg-[#121212] border border-[#262626] rounded-xl">
                  No matching students found.
                </div>
              ) : (
                filteredStudents.map((s) => {
                  const expiry = s.subscriptionExpiresAt 
                    ? (typeof s.subscriptionExpiresAt === 'number' ? s.subscriptionExpiresAt : new Date(s.subscriptionExpiresAt).getTime())
                    : null;
                  const diff = expiry ? expiry - Date.now() : null;
                  const isExpired = diff !== null && diff <= 0;
                  const days = diff !== null && diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
                  const hours = diff !== null && diff > 0 ? Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)) : 0;
                  const isUrgent = days < 3;

                  const coursesAllowed = s.allowedSections?.courses ?? true;
                  const textbooksAllowed = s.allowedSections?.textbooks ?? true;
                  const pyqsAllowed = s.allowedSections?.pyqs ?? true;

                  return (
                    <div key={s.id} className="bg-[#121212] border border-[#262626] rounded-xl p-4 space-y-3 shadow-sm">
                      {/* Card Top: Avatar, Name, Class & Subscription Pill */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-9 h-9 rounded-lg bg-[#1a1a1a] border border-[#262626] flex items-center justify-center font-bold text-[#f59e0b] text-sm flex-shrink-0">
                            {s.name ? s.name.charAt(0).toUpperCase() : 'S'}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-bold text-sm text-[#f3f4f6]">{s.name}</h3>
                              <span className="text-[10px] bg-[#1a1a1a] text-[#9ca3af] px-1.5 py-0.2 rounded border border-[#262626] font-medium">
                                Cl {s.class}
                              </span>
                            </div>
                            <div className="text-xs text-[#9ca3af]">
                              {s.personalDetails?.school || 'School'} • {s.personalDetails?.area || 'Area'}
                            </div>
                          </div>
                        </div>

                        <div>
                          {s.status === 'revoked' ? (
                            <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full border bg-red-900/20 text-red-400 border-red-900/50">
                              Revoked
                            </span>
                          ) : s.status === 'suspended' ? (
                            <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full border bg-amber-900/20 text-amber-400 border-amber-900/50">
                              Suspended
                            </span>
                          ) : !expiry ? (
                            <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full border bg-emerald-900/20 text-emerald-400 border-emerald-900/50">
                              Unlimited
                            </span>
                          ) : isExpired ? (
                            <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full border bg-red-900/20 text-red-400 border-red-900/50">
                              Expired
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border ${isUrgent ? 'bg-amber-900/20 text-amber-400 border-amber-900/50' : 'bg-green-900/20 text-green-400 border-green-900/50'}`}>
                              {days > 0 ? `${days}d left` : `${hours}h left`}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Middle: PAT and Permissions */}
                      <div className="flex items-center justify-between bg-[#161616] p-2.5 rounded-lg border border-[#222]">
                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] text-[#9ca3af]">PAT:</span>
                          <code className="bg-[#121212] border border-[#2a2a2a] px-2 py-0.5 rounded text-[#f59e0b] font-bold text-xs">
                            {s.pat}
                          </code>
                          <button 
                            onClick={() => copyToClipboard(s.pat)} 
                            className="text-[#9ca3af] hover:text-[#f3f4f6] p-1"
                            title="Copy PAT"
                          >
                            {copiedPAT === s.pat ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                          </button>
                        </div>

                        {/* Section Tier Badges */}
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${coursesAllowed ? 'bg-amber-950/40 text-amber-400 border-amber-800/60' : 'bg-zinc-900 text-zinc-600 border-zinc-800 line-through'}`}>
                            Courses
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${textbooksAllowed ? 'bg-blue-950/40 text-blue-400 border-blue-800/60' : 'bg-zinc-900 text-zinc-600 border-zinc-800 line-through'}`}>
                            Books
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${pyqsAllowed ? 'bg-purple-950/40 text-purple-400 border-purple-800/60' : 'bg-zinc-900 text-zinc-600 border-zinc-800 line-through'}`}>
                            PYQ
                          </span>
                        </div>
                      </div>

                      {/* Device, Platform, Version & Manage Button */}
                      <div className="flex items-center justify-between pt-1 text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap text-[#9ca3af]">
                          {s.device ? (
                            <span className="text-green-400 flex items-center gap-1 text-[11px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                              {s.device.model}
                            </span>
                          ) : (
                            <span className="italic text-[11px] text-[#71717a]">No device bound</span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold border bg-zinc-900 border-zinc-700 text-zinc-300 uppercase">
                            {s.platform || (s.device ? 'android' : 'web')}
                          </span>
                          {(() => {
                            const vStatus = getAndroidVersionStatus(s, versionConfig);
                            if (vStatus.status === 'web') {
                              return (
                                <span className="text-[10px] px-1.5 py-0.2 rounded border bg-zinc-900/60 text-zinc-400 border-zinc-800 font-mono">
                                  WEB
                                </span>
                              );
                            }
                            return (
                              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold border ${vStatus.badgeClass}`} title={vStatus.label}>
                                {vStatus.label}
                              </span>
                            );
                          })()}
                          {s.forcedUpdate?.enabled && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-bold border bg-red-950/40 text-red-400 border-red-800 animate-pulse">
                              Lockout
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          <button 
                            onClick={() => setSelectedStudent(s)}
                            className="flex items-center space-x-1 text-xs font-semibold text-[#f59e0b] hover:text-[#fbbf24] bg-[#1a1a1a] hover:bg-[#222] border border-[#333] hover:border-[#f59e0b]/50 px-2.5 py-1.5 rounded-lg transition"
                          >
                            <Settings size={13} />
                            <span>Manage</span>
                          </button>
                          <button 
                            onClick={(e) => handleDeleteStudent(s, e)}
                            className="p-1.5 text-xs text-[#71717a] hover:text-red-400 bg-[#1a1a1a] border border-[#333] hover:border-red-900/50 rounded-lg transition"
                            title="Delete Student & Unbind Device"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop View: Full Comprehensive Table (hidden on mobile) */}
            <div className="hidden md:block bg-[#121212] rounded-xl shadow-sm overflow-x-auto border border-[#262626]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#1a1a1a] text-[#9ca3af] text-sm uppercase tracking-wider border-b border-[#262626]">
                    <th className="p-4 border-b border-[#262626]">Name</th>
                    <th className="p-4 border-b border-[#262626]">Class</th>
                    <th className="p-4 border-b border-[#262626]">PAT Token</th>
                    <th className="p-4 border-b border-[#262626]">Device Info</th>
                    <th className="p-4 border-b border-[#262626]">Access</th>
                    <th className="p-4 border-b border-[#262626]">Subscription</th>
                    <th className="p-4 border-b border-[#262626]">Status</th>
                    <th className="p-4 border-b border-[#262626]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => {
                    const expiry = s.subscriptionExpiresAt 
                      ? (typeof s.subscriptionExpiresAt === 'number' ? s.subscriptionExpiresAt : new Date(s.subscriptionExpiresAt).getTime())
                      : null;
                    const diff = expiry ? expiry - Date.now() : null;
                    const isExpired = diff !== null && diff <= 0;
                    const days = diff !== null && diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
                    const hours = diff !== null && diff > 0 ? Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)) : 0;
                    const isUrgent = days < 3;

                    const coursesAllowed = s.allowedSections?.courses ?? true;
                    const textbooksAllowed = s.allowedSections?.textbooks ?? true;
                    const pyqsAllowed = s.allowedSections?.pyqs ?? true;

                    return (
                      <tr key={s.id} className="border-b border-[#262626] last:border-0 hover:bg-[#1a1a1a] transition-colors">
                        <td className="p-4 font-medium">
                          {s.name}
                          <div className="text-xs text-[#9ca3af] font-normal">{s.personalDetails?.school} • {s.personalDetails?.area}</div>
                        </td>
                        <td className="p-4 text-[#9ca3af]">{s.class}</td>
                        <td className="p-4">
                          <div className="flex items-center space-x-2">
                            <code className="bg-[#1a1a1a] border border-[#262626] px-2 py-1 rounded text-[#f59e0b] font-bold">{s.pat}</code>
                            <button onClick={() => copyToClipboard(s.pat)} className="text-[#9ca3af] hover:text-[#f3f4f6]" title="Copy PAT">
                              {copiedPAT === s.pat ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                            </button>
                          </div>
                        </td>
                        <td className="p-4 text-sm">
                          {s.device ? (
                            <div className="flex items-start space-x-1 text-green-500">
                              <Info size={16} className="mt-0.5 shrink-0" />
                              <div>
                                <div className="text-[#f3f4f6] flex items-center gap-1.5 flex-wrap">
                                  <span>{s.device.model}</span>
                                  <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold border bg-zinc-900 border-zinc-700 text-zinc-300 uppercase">
                                    {s.platform || (s.device ? 'android' : 'web')}
                                  </span>
                                  {(() => {
                                    const vStatus = getAndroidVersionStatus(s, versionConfig);
                                    if (vStatus.status === 'web') {
                                      return (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded border bg-zinc-900/60 text-zinc-400 border-zinc-800 font-mono">
                                          WEB
                                        </span>
                                      );
                                    }
                                    return (
                                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold border ${vStatus.badgeClass}`} title={vStatus.label}>
                                        {vStatus.label}
                                      </span>
                                    );
                                  })()}
                                </div>
                                <div className="text-xs text-[#9ca3af] break-all w-36 font-mono mt-0.5">{s.device.androidId}</div>
                                {s.forcedUpdate?.enabled && (
                                  <div className="mt-1">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold border bg-red-950/40 text-red-400 border-red-800 inline-flex items-center gap-1 animate-pulse">
                                      <Download size={10} />
                                      Update Locked ({s.forcedUpdate.minVersion || '2.7.0'})
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <span className="text-[#9ca3af] italic">Not logged in yet</span>
                              {s.forcedUpdate?.enabled && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold border bg-red-950/40 text-red-400 border-red-800 w-fit">
                                  Update Locked
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1 w-28">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${coursesAllowed ? 'bg-amber-950/40 text-amber-400 border-amber-800/60' : 'bg-zinc-900 text-zinc-600 border-zinc-800 line-through'}`} title={coursesAllowed ? 'Courses enabled' : 'Courses blocked'}>
                              Courses
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${textbooksAllowed ? 'bg-blue-950/40 text-blue-400 border-blue-800/60' : 'bg-zinc-900 text-zinc-600 border-zinc-800 line-through'}`} title={textbooksAllowed ? 'Textbooks enabled' : 'Textbooks blocked'}>
                              Books
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${pyqsAllowed ? 'bg-purple-950/40 text-purple-400 border-purple-800/60' : 'bg-zinc-900 text-zinc-600 border-zinc-800 line-through'}`} title={pyqsAllowed ? 'PYQs enabled' : 'PYQs blocked'}>
                              PYQ
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          {s.status === 'revoked' ? (
                            <span className="px-2.5 py-1 inline-flex text-xs font-semibold rounded-full border bg-red-900/20 text-red-400 border-red-900/50">
                              Revoked
                            </span>
                          ) : !expiry ? (
                            <span className="px-2.5 py-1 inline-flex text-xs font-semibold rounded-full border bg-emerald-900/20 text-emerald-400 border-emerald-900/50">
                              Unlimited
                            </span>
                          ) : isExpired ? (
                            <div className="flex flex-col">
                              <span className="px-2.5 py-0.5 inline-flex text-xs font-semibold rounded-full border w-fit bg-red-900/20 text-red-400 border-red-900/50">
                                Expired
                              </span>
                              <span className="text-[11px] text-[#9ca3af] mt-0.5">
                                {new Date(expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              <span className={`px-2.5 py-0.5 inline-flex text-xs font-semibold rounded-full border w-fit ${isUrgent ? 'bg-amber-900/20 text-amber-400 border-amber-900/50' : 'bg-green-900/20 text-green-400 border-green-900/50'}`}>
                                {days > 0 ? `${days}d ${hours}h left` : `${hours}h left`}
                              </span>
                              <span className="text-[11px] text-[#9ca3af] mt-0.5">
                                {new Date(expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${
                            s.status === 'active' 
                              ? 'bg-green-900/20 text-green-400 border-green-900/50' 
                              : s.status === 'suspended'
                              ? 'bg-amber-900/20 text-amber-400 border-amber-900/50'
                              : 'bg-red-900/20 text-red-400 border-red-900/50'
                          }`}>
                            {s.status === 'suspended' ? 'Suspended' : s.status}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center space-x-1.5">
                            <button 
                              onClick={() => setSelectedStudent(s)}
                              className="flex items-center space-x-1 text-xs font-semibold text-[#9ca3af] hover:text-[#f59e0b] bg-[#1a1a1a] border border-[#262626] hover:border-[#f59e0b]/50 px-2.5 py-1.5 rounded-lg transition"
                              title="Manage Student Access & Profile"
                            >
                              <Settings size={14} />
                              <span>Manage</span>
                            </button>
                            <button 
                              onClick={(e) => handleDeleteStudent(s, e)}
                              className="p-1.5 text-xs text-[#71717a] hover:text-red-400 bg-[#1a1a1a] border border-[#262626] hover:border-red-900/50 rounded-lg transition"
                              title="Delete Student & Unbind Device"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredStudents.length === 0 && (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-[#9ca3af]">No students matching your filter.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'analytics' && (
          <AdminAnalytics 
            students={students} 
            onSelectStudent={(s) => setSelectedStudent(s)} 
          />
        )}

        {activeTab === 'library' && (
          <AdminCourseLibrary />
        )}

        {activeTab === 'notices' && (
          <AdminNoticeBoard />
        )}

        {activeTab === 'sync' && (
          <RenderSyncPanel />
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-[#0a0a0a]/90 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-[#121212] border-0 sm:border border-[#262626] rounded-none sm:rounded-xl shadow-2xl p-4 sm:p-6 w-full h-full sm:h-auto sm:max-w-md overflow-y-auto custom-scrollbar flex flex-col justify-between">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#262626] sm:border-0 sm:pb-0 sm:mb-4">
              <h2 className="text-lg sm:text-xl font-bold">Add New Student</h2>
              <button 
                onClick={() => setShowAddModal(false)} 
                className="text-[#9ca3af] hover:text-white p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddStudent} className="space-y-4 flex-1 flex flex-col justify-between">
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
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-[#9ca3af]">Initial Subscription Duration (Days)</label>
                  <span className="text-xs text-[#f59e0b] font-medium">Default: 5 Days</span>
                </div>
                <input 
                  required 
                  type="number" 
                  min="0" 
                  value={initialSubscriptionDays} 
                  onChange={e => setInitialSubscriptionDays(Math.max(0, parseInt(e.target.value) || 0))} 
                  className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent text-[#f3f4f6] mb-2" 
                  placeholder="Enter days (0 for unlimited)"
                />
                <div className="flex flex-wrap gap-1.5">
                  {[5, 30, 90, 365, 0].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setInitialSubscriptionDays(d)}
                      className={`text-[11px] px-2.5 py-1 rounded border transition ${initialSubscriptionDays === d ? 'bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/50' : 'bg-[#181818] text-[#9ca3af] border-[#2a2a2a] hover:text-white'}`}
                    >
                      {d === 0 ? 'Unlimited' : `${d} Days`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[#6b7280] mt-1">Set 0 for permanent unlimited access.</p>
              </div>

              {/* Section Access Permissions */}
              <div className="bg-[#181818] p-3.5 rounded-lg border border-[#262626]">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">
                    Feature Access Permissions
                  </label>
                  <span className="text-[10px] text-[#f59e0b]">Tier Control</span>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2.5 cursor-pointer text-sm">
                    <input 
                      type="checkbox" 
                      checked={accessCourses} 
                      onChange={e => setAccessCourses(e.target.checked)}
                      className="w-4 h-4 rounded border-[#333] text-[#f59e0b] focus:ring-[#f59e0b] bg-[#121212]"
                    />
                    <span className="text-[#f3f4f6]">Courses & Lectures</span>
                    <span className="text-[11px] text-[#9ca3af] ml-auto">Video + Notes</span>
                  </label>
                  <label className="flex items-center space-x-2.5 cursor-pointer text-sm">
                    <input 
                      type="checkbox" 
                      checked={accessTextbooks} 
                      onChange={e => setAccessTextbooks(e.target.checked)}
                      className="w-4 h-4 rounded border-[#333] text-[#f59e0b] focus:ring-[#f59e0b] bg-[#121212]"
                    />
                    <span className="text-[#f3f4f6]">NCERT Textbooks</span>
                    <span className="text-[11px] text-[#9ca3af] ml-auto">Class 10 Books</span>
                  </label>
                  <label className="flex items-center space-x-2.5 cursor-pointer text-sm">
                    <input 
                      type="checkbox" 
                      checked={accessPyqs} 
                      onChange={e => setAccessPyqs(e.target.checked)}
                      className="w-4 h-4 rounded border-[#333] text-[#f59e0b] focus:ring-[#f59e0b] bg-[#121212]"
                    />
                    <span className="text-[#f3f4f6]">CBSE PYQs Hub</span>
                    <span className="text-[11px] text-[#9ca3af] ml-auto">Past Papers</span>
                  </label>
                  <label className="flex items-center space-x-2.5 cursor-pointer text-sm">
                    <input 
                      type="checkbox" 
                      checked={accessPdfDownload} 
                      onChange={e => setAccessPdfDownload(e.target.checked)}
                      className="w-4 h-4 rounded border-[#333] text-[#38bdf8] focus:ring-[#38bdf8] bg-[#121212]"
                    />
                    <span className="text-[#f3f4f6]">In-App PDF Download</span>
                    <span className="text-[11px] text-[#9ca3af] ml-auto">Save & Read Offline</span>
                  </label>
                  <label className="flex items-center space-x-2.5 cursor-pointer text-sm">
                    <input 
                      type="checkbox" 
                      checked={accessPdfExportShare} 
                      onChange={e => setAccessPdfExportShare(e.target.checked)}
                      className="w-4 h-4 rounded border-[#333] text-[#38bdf8] focus:ring-[#38bdf8] bg-[#121212]"
                    />
                    <span className="text-[#f3f4f6]">Download to Device & Share</span>
                    <span className="text-[11px] text-[#9ca3af] ml-auto">Downloads Folder + Share</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#9ca3af] mb-1">School</label>
                <input required type="text" value={school} onChange={e => setSchool(e.target.value)} className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent text-[#f3f4f6]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9ca3af] mb-1">Area</label>
                <input required type="text" value={area} onChange={e => setArea(e.target.value)} className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg outline-none focus:ring-2 focus:ring-[#f59e0b] focus:border-transparent text-[#f3f4f6]" />
              </div>
              </div>
              <div className="pt-4 flex justify-end space-x-3 border-t border-[#262626] sm:border-0 mt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-[#9ca3af] hover:text-[#f3f4f6]">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#f59e0b] text-[#0a0a0a] font-bold rounded-lg hover:bg-[#fbbf24]">Create Student</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Student Modal */}
      {selectedStudent && (
        <StudentModal 
          student={selectedStudent} 
          versionConfig={versionConfig}
          onClose={() => setSelectedStudent(null)} 
        />
      )}

      {/* Broadcast Update Modal */}
      {showBroadcastModal && (
        <BroadcastUpdateModal
          students={students}
          versionConfig={versionConfig}
          onClose={() => setShowBroadcastModal(false)}
        />
      )}

      {/* App Version Settings Modal */}
      <AppVersionSettingsModal
        isOpen={showVersionModal}
        currentConfig={versionConfig}
        onClose={() => setShowVersionModal(false)}
        onSaveSuccess={(newConfig) => setVersionConfig(newConfig)}
      />
    </div>
  );
}
