import { useState, useEffect } from 'react';
import { BookOpen, ChevronRight, Play } from 'lucide-react';

interface BibleBrowserProps {
  translation: string;
  showVerseNumbers: boolean;
  onProject: (reference: string, text: string) => void;
  onAddBookmark?: (book: string, chapter: number, verseStart: number, verseEnd: number | undefined, text: string) => void;
  onAddSchedule?: (reference: string, text: string) => void;
}

export default function BibleBrowser({ translation, showVerseNumbers, onProject, onAddBookmark, onAddSchedule }: BibleBrowserProps) {
  const [books, setBooks] = useState<string[]>([]);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  
  const [chapterCount, setChapterCount] = useState<number>(0);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  
  const [verses, setVerses] = useState<any[]>([]);
  const [selectedVerses, setSelectedVerses] = useState<number[]>([]);

  // Load books on mount or translation change
  useEffect(() => {
    if (window.api) {
      window.api.getBooks(translation).then(setBooks);
    }
    // Reset selections
    setSelectedBook(null);
    setSelectedChapter(null);
    setVerses([]);
    setSelectedVerses([]);
  }, [translation]);

  // Load chapters when book selected
  useEffect(() => {
    if (window.api && selectedBook) {
      window.api.getChapterCount(translation, selectedBook).then(setChapterCount);
      setSelectedChapter(null);
      setVerses([]);
      setSelectedVerses([]);
    }
  }, [selectedBook, translation]);

  // Load verses when chapter selected
  useEffect(() => {
    if (window.api && selectedBook && selectedChapter) {
      window.api.queryVerses({
        translation,
        book: selectedBook,
        chapter: selectedChapter
      }).then((v) => {
        setVerses(v);
        setSelectedVerses([]);
      });
    }
  }, [selectedChapter, selectedBook, translation]);

  const handleVerseClick = (verseNum: number, shiftKey: boolean) => {
    if (shiftKey && selectedVerses.length > 0) {
      // Select range
      const start = Math.min(selectedVerses[0], verseNum);
      const end = Math.max(selectedVerses[selectedVerses.length - 1], verseNum);
      const newSelection = [];
      for (let i = start; i <= end; i++) {
        newSelection.push(i);
      }
      setSelectedVerses(newSelection);
    } else {
      // Toggle single selection
      if (selectedVerses.includes(verseNum)) {
        setSelectedVerses(selectedVerses.filter(v => v !== verseNum));
      } else {
        setSelectedVerses([verseNum]); // Or append if we want disjoint selection, but let's stick to contiguous for simplicity, so just replace or append
        // Let's make without shift replace the selection
        setSelectedVerses([verseNum]);
      }
    }
  };

  const getSelectedTextAndRef = () => {
    if (selectedVerses.length === 0 || !selectedBook || !selectedChapter) return null;
    const sorted = [...selectedVerses].sort((a, b) => a - b);
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    
    const selectedVerseObjects = verses.filter(v => sorted.includes(v.verse));
    const textCombined = selectedVerseObjects.map(v => showVerseNumbers ? `[${v.verse}] ${v.text}` : v.text).join(' ');
    
    const refFormatted = `${selectedBook} ${selectedChapter}:${start}${end > start ? '-' + end : ''} (${translation})`;
    return {
      reference: refFormatted,
      text: textCombined,
      startVerse: start,
      endVerse: end > start ? end : undefined
    };
  };

  const handleProjectSelected = () => {
    const data = getSelectedTextAndRef();
    if (data) {
      onProject(data.reference, data.text);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Breadcrumbs */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold text-muted-foreground bg-muted/30">
        <BookOpen className="w-4 h-4 text-primary" />
        <button 
          onClick={() => { setSelectedBook(null); setSelectedChapter(null); }}
          className={!selectedBook ? "text-primary" : "hover:text-foreground transition-colors"}
        >
          Bible
        </button>
        
        {selectedBook && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <button 
              onClick={() => setSelectedChapter(null)}
              className={!selectedChapter ? "text-primary" : "hover:text-foreground transition-colors"}
            >
              {selectedBook}
            </button>
          </>
        )}

        {selectedChapter && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-primary">Chapter {selectedChapter}</span>
          </>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-grow overflow-hidden flex relative">
        
        {/* View 1: Books */}
        {!selectedBook && (
          <div className="w-full h-full overflow-y-auto custom-scrollbar p-4 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 content-start">
            {books.length > 0 ? books.map(book => (
              <button
                key={book}
                onClick={() => setSelectedBook(book)}
                className="py-3 px-4 bg-background border border-border rounded-lg text-sm font-semibold hover:border-primary hover:bg-secondary transition-all text-center shadow-sm"
              >
                {book}
              </button>
            )) : (
              <div className="col-span-full py-10 text-center text-muted-foreground text-sm italic">
                Loading books or no data for this translation...
              </div>
            )}
          </div>
        )}

        {/* View 2: Chapters */}
        {selectedBook && !selectedChapter && (
          <div className="w-full h-full overflow-y-auto custom-scrollbar p-4 grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-3 content-start">
            {Array.from({ length: chapterCount }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedChapter(idx + 1)}
                className="aspect-square bg-background border border-border rounded-lg flex items-center justify-center text-xl font-bold hover:border-primary hover:bg-secondary hover:text-primary transition-all shadow-sm"
              >
                {idx + 1}
              </button>
            ))}
          </div>
        )}

        {/* View 3: Verses */}
        {selectedBook && selectedChapter && (
          <div className="w-full h-full flex flex-col">
            <div className="flex-grow overflow-y-auto custom-scrollbar p-4 space-y-1">
              {verses.map((v) => {
                const isSelected = selectedVerses.includes(v.verse);
                return (
                  <div
                    key={v.verse}
                    onClick={(e) => handleVerseClick(v.verse, e.shiftKey)}
                    className={`p-2 rounded cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-primary/20 border-l-2 border-primary' 
                        : 'hover:bg-secondary border-l-2 border-transparent'
                    }`}
                  >
                    <span className="text-primary font-bold text-xs mr-2 select-none">{v.verse}</span>
                    <span className="text-sm">{v.text}</span>
                  </div>
                );
              })}
            </div>

            {/* Selection Actions Panel */}
            {selectedVerses.length > 0 && (
              <div className="p-3 border-t border-border bg-muted/30 flex justify-between items-center animate-in slide-in-from-bottom-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  {selectedVerses.length} verse{selectedVerses.length > 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  {onAddBookmark && (
                    <button 
                      onClick={() => {
                        const data = getSelectedTextAndRef();
                        if (data) onAddBookmark(selectedBook, selectedChapter, data.startVerse, data.endVerse, data.text);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold bg-background border border-border rounded hover:bg-secondary transition-colors"
                    >
                      Bookmark
                    </button>
                  )}
                  {onAddSchedule && (
                    <button 
                      onClick={() => {
                        const data = getSelectedTextAndRef();
                        if (data) onAddSchedule(data.reference, data.text);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold bg-background border border-border rounded hover:bg-secondary transition-colors"
                    >
                      + Schedule
                    </button>
                  )}
                  <button 
                    onClick={handleProjectSelected}
                    className="px-4 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity flex items-center gap-1 shadow-sm"
                  >
                    <Play className="w-3 h-3" /> Project
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
