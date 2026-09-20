import React, { useState, useEffect } from 'react';
import { ChevronRight, Folder, Video, FileText, ArrowLeft, Download, CheckCircle, Smartphone } from 'lucide-react';
import VideoPlayer from './VideoPlayer';
import { Filesystem, Directory } from '@capacitor/filesystem';

const FIREBASE_DB_URL = "https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app";

const LearningHub = ({ user }) => {
  const [courseData, setCourseData] = useState(null);
  const [currentPath, setCurrentPath] = useState([]); // Array of folder objects
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
  };

  const handleBack = () => {
    setCurrentPath(currentPath.slice(0, -1));
  };

  const handlePlayVideo = (item) => {
    setPlayingVideo(item);
  };

  const closeVideo = () => {
    setPlayingVideo(null);
  };

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
  let currentTitle = "Learning Hub";

  if (currentPath.length === 0) {
    // Root level: show subjects
    currentItems = Object.values(courseData.subjects).map(sub => ({
      ...sub,
      isRootSubject: true,
      displayTitle: sub.subject_name
    }));
  } else {
    // Inside a folder/subject
    const currentFolder = currentPath[currentPath.length - 1];
    currentTitle = currentFolder.displayTitle || currentFolder.title;
    
    const subject = courseData.subjects[currentFolder.subjectId];
    if (subject && subject.items) {
      // Find items matching the current folder path
      let targetPath = "";
      if (!currentFolder.isRootSubject) {
         targetPath = currentFolder.folder_path ? `${currentFolder.folder_path}/${currentFolder.title}` : currentFolder.title;
      }
      
      const allItems = Object.values(subject.items);
      
      // Filter direct children
      const directChildren = [];
      const folders = new Set();

      allItems.forEach(item => {
        if (item.folder_path === targetPath) {
          directChildren.push(item);
        } else if (item.folder_path && item.folder_path.startsWith(targetPath)) {
          // It's in a subfolder
          const remainingPath = targetPath === "" ? item.folder_path : item.folder_path.substring(targetPath.length + 1);
          const nextFolder = remainingPath.split('/')[0];
          if (nextFolder) folders.add(nextFolder);
        }
      });

      currentItems = [
        ...Array.from(folders).map(f => ({ title: f, isFolder: true, subjectId: currentFolder.subjectId, folder_path: targetPath })),
        ...directChildren
      ];
    }
  }

  if (playingVideo) {
    return <VideoPlayer item={playingVideo} onClose={closeVideo} />;
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-[#f3f4f6]">
      {/* Header */}
      <div className="bg-[#121212] border-b border-[#262626] px-4 py-4 flex items-center sticky top-0 z-10 pt-10">
        {currentPath.length > 0 && (
          <button onClick={handleBack} className="p-2 mr-2 text-[#9ca3af] hover:text-[#f59e0b] bg-[#1e1e1e] rounded-full">
            <ArrowLeft size={20} />
          </button>
        )}
        <h1 className="text-lg font-bold truncate">{currentTitle}</h1>
      </div>

      {/* Content List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
        {currentItems.length === 0 && (
          <p className="text-center text-[#9ca3af] mt-10">Folder is empty.</p>
        )}

        {currentItems.map((item, idx) => {
          if (item.isRootSubject) {
            return (
              <div 
                key={idx} 
                onClick={() => handleFolderClick(item.subject_id, item)}
                className="bg-[#121212] border border-[#262626] rounded-xl p-4 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center space-x-4">
                  <div className="bg-[#f59e0b]/10 p-3 rounded-lg text-[#f59e0b]">
                    <Folder size={24} />
                  </div>
                  <span className="font-semibold text-lg">{item.subject_name}</span>
                </div>
                <ChevronRight className="text-[#525252]" />
              </div>
            );
          }
          
          if (item.isFolder) {
            return (
              <div 
                key={idx} 
                onClick={() => handleFolderClick(item.subjectId, item)}
                className="bg-[#1a1a1a] border border-[#262626] rounded-xl p-4 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center space-x-3">
                  <Folder size={20} className="text-[#f59e0b]" />
                  <span className="font-medium text-[15px]">{item.title}</span>
                </div>
                <ChevronRight className="text-[#525252]" size={18} />
              </div>
            );
          }

          // File / Video Item
          return (
            <div 
              key={item.id || idx} 
              className="bg-[#121212] border border-[#262626] rounded-xl p-4 flex flex-col space-y-3 cursor-pointer"
              onClick={() => handlePlayVideo(item)}
            >
              <div className="flex items-start space-x-3">
                <div className="mt-1">
                  {item.type === 'video' ? <Video size={20} className="text-blue-400" /> : <FileText size={20} className="text-red-400" />}
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-[15px] leading-snug text-white">{item.title}</h3>
                  {item.duration > 0 && <span className="text-xs text-[#9ca3af] mt-1 block">{item.duration}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LearningHub;
