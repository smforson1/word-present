import { useEffect, useState } from 'react';

interface ProjectedScripture {
  reference: string;
  text: string;
  translation: string;
}

export default function ProjectionScreen() {
  const [scripture, setScripture] = useState<ProjectedScripture | null>(null);
  const [blackout, setBlackout] = useState(false);
  const [animationClass, setAnimationClass] = useState('opacity-0 translate-y-8');

  // Customization State
  const [bgColor, setBgColor] = useState('#000000');
  const [bgMode, setBgMode] = useState<'color' | 'image'>('color');
  const [bgImage, setBgImage] = useState('');
  const [fontFamily, setFontFamily] = useState('serif');
  const [fontSizeScale, setFontSizeScale] = useState(1.0);

  useEffect(() => {
    if (!window.api) return;

    // Load initial settings
    window.api.getSettings().then((settings: any) => {
      if (settings.projectionBgColor) setBgColor(settings.projectionBgColor);
      if (settings.projectionBgMode) setBgMode(settings.projectionBgMode);
      if (settings.projectionBgImage) setBgImage(settings.projectionBgImage);
      if (settings.projectionFontFamily) setFontFamily(settings.projectionFontFamily);
      if (settings.fontSizeScale) setFontSizeScale(settings.fontSizeScale);
    });

    // Listen to updates from the main process
    const unsubscribeProject = window.api.onProjectUpdate((_, data) => {
      setAnimationClass('opacity-0 translate-y-8 transition-none');
      setBlackout(false);
      setScripture(data);
      
      // Trigger smooth slide-in transition
      setTimeout(() => {
        setAnimationClass('opacity-100 translate-y-0 transition-all duration-700 ease-out');
      }, 50);
    });

    const unsubscribeClear = window.api.onClearScreen(() => {
      setAnimationClass('opacity-0 -translate-y-8 transition-all duration-500 ease-in');
      setTimeout(() => {
        setScripture(null);
      }, 500);
    });

    // Listen to direct status sync commands (e.g. blackout overrides and settings changes)
    const unsubscribeStatus = window.api.onStatusUpdate((_, status) => {
      if (!status) return;
      if (typeof status.blackout === 'boolean') setBlackout(status.blackout);
      if (status.projectionBgColor) setBgColor(status.projectionBgColor);
      if (status.projectionBgMode) setBgMode(status.projectionBgMode as 'color' | 'image');
      if (status.projectionBgImage) setBgImage(status.projectionBgImage);
      if (status.projectionFontFamily) setFontFamily(status.projectionFontFamily);
      if (status.fontSizeScale) setFontSizeScale(status.fontSizeScale);
    });

    return () => {
      unsubscribeProject();
      unsubscribeClear();
      unsubscribeStatus();
    };
  }, []);

  // Responsive font auto-scaling based on length to ensure 0 text truncation or overflow
  const getFontSize = (text: string) => {
    const len = text.length;
    let base = 5.5;
    if (len >= 80 && len < 165) base = 4.5;
    else if (len >= 165 && len < 280) base = 3.5;
    else if (len >= 280 && len < 450) base = 2.6;
    else if (len >= 450) base = 2.1;
    
    // Apply user scaling
    const scaled = base * fontSizeScale;
    
    if (len < 80) return `text-[${scaled}vw] leading-tight`;
    if (len < 165) return `text-[${scaled}vw] leading-snug`;
    if (len < 280) return `text-[${scaled}vw] leading-relaxed`;
    if (len < 450) return `text-[${scaled}vw] leading-relaxed`;
    return `text-[${scaled}vw] leading-normal`;
  };

  return (
    <div 
      className="relative w-screen h-screen text-white flex flex-col justify-between p-12 overflow-hidden select-none"
      style={{ backgroundColor: bgColor }}
    >
      {/* Background Image Layer */}
      {bgMode === 'image' && bgImage && (
        <div 
          className="absolute inset-0 bg-cover bg-center transition-all duration-1000 z-0 pointer-events-none"
          style={{ backgroundImage: `url(${bgImage})` }}
        >
          {/* Dark legibility gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-black/65" />
        </div>
      )}

      {/* Blackout Mask Overlay */}
      <div 
        className={`absolute inset-0 bg-black z-50 transition-opacity duration-300 pointer-events-none ${
          blackout ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {scripture ? (
        <div className={`flex flex-col h-full justify-between transform ${animationClass} z-10 relative`}>
          {/* Top Divider and Logo/Watermark */}
          <div className="flex justify-between items-center border-b border-white/20 pb-4">
            <div className="flex items-center gap-2.5">
              <img src="favicon.ico" alt="" className="w-7 h-7 opacity-60 object-contain" />
              <span className="text-[1.6vw] font-bold text-white/50 tracking-wider uppercase">
                Scripture Presenter
              </span>
            </div>
            <span className="text-[1.6vw] font-medium text-white/40">
              {scripture.translation}
            </span>
          </div>

          {/* Main Verse Text Section */}
          <div className="flex-grow flex items-center justify-center py-8">
            <p 
              className={`text-center font-medium drop-shadow-md text-zinc-100 max-w-[85vw] ${
                fontFamily === 'serif' ? 'font-serif italic' : 'font-sans'
              }`}
              style={{ fontSize: `calc(1vw * ${parseFloat(getFontSize(scripture.text).split('[')[1].split('v')[0])})`, lineHeight: getFontSize(scripture.text).split(' ')[1].split('-')[1] }}
            >
              “{scripture.text}”
            </p>
          </div>

          {/* Bottom Reference Citation Panel */}
          <div className="flex justify-center border-t border-white/20 pt-6">
            <h2 className="text-[4.5vw] font-bold tracking-wide drop-shadow-md" style={{ color: '#C9A227', fontFamily: fontFamily === 'serif' ? 'serif' : 'sans-serif' }}>
              {scripture.reference}
            </h2>
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-full items-center justify-center gap-4 animate-pulse z-10 relative">
          <img src="favicon.ico" alt="" className="w-16 h-16 opacity-20 object-contain" />
          <p className="text-[1.8vw] font-light uppercase tracking-widest text-white/30">
            Waiting for Scripture…
          </p>
        </div>
      )}
    </div>
  );
}
