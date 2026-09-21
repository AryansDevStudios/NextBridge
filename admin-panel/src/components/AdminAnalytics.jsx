import React, { useState, useMemo } from 'react';
import { 
  Trophy, 
  Crown, 
  Medal, 
  Clock, 
  Video, 
  FileText, 
  Users, 
  BarChart2, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Eye
} from 'lucide-react';

function formatSecondsToHMS(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function AdminAnalytics({ students, onSelectStudent }) {
  const [selectedClass, setSelectedClass] = useState('all'); // 'all', '9', '10'
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubTab, setActiveSubTab] = useState('leaderboard'); // 'leaderboard', 'comparison', 'videos', 'notes', 'classes'
  const [comparedStudentIds, setComparedStudentIds] = useState([]);
  const [expandedVideoId, setExpandedVideoId] = useState(null);
  const [expandedNoteId, setExpandedNoteId] = useState(null);
  const [leaderboardSort, setLeaderboardSort] = useState('videoTime'); // 'videoTime', 'notesTime', 'screenTime', 'totalStudy'

  // Filter students by class & search
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchClass = selectedClass === 'all' || String(s.class) === String(selectedClass);
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        (s.name || '').toLowerCase().includes(q) || 
        (s.personalDetails?.school || '').toLowerCase().includes(q) || 
        (s.personalDetails?.area || '').toLowerCase().includes(q) || 
        (s.pat || '').toLowerCase().includes(q);
      return matchClass && matchSearch;
    });
  }, [students, selectedClass, searchQuery]);

  // Overall Global KPI Metrics
  const kpis = useMemo(() => {
    let totalVideoSecs = 0;
    let totalNotesSecs = 0;
    let totalScreenSecs = 0;
    let activeSubs = 0;
    const now = Date.now();

    students.forEach(s => {
      totalVideoSecs += (s.totalVideoTime || 0);
      totalNotesSecs += (s.totalNotesTime || 0);
      totalScreenSecs += (s.totalScreenTime || 0);

      const expiry = s.subscriptionExpiresAt ? new Date(s.subscriptionExpiresAt).getTime() : null;
      if (s.status === 'active' && (!expiry || expiry > now)) {
        activeSubs++;
      }
    });

    return {
      totalVideoSecs,
      totalNotesSecs,
      totalScreenSecs,
      totalStudents: students.length,
      activeSubs,
      activeRate: students.length > 0 ? Math.round((activeSubs / students.length) * 100) : 0
    };
  }, [students]);

  // Sorted Leaderboard
  const rankedStudents = useMemo(() => {
    return [...filteredStudents].sort((a, b) => {
      if (leaderboardSort === 'videoTime') {
        return (b.totalVideoTime || 0) - (a.totalVideoTime || 0);
      }
      if (leaderboardSort === 'notesTime') {
        return (b.totalNotesTime || 0) - (a.totalNotesTime || 0);
      }
      if (leaderboardSort === 'screenTime') {
        return (b.totalScreenTime || 0) - (a.totalScreenTime || 0);
      }
      const studyA = (a.totalVideoTime || 0) + (a.totalNotesTime || 0);
      const studyB = (b.totalVideoTime || 0) + (b.totalNotesTime || 0);
      return studyB - studyA;
    });
  }, [filteredStudents, leaderboardSort]);

  // Aggregated Video Analytics across all students
  const videoAnalyticsList = useMemo(() => {
    const map = {};
    students.forEach(s => {
      if (!s.videoStats) return;
      Object.entries(s.videoStats).forEach(([vidId, stat]) => {
        if (!map[vidId]) {
          map[vidId] = {
            id: vidId,
            title: stat.title || 'Untitled Lecture',
            subjectName: stat.subjectName || 'General Studies',
            totalWatchSecs: 0,
            totalPlays: 0,
            viewers: []
          };
        }
        map[vidId].totalWatchSecs += (stat.watchTimeSecs || 0);
        map[vidId].totalPlays += (stat.playCount || 1);
        map[vidId].viewers.push({
          studentId: s.id,
          studentName: s.name,
          studentClass: s.class,
          school: s.personalDetails?.school,
          watchSecs: stat.watchTimeSecs || 0,
          lastWatched: stat.lastWatched
        });
      });
    });

    return Object.values(map).sort((a, b) => b.totalWatchSecs - a.totalWatchSecs);
  }, [students]);

  // Aggregated Notes Analytics across all students
  const notesAnalyticsList = useMemo(() => {
    const map = {};
    students.forEach(s => {
      if (!s.notesStats) return;
      Object.entries(s.notesStats).forEach(([noteId, stat]) => {
        if (!map[noteId]) {
          map[noteId] = {
            id: noteId,
            title: stat.title || 'Untitled Document',
            subjectName: stat.subjectName || 'General Notes',
            totalReadSecs: 0,
            totalOpens: 0,
            readers: []
          };
        }
        map[noteId].totalReadSecs += (stat.readTimeSecs || 0);
        map[noteId].totalOpens += (stat.openCount || 1);
        map[noteId].readers.push({
          studentId: s.id,
          studentName: s.name,
          studentClass: s.class,
          school: s.personalDetails?.school,
          readSecs: stat.readTimeSecs || 0,
          lastRead: stat.lastRead
        });
      });
    });

    return Object.values(map).sort((a, b) => b.totalReadSecs - a.totalReadSecs);
  }, [students]);

  // Class Comparison Breakdown
  const classComparison = useMemo(() => {
    const classes = { '9': { video: 0, notes: 0, screen: 0, count: 0 }, '10': { video: 0, notes: 0, screen: 0, count: 0 } };
    students.forEach(s => {
      const cls = String(s.class || '9');
      if (classes[cls]) {
        classes[cls].count++;
        classes[cls].video += (s.totalVideoTime || 0);
        classes[cls].notes += (s.totalNotesTime || 0);
        classes[cls].screen += (s.totalScreenTime || 0);
      }
    });

    return classes;
  }, [students]);

  // Toggle student in comparison dock
  const toggleCompareStudent = (id) => {
    setComparedStudentIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      if (prev.length >= 4) {
        alert('You can compare up to 4 students side-by-side.');
        return prev;
      }
      return [...prev, id];
    });
  };

  const comparedStudents = useMemo(() => {
    return students.filter(s => comparedStudentIds.includes(s.id));
  }, [students, comparedStudentIds]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header & Global KPIs */}
      <div>
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-4 sm:mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Trophy className="text-[#f59e0b]" size={22} />
              <span>Learning Analytics & Leaderboard</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#9ca3af] mt-0.5">
              Compare watch times, study durations, lecture performance, and engagement.
            </p>
          </div>

          {/* Sub-tabs */}
          <div className="flex bg-[#121212] p-1 rounded-xl border border-[#262626] overflow-x-auto scrollbar-none w-full md:w-auto">
            <button
              onClick={() => setActiveSubTab('leaderboard')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${activeSubTab === 'leaderboard' ? 'bg-[#f59e0b] text-[#0a0a0a]' : 'text-[#9ca3af] hover:text-white'}`}
            >
              <Trophy size={13} />
              <span>Leaderboard</span>
            </button>
            <button
              onClick={() => setActiveSubTab('comparison')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${activeSubTab === 'comparison' ? 'bg-[#f59e0b] text-[#0a0a0a]' : 'text-[#9ca3af] hover:text-white'}`}
            >
              <Users size={13} />
              <span>Compare ({comparedStudentIds.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('videos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${activeSubTab === 'videos' ? 'bg-[#f59e0b] text-[#0a0a0a]' : 'text-[#9ca3af] hover:text-white'}`}
            >
              <Video size={13} />
              <span>Videos</span>
            </button>
            <button
              onClick={() => setActiveSubTab('notes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${activeSubTab === 'notes' ? 'bg-[#f59e0b] text-[#0a0a0a]' : 'text-[#9ca3af] hover:text-white'}`}
            >
              <FileText size={13} />
              <span>Notes</span>
            </button>
            <button
              onClick={() => setActiveSubTab('classes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 ${activeSubTab === 'classes' ? 'bg-[#f59e0b] text-[#0a0a0a]' : 'text-[#9ca3af] hover:text-white'}`}
            >
              <BarChart2 size={13} />
              <span>Classes</span>
            </button>
          </div>
        </div>

        {/* Global KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#121212] p-4 rounded-xl border border-[#262626]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#9ca3af] uppercase tracking-wider font-semibold">Total Video Watch Time</span>
              <div className="p-2 rounded-lg bg-[#f59e0b]/10 text-[#f59e0b]">
                <Video size={18} />
              </div>
            </div>
            <div className="text-2xl font-black text-white">{formatSecondsToHMS(kpis.totalVideoSecs)}</div>
            <div className="text-xs text-[#9ca3af] mt-1">Across all lectures and participants</div>
          </div>

          <div className="bg-[#121212] p-4 rounded-xl border border-[#262626]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#9ca3af] uppercase tracking-wider font-semibold">Total Notes Study Time</span>
              <div className="p-2 rounded-lg bg-[#38bdf8]/10 text-[#38bdf8]">
                <FileText size={18} />
              </div>
            </div>
            <div className="text-2xl font-black text-[#38bdf8]">{formatSecondsToHMS(kpis.totalNotesSecs)}</div>
            <div className="text-xs text-[#9ca3af] mt-1">Reading PDF study materials & DPPs</div>
          </div>

          <div className="bg-[#121212] p-4 rounded-xl border border-[#262626]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#9ca3af] uppercase tracking-wider font-semibold">Total App Screen Time</span>
              <div className="p-2 rounded-lg bg-[#4ade80]/10 text-[#4ade80]">
                <Clock size={18} />
              </div>
            </div>
            <div className="text-2xl font-black text-[#4ade80]">{formatSecondsToHMS(kpis.totalScreenSecs)}</div>
            <div className="text-xs text-[#9ca3af] mt-1">Total active session duration</div>
          </div>

          <div className="bg-[#121212] p-4 rounded-xl border border-[#262626]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#9ca3af] uppercase tracking-wider font-semibold">Active Subscriptions</span>
              <div className="p-2 rounded-lg bg-[#a855f7]/10 text-[#a855f7]">
                <Users size={18} />
              </div>
            </div>
            <div className="text-2xl font-black text-white">{kpis.activeSubs} / {kpis.totalStudents}</div>
            <div className="text-xs text-[#4ade80] mt-1 font-semibold">{kpis.activeRate}% valid access rate</div>
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: LEADERBOARD */}
      {activeSubTab === 'leaderboard' && (
        <div className="space-y-6">
          {/* Controls Bar: Class Filter, Search, Sort Mode */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-[#121212] p-4 rounded-xl border border-[#262626]">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 bg-[#1a1a1a] p-1 rounded-lg border border-[#262626]">
                <button
                  onClick={() => setSelectedClass('all')}
                  className={`px-3 py-1 rounded text-xs font-semibold ${selectedClass === 'all' ? 'bg-[#f59e0b] text-[#0a0a0a]' : 'text-[#9ca3af] hover:text-white'}`}
                >
                  All Classes
                </button>
                <button
                  onClick={() => setSelectedClass('9')}
                  className={`px-3 py-1 rounded text-xs font-semibold ${selectedClass === '9' ? 'bg-[#f59e0b] text-[#0a0a0a]' : 'text-[#9ca3af] hover:text-white'}`}
                >
                  Class 9
                </button>
                <button
                  onClick={() => setSelectedClass('10')}
                  className={`px-3 py-1 rounded text-xs font-semibold ${selectedClass === '10' ? 'bg-[#f59e0b] text-[#0a0a0a]' : 'text-[#9ca3af] hover:text-white'}`}
                >
                  Class 10
                </button>
              </div>

              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-[#9ca3af]" />
                <input
                  type="text"
                  placeholder="Filter student or school..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-[#1a1a1a] border border-[#262626] rounded-lg text-xs outline-none text-white focus:border-[#f59e0b] w-48"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-[#9ca3af]">Rank By:</span>
              <select
                value={leaderboardSort}
                onChange={e => setLeaderboardSort(e.target.value)}
                className="bg-[#1a1a1a] border border-[#262626] text-xs font-semibold px-3 py-1.5 rounded-lg outline-none text-[#f59e0b] focus:border-[#f59e0b]"
              >
                <option value="videoTime">Video Watch Time</option>
                <option value="notesTime">Notes Reading Time</option>
                <option value="totalStudy">Total Study Time (Video + Notes)</option>
                <option value="screenTime">Total App Screen Time</option>
              </select>
            </div>
          </div>

          {/* Top 3 Podium Cards */}
          {rankedStudents.length >= 3 && !searchQuery && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Silver #2 */}
              <div className="order-2 md:order-1 bg-[#121212] border border-[#3b4252] rounded-xl p-5 flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-3 right-3 bg-[#e5e7eb]/10 text-[#e5e7eb] px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 border border-[#e5e7eb]/30">
                  <Medal size={12} /> Rank #2
                </div>
                <div className="w-16 h-16 rounded-full bg-[#e5e7eb]/20 border-2 border-[#e5e7eb] flex items-center justify-center text-[#e5e7eb] text-xl font-black mb-3">
                  {rankedStudents[1].name.slice(0, 2).toUpperCase()}
                </div>
                <h3 className="font-bold text-base text-white">{rankedStudents[1].name}</h3>
                <div className="text-xs text-[#9ca3af] mt-0.5">Class {rankedStudents[1].class} • {rankedStudents[1].personalDetails?.school || 'School'}</div>
                <div className="mt-4 pt-4 border-t border-[#262626] w-full grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-[#9ca3af] text-[10px] uppercase">Video</div>
                    <div className="font-bold text-[#f59e0b]">{formatSecondsToHMS(rankedStudents[1].totalVideoTime)}</div>
                  </div>
                  <div>
                    <div className="text-[#9ca3af] text-[10px] uppercase">Notes</div>
                    <div className="font-bold text-[#38bdf8]">{formatSecondsToHMS(rankedStudents[1].totalNotesTime)}</div>
                  </div>
                  <div>
                    <div className="text-[#9ca3af] text-[10px] uppercase">App</div>
                    <div className="font-bold text-[#4ade80]">{formatSecondsToHMS(rankedStudents[1].totalScreenTime)}</div>
                  </div>
                </div>
              </div>

              {/* Gold #1 */}
              <div className="order-1 md:order-2 bg-[#121212] border-2 border-[#f59e0b] shadow-[0_0_24px_rgba(245,158,11,0.15)] rounded-xl p-6 flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-3 right-3 bg-[#f59e0b]/20 text-[#f59e0b] px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1 border border-[#f59e0b]/50">
                  <Crown size={14} /> Champion #1
                </div>
                <div className="w-20 h-20 rounded-full bg-[#f59e0b]/20 border-2 border-[#f59e0b] flex items-center justify-center text-[#f59e0b] text-2xl font-black mb-3">
                  {rankedStudents[0].name.slice(0, 2).toUpperCase()}
                </div>
                <h3 className="font-black text-lg text-white">{rankedStudents[0].name}</h3>
                <div className="text-xs text-[#9ca3af] mt-0.5 font-medium">Class {rankedStudents[0].class} • {rankedStudents[0].personalDetails?.school || 'School'}</div>
                <div className="mt-4 pt-4 border-t border-[#262626] w-full grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-[#9ca3af] text-[10px] uppercase font-bold">Video</div>
                    <div className="font-extrabold text-[#f59e0b] text-sm">{formatSecondsToHMS(rankedStudents[0].totalVideoTime)}</div>
                  </div>
                  <div>
                    <div className="text-[#9ca3af] text-[10px] uppercase font-bold">Notes</div>
                    <div className="font-extrabold text-[#38bdf8] text-sm">{formatSecondsToHMS(rankedStudents[0].totalNotesTime)}</div>
                  </div>
                  <div>
                    <div className="text-[#9ca3af] text-[10px] uppercase font-bold">App Time</div>
                    <div className="font-extrabold text-[#4ade80] text-sm">{formatSecondsToHMS(rankedStudents[0].totalScreenTime)}</div>
                  </div>
                </div>
              </div>

              {/* Bronze #3 */}
              <div className="order-3 bg-[#121212] border border-[#cd7f32]/40 rounded-xl p-5 flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-3 right-3 bg-[#cd7f32]/10 text-[#cd7f32] px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 border border-[#cd7f32]/30">
                  <Medal size={12} /> Rank #3
                </div>
                <div className="w-16 h-16 rounded-full bg-[#cd7f32]/20 border-2 border-[#cd7f32] flex items-center justify-center text-[#cd7f32] text-xl font-black mb-3">
                  {rankedStudents[2].name.slice(0, 2).toUpperCase()}
                </div>
                <h3 className="font-bold text-base text-white">{rankedStudents[2].name}</h3>
                <div className="text-xs text-[#9ca3af] mt-0.5">Class {rankedStudents[2].class} • {rankedStudents[2].personalDetails?.school || 'School'}</div>
                <div className="mt-4 pt-4 border-t border-[#262626] w-full grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-[#9ca3af] text-[10px] uppercase">Video</div>
                    <div className="font-bold text-[#f59e0b]">{formatSecondsToHMS(rankedStudents[2].totalVideoTime)}</div>
                  </div>
                  <div>
                    <div className="text-[#9ca3af] text-[10px] uppercase">Notes</div>
                    <div className="font-bold text-[#38bdf8]">{formatSecondsToHMS(rankedStudents[2].totalNotesTime)}</div>
                  </div>
                  <div>
                    <div className="text-[#9ca3af] text-[10px] uppercase">App</div>
                    <div className="font-bold text-[#4ade80]">{formatSecondsToHMS(rankedStudents[2].totalScreenTime)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Full Leaderboard Table */}
          <div className="bg-[#121212] rounded-xl shadow-sm overflow-x-auto border border-[#262626]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#1a1a1a] text-[#9ca3af] text-xs uppercase tracking-wider border-b border-[#262626]">
                  <th className="p-4 border-b border-[#262626]">Rank</th>
                  <th className="p-4 border-b border-[#262626]">Student</th>
                  <th className="p-4 border-b border-[#262626]">Class</th>
                  <th className="p-4 border-b border-[#262626]">Video Watch Time</th>
                  <th className="p-4 border-b border-[#262626]">Notes Study Time</th>
                  <th className="p-4 border-b border-[#262626]">App Screen Time</th>
                  <th className="p-4 border-b border-[#262626]">Compare</th>
                  <th className="p-4 border-b border-[#262626]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rankedStudents.map((s, idx) => {
                  const isCompared = comparedStudentIds.includes(s.id);
                  return (
                    <tr key={s.id} className="border-b border-[#262626] last:border-0 hover:bg-[#1a1a1a] transition-colors text-sm">
                      <td className="p-4 font-bold">
                        {idx === 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#f59e0b] text-[#0a0a0a] font-black text-xs">1</span>
                        ) : idx === 1 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#e5e7eb] text-[#0a0a0a] font-black text-xs">2</span>
                        ) : idx === 2 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#cd7f32] text-[#0a0a0a] font-black text-xs">3</span>
                        ) : (
                          <span className="text-[#9ca3af] font-mono text-xs">#{idx + 1}</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-white">{s.name}</div>
                        <div className="text-xs text-[#9ca3af]">{s.personalDetails?.school || 'School'} • {s.personalDetails?.area || 'Area'}</div>
                      </td>
                      <td className="p-4 text-[#9ca3af] font-medium">Class {s.class}</td>
                      <td className="p-4 font-semibold text-[#f59e0b]">
                        {formatSecondsToHMS(s.totalVideoTime)}
                      </td>
                      <td className="p-4 font-semibold text-[#38bdf8]">
                        {formatSecondsToHMS(s.totalNotesTime)}
                      </td>
                      <td className="p-4 font-semibold text-[#4ade80]">
                        {formatSecondsToHMS(s.totalScreenTime)}
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => toggleCompareStudent(s.id)}
                          className={`px-2.5 py-1 rounded text-xs font-semibold border transition ${isCompared ? 'bg-[#f59e0b] text-[#0a0a0a] border-[#f59e0b]' : 'border-[#262626] text-[#9ca3af] hover:text-white'}`}
                        >
                          {isCompared ? 'Comparing' : '+ Compare'}
                        </button>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => onSelectStudent && onSelectStudent(s)}
                          className="text-xs font-semibold text-[#9ca3af] hover:text-[#f59e0b] transition flex items-center gap-1"
                        >
                          <Eye size={14} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {rankedStudents.length === 0 && (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-[#9ca3af]">No students found matching current filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: SIDE-BY-SIDE STUDENT COMPARISON */}
      {activeSubTab === 'comparison' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-[#121212] p-4 rounded-xl border border-[#262626]">
            <div>
              <h2 className="font-bold text-lg text-white">Side-by-Side Participant Comparison</h2>
              <p className="text-xs text-[#9ca3af]">Select students from the leaderboard table to view direct performance comparison.</p>
            </div>
            {comparedStudentIds.length > 0 && (
              <button
                onClick={() => setComparedStudentIds([])}
                className="text-xs text-red-400 hover:text-red-300 transition"
              >
                Clear All Comparison
              </button>
            )}
          </div>

          {comparedStudents.length === 0 ? (
            <div className="bg-[#121212] border border-dashed border-[#262626] rounded-xl p-12 text-center text-[#9ca3af]">
              <Users size={36} className="mx-auto mb-3 opacity-40 text-[#f59e0b]" />
              <h3 className="text-base font-bold text-white mb-1">No Students Selected for Comparison</h3>
              <p className="text-xs max-w-md mx-auto mb-4">Click "+ Compare" next to students in the Leaderboard tab to select up to 4 participants.</p>
              <button
                onClick={() => setActiveSubTab('leaderboard')}
                className="px-4 py-2 bg-[#f59e0b] text-[#0a0a0a] rounded-lg text-xs font-bold hover:bg-[#fbbf24] transition"
              >
                Go to Leaderboard
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {comparedStudents.map(s => {
                const totalStudy = (s.totalVideoTime || 0) + (s.totalNotesTime || 0);
                const videosCount = s.videoStats ? Object.keys(s.videoStats).length : 0;
                const notesCount = s.notesStats ? Object.keys(s.notesStats).length : 0;

                return (
                  <div key={s.id} className="bg-[#121212] border border-[#262626] rounded-xl p-5 relative">
                    <button
                      onClick={() => toggleCompareStudent(s.id)}
                      className="absolute top-3 right-3 text-[#9ca3af] hover:text-red-400 p-1 text-sm font-bold"
                      title="Remove from comparison"
                    >
                      ✕
                    </button>

                    <div className="w-12 h-12 rounded-full bg-[#f59e0b]/20 text-[#f59e0b] font-black flex items-center justify-center mb-3">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <h3 className="font-bold text-base text-white">{s.name}</h3>
                    <div className="text-xs text-[#9ca3af] mb-4">Class {s.class} • {s.personalDetails?.school || 'School'}</div>

                    <div className="space-y-4">
                      {/* Video Watch Time */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#9ca3af] flex items-center gap-1"><Video size={12} className="text-[#f59e0b]" /> Video Time</span>
                          <span className="font-bold text-[#f59e0b]">{formatSecondsToHMS(s.totalVideoTime)}</span>
                        </div>
                        <div className="w-full bg-[#1a1a1a] h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-[#f59e0b] h-full rounded-full"
                            style={{ width: `${Math.min(100, Math.round(((s.totalVideoTime || 0) / (kpis.totalVideoSecs || 1)) * 100 * (students.length || 1)))}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-[#9ca3af] mt-0.5">{videosCount} distinct videos watched</div>
                      </div>

                      {/* Notes Reading Time */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#9ca3af] flex items-center gap-1"><FileText size={12} className="text-[#38bdf8]" /> Notes Time</span>
                          <span className="font-bold text-[#38bdf8]">{formatSecondsToHMS(s.totalNotesTime)}</span>
                        </div>
                        <div className="w-full bg-[#1a1a1a] h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-[#38bdf8] h-full rounded-full"
                            style={{ width: `${Math.min(100, Math.round(((s.totalNotesTime || 0) / (kpis.totalNotesSecs || 1)) * 100 * (students.length || 1)))}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-[#9ca3af] mt-0.5">{notesCount} notes/documents accessed</div>
                      </div>

                      {/* Screen Time */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#9ca3af] flex items-center gap-1"><Clock size={12} className="text-[#4ade80]" /> App Screen Time</span>
                          <span className="font-bold text-[#4ade80]">{formatSecondsToHMS(s.totalScreenTime)}</span>
                        </div>
                        <div className="w-full bg-[#1a1a1a] h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-[#4ade80] h-full rounded-full"
                            style={{ width: `${Math.min(100, Math.round(((s.totalScreenTime || 0) / (kpis.totalScreenSecs || 1)) * 100 * (students.length || 1)))}%` }}
                          />
                        </div>
                      </div>

                      {/* Total Combined Study Time */}
                      <div className="pt-3 border-t border-[#262626] flex justify-between items-center text-xs">
                        <span className="text-[#9ca3af] font-semibold">Total Study:</span>
                        <span className="font-black text-white text-sm">{formatSecondsToHMS(totalStudy)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: PARTICULAR VIDEO ANALYTICS */}
      {activeSubTab === 'videos' && (
        <div className="space-y-6">
          <div className="bg-[#121212] p-4 rounded-xl border border-[#262626] flex justify-between items-center">
            <div>
              <h2 className="font-bold text-lg text-white">Lecture-by-Lecture Video Analytics</h2>
              <p className="text-xs text-[#9ca3af]">Detailed tracking of which videos were played, how much time each participant spent on them, and completion rates.</p>
            </div>
            <div className="text-xs font-bold bg-[#f59e0b]/10 text-[#f59e0b] px-3 py-1.5 rounded-lg border border-[#f59e0b]/30">
              {videoAnalyticsList.length} Watched Lectures Recorded
            </div>
          </div>

          <div className="bg-[#121212] rounded-xl shadow-sm overflow-hidden border border-[#262626]">
            {videoAnalyticsList.length === 0 ? (
              <div className="p-12 text-center text-[#9ca3af]">
                <Video size={36} className="mx-auto mb-3 opacity-40 text-[#f59e0b]" />
                <p>No video viewing activity recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#262626]">
                {videoAnalyticsList.map(v => {
                  const isExpanded = expandedVideoId === v.id;
                  const avgTime = v.viewers.length > 0 ? Math.round(v.totalWatchSecs / v.viewers.length) : 0;

                  return (
                    <div key={v.id} className="p-4 hover:bg-[#161616] transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex-1 min-w-[280px]">
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            <Video size={16} className="text-[#f59e0b] flex-shrink-0" />
                            <span>{v.title}</span>
                          </div>
                          <div className="text-xs text-[#9ca3af] mt-1 flex items-center gap-3">
                            <span className="bg-[#1a1a1a] px-2 py-0.5 rounded border border-[#262626]">{v.subjectName}</span>
                            <span>{v.viewers.length} {v.viewers.length === 1 ? 'participant' : 'participants'}</span>
                            <span>{v.totalPlays} total plays</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-xs">
                          <div>
                            <div className="text-[#9ca3af] text-[10px] uppercase">Total Time Spent</div>
                            <div className="font-black text-[#f59e0b] text-sm">{formatSecondsToHMS(v.totalWatchSecs)}</div>
                          </div>
                          <div>
                            <div className="text-[#9ca3af] text-[10px] uppercase">Avg Watch Time</div>
                            <div className="font-bold text-white text-sm">{formatSecondsToHMS(avgTime)}</div>
                          </div>
                          <button
                            onClick={() => setExpandedVideoId(isExpanded ? null : v.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#222] border border-[#262626] rounded-lg text-xs font-semibold text-white transition"
                          >
                            <span>Participants ({v.viewers.length})</span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable breakdown: which participants watched this lecture */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-[#262626] bg-[#0e0e0e] -mx-4 -mb-4 p-4">
                          <h4 className="text-xs font-bold text-[#9ca3af] uppercase tracking-wider mb-2">Participant Breakdown</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {v.viewers.map((viewer, vIdx) => (
                              <div key={vIdx} className="bg-[#161616] p-2.5 rounded-lg border border-[#262626] flex justify-between items-center text-xs">
                                <div>
                                  <div className="font-semibold text-white">{viewer.studentName}</div>
                                  <div className="text-[10px] text-[#9ca3af]">Class {viewer.studentClass} • {viewer.school || 'School'}</div>
                                </div>
                                <div className="text-right font-bold text-[#f59e0b]">
                                  {formatSecondsToHMS(viewer.watchSecs)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: PARTICULAR NOTES / PDF ANALYTICS */}
      {activeSubTab === 'notes' && (
        <div className="space-y-6">
          <div className="bg-[#121212] p-4 rounded-xl border border-[#262626] flex justify-between items-center">
            <div>
              <h2 className="font-bold text-lg text-white">Document-by-Document Notes Analytics</h2>
              <p className="text-xs text-[#9ca3af]">Tracking reading time, document open frequency, and study focus across all notes and PDF files.</p>
            </div>
            <div className="text-xs font-bold bg-[#38bdf8]/10 text-[#38bdf8] px-3 py-1.5 rounded-lg border border-[#38bdf8]/30">
              {notesAnalyticsList.length} Studied Documents Recorded
            </div>
          </div>

          <div className="bg-[#121212] rounded-xl shadow-sm overflow-hidden border border-[#262626]">
            {notesAnalyticsList.length === 0 ? (
              <div className="p-12 text-center text-[#9ca3af]">
                <FileText size={36} className="mx-auto mb-3 opacity-40 text-[#38bdf8]" />
                <p>No notes reading activity recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#262626]">
                {notesAnalyticsList.map(n => {
                  const isExpanded = expandedNoteId === n.id;
                  const avgTime = n.readers.length > 0 ? Math.round(n.totalReadSecs / n.readers.length) : 0;

                  return (
                    <div key={n.id} className="p-4 hover:bg-[#161616] transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex-1 min-w-[280px]">
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            <FileText size={16} className="text-[#38bdf8] flex-shrink-0" />
                            <span>{n.title}</span>
                          </div>
                          <div className="text-xs text-[#9ca3af] mt-1 flex items-center gap-3">
                            <span className="bg-[#1a1a1a] px-2 py-0.5 rounded border border-[#262626]">{n.subjectName}</span>
                            <span>{n.readers.length} {n.readers.length === 1 ? 'reader' : 'readers'}</span>
                            <span>{n.totalOpens} total opens</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-xs">
                          <div>
                            <div className="text-[#9ca3af] text-[10px] uppercase">Total Read Time</div>
                            <div className="font-black text-[#38bdf8] text-sm">{formatSecondsToHMS(n.totalReadSecs)}</div>
                          </div>
                          <div>
                            <div className="text-[#9ca3af] text-[10px] uppercase">Avg Read Time</div>
                            <div className="font-bold text-white text-sm">{formatSecondsToHMS(avgTime)}</div>
                          </div>
                          <button
                            onClick={() => setExpandedNoteId(isExpanded ? null : n.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#222] border border-[#262626] rounded-lg text-xs font-semibold text-white transition"
                          >
                            <span>Readers ({n.readers.length})</span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </div>

                      {/* Expandable breakdown: which participants read this note */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-[#262626] bg-[#0e0e0e] -mx-4 -mb-4 p-4">
                          <h4 className="text-xs font-bold text-[#9ca3af] uppercase tracking-wider mb-2">Reader Breakdown</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {n.readers.map((reader, rIdx) => (
                              <div key={rIdx} className="bg-[#161616] p-2.5 rounded-lg border border-[#262626] flex justify-between items-center text-xs">
                                <div>
                                  <div className="font-semibold text-white">{reader.studentName}</div>
                                  <div className="text-[10px] text-[#9ca3af]">Class {reader.studentClass} • {reader.school || 'School'}</div>
                                </div>
                                <div className="text-right font-bold text-[#38bdf8]">
                                  {formatSecondsToHMS(reader.readSecs)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 5: CLASS COMPARISONS */}
      {activeSubTab === 'classes' && (
        <div className="space-y-6">
          <div className="bg-[#121212] p-4 rounded-xl border border-[#262626]">
            <h2 className="font-bold text-lg text-white">Class 9 vs Class 10 Comparative Analysis</h2>
            <p className="text-xs text-[#9ca3af]">Comparison of study volume, video engagement, and notes reading between classes.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Class 9 Card */}
            <div className="bg-[#121212] border border-[#262626] rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <span className="px-3 py-1 bg-[#f59e0b]/15 text-[#f59e0b] rounded-full text-xs font-extrabold border border-[#f59e0b]/30">Class 9</span>
                <span className="text-xs text-[#9ca3af]">{classComparison['9'].count} Enrolled Students</span>
              </div>
              <div className="space-y-4">
                <div className="bg-[#1a1a1a] p-3 rounded-lg flex justify-between items-center">
                  <span className="text-xs text-[#9ca3af]">Total Video Watch Time</span>
                  <span className="font-bold text-[#f59e0b]">{formatSecondsToHMS(classComparison['9'].video)}</span>
                </div>
                <div className="bg-[#1a1a1a] p-3 rounded-lg flex justify-between items-center">
                  <span className="text-xs text-[#9ca3af]">Total Notes Read Time</span>
                  <span className="font-bold text-[#38bdf8]">{formatSecondsToHMS(classComparison['9'].notes)}</span>
                </div>
                <div className="bg-[#1a1a1a] p-3 rounded-lg flex justify-between items-center">
                  <span className="text-xs text-[#9ca3af]">Total App Screen Time</span>
                  <span className="font-bold text-[#4ade80]">{formatSecondsToHMS(classComparison['9'].screen)}</span>
                </div>
                <div className="pt-2 border-t border-[#262626] flex justify-between items-center text-xs">
                  <span className="text-[#9ca3af]">Average Study Per Student</span>
                  <span className="font-extrabold text-white text-sm">
                    {formatSecondsToHMS(classComparison['9'].count > 0 ? Math.round((classComparison['9'].video + classComparison['9'].notes) / classComparison['9'].count) : 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Class 10 Card */}
            <div className="bg-[#121212] border border-[#262626] rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <span className="px-3 py-1 bg-[#38bdf8]/15 text-[#38bdf8] rounded-full text-xs font-extrabold border border-[#38bdf8]/30">Class 10</span>
                <span className="text-xs text-[#9ca3af]">{classComparison['10'].count} Enrolled Students</span>
              </div>
              <div className="space-y-4">
                <div className="bg-[#1a1a1a] p-3 rounded-lg flex justify-between items-center">
                  <span className="text-xs text-[#9ca3af]">Total Video Watch Time</span>
                  <span className="font-bold text-[#f59e0b]">{formatSecondsToHMS(classComparison['10'].video)}</span>
                </div>
                <div className="bg-[#1a1a1a] p-3 rounded-lg flex justify-between items-center">
                  <span className="text-xs text-[#9ca3af]">Total Notes Read Time</span>
                  <span className="font-bold text-[#38bdf8]">{formatSecondsToHMS(classComparison['10'].notes)}</span>
                </div>
                <div className="bg-[#1a1a1a] p-3 rounded-lg flex justify-between items-center">
                  <span className="text-xs text-[#9ca3af]">Total App Screen Time</span>
                  <span className="font-bold text-[#4ade80]">{formatSecondsToHMS(classComparison['10'].screen)}</span>
                </div>
                <div className="pt-2 border-t border-[#262626] flex justify-between items-center text-xs">
                  <span className="text-[#9ca3af]">Average Study Per Student</span>
                  <span className="font-extrabold text-white text-sm">
                    {formatSecondsToHMS(classComparison['10'].count > 0 ? Math.round((classComparison['10'].video + classComparison['10'].notes) / classComparison['10'].count) : 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
