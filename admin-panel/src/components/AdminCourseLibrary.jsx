import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, Folder, Video, FileText, ArrowLeft, Download, Eye, EyeOff, X, Clock, Calendar, ShieldCheck, ShieldOff } from 'lucide-react';
import streamSaver from 'streamsaver';
import { BATCH_CATALOG, getBatchDisplayName } from '../utils/batchConfig';

streamSaver.mitm = '/mitm.html';

const FIREBASE_DB_URL = "https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app";

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '';
  const totalSecs = Math.round(Number(seconds));
  if (totalSecs <= 0) return '0s';
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) {
    if (m === 0 && s === 0) return `${h}h`;
    if (s === 0) return `${h}h ${m}m`;
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    if (s === 0) return `${m}m`;
    return `${m}m ${s}s`;
  }
  return `${s}s`;
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
        const fileStream = streamSaver.createWriteStream(`${sanitizedTitle}.${ext}`);
        const res = await fetch(url, { signal });
        await res.body.pipeTo(fileStream);
        setState('done');
        setTimeout(() => setState('idle'), 4000);
        return;
      }

      const masterRes = await fetch(url, { signal });
      const masterText = await masterRes.text();
      let mediaPlaylistUrl = url;

      const lines = masterText.split('\n');
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
      const mediaLines = mediaText.split('\n').map(l => l.trim());
      
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
      const fileStream = streamSaver.createWriteStream(`${sanitizedTitle}.ts`);
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
  const [selectedTarget, setSelectedTarget] = useState("class_10");

  const getEndpointBase = (target) => {
    if (target.startsWith('batch_')) {
      return `${FIREBASE_DB_URL}/batches/${target}`;
    }
    return `${FIREBASE_DB_URL}/classes/${target}`;
  };

  useEffect(() => {
    fetchCourseData();
  }, [selectedTarget]);

  const fetchCourseData = async () => {
    setLoading(true);
    try {
      const base = getEndpointBase(selectedTarget);
      const res = await fetch(`${base}.json`);
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
      const endpoint = `${getEndpointBase(selectedTarget)}/subjects/${subjectId}/items/${itemId}.json`;
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
      const endpoint = `${getEndpointBase(selectedTarget)}/subjects/${subjectId}.json`;
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

  const toggleSecurity = async (e, subjectId, itemId, currentIsSecure) => {
    e.stopPropagation();
    try {
      const endpoint = `${getEndpointBase(selectedTarget)}/subjects/${subjectId}/items/${itemId}.json`;
      // By default items have NO security flags (null/omitted).
      // Only when explicitly toggled on by admin, isSecure and preventScreenshots become true.
      const payload = currentIsSecure 
        ? { isSecure: null, preventScreenshots: null } 
        : { isSecure: true, preventScreenshots: true };
      
      await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const newData = { ...courseData };
      if (currentIsSecure) {
        delete newData.subjects[subjectId].items[itemId].isSecure;
        delete newData.subjects[subjectId].items[itemId].preventScreenshots;
      } else {
        newData.subjects[subjectId].items[itemId].isSecure = true;
        newData.subjects[subjectId].items[itemId].preventScreenshots = true;
      }
      setCourseData(newData);
    } catch(err) {
      console.error(err);
      alert("Failed to update security setting");
    }
  };

  const toggleSubjectSecurity = async (e, subjectId, currentIsSecure) => {
    e.stopPropagation();
    try {
      const subject = courseData?.subjects?.[subjectId];
      if (!subject?.items) return;

      const newIsSecure = !currentIsSecure;
      const updates = {};
      Object.keys(subject.items).forEach(k => {
        updates[`items/${k}/isSecure`] = newIsSecure ? true : null;
        updates[`items/${k}/preventScreenshots`] = newIsSecure ? true : null;
      });
      updates['isSecure'] = newIsSecure ? true : null;

      const endpoint = `${getEndpointBase(selectedTarget)}/subjects/${subjectId}.json`;
      await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      const newData = { ...courseData };
      const sub = newData.subjects[subjectId];
      if (newIsSecure) {
        sub.isSecure = true;
        Object.keys(sub.items).forEach(k => {
          sub.items[k].isSecure = true;
          sub.items[k].preventScreenshots = true;
        });
      } else {
        delete sub.isSecure;
        Object.keys(sub.items).forEach(k => {
          delete sub.items[k].isSecure;
          delete sub.items[k].preventScreenshots;
        });
      }
      setCourseData(newData);
    } catch(err) {
      console.error(err);
      alert("Failed to update subject security setting");
    }
  };

  const handleFolderClick = (subjectId, itemOrFolder) => {
    setCurrentPath([...currentPath, { subjectId, ...itemOrFolder }]);
  };

  const handleBack = () => {
    setCurrentPath(currentPath.slice(0, -1));
  };

  let currentItems = [];
  let currentTitle = courseData?.batch_name || 'Course Content';

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
    <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-sm min-h-[500px] h-[calc(100vh-140px)] md:h-[750px] flex flex-col">
      <div className="bg-[#1a1a1a] border-b border-[#262626] px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3 rounded-t-xl">
        <div className="flex items-center min-w-0">
            {currentPath.length > 0 && (
            <button onClick={handleBack} className="p-2 mr-2.5 text-[#9ca3af] hover:text-[#f59e0b] bg-[#121212] rounded-full border border-[#262626] shrink-0">
                <ArrowLeft size={16} />
            </button>
            )}
            <h2 className="text-base sm:text-xl font-bold truncate">{currentTitle}</h2>
        </div>
        
        <select 
          value={selectedTarget} 
          onChange={(e) => { setSelectedTarget(e.target.value); setCurrentPath([]); }}
          className="bg-[#121212] border border-[#262626] text-[#f3f4f6] px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg outline-none focus:border-[#f59e0b] text-xs sm:text-sm font-medium max-w-[280px]"
        >
          <optgroup label="Mainstream Classes">
            <option value="class_10">Class 10 (Mainstream)</option>
            <option value="class_9">Class 9 (Mainstream)</option>
            <option value="class_8">Class 8</option>
            <option value="batch_197">Class 7 (NIRMAAN)</option>
          </optgroup>
          <optgroup label="Class 11 Batches">
            {BATCH_CATALOG.filter(b => b.class_name === 'Class 11' && !b.is_old).map(b => (
              <option key={b.batch_id} value={`batch_${b.batch_id}`}>{b.batch_name}</option>
            ))}
          </optgroup>
          <optgroup label="Class 12 Batches">
            {BATCH_CATALOG.filter(b => b.class_name === 'Class 12' && !b.is_old).map(b => (
              <option key={b.batch_id} value={`batch_${b.batch_id}`}>{b.batch_name}</option>
            ))}
          </optgroup>
          <optgroup label="Crash Courses & Olympiads">
            {BATCH_CATALOG.filter(b => (b.class_name?.includes('Crash') || b.batch_name?.includes('CRASH')) && !b.is_old).map(b => (
              <option key={b.batch_id} value={`batch_${b.batch_id}`}>{b.batch_name}</option>
            ))}
          </optgroup>
          <optgroup label="All 2025-26 Archive Batches">
            {BATCH_CATALOG.filter(b => b.is_old).map(b => (
              <option key={b.batch_id} value={`batch_${b.batch_id}`}>{b.batch_name}</option>
            ))}
          </optgroup>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-2.5 sm:space-y-3">
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
                    className={`bg-[#1a1a1a] border border-[#262626] rounded-xl p-3.5 sm:p-4 flex items-center justify-between cursor-pointer hover:border-[#f59e0b]/50 transition ${item.isHidden ? 'opacity-50' : ''}`}
                    onClick={() => handleFolderClick(item.subject_id, item)}
                >
                    <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
                        <Folder size={22} className="text-[#f59e0b] shrink-0" />
                        <span className="font-semibold text-sm sm:text-base truncate">{item.subject_name}</span>
                    </div>
                    <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
                        <span className="text-xs sm:text-sm text-[#9ca3af] mr-2 sm:mr-4">{item.items ? Object.keys(item.items).length : 0} items</span>
                        <button
                            onClick={(e) => toggleSubjectSecurity(e, item.subject_id, item.isSecure)}
                            className={`p-1.5 sm:p-2 rounded-lg transition ${
                              item.isSecure
                                ? 'text-amber-400 bg-amber-950/30 border border-amber-900/50'
                                : 'text-[#71717a] hover:text-white hover:bg-[#262626]'
                            }`}
                            title={item.isSecure ? "All items in subject protected. Click to unprotect all." : "Subject unprotected by default. Click to protect all items in this subject."}
                        >
                            {item.isSecure ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
                        </button>
                        <button 
                            onClick={(e) => toggleSubjectVisibility(e, item.subject_id, item.isHidden)}
                            className="p-1.5 sm:p-2 text-[#9ca3af] hover:text-white rounded-lg hover:bg-[#262626]"
                            title={item.isHidden ? "Unhide" : "Hide from students"}
                        >
                            {item.isHidden ? <EyeOff size={16} className="text-red-400" /> : <Eye size={16} />}
                        </button>
                        <ChevronRight className="text-[#525252]" size={18} />
                    </div>
                </div>
                );
            }
            
            if (item.isFolder) {
                return (
                <div 
                    key={idx} 
                    className="bg-[#1a1a1a] border border-[#262626] rounded-xl p-3.5 sm:p-4 flex items-center justify-between cursor-pointer hover:border-[#f59e0b]/50 transition"
                    onClick={() => handleFolderClick(item.subjectId, item)}
                >
                    <div className="flex items-center space-x-3 min-w-0">
                        <Folder size={20} className="text-[#f59e0b] shrink-0" />
                        <span className="font-medium text-sm sm:text-base truncate">{item.title}</span>
                    </div>
                    <ChevronRight className="text-[#525252]" size={18} />
                </div>
                );
            }

            return (
                <div 
                  key={item.id} 
                  className={`bg-[#1a1a1a] border border-[#262626] rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#f59e0b]/30 transition ${item.isHidden ? 'opacity-50' : ''}`}
                >
                <div className="flex items-start sm:items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                    <div className="w-16 h-12 sm:w-20 sm:h-14 bg-black rounded overflow-hidden flex-shrink-0 flex items-center justify-center border border-[#333]">
                      {item.type === 'video' && item.thumbnail ? (
                        <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                      ) : (
                        item.type === 'video' ? <Video size={20} className="text-blue-400" /> : <FileText size={20} className="text-red-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-sm sm:text-base leading-snug line-clamp-2">{item.title}</h3>
                        <div className="text-xs text-[#9ca3af] mt-1.5 flex flex-wrap items-center gap-2 sm:gap-3">
                            <span className="uppercase bg-[#333] px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-semibold">{item.type}</span>
                            {item.duration > 0 && <span className="flex items-center gap-1 text-[11px]"><Clock size={11} /> {formatDuration(item.duration)}</span>}
                            {item.created_at && <span className="flex items-center gap-1 text-[11px]"><Calendar size={11} /> {formatDate(item.created_at)}</span>}
                            {Boolean(item.isSecure || item.preventScreenshots) && (
                              <span className="flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.5 rounded">
                                <ShieldCheck size={11} /> Protected
                              </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-end space-x-1.5 sm:space-x-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#262626]">
                    <button
                        onClick={(e) => toggleSecurity(e, currentPath[currentPath.length-1].subjectId, item.id, Boolean(item.isSecure || item.preventScreenshots))}
                        className={`p-2 rounded-lg transition ${
                          item.isSecure || item.preventScreenshots 
                            ? 'text-amber-400 bg-amber-950/30 border border-amber-900/50 hover:bg-amber-950/60' 
                            : 'text-[#71717a] hover:text-[#f3f4f6] hover:bg-[#262626]'
                        }`}
                        title={item.isSecure || item.preventScreenshots 
                          ? "Protected: Screenshots & recording blocked. Click to unprotect." 
                          : "Unprotected (Default): Screenshots & recording allowed. Click to protect."}
                    >
                        {item.isSecure || item.preventScreenshots ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}
                    </button>

                    <button 
                        onClick={(e) => toggleVisibility(e, currentPath[currentPath.length-1].subjectId, item.id, item.isHidden)}
                        className="p-2 text-[#9ca3af] hover:text-white rounded-lg hover:bg-[#262626] transition"
                        title={item.isHidden ? "Unhide" : "Hide from students"}
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
