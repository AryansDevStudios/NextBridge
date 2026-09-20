import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc } from 'firebase/firestore';
import { LogOut, Users, Plus, Copy, Check, Info, ShieldAlert, Settings } from 'lucide-react';
import StudentModal from './StudentModal';
import AdminCourseLibrary from './AdminCourseLibrary';
import RenderSyncPanel from './RenderSyncPanel';

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
  const [copiedPAT, setCopiedPAT] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Form State
  const [name, setName] = useState('');
  const [studentClass, setStudentClass] = useState('9');
  const [school, setSchool] = useState('');
  const [area, setArea] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'students'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStudents(data);
    });
    return () => unsub();
  }, []);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    const pat = generatePAT();
    await addDoc(collection(db, 'students'), {
      name,
      class: studentClass,
      personalDetails: { school, area },
      pat,
      device: null,
      status: 'active',
      customMessage: ''
    });
    setShowAddModal(false);
    setName(''); setSchool(''); setArea(''); setStudentClass('9');
  };

  const copyToClipboard = (pat) => {
    navigator.clipboard.writeText(pat);
    setCopiedPAT(pat);
    setTimeout(() => setCopiedPAT(null), 2000);
  };

  const [activeTab, setActiveTab] = useState('students'); // 'students', 'library', 'sync'

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f3f4f6]">
      {/* Navbar */}
      <nav className="bg-[#121212] border-b border-[#262626] px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-2 text-[#f59e0b] font-bold text-xl mr-8">
            <img src="/favicon.png" alt="Logo" className="w-8 h-8 rounded" />
            <span>Next Bridge Admin</span>
          </div>
          
          <div className="flex space-x-1 border-l border-[#262626] pl-8">
            <button 
              onClick={() => setActiveTab('students')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'students' ? 'bg-[#1a1a1a] text-white' : 'text-[#9ca3af] hover:text-white'}`}
            >
              Students
            </button>
            <button 
              onClick={() => setActiveTab('library')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'library' ? 'bg-[#1a1a1a] text-white' : 'text-[#9ca3af] hover:text-white'}`}
            >
              Course Library
            </button>
            <button 
              onClick={() => setActiveTab('sync')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'sync' ? 'bg-[#1a1a1a] text-white' : 'text-[#9ca3af] hover:text-white'}`}
            >
              Backend Sync
            </button>
          </div>
        </div>
        
        <button onClick={onLogout} className="flex items-center space-x-2 text-[#9ca3af] hover:text-[#ef4444] transition">
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'students' && (
          <>
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-2xl font-bold">Students Directory</h1>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2 bg-[#f59e0b] text-[#0a0a0a] px-4 py-2 rounded-lg hover:bg-[#fbbf24] transition font-bold"
          >
            <Plus size={20} />
            <span>Add Student</span>
          </button>
        </div>

        {/* Table */}
        <div className="bg-[#121212] rounded-xl shadow-sm overflow-x-auto border border-[#262626]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1a1a1a] text-[#9ca3af] text-sm uppercase tracking-wider border-b border-[#262626]">
                <th className="p-4 border-b border-[#262626]">Name</th>
                <th className="p-4 border-b border-[#262626]">Class</th>
                <th className="p-4 border-b border-[#262626]">PAT Token</th>
                <th className="p-4 border-b border-[#262626]">Device Info</th>
                <th className="p-4 border-b border-[#262626]">Status</th>
                <th className="p-4 border-b border-[#262626]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
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
                        <Info size={16} className="mt-0.5" />
                        <div>
                          <div className="text-[#f3f4f6]">{s.device.model}</div>
                          <div className="text-xs text-[#9ca3af] break-all w-32">{s.device.androidId}</div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[#9ca3af] italic">Not logged in yet</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${s.status === 'active' ? 'bg-green-900/20 text-green-400 border-green-900/50' : 'bg-red-900/20 text-red-400 border-red-900/50'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <button 
                      onClick={() => setSelectedStudent(s)}
                      className="flex items-center space-x-1 text-sm font-medium text-[#9ca3af] hover:text-[#f59e0b] bg-[#1a1a1a] border border-[#262626] hover:border-[#f59e0b]/50 px-3 py-1.5 rounded-lg transition"
                    >
                      <Settings size={16} />
                      <span>Manage</span>
                    </button>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-[#9ca3af]">No students found. Add one to get started!</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
        )}

        {activeTab === 'library' && (
          <AdminCourseLibrary />
        )}

        {activeTab === 'sync' && (
          <RenderSyncPanel />
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-[#0a0a0a]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add New Student</h2>
            <form onSubmit={handleAddStudent} className="space-y-4">
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
              <div className="pt-4 flex justify-end space-x-3">
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
          onClose={() => setSelectedStudent(null)} 
        />
      )}
    </div>
  );
}
