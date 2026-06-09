import { useState, useEffect } from 'react';
import { Search, Play } from 'lucide-react';

interface SearchPanelProps {
  translation: string;
  showVerseNumbers: boolean;
  onProject: (reference: string, text: string) => void;
  onAddBookmark?: (book: string, chapter: number, verseStart: number, verseEnd: number | undefined, text: string) => void;
  onAddSchedule?: (reference: string, text: string) => void;
}

export default function SearchPanel({ translation, showVerseNumbers, onProject, onAddBookmark, onAddSchedule }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim().length >= 3) {
        setIsSearching(true);
        if (window.api) {
          window.api.searchText(translation, query.trim(), 50).then(res => {
            setResults(res);
            setIsSearching(false);
            setHasSearched(true);
          });
        }
      } else {
        setResults([]);
        setHasSearched(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [query, translation]);

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return text;
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === highlight.toLowerCase() ? 
            <mark key={i} className="bg-gold/25 text-gold-foreground rounded px-0.5 not-italic">{part}</mark> : part
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search scripture text (min 3 chars)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-md text-sm focus:ring-2 focus:ring-primary/50 outline-none"
          />
        </div>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar">
        {isSearching && (
          <div className="p-8 text-center text-sm text-muted-foreground italic animate-pulse">
            Searching {translation}...
          </div>
        )}

        {!isSearching && hasSearched && results.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No results found for "{query}".
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="divide-y divide-border">
            {results.map((res, idx) => {
              const reference = `${res.book} ${res.chapter}:${res.verse} (${translation})`;
              return (
                <div key={idx} className="p-4 hover:bg-secondary transition-colors group">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-bold text-gold">{reference}</span>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                      {onAddBookmark && (
                        <button 
                          onClick={() => onAddBookmark(res.book, res.chapter, res.verse, undefined, res.text)}
                          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Bookmark
                        </button>
                      )}
                      {onAddSchedule && (
                        <button 
                          onClick={() => onAddSchedule(reference, showVerseNumbers ? `[${res.verse}] ${res.text}` : res.text)}
                          className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                          + Schedule
                        </button>
                      )}
                      <button 
                        onClick={() => onProject(reference, showVerseNumbers ? `[${res.verse}] ${res.text}` : res.text)}
                        className="px-4 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity flex items-center gap-1 shadow-sm"
                      >
                        <Play className="w-3 h-3" /> Project
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-foreground">
                    {highlightText(res.text, query)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        
        {!isSearching && !hasSearched && (
          <div className="p-8 flex flex-col items-center justify-center text-muted-foreground/50 h-full">
            <Search className="w-8 h-8 mb-2" />
            <p className="text-sm italic">Type to search across the entire Bible</p>
          </div>
        )}
      </div>
    </div>
  );
}
