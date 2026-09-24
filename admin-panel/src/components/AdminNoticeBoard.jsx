import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Bell, Plus, Trash2, Megaphone, AlertCircle, Calendar, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

export default function AdminNoticeBoard() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('important'); // 'info', 'important', 'urgent'
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setNotices(list);
      setLoading(false);
    }, (err) => {
      console.warn('Error fetching announcements:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleCreateNotice = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    setIsSubmitting(true);
    setFeedback('');

    try {
      await addDoc(collection(db, 'announcements'), {
        title: title.trim(),
        message: message.trim(),
        priority,
        createdAt: new Date().toISOString(),
        timestamp: Date.now()
      });

      setTitle('');
      setMessage('');
      setPriority('important');
      setShowAddForm(false);
      setFeedback('Announcement broadcasted successfully to all student apps!');
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      console.error('Failed to post announcement:', err);
      setFeedback('Failed to broadcast announcement: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNotice = async (id) => {
    if (!window.confirm('Delete this announcement? It will be removed from all student apps.')) return;
    try {
      await deleteDoc(doc(db, 'announcements', id));
    } catch (err) {
      console.error('Failed to delete announcement:', err);
    }
  };

  const getPriorityBadge = (p) => {
    switch (p) {
      case 'urgent':
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-900/40 text-red-400 border border-red-800/60">Urgent Alert</span>;
      case 'important':
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-900/40 text-amber-400 border border-amber-800/60">Important</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-900/40 text-sky-400 border border-sky-800/60">Information</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#181818] p-4 sm:p-6 rounded-2xl border border-[#262626]">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Megaphone size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Notice Board & Announcements
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#262626] text-gray-400 font-mono">
                {notices.length} active
              </span>
            </h2>
            <p className="text-xs text-gray-400">
              Broadcast direct notices and push notifications to all student devices
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black shadow-lg shadow-amber-500/20 transition-all active:scale-95"
        >
          {showAddForm ? <AlertCircle size={16} /> : <Plus size={16} />}
          <span>{showAddForm ? 'Cancel' : 'Post Announcement'}</span>
        </button>
      </div>

      {feedback && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 text-sm flex items-center gap-2">
          <CheckCircle2 size={18} />
          <span>{feedback}</span>
        </div>
      )}

      {/* Create Announcement Form */}
      {showAddForm && (
        <form onSubmit={handleCreateNotice} className="bg-[#181818] p-5 sm:p-6 rounded-2xl border border-amber-500/30 space-y-4">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <Sparkles size={16} />
            <span>Create New In-App Announcement</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-gray-300">Notice Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Live Doubt Session Today at 6 PM"
                required
                className="w-full px-3 py-2 rounded-lg bg-[#202020] border border-[#333] text-white text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-300">Priority / Tag</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#202020] border border-[#333] text-white text-sm focus:outline-none focus:border-amber-500"
              >
                <option value="important">Important (Default)</option>
                <option value="urgent">Urgent Alert</option>
                <option value="info">General Info</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-300">Announcement Details / Message *</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write the message that students will read on their notice board and in notifications..."
              rows={3}
              required
              className="w-full px-3 py-2 rounded-lg bg-[#202020] border border-[#333] text-white text-sm focus:outline-none focus:border-amber-500 custom-scrollbar resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-white bg-[#222] border border-[#333]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />}
              <span>{isSubmitting ? 'Broadcasting...' : 'Broadcast to Students'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Notices List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center gap-2">
            <Loader2 size={24} className="animate-spin text-amber-500" />
            <span className="text-sm">Loading announcements...</span>
          </div>
        ) : notices.length === 0 ? (
          <div className="p-12 text-center bg-[#181818] rounded-2xl border border-[#262626] text-gray-400 space-y-2">
            <Bell size={32} className="mx-auto text-gray-600 mb-2" />
            <p className="font-semibold text-gray-300">No Announcements Posted</p>
            <p className="text-xs text-gray-500">Post announcements to inform students about schedule updates, exam tips, or revisions.</p>
          </div>
        ) : (
          notices.map((n) => (
            <div
              key={n.id}
              className="bg-[#181818] hover:bg-[#1a1a1a] transition p-4 sm:p-5 rounded-2xl border border-[#262626] flex items-start justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {getPriorityBadge(n.priority)}
                  <h3 className="text-sm sm:text-base font-bold text-white truncate">
                    {n.title}
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {n.message}
                </p>
                <div className="flex items-center gap-4 text-[11px] text-gray-500 pt-1">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {n.createdAt ? new Date(n.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleDeleteNotice(n.id)}
                className="p-2 rounded-lg bg-red-950/20 text-red-400 hover:bg-red-900/40 border border-red-900/30 transition flex-shrink-0"
                title="Delete Announcement"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
