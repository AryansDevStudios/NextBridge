import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, Folder, Video, FileText, ArrowLeft, Download, Eye, EyeOff, X, Clock, Calendar } from 'lucide-react';
import streamSaver from 'streamsaver';

streamSaver.mitm = '/mitm.html';

const FIREBASE_DB_URL = "https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app";

function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return \\h \m \s\;
  return \\m \s\;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function AdminVideoDownloader({ url, title }) {
  const [state, setState] = useState('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0, bytes: 0, speed: 0 });
  const [errorMsg, setErrorMsg] = useState('');
  const abortRef = useRef(null);
  const lastBytesRef = useRef(0);
  const lastTimeRef = useRef(0);

  const formatBytes = (bytes) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const startDownload = async () => {
    try {
      setState('downloading');
      setErrorMsg('');
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      if (!url.includes('.m3u8')) {
        const sanitizedTitle = (title || 'file').replace(/[^a-zA-Z0-9_ \\-|]/g, '').trim();
        const ext = url.split('?')[0].split('.').pop() || 'mp4';
        const fileStream = streamSaver.createWriteStream(\\.\\);
        const res = await fetch(url, { signal });
        await res.body.pipeTo(fileStream);
        setState('done');
        setTimeout(() => setState('idle'), 4000);
        return;
      }

      const masterRes = await fetch(url, { signal });
      const masterText = await masterRes.text();
      let mediaPlaylistUrl = url;

      const lines = masterText.split('\\n');
      for (let i = 0; i < lines.length; i++) {
         if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
            const nextLine = lines[i+1]?.trim();
            if (nextLine && !nextLine.startsWith('#')) {
               mediaPlaylistUrl = nextLine.startsWith('http') ? nextLine : url.substring(0, url.lastIndexOf('/') + 1) + nextLine;
               break; 
            }
         }
      }

      const mediaRes = await fetch(mediaPlaylistUrl, { signal });
      const mediaText = await mediaRes.text();
      const mediaLines = mediaText.split('\\n').map(l => l.trim());
      
      const segmentUrls = [];
      const mediaBase = mediaPlaylistUrl.substring(0, mediaPlaylistUrl.lastIndexOf('/') + 1);

      for (const line of mediaLines) {
        if (line && !line.startsWith('#')) {
          segmentUrls.push(line.startsWith('http') ? line : mediaBase + line);
        }
      }

      if (segmentUrls.length === 0) throw new Error('No video segments found');

      setProgress({ current: 0, total: segmentUrls.length, bytes: 0, speed: 0 });
      
      const sanitizedTitle = (title || 'lecture').replace(/[^a-zA-Z0-9_ \\-|]/g, '').trim();
      const fileStream = streamSaver.createWriteStream(\\.ts\);
      const writer = fileStream.getWriter();

      lastTimeRef.current = Date.now();
      lastBytesRef.current = 0;
      let totalBytes = 0;
      let currentProgress = 0;

      const CONCURRENCY = 12;
      let writeIndex = 0;
      let fetchIndex = 0;
      const segmentBuffers = new Map();
      
      const speedInterval = setInterval(() => {
        const now = Date.now();
        const timeDiff = (now - lastTimeRef.current) / 1000;
        if (timeDiff >= 1) {
          const speed = (totalBytes - lastBytesRef.current) / timeDiff;
          setProgress(p => ({ ...p, speed }));
          lastTimeRef.current = now;
          lastBytesRef.current = totalBytes;
        }
      }, 1000);

      const fetchWorker = async () => {
        while (fetchIndex < segmentUrls.length) {
          if (signal.aborted) break;
          if (segmentBuffers.size >= CONCURRENCY * 2) {
             await new Promise(r => setTimeout(r, 50));
             continue;
          }
          const currentIndex = fetchIndex++;
          try {
             const segRes = await fetch(segmentUrls[currentIndex], { signal, cache: 'no-store' });
             const buffer = await segRes.arrayBuffer();
             segmentBuffers.set(currentIndex, new Uint8Array(buffer));
          } catch(e) {
             if (!signal.aborted) throw e;
          }
        }
      };

      const workers = Array.from({ length: Math.min(CONCURRENCY, segmentUrls.length) }).map(() => fetchWorker());

      while (writeIndex < segmentUrls.length) {
        if (signal.aborted) break;
        if (segmentBuffers.has(writeIndex)) {
          const buffer = segmentBuffers.get(writeIndex);
          await writer.write(new Uint8Array(buffer));
          totalBytes += buffer.byteLength;
          segmentBuffers.delete(writeIndex);
          writeIndex++;
          currentProgress++;
          setProgress(p => ({ ...p, current: currentProgress, bytes: totalBytes }));
        } else {
          await new Promise(r => setTimeout(r, 50));
        }
      }

      clearInterval(speedInterval);
      await Promise.all(workers);
      await writer.close();
      
      if (!signal.aborted) {
         setState('done');
         setTimeout(() => setState('idle'), 4000);
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        setState('idle');
      } else {
        console.error('Download error:', err);
        setErrorMsg(err.message || 'Download failed');
        setState('error');
        setTimeout(() => setState('idle'), 5000);
      }
    }
  };

  if (state === 'idle') {
    return (
      <button 
        onClick={startDownload}
        className="p-2 text-[#9ca3af] hover:text-[#4ade80] rounded-lg hover:bg-[#262626] transition flex items-center gap-2"
        title="Download to PC"
      >
        <Download size={18} />
      </button>
    );
  }

  if (state === 'downloading') {
    return (
      <div className="flex items-center gap-3 text-xs bg-[#262626] px-3 py-1.5 rounded-lg border border-[#f59e0b]">
        <div className="flex flex-col">
          <span className="text-[#f59e0b] font-bold">Downloading {progress.current}/{progress.total}</span>
          <span className="text-[#9ca3af]">{formatBytes(progress.bytes)}</span>
        </div>
        <button onClick={() => { if(abortRef.current) abortRef.current.abort(); }} className="p-1 hover:bg-[#333] rounded">
          <X size={14} className="text-red-400" />
        </button>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="flex items-center gap-2 text-xs bg-green-900/30 text-green-400 px-3 py-2 rounded-lg border border-green-900">
        <span>Downloaded</span>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex items-center gap-2 text-xs bg-red-900/30 text-red-400 px-3 py-2 rounded-lg border border-red-900">
        <span>Failed: {errorMsg}</span>
      </div>
    );
  }

  return null;
}

const AdminCourseLibrary = () => {
  const [courseData, setCourseData] = useState(null);
  const [currentPath, setCurrentPath] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState("10");

  useEffect(() => {
    fetchCourseData();
  }, [selectedClass]);

  const fetchCourseData = async () => {
    setLoading(true);
    try {
      const res = await fetch(\\/classes/class_\.json\);
      const data = await res.json();
      setCourseData(data || {});
    } catch (err) {
      console.error("Failed to fetch course data:", err);
    }
    setLoading(false);
  };

  const toggleVisibility = async (e, subjectId, itemId, currentIsHidden) => {
    e.stopPropagation();
    try {
      const endpoint = \\/classes/class_\/subjects/\/items/\.json\;
      const payload = currentIsHidden ? { isHidden: null } : { isHidden: true };
      
      await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const newData = { ...courseData };
      if (currentIsHidden) delete newData.subjects[subjectId].items[itemId].isHidden;
      else newData.subjects[subjectId].items[itemId].isHidden = true;
      setCourseData(newData);
    } catch(err) {
      console.error(err);
      alert("Failed to update visibility");
    }
  };

  const toggleSubjectVisibility = async (e, subjectId, currentIsHidden) => {
    e.stopPropagation();
    try {
      const endpoint = \\/classes/class_\/subjects/\.json\;
      const payload = currentIsHidden ? { isHidden: null } : { isHidden: true };
      
      await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const newData = { ...courseData };
      if (currentIsHidden) delete newData.subjects[subjectId].isHidden;
      else newData.subjects[subjectId].isHidden = true;
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

  let currentItems = [];
  let currentTitle = \Class \ Content\;

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
             targetPath = currentFolder.folder_path ? \\/\\ : currentFolder.title;
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
            ...directChildren.sort((a, b) => {
               const timeA = typeof a.created_at === 'number' ? a.created_at : 0;
               const timeB = typeof b.created_at === 'number' ? b.created_at : 0;
               if (timeB !== timeA) return timeB - timeA;
               return a.title.localeCompare(b.title);
            })
          ];
        }
      }
  }

  return (
    <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-sm h-[750px] flex flex-col">
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
                    className={\g-[#1a1a1a] border border-[#262626] rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-[#f59e0b]/50 transition \\}
                    onClick={() => handleFolderClick(item.subject_id, item)}
                >
                    <div className="flex items-center space-x-4">
                        <Folder size={24} className="text-[#f59e0b]" />
                        <span className="font-semibold">{item.subject_name}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                        <span className="text-sm text-[#9ca3af] mr-4">{item.items ? Object.keys(item.items).length : 0} items</span>
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
                  className={\g-[#1a1a1a] border border-[#262626] rounded-xl p-4 flex items-center justify-between hover:border-[#f59e0b]/30 transition \\}
                >
                <div className="flex items-center space-x-4 flex-1">
                    <div className="w-20 h-14 bg-black rounded overflow-hidden flex-shrink-0 flex items-center justify-center border border-[#333]">
                      {item.type === 'video' && item.thumbnail ? (
                        <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        item.type === 'video' ? <Video size={24} className="text-blue-400" /> : <FileText size={24} className="text-red-400" />
                      )}
                    </div>
                    <div>
                        <h3 className="font-medium leading-snug">{item.title}</h3>
                        <div className="text-xs text-[#9ca3af] mt-2 flex items-center space-x-4">
                            <span className="uppercase bg-[#333] px-2 py-0.5 rounded">{item.type}</span>
                            {item.duration > 0 && <span className="flex items-center gap-1"><Clock size={12} /> {formatDuration(item.duration)}</span>}
                            {item.created_at && <span className="flex items-center gap-1"><Calendar size={12} /> {formatDate(item.created_at)}</span>}
                            <span className="opacity-50">ID: {item.id}</span>
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
                    {item.type === 'video' ? (
                      <AdminVideoDownloader url={item.url} title={item.title} />
                    ) : (
                      <a 
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 text-[#9ca3af] hover:text-[#4ade80] rounded-lg hover:bg-[#262626] transition flex items-center"
                          title="Open PDF"
                      >
                          <Download size={18} />
                      </a>
                    )}
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
