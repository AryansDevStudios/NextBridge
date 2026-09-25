import React, { useState, useRef } from 'react';
import { Bookmark, Clock, Plus, Play, Trash2 } from 'lucide-react';
import { formatSeekTime } from '../utils/playerHelpers';

const PRESET_TAGS = ['📌 Formula', '⚠️ Exam Important', '❓ Review Later', '💡 Key Concept', '📝 Summary'];

export default function NotesTaker({
  notes = [],
  currentTime = 0,
  onAddNote,
  onDeleteNote,
  onSeek,
  inputRef,
  isMobile = false
}) {
  const [noteInput, setNoteInput] = useState('');
  const localInputRef = useRef(null);
  const activeInputRef = inputRef || localInputRef;

  const handleSave = (presetText) => {
    const textToAdd = (presetText || noteInput || '').trim();
    if (!textToAdd) return;
    onAddNote?.(textToAdd);
    setNoteInput('');
  };

  return (
    <div className={`notes-taker-container ${isMobile ? 'is-mobile' : ''}`}>
      {/* Header Bar */}
      <div className="notes-taker-header">
        <div className="notes-taker-title-wrap">
          <div className="notes-icon-badge">
            <Bookmark size={16} className="text-[#f59e0b]" />
          </div>
          <div>
            <h3 className="notes-taker-title">Lecture Notes</h3>
            <span className="notes-taker-subtitle">
              {notes.length} saved moment{notes.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="notes-time-pill" title="Current lecture timestamp">
          <Clock size={12} className="text-[#f59e0b]" />
          <span>{formatSeekTime(currentTime)}</span>
        </div>
      </div>

      {/* Input Section */}
      <div className="notes-input-card">
        <div className="notes-input-row">
          <input
            ref={activeInputRef}
            type="text"
            placeholder={`Take note at ${formatSeekTime(currentTime)}...`}
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            className="notes-text-input"
          />
          <button
            onClick={() => handleSave()}
            className="notes-add-btn"
            title="Add Note"
          >
            <Plus size={16} />
            <span>Add</span>
          </button>
        </div>

        {/* Preset Chips */}
        <div className="notes-preset-chips">
          {PRESET_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => handleSave(tag)}
              className="notes-preset-chip"
              type="button"
            >
              +{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Notes List */}
      <div className="notes-list-wrap">
        {notes.length === 0 ? (
          <div className="notes-empty-state">
            <Bookmark size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
            <p className="notes-empty-title">No notes taken yet</p>
            <span className="notes-empty-desc">
              Bookmark formulas or key moments at any point while watching this lecture.
            </span>
          </div>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="note-card">
              <div className="note-card-header">
                <button
                  onClick={() => onSeek?.(n.time)}
                  className="note-seek-btn"
                  title="Click to jump to this timestamp"
                  type="button"
                >
                  <Play size={10} fill="currentColor" />
                  <span>{formatSeekTime(n.time)}</span>
                </button>

                <button
                  onClick={() => onDeleteNote?.(n.id)}
                  className="note-delete-btn"
                  title="Delete note"
                  type="button"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <div className="note-card-text">{n.text}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
