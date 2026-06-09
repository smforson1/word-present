import React, { useState, useEffect } from 'react';
import { 
  ListOrdered, Trash2, ArrowUp, ArrowDown, Save, FolderOpen, 
  ChevronRight, ChevronLeft, Plus, Pencil, Check, X, 
  Music, Megaphone, FileText, BookOpen 
} from 'lucide-react';

export interface ScheduleItem {
  id: string;
  reference: string;
  text: string;
  type?: 'scripture' | 'song' | 'announcement' | 'custom';
}

interface ServiceScheduleProps {
  schedule: ScheduleItem[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
  onProject: (reference: string, text: string) => void;
}

export default function ServiceSchedule({ schedule, setSchedule, onProject }: ServiceScheduleProps) {
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Add Item State
  const [isAdding, setIsAdding] = useState(false);
  const [newType, setNewType] = useState<'scripture' | 'song' | 'announcement' | 'custom'>('song');
  const [newReference, setNewReference] = useState('');
  const [newText, setNewText] = useState('');

  // Edit Item State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReference, setEditReference] = useState('');
  const [editText, setEditText] = useState('');

  // Keyboard navigation for schedule
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard against typing in input or textarea fields
      if (
        document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA'
      ) return;

      if (schedule.length === 0) return;

      if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [schedule, activeIndex]);

  const handleNext = () => {
    if (schedule.length === 0) return;
    const nextIdx = activeIndex + 1 < schedule.length ? activeIndex + 1 : activeIndex;
    setActiveIndex(nextIdx);
    onProject(schedule[nextIdx].reference, schedule[nextIdx].text);
  };

  const handlePrev = () => {
    if (schedule.length === 0) return;
    const prevIdx = activeIndex - 1 >= 0 ? activeIndex - 1 : 0;
    setActiveIndex(prevIdx);
    onProject(schedule[prevIdx].reference, schedule[prevIdx].text);
  };

  const handleProjectIndex = (idx: number) => {
    setActiveIndex(idx);
    onProject(schedule[idx].reference, schedule[idx].text);
  };

  const removeItem = (id: string) => {
    const idx = schedule.findIndex(i => i.id === id);
    const newSchedule = schedule.filter(i => i.id !== id);
    setSchedule(newSchedule);
    
    // Adjust active index if necessary
    if (activeIndex === idx) {
      setActiveIndex(-1); // Stop projecting if the active item was removed
    } else if (activeIndex > idx) {
      setActiveIndex(activeIndex - 1);
    }
  };

  const moveItem = (idx: number, direction: 'up' | 'down') => {
    if (direction === 'up' && idx > 0) {
      const newSchedule = [...schedule];
      const temp = newSchedule[idx];
      newSchedule[idx] = newSchedule[idx - 1];
      newSchedule[idx - 1] = temp;
      setSchedule(newSchedule);
      if (activeIndex === idx) setActiveIndex(idx - 1);
      else if (activeIndex === idx - 1) setActiveIndex(idx);
    } else if (direction === 'down' && idx < schedule.length - 1) {
      const newSchedule = [...schedule];
      const temp = newSchedule[idx];
      newSchedule[idx] = newSchedule[idx + 1];
      newSchedule[idx + 1] = temp;
      setSchedule(newSchedule);
      if (activeIndex === idx) setActiveIndex(idx + 1);
      else if (activeIndex === idx + 1) setActiveIndex(idx);
    }
  };

  const saveSchedule = async () => {
    if (window.api && schedule.length > 0) {
      const data = JSON.stringify(schedule, null, 2);
      await window.api.saveSchedule(data);
    }
  };

  const loadSchedule = async () => {
    if (window.api) {
      const dataStr = await window.api.loadSchedule();
      if (dataStr) {
        try {
          const parsed = JSON.parse(dataStr);
          if (Array.isArray(parsed)) {
            setSchedule(parsed);
            setActiveIndex(-1);
          }
        } catch (e) {
          console.error("Failed to parse schedule", e);
        }
      }
    }
  };

  const clearSchedule = () => {
    if (confirm("Are you sure you want to clear the schedule?")) {
      setSchedule([]);
      setActiveIndex(-1);
    }
  };

  // Add custom item helper
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReference.trim() || !newText.trim()) return;

    const newItem: ScheduleItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      reference: newReference.trim(),
      text: newText.trim(),
      type: newType
    };

    setSchedule(prev => [...prev, newItem]);
    setNewReference('');
    setNewText('');
    setIsAdding(false);
  };

  // Inline editing helpers
  const startEdit = (item: ScheduleItem) => {
    setEditingId(item.id);
    setEditReference(item.reference);
    setEditText(item.text);
  };

  const saveEdit = (id: string) => {
    if (!editReference.trim() || !editText.trim()) return;
    setSchedule(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, reference: editReference.trim(), text: editText.trim() };
      }
      return item;
    }));
    setEditingId(null);
  };

  const renderIcon = (type?: 'scripture' | 'song' | 'announcement' | 'custom') => {
    switch (type) {
      case 'scripture':
        return <BookOpen className="w-4 h-4 text-emerald-500" />;
      case 'song':
        return <Music className="w-4 h-4 text-sky-500" />;
      case 'announcement':
        return <Megaphone className="w-4 h-4 text-purple-500" />;
      default:
        return <FileText className="w-4 h-4 text-amber-500" />;
    }
  };

  const renderBadge = (type?: 'scripture' | 'song' | 'announcement' | 'custom') => {
    switch (type) {
      case 'scripture':
        return <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Scripture</span>;
      case 'song':
        return <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-sky-500/10 text-sky-500 border border-sky-500/20">Song</span>;
      case 'announcement':
        return <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-purple-500/10 text-purple-500 border border-purple-500/20">Slide</span>;
      default:
        return <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">Custom</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold tracking-wider uppercase text-muted-foreground">Service Schedule</h2>
        </div>
        <div className="flex gap-1.5">
          <button 
            onClick={() => setIsAdding(!isAdding)} 
            className={`p-1.5 rounded transition-colors ${isAdding ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-muted-foreground hover:text-foreground'}`}
            title="Add Custom Item"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={loadSchedule} className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground" title="Load Schedule File">
            <FolderOpen className="w-4 h-4" />
          </button>
          <button onClick={saveSchedule} disabled={schedule.length === 0} className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground disabled:opacity-50" title="Save Schedule File">
            <Save className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Inline Add Item Form */}
      {isAdding && (
        <form onSubmit={handleAddItem} className="p-3 bg-muted/20 border-b border-border space-y-2.5 animate-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">New Schedule Item</span>
            <button type="button" onClick={() => setIsAdding(false)} className="p-0.5 hover:bg-secondary rounded text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
          </div>
          
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[9px] font-bold uppercase text-muted-foreground">Item Type</label>
              <select 
                value={newType} 
                onChange={(e) => setNewType(e.target.value as any)}
                className="w-full text-xs px-2 py-1 bg-card border border-border rounded outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="song">Song / Lyrics</option>
                <option value="announcement">Announcement / Slide</option>
                <option value="custom">Custom Text</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase text-muted-foreground">Title / Header</label>
              <input 
                type="text" 
                placeholder="e.g. Amazing Grace"
                value={newReference}
                onChange={(e) => setNewReference(e.target.value)}
                className="w-full text-xs px-2 py-1 bg-card border border-border rounded outline-none focus:ring-1 focus:ring-primary/50"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] font-bold uppercase text-muted-foreground">Content / Slides Text</label>
            <textarea
              placeholder="Enter lyrics or slide content text here..."
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={3}
              className="w-full text-xs px-2 py-1 bg-card border border-border rounded outline-none focus:ring-1 focus:ring-primary/50 font-mono leading-tight resize-none"
              required
            />
          </div>

          <button 
            type="submit"
            className="w-full py-1 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 rounded transition-colors"
          >
            Add to Schedule
          </button>
        </form>
      )}

      <div className="p-3 border-b border-border bg-background flex justify-between items-center">
        <button 
          onClick={handlePrev} 
          disabled={schedule.length === 0 || activeIndex <= 0}
          className="px-3 py-1.5 text-xs font-bold bg-secondary text-secondary-foreground rounded hover:bg-muted disabled:opacity-50 flex items-center gap-1"
        >
          <ChevronLeft className="w-3 h-3" /> Prev [←]
        </button>
        <span className="text-xs font-semibold text-muted-foreground">
          {schedule.length > 0 ? `${activeIndex + 1} / ${schedule.length}` : 'Empty'}
        </span>
        <button 
          onClick={handleNext} 
          disabled={schedule.length === 0 || activeIndex >= schedule.length - 1}
          className="px-3 py-1.5 text-xs font-bold bg-gold text-gold-foreground rounded hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
        >
          Next [→] <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-grow overflow-y-auto custom-scrollbar p-2 space-y-1.5">
        {schedule.length > 0 ? (
          schedule.map((item, idx) => {
            const isEditing = editingId === item.id;
            
            return (
              <div 
                key={item.id} 
                className={`flex items-stretch border rounded-md overflow-hidden transition-colors ${
                  activeIndex === idx ? 'border-gold bg-gold/10' : 'border-border bg-background hover:bg-secondary'
                }`}
              >
                {/* Re-order controls (hidden when editing) */}
                {!isEditing && (
                  <div className="w-8 flex flex-col items-center justify-center bg-muted/50 border-r border-border gap-2 py-1 shrink-0">
                    <button onClick={() => moveItem(idx, 'up')} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => moveItem(idx, 'down')} disabled={idx === schedule.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Content Area */}
                <div className="flex-grow p-3 min-w-0">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-bold uppercase text-muted-foreground">Editing Item</span>
                        <div className="flex gap-1">
                          <button onClick={() => saveEdit(item.id)} className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded" title="Save"><Check className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-secondary rounded" title="Cancel"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <input 
                        type="text"
                        value={editReference}
                        onChange={(e) => setEditReference(e.target.value)}
                        className="w-full text-xs px-2 py-1 bg-card border border-border rounded outline-none focus:ring-1 focus:ring-primary/50 font-bold"
                        placeholder="Title / Reference"
                        required
                      />
                      <textarea 
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={2}
                        className="w-full text-xs px-2 py-1 bg-card border border-border rounded outline-none focus:ring-1 focus:ring-primary/50 font-mono resize-none leading-tight"
                        placeholder="Content text"
                        required
                      />
                    </div>
                  ) : (
                    <div 
                      className="cursor-pointer h-full flex flex-col justify-between"
                      onClick={() => handleProjectIndex(idx)}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          {renderIcon(item.type)}
                          <p className="text-sm font-bold text-gold truncate flex-grow min-w-0">{item.reference}</p>
                          {renderBadge(item.type)}
                        </div>
                        <p className="text-xs text-foreground line-clamp-2 leading-snug">{item.text}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Edit & Delete Controls (hidden when editing) */}
                {!isEditing && (
                  <div className="w-10 flex flex-col items-center justify-center border-l border-border bg-muted/50 divide-y divide-border shrink-0">
                    <button 
                      onClick={() => startEdit(item)}
                      className="flex-grow w-full flex items-center justify-center p-2 text-muted-foreground hover:bg-secondary transition-colors"
                      title="Edit Item"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => removeItem(item.id)}
                      className="flex-grow w-full flex items-center justify-center p-2 text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remove Item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground/50 h-full p-8 text-center space-y-2 py-20">
            <ListOrdered className="w-8 h-8" />
            <p className="text-sm italic leading-tight">Schedule is empty.</p>
            <p className="text-xs">Add scriptures from the browser/search or click the <strong>+ icon</strong> to create custom slides.</p>
          </div>
        )}
      </div>
      
      {schedule.length > 0 && (
        <div className="p-2 border-t border-border bg-muted/30">
          <button 
            onClick={clearSchedule}
            className="w-full py-1.5 text-xs font-semibold text-destructive border border-destructive/30 bg-background rounded hover:bg-destructive/10 transition-colors"
          >
            Clear Schedule
          </button>
        </div>
      )}
    </div>
  );
}
