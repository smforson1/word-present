import React, { useState, useEffect } from 'react';
import { ListOrdered, Trash2, ArrowUp, ArrowDown, Save, FolderOpen, ChevronRight, ChevronLeft } from 'lucide-react';

export interface ScheduleItem {
  id: string;
  reference: string;
  text: string;
}

interface ServiceScheduleProps {
  schedule: ScheduleItem[];
  setSchedule: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
  onProject: (reference: string, text: string) => void;
}

export default function ServiceSchedule({ schedule, setSchedule, onProject }: ServiceScheduleProps) {
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Keyboard navigation for schedule
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
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

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold tracking-wider uppercase text-muted-foreground">Service Schedule</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={loadSchedule} className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground" title="Load Schedule">
            <FolderOpen className="w-4 h-4" />
          </button>
          <button onClick={saveSchedule} disabled={schedule.length === 0} className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground disabled:opacity-50" title="Save Schedule">
            <Save className="w-4 h-4" />
          </button>
        </div>
      </div>

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

      <div className="flex-grow overflow-y-auto custom-scrollbar p-2 space-y-1">
        {schedule.length > 0 ? (
          schedule.map((item, idx) => (
            <div 
              key={item.id} 
              className={`flex items-stretch border rounded-md overflow-hidden transition-colors ${
                activeIndex === idx ? 'border-gold bg-gold/10' : 'border-border bg-background hover:bg-secondary'
              }`}
            >
              <div className="w-8 flex flex-col items-center justify-center bg-muted/50 border-r border-border gap-2 py-1">
                <button onClick={() => moveItem(idx, 'up')} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => moveItem(idx, 'down')} disabled={idx === schedule.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
              
              <div 
                className="flex-grow p-3 cursor-pointer"
                onClick={() => handleProjectIndex(idx)}
              >
                <p className="text-sm font-bold text-gold mb-1">{item.reference}</p>
                <p className="text-xs text-foreground line-clamp-2">{item.text}</p>
              </div>

              <div className="w-10 flex flex-col items-center justify-center border-l border-border bg-muted/50">
                <button 
                  onClick={() => removeItem(item.id)}
                  className="p-2 text-destructive hover:bg-destructive/10 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground/50 h-full p-8 text-center space-y-2">
            <ListOrdered className="w-8 h-8" />
            <p className="text-sm italic">Schedule is empty. Add verses from the Browser, Search, or Bookmarks.</p>
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
