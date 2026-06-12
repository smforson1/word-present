import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { RefreshCw, Power, Search, AlertCircle, History } from 'lucide-react';

export default function MobileRemote() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [pin, setPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [activeScripture, setActiveScripture] = useState<{ reference: string; text: string; translation: string } | null>(null);
  const [blackout, setBlackout] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [history, setHistory] = useState<{ reference: string; text: string; translation: string }[]>([]);

  useEffect(() => {
    const socketUrl = window.location.port && window.location.port !== '3000'
      ? `${window.location.protocol}//${window.location.hostname}:3000`
      : undefined;
    const s = io(socketUrl);
    setSocket(s);

    s.on('connect', () => console.log('Connected to socket server'));
    s.on('auth:success', (data: any) => {
      setIsAuthenticated(true);
      setAuthError('');
      if (data && data.activeScripture) setActiveScripture(data.activeScripture);
    });
    s.on('auth:failure', (msg: string) => { setAuthError(msg); setIsAuthenticated(false); });
    
    s.on('sync:project', (data: any) => {
      setActiveScripture(data);
      setHistory(prev => {
        const dup = prev.some(item => item.reference === data.reference && item.translation === data.translation);
        if (dup) return prev;
        return [data, ...prev].slice(0, 10); // Keep last 10
      });
    });
    
    s.on('sync:clear', () => setActiveScripture(null));
    s.on('sync:status', (status: any) => {
      if (status && typeof status.blackout === 'boolean') setBlackout(status.blackout);
    });
    s.on('lookup:error', (msg: string) => {
      setSearchError(msg);
      setTimeout(() => setSearchError(''), 4000);
    });

    return () => { s.disconnect(); };
  }, []);

  const handlePair = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket && pin) socket.emit('auth:verify', pin);
  };

  const handleClear = () => { if (socket) socket.emit('project:clear'); };
  
  const handleToggleBlackout = () => {
    if (!socket) return;
    const nextBlackout = !blackout;
    setBlackout(nextBlackout);
    socket.emit('status:broadcast', { blackout: nextBlackout });
  };

  const handleProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !searchQuery.trim()) return;
    socket.emit('project:lookup', searchQuery.trim());
    setSearchQuery('');
  };

  const projectQuickScripture = (ref: string) => {
    if (socket) socket.emit('project:lookup', ref);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 shadow-xl space-y-6">
          <div className="flex flex-col items-center space-y-2 text-center">
            <img src="/favicon.ico" alt="Church logo" className="w-14 h-14 rounded-xl object-contain" />
            <h1 className="text-2xl font-bold tracking-tight">Pair Mobile Remote</h1>
            <p className="text-sm text-muted-foreground">Enter the 4-digit PIN shown on the main Operator Console.</p>
          </div>
          <form onSubmit={handlePair} className="space-y-4">
            <input
              type="text" maxLength={4} pattern="\d{4}" placeholder="0000" value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full text-center text-3xl tracking-widest font-mono py-3 bg-background border border-border rounded-md focus:ring-2 focus:ring-primary outline-none"
              required autoFocus
            />
            {authError && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /><span>{authError}</span>
              </div>
            )}
            <button type="submit" className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-md hover:opacity-90 transition-all">
              Pair Device
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 max-w-lg mx-auto pb-8">
      <header className="flex items-center justify-between py-4 border-b border-border mb-4">
        <div className="flex items-center gap-2">
          <img src="/favicon.ico" alt="Church logo" className="w-7 h-7 object-contain" />
          <span className="font-bold tracking-tight text-lg">Scripture Remote</span>
        </div>
        <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs px-2.5 py-1 rounded-full font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Connected
        </div>
      </header>

      <main className="flex-grow space-y-6">
        {/* Active Scripture */}
        <div className="bg-card border border-border rounded-lg p-5 shadow-sm space-y-4 min-h-[160px] flex flex-col justify-between relative overflow-hidden">
          {blackout && <div className="absolute inset-0 bg-black/80 z-10 flex items-center justify-center text-red-500 font-bold uppercase tracking-widest">Blackout Active</div>}
          <div className="space-y-2 relative z-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Currently Projecting</div>
            {activeScripture ? (
              <div>
                <p className="font-serif italic text-lg leading-relaxed text-foreground">“{activeScripture.text}”</p>
                <h3 className="font-bold text-gold mt-2 text-base">{activeScripture.reference}</h3>
              </div>
            ) : <p className="text-muted-foreground text-sm italic">No active scripture on projector.</p>}
          </div>
        </div>

        {/* Quick Overrides */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={handleClear} className="flex items-center justify-center gap-2 py-3 bg-secondary text-secondary-foreground border border-border rounded-lg active:scale-95 transition-all">
            <RefreshCw className="w-4 h-4" /><span className="text-sm font-semibold">Clear</span>
          </button>
          <button onClick={handleToggleBlackout} className={`flex items-center justify-center gap-2 py-3 border rounded-lg active:scale-95 transition-all ${blackout ? 'bg-destructive text-white border-destructive' : 'bg-card text-foreground border-border hover:bg-secondary'}`}>
            <Power className="w-4 h-4" /><span className="text-sm font-semibold">{blackout ? 'End Blackout' : 'Blackout'}</span>
          </button>
        </div>

        {/* Manual Lookup */}
        <form onSubmit={handleProject} className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1"><Search className="w-3 h-3"/> Search Reference</div>
          <div className="flex gap-2">
            <input
              type="text" placeholder="e.g. John 3:16" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-grow px-3 py-2.5 bg-card border border-border rounded-md text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <button type="submit" className="bg-primary text-primary-foreground font-semibold px-4 rounded-md">Go</button>
          </div>
          {searchError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{searchError}</p>}
        </form>

        {/* History / Quick Project */}
        <div className="space-y-3 pt-4 border-t border-border">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1"><History className="w-3 h-3"/> Recent History</div>
          <div className="grid grid-cols-1 gap-2">
            {history.length > 0 ? history.map((item, idx) => (
              <button
                key={idx} onClick={() => projectQuickScripture(item.reference.split('(')[0].trim())}
                className="p-3 bg-card border border-border rounded-lg text-left active:scale-[0.98] transition-all"
              >
                <div className="font-bold text-sm text-gold">{item.reference}</div>
                <div className="text-xs text-muted-foreground line-clamp-1 italic mt-0.5">"{item.text}"</div>
              </button>
            )) : (
              <div className="text-center py-6 text-xs text-muted-foreground italic border border-dashed rounded-lg">No recent history</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
