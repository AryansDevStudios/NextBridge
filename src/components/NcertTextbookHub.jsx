import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  BookOpen, 
  Search, 
  Download, 
  Check, 
  Loader2, 
  FileText, 
  Archive, 
  ChevronRight,
  ExternalLink,
  Smartphone,
  BookMarked
} from 'lucide-react';
import { downloadManager } from '../services/DownloadManager';

const NCERT_API_URL = 'https://ncertbook.web.app/web_data.json';
const GITHUB_REPO = 'AryansDevStudios/ncert-class10-pdf-storage';
const CDN_BASE = `https://cdn.jsdelivr.net/gh/${GITHUB_REPO}@main/`;
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/`;

export const NCERT_SUBJECTS = [
  {
    key: 'Hindi',
    name: 'Hindi',
    mark: 'HN',
    desc: 'Course A Textbook (Kshitij-2) & Supplementary Reader (Kritika)',
    bookIds: ['Kshitij_2', 'Kritika'],
    badgeColor: '#f59e0b'
  },
  {
    key: 'English',
    name: 'English',
    mark: 'EN',
    desc: 'Main Reader (First Flight) & Supplementary Reader (Footprints Without Feet)',
    bookIds: ['First_Flight', 'Footprints_Without_Feet'],
    badgeColor: '#38bdf8'
  },
  {
    key: 'Mathematics',
    name: 'Maths',
    mark: 'MA',
    desc: 'Class 10 Complete Mathematics Textbook, Answers & Appendices',
    bookIds: ['Mathematics'],
    badgeColor: '#818cf8'
  },
  {
    key: 'Science',
    name: 'Science',
    mark: 'SC',
    desc: 'Physics, Chemistry, Biology Comprehensive Textbook & Answers',
    bookIds: ['Science'],
    badgeColor: '#34d399'
  },
  {
    key: 'Social_Science',
    name: 'SST (Social Science)',
    mark: 'SS',
    desc: 'History, Geography, Political Science & Economics Textbooks',
    bookIds: [
      'Geography_Contemporary_India',
      'Economics_Understanding_Economic_Development',
      'History_India_and_the_Contemporary_World_II',
      'Political_Science_Democratic_Politics'
    ],
    badgeColor: '#f472b6'
  },
  {
    key: 'Information_Technology',
    name: 'Information Tech (IT)',
    mark: 'IT',
    desc: 'Class 10 IT (Code 402) — Domestic Data Entry Operator & Employability Skills',
    bookIds: [
      'Domestic_Data_Entry_Operator',
      'Employability_Skills'
    ],
    badgeColor: '#a78bfa'
  }
];

export default function NcertTextbookHub({ onOpenPdf, onBack }) {
  const [allBooks, setAllBooks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedBook, setSelectedBook] = useState(null);
  const [chapterSearch, setChapterSearch] = useState('');
  const [downloadState, setDownloadState] = useState(downloadManager.getState());

  useEffect(() => {
    const unsub = downloadManager.subscribe((st) => {
      setDownloadState(st);
    });
    return unsub;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      // 1. Check local cache first for instantaneous offline loading
      const cached = localStorage.getItem('ncert_catalog_cache');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0 && isMounted) {
            setAllBooks(parsed);
            setIsLoading(false);
          }
        } catch (e) {
          console.warn('NCERT cache parse failed', e);
        }
      }

      // 2. Fetch live data from web_data.json
      try {
        const res = await fetch(NCERT_API_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isMounted) {
          setAllBooks(data);
          setIsLoading(false);
          try {
            localStorage.setItem('ncert_catalog_cache', JSON.stringify(data));
          } catch (e) {}
        }
      } catch (err) {
        console.warn('Live NCERT fetch error, relying on cache or local data:', err);
        if (isMounted && !allBooks.length) {
          setIsLoading(false);
          setLoadError('Unable to load latest NCERT catalogue online. Offline saved books remain available.');
        }
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, []);

  const getBookCoverUrl = (relPath) => {
    if (!relPath) return '';
    return CDN_BASE + relPath;
  };

  const getChapterPdfUrl = (relPath) => {
    if (!relPath) return '';
    return CDN_BASE + relPath;
  };

  const getZipUrl = (relPath) => {
    if (!relPath) return '';
    return GITHUB_RAW_BASE + relPath;
  };

  const getPillLabel = (chapter, idx) => {
    const fn = (chapter.filename || '').toLowerCase();
    if (fn.includes('pre') || fn.includes('pr')) return 'PR';
    if (fn.includes('ans') || fn.includes('an')) return 'AN';
    if (fn.includes('app') || fn.includes('a1') || fn.includes('a2')) return 'AP';
    const match = fn.match(/(\d{2,3})\.pdf$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const chNum = num % 100;
      return chNum < 10 ? `0${chNum}` : `${chNum}`;
    }
    return idx < 9 ? `0${idx + 1}` : `${idx + 1}`;
  };

  const handleOpenChapter = (chapter, book, subject) => {
    const itemId = `ncert_${book.id}_${(chapter.filename || '').replace(/\.pdf$/i, '')}`;
    const url = getChapterPdfUrl(chapter.url);
    const item = {
      id: itemId,
      title: `${book.title} - ${chapter.title}`,
      name: `${chapter.title}`,
      type: 'pdf',
      url: url,
      source: 'ncert',
      subject_name: subject?.name || book.category || 'NCERT',
      book_title: book.title,
      chapter_title: chapter.title,
      folder_path: book.title
    };
    if (onOpenPdf) {
      onOpenPdf(item);
    }
  };

  const handleDownloadChapter = async (e, chapter, book, subject) => {
    e.stopPropagation();
    const itemId = `ncert_${book.id}_${(chapter.filename || '').replace(/\.pdf$/i, '')}`;
    const url = getChapterPdfUrl(chapter.url);
    const item = {
      id: itemId,
      title: `${book.title} - ${chapter.title}`,
      name: `${chapter.title}`,
      type: 'pdf',
      url: url,
      source: 'ncert',
      subject_name: subject?.name || book.category || 'NCERT',
      book_title: book.title,
      chapter_title: chapter.title,
      folder_path: book.title
    };
    try {
      await downloadManager.downloadPdf(item);
    } catch (err) {
      console.error('Failed to download NCERT chapter:', err);
    }
  };

  // Filtered chapters for current book
  const filteredChapters = useMemo(() => {
    if (!selectedBook || !selectedBook.chapters) return [];
    if (!chapterSearch.trim()) return selectedBook.chapters;
    const q = chapterSearch.toLowerCase().trim();
    return selectedBook.chapters.filter(ch => 
      (ch.title && ch.title.toLowerCase().includes(q)) ||
      (ch.filename && ch.filename.toLowerCase().includes(q))
    );
  }, [selectedBook, chapterSearch]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      background: '#0a0a0a',
      color: '#f4f4f6',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Top Header Bar */}
      <div style={{
        height: '54px',
        background: '#101012',
        borderBottom: '1px solid #24242b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        flexShrink: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {(selectedBook || selectedSubject) && (
            <button
              onClick={() => {
                if (selectedBook) setSelectedBook(null);
                else if (selectedSubject) setSelectedSubject(null);
              }}
              style={{
                background: '#1c1c22',
                border: '1px solid #2e2e36',
                color: '#f4f4f6',
                padding: '6px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Back"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: '#1c1c22',
              border: '1px solid #2e2e36',
              display: 'grid',
              placeItems: 'center',
              fontSize: '11px',
              fontWeight: 700,
              color: '#6aa3ff'
            }}>
              NC
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f6', lineHeight: 1.2 }}>
                {selectedBook ? selectedBook.title : (selectedSubject ? selectedSubject.name : 'NCERT Textbooks')}
              </div>
              <div style={{ fontSize: '11px', color: '#6b6b75', lineHeight: 1.2 }}>
                {selectedBook ? `${selectedBook.chapters_count || selectedBook.chapters?.length || 0} Chapters • Solutions` : 'Official Class 10 Textbooks'}
              </div>
            </div>
          </div>
        </div>

        {/* Breadcrumb Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#a0a0a8' }}>
          <span 
            onClick={() => { setSelectedSubject(null); setSelectedBook(null); }}
            style={{ cursor: 'pointer', color: selectedSubject ? '#6aa3ff' : '#a0a0a8' }}
          >
            Subjects
          </span>
          {selectedSubject && (
            <>
              <ChevronRight size={13} style={{ color: '#4a4a52' }} />
              <span 
                onClick={() => setSelectedBook(null)}
                style={{ cursor: selectedBook ? 'pointer' : 'default', color: selectedBook ? '#6aa3ff' : '#f4f4f6', fontWeight: selectedBook ? 400 : 600 }}
              >
                {selectedSubject.name}
              </span>
            </>
          )}
          {selectedBook && (
            <>
              <ChevronRight size={13} style={{ color: '#4a4a52' }} />
              <span style={{ color: '#f4f4f6', fontWeight: 600 }}>
                {selectedBook.title}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 80px' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto' }}>

          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '12px' }}>
              <Loader2 size={32} className="spin-icon text-[#6aa3ff]" />
              <div style={{ fontSize: '0.9rem', color: '#a0a0a8' }}>Loading NCERT catalog...</div>
            </div>
          ) : loadError && !allBooks.length ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: '#15151a', borderRadius: '12px', border: '1px solid #24242b' }}>
              <p style={{ color: '#f87171', marginBottom: '12px' }}>{loadError}</p>
              <button 
                onClick={() => window.location.reload()}
                style={{ background: '#1c1c22', border: '1px solid #2e2e36', color: '#f4f4f6', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
              >
                Retry
              </button>
            </div>
          ) : !selectedSubject ? (
            /* LEVEL 1: Subject Cards Grid */
            <div>
              <div style={{ marginBottom: '22px' }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f4f4f6', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
                  Class 10 Textbooks
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#a0a0a8', margin: 0 }}>
                  Select a subject to browse official NCERT books, chapter solutions, and offline materials.
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                gap: '16px'
              }}>
                {NCERT_SUBJECTS.map((subj) => {
                  const books = subj.bookIds.map(id => allBooks.find(b => b.id === id)).filter(Boolean);
                  const totalChapters = books.reduce((sum, b) => sum + (b.chapters_count || b.chapters?.length || 0), 0);

                  return (
                    <div
                      key={subj.key}
                      onClick={() => setSelectedSubject(subj)}
                      style={{
                        background: '#101012',
                        border: '1px solid #24242b',
                        borderRadius: '12px',
                        padding: '22px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '160px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#15151a';
                        e.currentTarget.style.borderColor = '#2e2e36';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#101012';
                        e.currentTarget.style.borderColor = '#24242b';
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                          <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '8px',
                            background: '#1c1c22',
                            border: '1px solid #2e2e36',
                            display: 'grid',
                            placeItems: 'center',
                            color: subj.badgeColor || '#6aa3ff'
                          }}>
                            <BookOpen size={20} />
                          </div>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#a0a0a8',
                            background: '#15151a',
                            border: '1px solid #24242b',
                            padding: '3px 9px',
                            borderRadius: '999px'
                          }}>
                            {books.length} {books.length === 1 ? 'Book' : 'Books'}
                          </span>
                        </div>

                        <div style={{ fontSize: '17px', fontWeight: 600, color: '#f4f4f6', marginBottom: '5px' }}>
                          {subj.name}
                        </div>
                        <div style={{ fontSize: '12.5px', color: '#a0a0a8', lineHeight: 1.4 }}>
                          {subj.desc}
                        </div>
                      </div>

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '18px',
                        paddingTop: '14px',
                        borderTop: '1px solid #24242b',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#6b6b75'
                      }}>
                        <span>{totalChapters} Total Chapters</span>
                        <span style={{ color: '#6aa3ff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Open <ChevronRight size={14} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : !selectedBook ? (
            /* LEVEL 2: Books Grid for Subject */
            <div>
              <div style={{ marginBottom: '22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f4f4f6', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
                    {selectedSubject.name} Textbooks
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: '#a0a0a8', margin: 0 }}>
                    {selectedSubject.desc}
                  </p>
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '20px'
              }}>
                {selectedSubject.bookIds.map(id => allBooks.find(b => b.id === id)).filter(Boolean).map(book => {
                  const coverUrl = getBookCoverUrl(book.cover_url);
                  const zipUrl = getZipUrl(book.zip_url);
                  const chCount = book.chapters_count || book.chapters?.length || 0;

                  return (
                    <div
                      key={book.id}
                      onClick={() => setSelectedBook(book)}
                      style={{
                        background: '#101012',
                        border: '1px solid #24242b',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#15151a';
                        e.currentTarget.style.borderColor = '#2e2e36';
                        e.currentTarget.style.transform = 'translateY(-3px)';
                        e.currentTarget.style.boxShadow = '0 12px 28px -6px rgba(0, 0, 0, 0.6)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#101012';
                        e.currentTarget.style.borderColor = '#24242b';
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                      }}
                    >
                      {/* Portrait Book Stage */}
                      <div style={{
                        padding: '24px 16px 20px',
                        background: 'radial-gradient(circle at 50% 30%, #1c1c22 0%, #15151a 100%)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderBottom: '1px solid #24242b',
                        minHeight: '210px'
                      }}>
                        {coverUrl ? (
                          <img
                            src={coverUrl}
                            alt={book.title}
                            style={{
                              width: '125px',
                              height: '175px',
                              objectFit: 'cover',
                              borderRadius: '5px',
                              boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.7), 0 2px 6px rgba(0, 0, 0, 0.4)',
                              border: '1px solid rgba(255, 255, 255, 0.08)'
                            }}
                          />
                        ) : (
                          <div style={{
                            width: '125px',
                            height: '175px',
                            borderRadius: '5px',
                            background: '#1c1c22',
                            border: '1px solid #2e2e36',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#6b6b75',
                            fontSize: '11px',
                            gap: '6px'
                          }}>
                            <BookOpen size={24} />
                            <span>No Cover</span>
                          </div>
                        )}
                      </div>

                      {/* Card Body */}
                      <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 600, color: '#f4f4f6', marginBottom: '4px', lineHeight: 1.35 }}>
                            {book.title}
                          </div>
                          <div style={{ fontSize: '12px', color: '#a0a0a8', marginBottom: '14px' }}>
                            {chCount} Chapters • Solutions Included
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid #24242b' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedBook(book); }}
                            style={{
                              flex: 1,
                              height: '34px',
                              borderRadius: '6px',
                              background: '#f4f4f6',
                              color: '#0a0a0a',
                              border: 'none',
                              fontSize: '12.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }}
                          >
                            <BookOpen size={14} />
                            Read Chapters
                          </button>
                          {zipUrl && (
                            <a
                              href={zipUrl}
                              download={`${book.code || book.id}_complete.zip`}
                              onClick={(e) => e.stopPropagation()}
                              title="Download Full Book ZIP"
                              style={{
                                height: '34px',
                                padding: '0 12px',
                                borderRadius: '6px',
                                background: '#15151a',
                                border: '1px solid #24242b',
                                color: '#f4f4f6',
                                fontSize: '12px',
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                textDecoration: 'none'
                              }}
                            >
                              <Archive size={14} />
                              <span>ZIP</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* LEVEL 3: Chapters Drawer / List View */
            <div>
              <div style={{
                background: '#101012',
                border: '1px solid #24242b',
                borderRadius: '12px',
                padding: '18px 20px',
                marginBottom: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#f4f4f6', margin: '0 0 4px 0' }}>
                      {selectedBook.title}
                    </h2>
                    <div style={{ fontSize: '12px', color: '#a0a0a8' }}>
                      {selectedBook.chapters_count || selectedBook.chapters?.length} Total Chapters • {selectedSubject.name}
                    </div>
                  </div>

                  {/* Search within chapters */}
                  <div style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: '300px'
                  }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6b6b75' }} />
                    <input
                      type="text"
                      placeholder="Search chapters or topics..."
                      value={chapterSearch}
                      onChange={(e) => setChapterSearch(e.target.value)}
                      style={{
                        width: '100%',
                        height: '34px',
                        padding: '0 12px 0 32px',
                        background: '#15151a',
                        border: '1px solid #24242b',
                        borderRadius: '6px',
                        color: '#f4f4f6',
                        fontSize: '12px',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Chapters List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredChapters.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b6b75', fontSize: '0.85rem' }}>
                    No chapters found matching "{chapterSearch}".
                  </div>
                ) : (
                  filteredChapters.map((ch, idx) => {
                    const itemId = `ncert_${selectedBook.id}_${(ch.filename || '').replace(/\.pdf$/i, '')}`;
                    const isDownloaded = downloadManager.isDownloaded(itemId);
                    const isDownloading = downloadManager.isDownloading(itemId);
                    const pillLabel = getPillLabel(ch, idx);

                    return (
                      <div
                        key={ch.filename || idx}
                        onClick={() => handleOpenChapter(ch, selectedBook, selectedSubject)}
                        style={{
                          background: '#101012',
                          border: '1px solid #24242b',
                          borderRadius: '8px',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#15151a';
                          e.currentTarget.style.borderColor = '#2e2e36';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#101012';
                          e.currentTarget.style.borderColor = '#24242b';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                          {/* Chapter Pill Badge */}
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '6px',
                            background: '#1c1c22',
                            border: '1px solid #2e2e36',
                            color: '#6aa3ff',
                            fontSize: '11px',
                            fontWeight: 700,
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0
                          }}>
                            {pillLabel}
                          </div>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#f4f4f6', lineHeight: 1.3 }} className="truncate">
                              {ch.title}
                            </div>
                            <div style={{ fontSize: '11px', color: '#6b6b75', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                              {ch.pages && <span>{ch.pages} pages</span>}
                              {ch.size_formatted && <span>• {ch.size_formatted}</span>}
                              {isDownloaded && (
                                <span style={{ color: '#4ade80', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                                  <Check size={12} /> Offline
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <button
                            onClick={(e) => handleDownloadChapter(e, ch, selectedBook, selectedSubject)}
                            disabled={isDownloading || isDownloaded}
                            title={isDownloaded ? 'Downloaded to App' : isDownloading ? 'Downloading...' : 'Download for Offline Reading'}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '6px',
                              background: isDownloaded ? 'rgba(74, 222, 128, 0.1)' : '#1c1c22',
                              border: `1px solid ${isDownloaded ? 'rgba(74, 222, 128, 0.3)' : '#2e2e36'}`,
                              color: isDownloaded ? '#4ade80' : isDownloading ? '#f59e0b' : '#a0a0a8',
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
                            onClick={() => handleOpenChapter(ch, selectedBook, selectedSubject)}
                            style={{
                              height: '32px',
                              padding: '0 12px',
                              borderRadius: '6px',
                              background: '#f4f4f6',
                              border: 'none',
                              color: '#0a0a0a',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                          >
                            <FileText size={13} />
                            Read
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
