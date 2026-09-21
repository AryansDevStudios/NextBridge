import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  FileText,
  Download,
  Check,
  Loader2,
  ChevronLeft,
  ChevronRight,
  BookMarked,
  X
} from 'lucide-react';
import { downloadManager } from '../services/DownloadManager';

const CDN_BASE = 'https://cdn.jsdelivr.net/gh/AryansDevStudios/raw-files@main/RSAggrawalPDF/';

const CHAPTERS = [
  { n:  1, file: 'Ch01_Real_Numbers.pdf',                                   pages: 42,  title: 'Real Numbers' },
  { n:  2, file: 'Ch02_Polynomials.pdf',                                    pages: 28,  title: 'Polynomials' },
  { n:  3, file: 'Ch03_Linear_Equations_in_Two_Variables.pdf',              pages: 94,  title: 'Linear Equations in Two Variables' },
  { n:  4, file: 'Ch04_Quadratic_Equations.pdf',                            pages: 79,  title: 'Quadratic Equations' },
  { n:  5, file: 'Ch05_Arithmetic_Progression.pdf',                         pages: 53,  title: 'Arithmetic Progression' },
  { n:  6, file: 'Ch06_Coordinate_Geometry.pdf',                            pages: 54,  title: 'Coordinate Geometry' },
  { n:  7, file: 'Ch07_Triangles.pdf',                                      pages: 110, title: 'Triangles' },
  { n:  8, file: 'Ch08_Circles.pdf',                                        pages: 51,  title: 'Circles' },
  { n:  9, file: 'Ch09_Constructions.pdf',                                  pages: 16,  title: 'Constructions' },
  { n: 10, file: 'Ch10_Trigonometric_Ratios.pdf',                           pages: 18,  title: 'Trigonometric Ratios' },
  { n: 11, file: 'Ch11_T_Ratios_of_Some_Particular_Angles.pdf',             pages: 10,  title: 'T-Ratios of Some Particular Angles' },
  { n: 12, file: 'Ch12_Trigonometric_Ratios_of_Complementary_Angles.pdf',  pages: 11,  title: 'Trigonometric Ratios of Complementary Angles' },
  { n: 13, file: 'Ch13_Trigonometric_Identities.pdf',                       pages: 45,  title: 'Trigonometric Identities' },
  { n: 14, file: 'Ch14_Heights_and_Distances.pdf',                          pages: 42,  title: 'Heights and Distances' },
  { n: 15, file: 'Ch15_Perimeter_and_Area_of_Plan_Figuers.pdf',             pages: 24,  title: 'Perimeter and Area of Plan Figures' },
  { n: 16, file: 'Ch16_Area_of_Circle_Sector_and_Segment.pdf',              pages: 64,  title: 'Area of Circle, Sector and Segment' },
  { n: 17, file: 'Ch17_Volume_and_Surface_Areas_of_Solids.pdf',             pages: 84,  title: 'Volume and Surface Areas of Solids' },
  { n: 18, file: 'Ch18_Mean_Median_Mode_of_Grouped_Data_Cumulative_Frequency_Graph_and_Ogive.pdf', pages: 61, title: 'Mean, Median, Mode & Cumulative Frequency' },
  { n: 19, file: 'Ch19_Probability.pdf',                                    pages: 51,  title: 'Probability' }
];

function chapterItemId(ch) {
  return `rsa_ch${String(ch.n).padStart(2, '0')}`;
}

function chapterToPdfItem(ch) {
  return {
    id: chapterItemId(ch),
    title: `RS Aggarwal — Ch ${String(ch.n).padStart(2, '0')}: ${ch.title}`,
    name: ch.file,
    type: 'pdf',
    url: CDN_BASE + ch.file,
    source: 'rsa',
    subject_name: 'Mathematics',
    book_title: 'RS Aggarwal',
    chapter_title: ch.title,
    folder_path: 'RS Aggarwal'
  };
}

export default function RsAggarwalHub({ onOpenPdf }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [downloadState, setDownloadState] = useState(downloadManager.getState());

  React.useEffect(() => {
    const unsub = downloadManager.subscribe((st) => setDownloadState(st));
    return unsub;
  }, []);

  const filteredChapters = useMemo(() => {
    if (!searchQuery.trim()) return CHAPTERS;
    const q = searchQuery.toLowerCase().trim();
    return CHAPTERS.filter(
      ch => ch.title.toLowerCase().includes(q) || String(ch.n).includes(q)
    );
  }, [searchQuery]);

  const handleOpen = (ch) => {
    if (onOpenPdf) onOpenPdf(chapterToPdfItem(ch));
  };

  const handleDownload = async (e, ch) => {
    e.stopPropagation();
    const item = chapterToPdfItem(ch);
    try {
      await downloadManager.downloadPdf(item);
    } catch (err) {
      console.error('Failed to download RS Aggarwal chapter:', err);
    }
  };

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
      {/* ── Header ── */}
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
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: '6px',
            background: '#1c1c22', border: '1px solid #2e2e36',
            display: 'grid', placeItems: 'center',
            fontSize: '11px', fontWeight: 700, color: '#6aa3ff', letterSpacing: '0.04em',
            flexShrink: 0
          }}>
            RS
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f6', lineHeight: 1.2 }}>
              RS Aggarwal
            </div>
            <div style={{ fontSize: '11px', color: '#6b6b75', lineHeight: 1.2 }}>
              Mathematics · Class 10 · {CHAPTERS.length} Chapters
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', flex: '0 1 340px', margin: '0 16px' }}>
          <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#6b6b75', pointerEvents: 'none' }} />
          <input
            type="search"
            placeholder="Search chapters…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', height: '32px',
              padding: '0 10px 0 28px',
              background: '#15151a', border: '1px solid #24242b',
              borderRadius: '7px', color: '#f4f4f6',
              fontSize: '12px', outline: 'none'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#6b6b75', cursor: 'pointer', display: 'flex' }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Chapter count info */}
        <div style={{ fontSize: '11px', color: '#6b6b75', flexShrink: 0 }}>
          {filteredChapters.length} of {CHAPTERS.length} chapters
        </div>
      </div>

      {/* ── Chapter List ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 80px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>

          {filteredChapters.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#6b6b75', fontSize: '0.85rem' }}>
              No chapters match "<span style={{ color: '#a0a0a8' }}>{searchQuery}</span>"
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Section label */}
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#6b6b75', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 2px 8px' }}>
                Chapters
              </div>

              {filteredChapters.map(ch => {
                const itemId = chapterItemId(ch);
                const isDownloaded = downloadManager.isDownloaded(itemId);
                const isDownloading = downloadManager.isDownloading(itemId);

                return (
                  <div
                    key={ch.n}
                    onClick={() => handleOpen(ch)}
                    style={{
                      background: '#101012',
                      border: '1px solid #24242b',
                      borderRadius: '8px',
                      padding: '11px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      cursor: 'pointer',
                      transition: 'background 0.12s ease, border-color 0.12s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#15151a';
                      e.currentTarget.style.borderColor = '#2e2e36';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#101012';
                      e.currentTarget.style.borderColor = '#24242b';
                    }}
                  >
                    {/* Left: number badge + name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      {/* Chapter number pill */}
                      <div style={{
                        width: '34px', height: '34px', borderRadius: '6px',
                        background: '#1c1c22', border: '1px solid #2e2e36',
                        display: 'grid', placeItems: 'center',
                        fontSize: '11px', fontWeight: 700,
                        color: isDownloaded ? '#4ade80' : '#6aa3ff',
                        flexShrink: 0, fontVariantNumeric: 'tabular-nums'
                      }}>
                        {String(ch.n).padStart(2, '0')}
                      </div>

                      {/* Name + meta */}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                          fontSize: '13.5px', fontWeight: 600,
                          color: '#f4f4f6', lineHeight: 1.3,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }} title={ch.title}>
                          {ch.title}
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b6b75', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                          <span>{ch.pages} pages</span>
                          {isDownloaded && (
                            <span style={{ color: '#4ade80', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                              <Check size={11} /> Offline
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: page badge + download + read */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <span style={{
                        fontSize: '10px', color: '#a0a0a8',
                        background: '#15151a', border: '1px solid #24242b',
                        padding: '2px 7px', borderRadius: '4px',
                        fontVariantNumeric: 'tabular-nums'
                      }}>
                        {ch.pages}p
                      </span>

                      <button
                        onClick={e => handleDownload(e, ch)}
                        disabled={isDownloading || isDownloaded}
                        title={isDownloaded ? 'Downloaded to App' : isDownloading ? 'Downloading…' : 'Download for offline reading'}
                        style={{
                          width: '30px', height: '30px', borderRadius: '6px',
                          background: isDownloaded ? 'rgba(74,222,128,0.1)' : '#1c1c22',
                          border: `1px solid ${isDownloaded ? 'rgba(74,222,128,0.3)' : '#2e2e36'}`,
                          color: isDownloaded ? '#4ade80' : isDownloading ? '#f59e0b' : '#a0a0a8',
                          display: 'grid', placeItems: 'center',
                          cursor: (isDownloading || isDownloaded) ? 'default' : 'pointer'
                        }}
                      >
                        {isDownloading
                          ? <Loader2 size={14} className="spin-icon" />
                          : isDownloaded
                            ? <Check size={14} />
                            : <Download size={14} />}
                      </button>

                      <button
                        onClick={() => handleOpen(ch)}
                        style={{
                          height: '30px', padding: '0 12px',
                          borderRadius: '6px',
                          background: '#f4f4f6', border: 'none',
                          color: '#0a0a0a', fontSize: '12px', fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: '5px'
                        }}
                      >
                        <FileText size={12} />
                        Read
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
