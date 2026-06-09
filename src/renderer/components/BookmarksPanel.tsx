import { useState, useEffect } from 'react';
import { Bookmark, Play, Trash2 } from 'lucide-react';

interface BookmarksPanelProps {
  onProject: (reference: string, text: string) => void;
  onAddSchedule?: (reference: string, text: string) => void;
  refreshTrigger: number; // Increment this prop to trigger a reload
  showVerseNumbers: boolean;
}

export default function BookmarksPanel({ onProject, onAddSchedule, refreshTrigger, showVerseNumbers }: BookmarksPanelProps) {
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBookmarks = () => {
    setLoading(true);
    if (window.api) {
      window.api.getBookmarks().then(b => {
        setBookmarks(b);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookmarks();
  }, [refreshTrigger]);

  const removeBookmark = async (id: number) => {
    if (window.api) {
      await window.api.removeBookmark(id);
      loadBookmarks();
    }
  };

  const getReferenceString = (b: any) => {
    return `${b.book} ${b.chapter}:${b.verseStart}${b.verseEnd ? '-' + b.verseEnd : ''} (${b.translation})`;
  };

  const fetchAndProject = async (b: any) => {
    if (window.api) {
      const verses = await window.api.queryVerses({
        translation: b.translation,
        book: b.book,
        chapter: b.chapter,
        verseStart: b.verseStart,
        verseEnd: b.verseEnd
      });
      if (verses.length > 0) {
        const textCombined = verses.map((v: any) => showVerseNumbers ? `[${v.verse}] ${v.text}` : v.text).join(' ');
        onProject(getReferenceString(b), textCombined);
      }
    }
  };

  const fetchAndSchedule = async (b: any) => {
    if (window.api && onAddSchedule) {
      const verses = await window.api.queryVerses({
        translation: b.translation,
        book: b.book,
        chapter: b.chapter,
        verseStart: b.verseStart,
        verseEnd: b.verseEnd
      });
      if (verses.length > 0) {
        const textCombined = verses.map((v: any) => showVerseNumbers ? `[${v.verse}] ${v.text}` : v.text).join(' ');
        onAddSchedule(getReferenceString(b), textCombined);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="p-4 border-b border-border bg-muted/30 flex items-center gap-2">
        <Bookmark className="w-4 h-4 text-gold" />
        <h2 className="text-sm font-bold tracking-wider uppercase text-muted-foreground">Favorites & Bookmarks</h2>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground animate-pulse">Loading...</div>
        ) : bookmarks.length > 0 ? (
          <div className="divide-y divide-border">
            {bookmarks.map(b => {
              const reference = getReferenceString(b);
              return (
                <div key={b.id} className="p-4 hover:bg-secondary transition-colors group">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-bold text-gold">{reference}</span>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                      {onAddSchedule && (
                        <button 
                          onClick={() => fetchAndSchedule(b)}
                          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                          + Schedule
                        </button>
                      )}
                      <button 
                        onClick={() => fetchAndProject(b)}
                        className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1"
                      >
                        <Play className="w-3 h-3" /> Project
                      </button>
                      <button 
                        onClick={() => removeBookmark(b.id)}
                        className="text-xs font-bold text-destructive hover:text-destructive/80 p-1"
                        title="Remove bookmark"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {b.label && <p className="text-xs text-muted-foreground mb-1 italic">{b.label}</p>}
                  <p className="text-xs text-muted-foreground">Added: {new Date(b.createdAt).toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 flex flex-col items-center justify-center text-muted-foreground/50 h-full">
            <Bookmark className="w-8 h-8 mb-2 text-gold/40" />
            <p className="text-sm italic">No bookmarks saved yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
