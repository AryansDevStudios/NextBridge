import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, Folder, Video, FileText, ArrowLeft, Download, CheckCircle, Smartphone, Search, BookOpen, LogOut, Calendar, Clock } from 'lucide-react';
import VideoPlayer from './VideoPlayer';
import { Filesystem, Directory } from '@capacitor/filesystem';

const FIREBASE_DB_URL = "https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app";

function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const LearningHub = ({ user }) => {
  const [courseData, setCourseData] = useState(null);
  const [currentPath, setCurrentPath] = useState([]); // Array of folder objects
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [playingVideo, setPlayingVideo] = useState(null);

  useEffect(() => {
    fetchCourseData();
  }, [user.class]);

  const fetchCourseData = async () => {
    setLoading(true);
    const classId = user.class === "9th" ? "9" : "10";
    const cacheKey = `course_data_${classId}`;
    
    // 1. Instant Load from Cache
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        setCourseData(JSON.parse(cached));
        setLoading(false); // UI renders instantly
      } catch (e) {
        console.error("Cache parse error", e);
      }
    }

    // 2. Background Fetch (Update Cache silently)
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/classes/class_${classId}.json`);
      const data = await res.json();
      if (data) {
        localStorage.setItem(cacheKey, JSON.stringify(data));
        setCourseData(data);
      }
    } catch (err) {
      console.error("Failed to fetch latest course data:", err);
    }
    setLoading(false);
  };

  const handleFolderClick = (subjectId, itemOrFolder) => {
    setCurrentPath([...currentPath, { subjectId, ...itemOrFolder }]);
    setSearchQuery('');
  };

  const handlePlayVideo = (item) => {
    setPlayingVideo(item);
  };

  const closeVideo = () => {
    setPlayingVideo(null);
  };

  // Flatten all items across all subjects into one big array for search
  const allItems = useMemo(() => {
    let items = [];
    if (!courseData || !courseData.subjects) return items;
    
    const subjectsList = Array.isArray(courseData.subjects) 
      ? courseData.subjects.filter(Boolean) 
      : Object.values(courseData.subjects).filter(Boolean);
    
    subjectsList.forEach(subject => {
      const itemsList = Array.isArray(subject.items) 
        ? subject.items.filter(Boolean) 
        : (subject.items ? Object.values(subject.items).filter(Boolean) : []);
        
      itemsList.forEach(item => {
        const unifiedPath = item.folder_path 
          ? `${subject.subject_name}/${item.folder_path}` 
          : subject.subject_name;
        
        items.push({ ...item, unified_path: unifiedPath });
      });
    });
    return items;
  }, [courseData]);

  if (loading && !courseData) {
    return (
      <div className="flex-1 flex justify-center items-center h-full min-h-screen bg-[#0a0a0a]">
        <p className="text-[#9ca3af]">Loading learning materials...</p>
      </div>
    );
  }

  if (!courseData || !courseData.subjects) {
    return (
      <div className="flex-1 p-6 text-center text-[#9ca3af] min-h-screen bg-[#0a0a0a] pt-20">
        <Smartphone size={48} className="mx-auto mb-4 opacity-50" />
        <p>No course data found for Class {user.class}.</p>
      </div>
    );
  }

  // --- Breadcrumb & Hierarchy Logic ---
  let currentItems = [];

  if (searchQuery.trim().length > 0) {
    const q = searchQuery.toLowerCase();
    currentItems = allItems.filter(item => 
      (item.title && item.title.toLowerCase().includes(q)) || 
      (item.unified_path && item.unified_path.toLowerCase().includes(q))
    ).sort((a, b) => {
      const timeA = typeof a.created_at === 'number' ? a.created_at : 0;
      const timeB = typeof b.created_at === 'number' ? b.created_at : 0;
      if (timeB !== timeA) return timeB - timeA;
      return a.title.localeCompare(b.title);
    });
  } else if (currentPath.length === 0) {
    // Root level: show subjects
    currentItems = Object.values(courseData.subjects)
      .filter(sub => !sub.isHidden)
      .map(sub => ({
        ...sub,
        isRootSubject: true,
        displayTitle: sub.subject_name
      }));
  } else {
    // Inside a folder/subject
    const currentFolder = currentPath[currentPath.length - 1];
    const subject = courseData.subjects[currentFolder.subjectId];
    
    if (subject && subject.items) {
      let targetPath = "";
      if (!currentFolder.isRootSubject) {
         targetPath = currentFolder.folder_path ? `${currentFolder.folder_path}/${currentFolder.title}` : currentFolder.title;
      }
      
      const subjectItems = Object.values(subject.items);
      const directChildren = [];
      const folders = new Set();

      subjectItems.forEach(item => {
        if (item.isHidden) return; // Hide locked content

        if (item.folder_path === targetPath) {
          directChildren.push(item);
        } else if (item.folder_path && item.folder_path.startsWith(targetPath)) {
          const remainingPath = targetPath === "" ? item.folder_path : item.folder_path.substring(targetPath.length + 1);
          const nextFolder = remainingPath.split('/')[0];
          if (nextFolder) folders.add(nextFolder);
        }
      });

      currentItems = [
        ...Array.from(folders).map(f => ({ title: f, isFolder: true, subjectId: currentFolder.subjectId, folder_path: targetPath })),
        ...directChildren.sort((a, b) => {
           const timeA = typeof a.created_at === 'number' ? a.created_at : 0;
           const timeB = typeof b.created_at === 'number' ? b.created_at : 0;
           if (timeB !== timeA) return timeB - timeA;
           return a.title.localeCompare(b.title);
        })
      ];
    }
  }

  if (playingVideo) {
    return <VideoPlayer item={playingVideo} onClose={closeVideo} user={user} />;
  }

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <nav className="navbar" style={{ paddingTop: '40px' }}> {/* Capacitor top padding */}
        <div className="nav-left">
          <div className="logo" onClick={() => { setCurrentPath([]); setSearchQuery(''); }} style={{cursor: 'pointer'}}>
            <BookOpen size={24} />
            NextBridge Archive
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, justifySelf: 'flex-end', marginLeft: 'auto' }}>
          <div className="search-container" style={{ width: '100%', maxWidth: '300px' }}>
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              className="search-input" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            className="logout-btn" 
            onClick={() => window.location.reload()}
            title="Log Out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      <div className="main-content pb-24">
        {/* Breadcrumbs */}
        {!searchQuery && (
          <div className="breadcrumbs">
            <span className="breadcrumb-item" onClick={() => setCurrentPath([])}>
              Home
            </span>
            {currentPath.map((part, idx) => (
              <React.Fragment key={idx}>
                <ChevronRight size={18} className="breadcrumb-separator" />
                <span 
                  className="breadcrumb-item" 
                  onClick={() => setCurrentPath(currentPath.slice(0, idx + 1))}
                >
                  {part.displayTitle || part.title}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
        
        {searchQuery && (
          <div className="breadcrumbs" style={{ color: 'var(--accent)' }}>
            Search Results for "{searchQuery}"
          </div>
        )}

        {/* List Container */}
        <div className="list-container">
          {currentItems.length === 0 && (
            <div style={{ padding: '64px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px dashed var(--border-color)', margin: '16px 0' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '50%', marginBottom: '16px' }}>
                <Search size={32} style={{ color: 'var(--text-secondary)' }} />
              </div>
              <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: '600' }}>No Content Found</h3>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', lineHeight: '1.5' }}>
                We couldn't find any items matching your request.
              </p>
            </div>
          )}
          
          {currentItems.map((item, idx) => {
            if (item.isRootSubject || item.isFolder) {
              return (
                <div 
                  key={idx} 
                  className="list-item"
                  onClick={() => handleFolderClick(item.subject_id || item.subjectId, item)}
                >
                  <div className="item-icon-container folder">
                    <Folder size={24} />
                  </div>
                  <div className="item-details">
                    <div className="item-title">{item.isRootSubject ? item.subject_name : item.title}</div>
                    <div className="item-meta">
                       {item.isRootSubject && item.items ? Object.keys(item.items).length : ''} {item.isRootSubject ? 'items' : 'Folder'}
                    </div>
                  </div>
                </div>
              );
            }

            // File / Video Item
            return (
              <div 
                key={item.id || idx} 
                className="list-item"
                onClick={() => handlePlayVideo(item)}
              >
                <div className={item.type === 'video' && item.thumbnail ? "item-thumbnail-container" : `item-icon-container ${item.type}`}>
                  {item.type === 'video' && item.thumbnail ? (
                    <img src={item.thumbnail} alt="Thumbnail" className="item-thumbnail" />
                  ) : item.type === 'video' ? (
                    <Video size={24} />
                  ) : (
                    <FileText size={24} />
                  )}
                </div>
                
                <div className="item-details">
                  <div className="item-title">{item.title}</div>
                  <div className="item-meta">
                    {item.type === 'video' && item.duration > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={14} />
                        {formatDuration(item.duration)}
                      </span>
                    )}
                    {item.created_at && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={14} />
                        {formatDate(item.created_at)}
                      </span>
                    )}
                    <span style={{ textTransform: 'uppercase', fontSize: '0.75rem', opacity: 0.8, background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                      {item.type}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LearningHub;
