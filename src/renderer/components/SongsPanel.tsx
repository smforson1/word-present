import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, X, Music, Play } from 'lucide-react';

interface SongRecord {
  id?: number;
  title: string;
  artist: string;
  lyrics: string;
  createdAt?: string;
}

interface SongsPanelProps {
  onProject: (reference: string, text: string, slideType?: 'scripture' | 'song' | 'announcement' | 'custom') => void;
  onAddSchedule: (reference: string, text: string) => void;
}

interface SongSlide {
  label: string;
  text: string;
}

export default function SongsPanel({ onProject, onAddSchedule }: SongsPanelProps) {
  const [songs, setSongs] = useState<SongRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSong, setSelectedSong] = useState<SongRecord | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSongId, setEditingSongId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formArtist, setFormArtist] = useState('');
  const [formLyrics, setFormLyrics] = useState('');
  const [formError, setFormError] = useState('');

  const fetchSongs = async (q = '') => {
    if (!window.api) return;
    try {
      const results = await window.api.getSongs(q);
      setSongs(results);
    } catch (err) {
      console.error('[SongsPanel] Failed to fetch songs:', err);
    }
  };

  useEffect(() => {
    fetchSongs(searchQuery);
  }, [searchQuery]);

  const handleOpenAddForm = () => {
    setEditingSongId(null);
    setFormTitle('');
    setFormArtist('');
    setFormLyrics('');
    setFormError('');
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (song: SongRecord) => {
    if (!song.id) return;
    setEditingSongId(song.id);
    setFormTitle(song.title);
    setFormArtist(song.artist);
    setFormLyrics(song.lyrics);
    setFormError('');
    setIsFormOpen(true);
  };

  const handleSaveSong = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formTitle.trim()) {
      setFormError('Title is required.');
      return;
    }
    if (!formLyrics.trim()) {
      setFormError('Lyrics are required.');
      return;
    }

    try {
      const songData = {
        title: formTitle.trim(),
        artist: formArtist.trim(),
        lyrics: formLyrics.trim()
      };

      if (editingSongId !== null) {
        await window.api.updateSong(editingSongId, songData);
        if (selectedSong && selectedSong.id === editingSongId) {
          setSelectedSong({ ...selectedSong, ...songData });
        }
      } else {
        const newId = await window.api.addSong(songData);
        setSelectedSong({ id: newId, ...songData });
      }

      setIsFormOpen(false);
      fetchSongs(searchQuery);
    } catch (err) {
      setFormError('Failed to save song to database.');
    }
  };

  const handleDeleteSong = async (id: number) => {
    if (!confirm('Are you sure you want to delete this song?')) return;
    try {
      await window.api.deleteSong(id);
      if (selectedSong && selectedSong.id === id) {
        setSelectedSong(null);
        setActiveSlideIndex(null);
      }
      fetchSongs(searchQuery);
    } catch (err) {
      console.error('[SongsPanel] Delete failed:', err);
    }
  };

  // Parse lyrics into structural slides
  const parseLyrics = (lyrics: string): SongSlide[] => {
    if (!lyrics) return [];
    // Split on double newlines or lines containing bracket headings
    const blocks = lyrics.trim().split(/\n\s*\n+/);
    return blocks.map((block, index) => {
      const lines = block.split('\n');
      let label = '';
      let textLines = [...lines];

      const firstLine = lines[0].trim();
      if (firstLine.startsWith('[') && firstLine.endsWith(']')) {
        label = firstLine.slice(1, -1);
        textLines = lines.slice(1);
      } else if (firstLine.endsWith(':')) {
        label = firstLine.slice(0, -1);
        textLines = lines.slice(1);
      } else {
        label = `Slide ${index + 1}`;
      }

      return {
        label,
        text: textLines.join('\n').trim()
      };
    });
  };

  const slides = selectedSong ? parseLyrics(selectedSong.lyrics) : [];

  const handleProjectSlide = (slide: SongSlide, index: number) => {
    if (!selectedSong) return;
    setActiveSlideIndex(index);
    // Project with bookmarked structure: Song Title as Reference, Slide Text, slideType = 'song'
    onProject(`${selectedSong.title} (${slide.label})`, slide.text, 'song');
  };

  const handleAddSongToSchedule = (song: SongRecord) => {
    // Add first slide or a song wrapper to schedule
    const firstSlide = parseLyrics(song.lyrics)[0];
    onAddSchedule(song.title, firstSlide ? firstSlide.text : 'Worship Song');
  };

  return (
    <div className="h-full flex divide-x divide-border overflow-hidden">
      {/* Left Column: Song List & Search */}
      <div className="w-[40%] flex flex-col h-full overflow-hidden bg-card/10">
        <div className="p-3 border-b flex gap-2 shrink-0">
          <div className="relative flex-grow">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search songs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-card border rounded text-xs outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <button
            onClick={handleOpenAddForm}
            className="bg-primary hover:bg-primary/95 text-primary-foreground p-2 rounded flex items-center justify-center shrink-0"
            title="Add Song"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto custom-scrollbar">
          {songs.length > 0 ? (
            songs.map((song) => (
              <div
                key={song.id}
                onClick={() => {
                  setSelectedSong(song);
                  setActiveSlideIndex(null);
                }}
                className={`p-3 border-b cursor-pointer flex justify-between items-center transition-colors group ${
                  selectedSong?.id === song.id ? 'bg-primary/10 text-primary border-l-4 border-l-primary' : 'hover:bg-muted/40'
                }`}
              >
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  <span className="text-xs font-bold truncate">{song.title}</span>
                  {song.artist && <span className="text-[10px] text-muted-foreground truncate">{song.artist}</span>}
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddSongToSchedule(song);
                    }}
                    className="p-1 hover:bg-primary/20 text-primary rounded"
                    title="Add to Schedule"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEditForm(song);
                    }}
                    className="p-1 hover:bg-card border rounded text-muted-foreground"
                    title="Edit Song"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (song.id) handleDeleteSong(song.id);
                    }}
                    className="p-1 hover:bg-rose-500/10 text-rose-500 rounded"
                    title="Delete Song"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground text-xs">No songs found.</div>
          )}
        </div>
      </div>

      {/* Right Column: Slide Sections Flow */}
      <div className="w-[60%] flex flex-col h-full overflow-hidden bg-background">
        {selectedSong ? (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header info */}
            <div className="p-4 border-b bg-card/30 flex justify-between items-center shrink-0">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Music className="w-4 h-4 text-primary" /> {selectedSong.title}
                </h3>
                {selectedSong.artist && <span className="text-xs text-muted-foreground">By {selectedSong.artist}</span>}
              </div>
              <button
                onClick={() => handleAddSongToSchedule(selectedSong)}
                className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs px-3 py-1.5 rounded font-semibold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add to Schedule
              </button>
            </div>

            {/* Slides grid list */}
            <div className="flex-grow p-4 overflow-y-auto space-y-3 custom-scrollbar">
              {slides.map((slide, idx) => (
                <div
                  key={idx}
                  onClick={() => handleProjectSlide(slide, idx)}
                  className={`border rounded p-3 cursor-pointer transition-all ${
                    activeSlideIndex === idx
                      ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                      : 'hover:border-muted-foreground bg-card'
                  }`}
                >
                  <div className="flex justify-between items-center border-b pb-1.5 mb-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-primary">
                      {slide.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">Slide {idx + 1}</span>
                  </div>
                  <p className="text-xs whitespace-pre-wrap text-center font-medium leading-relaxed italic text-foreground">
                    {slide.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Music className="w-8 h-8 opacity-20" />
            <span className="text-xs font-light">Select a song from the list to display slides.</span>
          </div>
        )}
      </div>

      {/* Add/Edit Modal Form overlay */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center bg-muted/20 shrink-0">
              <h3 className="font-bold text-sm">
                {editingSongId !== null ? 'Edit Worship Song' : 'Add New Worship Song'}
              </h3>
              <button onClick={() => setIsFormOpen(false)} className="hover:bg-muted p-1 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSong} className="flex-grow p-4 space-y-4 overflow-y-auto custom-scrollbar flex flex-col">
              <div className="grid grid-cols-2 gap-3 shrink-0">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">Song Title *</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Amazing Grace"
                    className="px-3 py-2 bg-background border rounded text-xs outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground">Artist/Author</label>
                  <input
                    type="text"
                    value={formArtist}
                    onChange={(e) => setFormArtist(e.target.value)}
                    placeholder="e.g. John Newton"
                    className="px-3 py-2 bg-background border rounded text-xs outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1 flex-grow">
                <label className="text-[10px] uppercase font-bold text-muted-foreground">Lyrics *</label>
                <span className="text-[9px] text-muted-foreground leading-normal mb-1">
                  Separate slides using double newlines. You can tag slides with section names in brackets on the first line of the block (e.g. [Verse 1] or [Chorus]).
                </span>
                <textarea
                  value={formLyrics}
                  onChange={(e) => setFormLyrics(e.target.value)}
                  placeholder="[Verse 1]&#10;Amazing grace! How sweet the sound&#10;That saved a wretch like me!&#10;&#10;[Chorus]&#10;My chains are gone, I've been set free..."
                  className="flex-grow p-3 bg-background border rounded text-xs font-mono outline-none focus:ring-2 focus:ring-primary/50 h-64 resize-none"
                />
              </div>

              {formError && <p className="text-xs text-rose-500 font-semibold shrink-0">{formError}</p>}

              <div className="flex justify-end gap-2 border-t pt-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 border rounded text-xs font-bold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary/95 text-primary-foreground rounded text-xs font-bold"
                >
                  Save Song
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
