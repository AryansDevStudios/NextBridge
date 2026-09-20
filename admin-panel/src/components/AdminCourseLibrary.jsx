import React, { useState, useEffect } from 'react';
import { ChevronRight, Folder, Video, FileText, ArrowLeft, Download, Eye, EyeOff } from 'lucide-react';

const FIREBASE_DB_URL = "https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app";

const AdminCourseLibrary = () => {
  const [courseData, setCourseData] = useState(null);
  const [currentPath, setCurrentPath] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState("10"); // Default to Class 10

  useEffect(() => {
    fetchCourseData();
  }, [selectedClass]);

  const fetchCourseData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/classes/class_${selectedClass}.json`);
      const data = await res.json();
      setCourseData(data || {});
    } catch (err) {
      console.error("Failed to fetch course data:", err);
    }
    setLoading(false);
  };

  const toggleVisibility = async (e, subjectId, itemId, currentIsHidden) => {
    e.stopPropagation(); // Prevent folder click
    try {
      const endpoint = `${FIREBASE_DB_URL}/classes/class_${selectedClass}/subjects/${subjectId}/items/${itemId}.json`;
      
      const payload = currentIsHidden ? { isHidden: null } : { isHidden: true };
      
      await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      // Optimistic update
      const newData = { ...courseData };
      if (currentIsHidden) {
          delete newData.subjects[subjectId].items[itemId].isHidden;
      } else {
          newData.subjects[subjectId].items[itemId].isHidden = true;
      }
      setCourseData(newData);
    } catch(err) {
      console.error(err);
      alert("Failed to update visibility");
    }
  };

  const toggleSubjectVisibility = async (e, subjectId, currentIsHidden) => {
    e.stopPropagation();
    try {
      const endpoint = `${FIREBASE_DB_URL}/classes/class_${selectedClass}/subjects/${subjectId}.json`;
      const payload = currentIsHidden ? { isHidden: null } : { isHidden: true };
      
      await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const newData = { ...courseData };
      if (currentIsHidden) {
          delete newData.subjects[subjectId].isHidden;
      } else {
          newData.subjects[subjectId].isHidden = true;
      }
      setCourseData(newData);
    } catch(err) {
      console.error(err);
    }
  };

  const handleFolderClick = (subjectId, itemOrFolder) => {
    setCurrentPath([...currentPath, { subjectId, ...itemOrFolder }]);
  };

  const handleBack = () => {
    setCurrentPath(currentPath.slice(0, -1));
  };

  // Hierarchy Logic
  let currentItems = [];
  let currentTitle = `Class ${selectedClass} Content`;

  if (courseData && courseData.subjects) {
      if (currentPath.length === 0) {
        currentItems = Object.values(courseData.subjects).map(sub => ({
          ...sub,
          isRootSubject: true,
          displayTitle: sub.subject_name
        }));
      } else {
        const currentFolder = currentPath[currentPath.length - 1];
        currentTitle = currentFolder.displayTitle || currentFolder.title;
        
        const subject = courseData.subjects[currentFolder.subjectId];
        if (subject && subject.items) {
          let targetPath = "";
          if (!currentFolder.isRootSubject) {
             targetPath = currentFolder.folder_path ? `${currentFolder.folder_path}/${currentFolder.title}` : currentFolder.title;
          }
          
          const allItems = Object.values(subject.items);
          const directChildren = [];
          const folders = new Set();

          allItems.forEach(item => {
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
            ...directChildren
          ];
        }
      }
  }

  return (
    <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-sm h-[700px] flex flex-col">
      {/* Header */}
      <div className="bg-[#1a1a1a] border-b border-[#262626] px-6 py-4 flex items-center justify-between rounded-t-xl">
        <div className="flex items-center">
            {currentPath.length > 0 && (
            <button onClick={handleBack} className="p-2 mr-3 text-[#9ca3af] hover:text-[#f59e0b] bg-[#121212] rounded-full border border-[#262626]">
                <ArrowLeft size={16} />
            </button>
            )}
            <h2 className="text-xl font-bold">{currentTitle}</h2>
        </div>
        
        <select 
          value={selectedClass} 
          onChange={(e) => { setSelectedClass(e.target.value); setCurrentPath([]); }}
          className="bg-[#121212] border border-[#262626] text-[#f3f4f6] px-4 py-2 rounded-lg outline-none focus:border-[#f59e0b]"
        >
          <option value="9">Class 9</option>
          <option value="10">Class 10</option>
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {loading ? (
            <div className="text-center text-[#9ca3af] mt-10">Loading library...</div>
        ) : currentItems.length === 0 ? (
            <div className="text-center text-[#9ca3af] mt-10">Folder is empty.</div>
        ) : (
            currentItems.map((item, idx) => {
            if (item.isRootSubject) {
                return (
                <div 
                    key={idx} 
                    className={`bg-[#1a1a1a] border border-[#262626] rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-[#f59e0b]/50 transition ${item.isHidden ? 'opacity-50' : ''}`}
                    onClick={() => handleFolderClick(item.subject_id, item)}
                >
                    <div className="flex items-center space-x-4">
                        <Folder size={24} className="text-[#f59e0b]" />
                        <span className="font-semibold">{item.subject_name}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button 
                            onClick={(e) => toggleSubjectVisibility(e, item.subject_id, item.isHidden)}
                            className="p-2 text-[#9ca3af] hover:text-white rounded-lg hover:bg-[#262626]"
                            title={item.isHidden ? "Unhide" : "Hide from students"}
                        >
                            {item.isHidden ? <EyeOff size={18} className="text-red-400" /> : <Eye size={18} />}
                        </button>
                        <ChevronRight className="text-[#525252]" />
                    </div>
                </div>
                );
            }
            
            if (item.isFolder) {
                return (
                <div 
                    key={idx} 
                    className="bg-[#1a1a1a] border border-[#262626] rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-[#f59e0b]/50 transition"
                    onClick={() => handleFolderClick(item.subjectId, item)}
                >
                    <div className="flex items-center space-x-3">
                        <Folder size={20} className="text-[#f59e0b]" />
                        <span className="font-medium">{item.title}</span>
                    </div>
                    <ChevronRight className="text-[#525252]" size={18} />
                </div>
                );
            }

            return (
                <div 
                key={item.id} 
                className={`bg-[#1a1a1a] border border-[#262626] rounded-xl p-4 flex items-center justify-between hover:border-[#f59e0b]/30 transition ${item.isHidden ? 'opacity-50' : ''}`}
                >
                <div className="flex items-start space-x-3 flex-1">
                    <div className="mt-1">
                    {item.type === 'video' ? <Video size={20} className="text-blue-400" /> : <FileText size={20} className="text-red-400" />}
                    </div>
                    <div>
                        <h3 className="font-medium leading-snug">{item.title}</h3>
                        <div className="text-xs text-[#9ca3af] mt-1 space-x-3">
                            <span>ID: {item.id}</span>
                            {item.duration > 0 && <span>Duration: {item.duration}</span>}
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <button 
                        onClick={(e) => toggleVisibility(e, currentPath[currentPath.length-1].subjectId, item.id, item.isHidden)}
                        className="p-2 text-[#9ca3af] hover:text-white rounded-lg hover:bg-[#262626] transition"
                        title="Toggle Visibility"
                    >
                        {item.isHidden ? <EyeOff size={18} className="text-red-400" /> : <Eye size={18} />}
                    </button>
                    <a 
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 text-[#9ca3af] hover:text-[#4ade80] rounded-lg hover:bg-[#262626] transition flex items-center"
                        title="Download natively"
                    >
                        <Download size={18} />
                    </a>
                </div>
                </div>
            );
            })
        )}
      </div>
    </div>
  );
};

export default AdminCourseLibrary;
