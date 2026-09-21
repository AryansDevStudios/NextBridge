import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Folder, 
  FileText, 
  ChevronRight, 
  BookOpen, 
  CheckCircle, 
  LayoutGrid, 
  List, 
  Home, 
  Download, 
  Check, 
  Loader2, 
  ArrowLeft,
  Layers
} from 'lucide-react';
import { downloadManager } from '../services/DownloadManager';

const PYQ_INDEX_URL = 'https://class10pyq.netlify.app/file-index.json';
const CDN_PYQ_BASE = 'https://cdn.jsdelivr.net/gh/code-verse-star/CBSE_PYQ@main/public';
const RAW_PYQ_BASE = 'https://github.com/code-verse-star/CBSE_PYQ/raw/main/public';

export default function CbsePyqHub({ onOpenPdf, onBack }) {
  const [files, setFiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('cbse-pyq-view') || 'grid');
  const [downloadState, setDownloadState] = useState(downloadManager.getState());

  useEffect(() => {
    const unsub = downloadManager.subscribe((st) => {
      setDownloadState(st);
    });
    return unsub;
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Check offline cache first
    const cached = localStorage.getItem('cbse_pyq_file_index_cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0 && isMounted) {
          setFiles(parsed);
          setIsLoading(false);
        }
      } catch (e) {
        console.warn('PYQ index cache parse failed', e);
      }
    }

    fetch(PYQ_INDEX_URL, { cache: 'no-cache' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          setFiles(data);
          setIsLoading(false);
          try {
            localStorage.setItem('cbse_pyq_file_index_cache', JSON.stringify(data));
          } catch (e) {}
        }
      })
      .catch(err => {
        console.warn('Live CBSE PYQ fetch error, fallback to cache:', err);
        if (isMounted && !files.length) {
          setIsLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, []);

  const toggleViewMode = () => {
    const nextView = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(nextView);
    localStorage.setItem('cbse-pyq-view', nextView);
  };

  const getItemsForPath = (targetPath) => {
    const folders = new Set();
    const exactFiles = [];
    files.forEach(file => {
      let relativePath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
      if (targetPath && relativePath.startsWith(targetPath + '/')) {
        relativePath = relativePath.substring(targetPath.length + 1);
      } else if (targetPath && relativePath === targetPath) {
        return;
      } else if (targetPath && !relativePath.startsWith(targetPath + '/')) {
        return;
      }
      const parts = relativePath.split('/');
      if (parts.length > 1) folders.add(parts[0]);
      else if (parts.length === 1 && relativePath !== "") exactFiles.push(file);
    });
    return [
      ...Array.from(folders).map(folder => ({ type: 'folder', name: folder, path: targetPath ? `${targetPath}/${folder}` : folder })),
      ...exactFiles.map(f => ({ type: 'file', ...f }))
    ];
  };

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const searchString = searchQuery.toLowerCase().trim();
    const queryParts = searchString.split(' ').filter(Boolean);
    return files.filter(file => {
      const target = `${file.path} ${file.name}`.toLowerCase();
      return queryParts.every(part => target.includes(part));
    });
  }, [files, searchQuery]);

  let displayItems = [];
  let msItems = [];
  let isSplitView = false;

  if (!searchQuery.trim()) {
    displayItems = getItemsForPath(currentPath);
    if (!currentPath.includes('_ms')) {
      displayItems = displayItems.filter(item => !(item.type === 'folder' && item.name.endsWith('_ms')));
    }
    if (currentPath && !currentPath.includes('_ms')) {
      const msPath = currentPath + '_ms';
      msItems = getItemsForPath(msPath);
      if (msItems.length > 0) isSplitView = true;
    }
  } else {
    displayItems = filteredFiles.map(f => ({ type: 'file', ...f }));
  }

  const formatPyqItem = (item, isMS = false) => {
    const cleanPath = item.path.replace(/^\//, '');
    const pathParts = cleanPath.split('/');
    const subject = pathParts[0] || 'General';
    const folder = pathParts.slice(1, -1).join('/') || 'Papers';
    const cleanTitle = item.name.replace(/\.pdf$/i, '');

    return {
      id: `cbse_pyq_${item.path.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      title: isMS ? `${cleanTitle} (Marking Scheme)` : cleanTitle,
      name: item.name,
      type: 'pdf',
      url: `${CDN_PYQ_BASE}${item.path}`,
      raw_url: `${RAW_PYQ_BASE}${item.path}`,
      source: 'pyq',
      subject_name: subject,
      folder_path: folder
    };
  };

  const handleItemClick = (item, isMS = false) => {
    if (item.type === 'folder') {
      setCurrentPath(item.path || (currentPath ? `${currentPath}/${item.name}` : item.name));
    } else {
      const docItem = formatPyqItem(item, isMS);
      if (onOpenPdf) {
        onOpenPdf(docItem);
      }
    }
  };

  const handleDownloadItem = async (e, item, isMS = false) => {
    e.stopPropagation();
    const docItem = formatPyqItem(item, isMS);
    try {
      await downloadManager.downloadPdf(docItem);
    } catch (err) {
      console.error('Failed to download PYQ item:', err);
    }
  };

  const ItemGrid = ({ items, emptyMessage, isMS = false }) => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(280px, 1fr))' : '1fr',
      gap: '12px'
    }}>
      {items.length === 0 ? (
        <div style={{ padding: '30px 10px', color: '#666', fontSize: '0.85rem' }}>{emptyMessage}</div>
      ) : (
        items.map((item, idx) => {
          const docId = `cbse_pyq_${(item.path || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const isDownloaded = item.type === 'file' && downloadManager.isDownloaded(docId);
          const isDownloading = item.type === 'file' && downloadManager.isDownloading(docId);

          return (
            <div
              key={idx}
              onClick={() => handleItemClick(item, isMS)}
              style={{
                background: 'rgba(25, 25, 25, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backdropFilter: 'blur(8px)',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(35, 35, 45, 0.7)';
                e.currentTarget.style.borderColor = isMS ? 'rgba(34, 197, 94, 0.4)' : 'rgba(99, 102, 241, 0.4)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(25, 25, 25, 0.5)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '8px',
                  background: isMS ? 'rgba(34, 197, 94, 0.12)' : (item.type === 'folder' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.06)'),
                  border: `1px solid ${isMS ? 'rgba(34, 197, 94, 0.25)' : (item.type === 'folder' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.1)')}`,
                  color: isMS ? '#22c55e' : (item.type === 'folder' ? '#6366f1' : '#a0a0a0'),
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0
                }}>
                  {item.type === 'folder' ? <Folder size={20} /> : <FileText size={20} />}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#fff', lineHeight: 1.3 }} className="truncate" title={item.name}>
                    {item.name}
                  </div>
                  {item.type === 'file' && (searchQuery || isMS) && (
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }} className="truncate">
                      {item.path.split('/').slice(-2, -1)[0] || 'Root'}
                    </div>
                  )}
                  {isDownloaded && (
                    <div style={{ fontSize: '11px', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px', fontWeight: 600 }}>
                      <Check size={12} /> Offline
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {item.type === 'file' ? (
                  <>
                    <button
                      onClick={(e) => handleDownloadItem(e, item, isMS)}
                      disabled={isDownloading || isDownloaded}
                      title={isDownloaded ? 'Downloaded to App' : isDownloading ? 'Downloading...' : 'Download to App for Offline Reading'}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: isDownloaded ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255, 255, 255, 0.06)',
                        border: `1px solid ${isDownloaded ? 'rgba(74, 222, 128, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                        color: isDownloaded ? '#4ade80' : isDownloading ? '#f59e0b' : '#a0a0a0',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: (isDownloading || isDownloaded) ? 'default' : 'pointer'
                      }}
                    >
                      {isDownloading ? (
                        <Loader2 size={15} className="spin-icon" />
                      ) : isDownloaded ? (
                        <Check size={15} />
                      ) : (
                        <Download size={15} />
                      )}
                    </button>
                    <button
                      onClick={() => handleItemClick(item, isMS)}
                      style={{
                        height: '32px',
                        padding: '0 12px',
                        borderRadius: '6px',
                        background: isMS ? '#22c55e' : '#6366f1',
                        border: 'none',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <FileText size={13} />
                      Open
                    </button>
                  </>
                ) : (
                  <ChevronRight size={18} style={{ color: '#666' }} />
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      background: '#080808',
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Top Navigation Bar — only shown when drilling down into directories or searching */}
      {(Boolean(currentPath) || Boolean(searchQuery)) && (
        <div style={{
          height: '50px',
          background: 'rgba(15, 15, 15, 0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          flexShrink: 0,
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {currentPath && (
              <button
                onClick={() => {
                  const parts = currentPath.split('/');
                  parts.pop();
                  setCurrentPath(parts.join('/'));
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  padding: '6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Go Back"
              >
                <ArrowLeft size={16} />
              </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} color="#6aa3ff" />
              <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#f4f4f6' }}>
                {currentPath.split('/').pop() || 'CBSE PYQs'}
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div style={{ flex: 1, maxWidth: '320px', margin: '0 12px', position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#a0a0a0' }} />
            <input
              type="text"
              placeholder="Search PYQs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: '32px',
                padding: '0 12px 0 30px',
                background: 'rgba(128, 128, 128, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '12px',
                outline: 'none'
              }}
            />
          </div>

          {/* View Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => { setCurrentPath(''); setSearchQuery(''); }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a0a0a0',
                padding: '6px',
                cursor: 'pointer',
                borderRadius: '6px'
              }}
              title="Home"
            >
              <Home size={17} />
            </button>
            <button
              onClick={toggleViewMode}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a0a0a0',
                padding: '6px',
                cursor: 'pointer',
                borderRadius: '6px'
              }}
              title="Toggle View"
            >
              {viewMode === 'grid' ? <List size={17} /> : <LayoutGrid size={17} />}
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px 80px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

          {/* Breadcrumbs Path */}
          {!searchQuery.trim() && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px',
              padding: '8px 14px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '8px',
              marginBottom: '18px',
              fontSize: '0.82rem',
              color: '#a0a0a0'
            }}>
              <span
                onClick={() => setCurrentPath('')}
                style={{ cursor: 'pointer', color: currentPath ? '#6366f1' : '#fff', fontWeight: currentPath ? 400 : 600 }}
              >
                Home
              </span>
              {currentPath.split('/').filter(Boolean).map((part, idx, arr) => (
                <React.Fragment key={idx}>
                  <ChevronRight size={13} style={{ color: '#555' }} />
                  <span
                    onClick={() => setCurrentPath(arr.slice(0, idx + 1).join('/'))}
                    style={{
                      cursor: idx === arr.length - 1 ? 'default' : 'pointer',
                      color: idx === arr.length - 1 ? '#fff' : '#6366f1',
                      fontWeight: idx === arr.length - 1 ? 600 : 400
                    }}
                  >
                    {part}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}

          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '12px' }}>
              <Loader2 size={32} className="spin-icon text-[#6366f1]" />
              <div style={{ fontSize: '0.9rem', color: '#a0a0a0' }}>Indexing CBSE PYQ archives...</div>
            </div>
          ) : isSplitView && !searchQuery.trim() ? (
            /* Split View: Question Papers vs Marking Schemes */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#6366f1', fontSize: '1rem', fontWeight: 600 }}>
                  <BookOpen size={18} />
                  <span>Question Papers</span>
                  <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 400 }}>({displayItems.length})</span>
                </div>
                <ItemGrid items={displayItems} emptyMessage="No question papers found in this folder." isMS={false} />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#22c55e', fontSize: '1rem', fontWeight: 600 }}>
                  <CheckCircle size={18} />
                  <span>Marking Schemes</span>
                  <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 400 }}>({msItems.length})</span>
                </div>
                <ItemGrid items={msItems} emptyMessage="No marking schemes found." isMS={true} />
              </div>
            </div>
          ) : (
            <div>
              {searchQuery.trim() && (
                <div style={{ marginBottom: '14px', fontSize: '0.85rem', color: '#a0a0a0' }}>
                  Found {displayItems.length} result{displayItems.length === 1 ? '' : 's'} for "{searchQuery}"
                </div>
              )}
              <ItemGrid items={displayItems} emptyMessage="No items found in this directory." isMS={false} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
