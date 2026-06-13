import { useEffect, useState, useRef } from 'react';

interface ProjectedScripture {
  reference: string;
  text: string;
  translation: string;
  secondaryText?: string;
  secondaryTranslation?: string;
  slideType?: string;
}

export default function ProjectionScreen() {
  const [scripture, setScripture] = useState<ProjectedScripture | null>(null);
  const [blackout, setBlackout] = useState(false);
  const [animationClass, setAnimationClass] = useState('opacity-0 translate-y-8');

  // Customization State
  const [bgColor, setBgColor] = useState('#000000');
  const [bgMode, setBgMode] = useState<'color' | 'image' | 'gradient' | 'motion' | 'video'>('color');
  const [bgImage, setBgImage] = useState('');
  const [bgGradient, setBgGradient] = useState('twilight');
  const [fontFamily, setFontFamily] = useState('serif');
  const [fontSizeScale, setFontSizeScale] = useState(1.0);

  // Motion backgrounds & custom video loop states
  const [particleSpeed, setParticleSpeed] = useState(0.5);
  const [particleDensity, setParticleDensity] = useState(50);
  const [particleColor, setParticleColor] = useState<'gold' | 'white' | 'blue' | 'rainbow'>('gold');
  const [bgVideo, setBgVideo] = useState('');

  useEffect(() => {
    if (!window.api) return;

    // Load initial settings
    window.api.getSettings().then((settings: any) => {
      if (settings.projectionBgColor) setBgColor(settings.projectionBgColor);
      if (settings.projectionBgMode) setBgMode(settings.projectionBgMode);
      if (settings.projectionBgImage) setBgImage(settings.projectionBgImage);
      if (settings.projectionBgGradient) setBgGradient(settings.projectionBgGradient);
      if (settings.projectionFontFamily) setFontFamily(settings.projectionFontFamily);
      if (settings.fontSizeScale) setFontSizeScale(settings.fontSizeScale);
      if (settings.projectionParticleSpeed !== undefined) setParticleSpeed(settings.projectionParticleSpeed);
      if (settings.projectionParticleDensity !== undefined) setParticleDensity(settings.projectionParticleDensity);
      if (settings.projectionParticleColor) setParticleColor(settings.projectionParticleColor);
      if (settings.projectionBgVideo !== undefined) setBgVideo(settings.projectionBgVideo);
    });

    // Listen to updates from the main process
    const unsubscribeProject = window.api.onProjectUpdate((_, data) => {
      setAnimationClass('opacity-0 translate-y-8 transition-none');
      setBlackout(false);
      setScripture(data);
      
      // Apply slide type style preset if attached, otherwise fallback to global store values
      if (data && data.preset) {
        const preset = data.preset;
        const isGlobal = !preset.projectionBgMode || preset.projectionBgMode === 'global';

        if (preset.fontSizeScale) setFontSizeScale(preset.fontSizeScale);
        if (preset.projectionFontFamily) setFontFamily(preset.projectionFontFamily);

        if (isGlobal) {
          window.api.getSettings().then((settings: any) => {
            if (settings.projectionBgColor) setBgColor(settings.projectionBgColor);
            if (settings.projectionBgMode) setBgMode(settings.projectionBgMode);
            if (settings.projectionBgImage) setBgImage(settings.projectionBgImage);
            if (settings.projectionBgGradient) setBgGradient(settings.projectionBgGradient);
            if (settings.projectionParticleSpeed !== undefined) setParticleSpeed(settings.projectionParticleSpeed);
            if (settings.projectionParticleDensity !== undefined) setParticleDensity(settings.projectionParticleDensity);
            if (settings.projectionParticleColor) setParticleColor(settings.projectionParticleColor);
            if (settings.projectionBgVideo !== undefined) setBgVideo(settings.projectionBgVideo);
          });
        } else {
          if (preset.projectionBgColor) setBgColor(preset.projectionBgColor);
          if (preset.projectionBgMode) setBgMode(preset.projectionBgMode);
          if (preset.projectionBgImage) {
            setBgImage(preset.projectionBgImage);
          } else {
            window.api.getSettings().then((settings: any) => {
              if (settings.projectionBgImage) setBgImage(settings.projectionBgImage);
            });
          }
          if (preset.projectionBgGradient) setBgGradient(preset.projectionBgGradient);
          if (preset.projectionParticleSpeed !== undefined) setParticleSpeed(preset.projectionParticleSpeed);
          if (preset.projectionParticleDensity !== undefined) setParticleDensity(preset.projectionParticleDensity);
          if (preset.projectionParticleColor) setParticleColor(preset.projectionParticleColor);
          if (preset.projectionBgVideo !== undefined) setBgVideo(preset.projectionBgVideo);
        }
      } else {
        // Fallback to global settings
        window.api.getSettings().then((settings: any) => {
          if (settings.projectionBgColor) setBgColor(settings.projectionBgColor);
          if (settings.projectionBgMode) setBgMode(settings.projectionBgMode);
          if (settings.projectionBgImage) setBgImage(settings.projectionBgImage);
          if (settings.projectionBgGradient) setBgGradient(settings.projectionBgGradient);
          if (settings.projectionFontFamily) setFontFamily(settings.projectionFontFamily);
          if (settings.fontSizeScale) setFontSizeScale(settings.fontSizeScale);
          if (settings.projectionParticleSpeed !== undefined) setParticleSpeed(settings.projectionParticleSpeed);
          if (settings.projectionParticleDensity !== undefined) setParticleDensity(settings.projectionParticleDensity);
          if (settings.projectionParticleColor) setParticleColor(settings.projectionParticleColor);
          if (settings.projectionBgVideo !== undefined) setBgVideo(settings.projectionBgVideo);
        });
      }
      
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
      if (status.projectionBgMode) setBgMode(status.projectionBgMode as any);
      if (status.projectionBgImage) setBgImage(status.projectionBgImage);
      if (status.projectionBgGradient) setBgGradient(status.projectionBgGradient);
      if (status.projectionFontFamily) setFontFamily(status.projectionFontFamily);
      if (status.fontSizeScale) setFontSizeScale(status.fontSizeScale);
      if (status.projectionParticleSpeed !== undefined) setParticleSpeed(status.projectionParticleSpeed);
      if (status.projectionParticleDensity !== undefined) setParticleDensity(status.projectionParticleDensity);
      if (status.projectionParticleColor) setParticleColor(status.projectionParticleColor);
      if (status.projectionBgVideo !== undefined) setBgVideo(status.projectionBgVideo);
    });

    return () => {
      unsubscribeProject();
      unsubscribeClear();
      unsubscribeStatus();
    };
  }, []);

  // Map font ID to CSS font-family and whether it should be italic
  const getFontStyle = (id: string): { fontFamily: string; fontStyle?: string } => {
    switch (id) {
      case 'cinzel':           return { fontFamily: '"Cinzel", serif' };
      case 'eb-garamond':      return { fontFamily: '"EB Garamond", serif', fontStyle: 'italic' };
      case 'lora':             return { fontFamily: '"Lora", serif', fontStyle: 'italic' };
      case 'playfair-display': return { fontFamily: '"Playfair Display", serif', fontStyle: 'italic' };
      case 'raleway':          return { fontFamily: '"Raleway", sans-serif' };
      case 'inter':            return { fontFamily: '"Inter", sans-serif' };
      // Legacy fallbacks
      case 'serif':            return { fontFamily: 'Georgia, serif', fontStyle: 'italic' };
      case 'sans-serif':       return { fontFamily: 'system-ui, sans-serif' };
      default:                 return { fontFamily: '"EB Garamond", serif', fontStyle: 'italic' };
    }
  };

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

      {/* Animated HSL Gradient Layer */}
      {bgMode === 'gradient' && (
        <div 
          className={`absolute inset-0 transition-all duration-1000 z-0 pointer-events-none ${
            bgGradient === 'twilight' ? 'gradient-twilight' :
            bgGradient === 'aurora' ? 'gradient-aurora' :
            bgGradient === 'forest' ? 'gradient-forest' :
            bgGradient === 'golden' ? 'gradient-golden' : ''
          }`}
        >
          {/* Dark legibility gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/35" />
        </div>
      )}

      {/* Motion Particles Layer */}
      {bgMode === 'motion' && (
        <>
          <CanvasParticles
            speed={particleSpeed}
            density={particleDensity}
            colorTheme={particleColor}
          />
          {/* Dark legibility overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/45 to-black/60 z-0 pointer-events-none" />
        </>
      )}

      {/* Video Loop Layer */}
      {bgMode === 'video' && bgVideo && (
        <>
          <video
            key={bgVideo}
            src={`file://${bgVideo}`}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
            onError={(e) => console.error('Video background load error:', e)}
          />
          {/* Dark legibility overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-black/70 z-0 pointer-events-none" />
        </>
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
                {scripture.slideType === 'song' ? scripture.reference : 'Scripture Presenter'}
              </span>
            </div>
            <span className="text-[1.6vw] font-medium text-white/40">
              {scripture.slideType === 'song'
                ? 'Worship'
                : `${scripture.translation}${scripture.secondaryTranslation ? ` + ${scripture.secondaryTranslation}` : ''}`}
            </span>
          </div>

          {/* Main Verse Text Section */}
          <div className="flex-grow flex flex-col items-center justify-center py-6 gap-3 overflow-y-auto">
            {/* Primary Translation Verse or Lyrics */}
            <p
              className="text-center font-medium drop-shadow-md text-zinc-100 max-w-[85vw] whitespace-pre-wrap"
              style={{
                fontSize: `calc(1vw * ${parseFloat(getFontSize(scripture.text).split('[')[1].split('v')[0])})`,
                lineHeight: getFontSize(scripture.text).split(' ')[1].split('-')[1],
                ...getFontStyle(fontFamily)
              }}
            >
              {scripture.slideType === 'song' ? scripture.text : `“${scripture.text}”`}
            </p>

            {/* Secondary Stacked Translation Verse */}
            {scripture.slideType !== 'song' && scripture.secondaryText && (
              <>
                <div className="w-[10vw] border-t border-white/20 my-1" />
                <p
                  className="text-center font-normal drop-shadow-md text-zinc-300 max-w-[85vw] opacity-80"
                  style={{
                    fontSize: `calc(0.72vw * ${parseFloat(getFontSize(scripture.secondaryText).split('[')[1].split('v')[0])})`,
                    lineHeight: getFontSize(scripture.secondaryText).split(' ')[1].split('-')[1],
                    ...getFontStyle(fontFamily),
                    fontStyle: 'italic'
                  }}
                >
                  “{scripture.secondaryText}” <span className="text-[0.6em] not-italic opacity-60 font-semibold font-sans ml-1">({scripture.secondaryTranslation})</span>
                </p>
              </>
            )}
          </div>

          {/* Bottom Reference Citation Panel */}
          {scripture.slideType !== 'song' && (
            <div className="flex justify-center border-t border-white/20 pt-6">
              <h2
                className="text-[4.5vw] font-bold tracking-wide drop-shadow-md"
                style={{ color: '#C9A227', ...getFontStyle(fontFamily), fontStyle: 'normal' }}
              >
                {scripture.reference}
              </h2>
            </div>
          )}
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

function CanvasParticles({
  speed,
  density,
  colorTheme
}: {
  speed: number;
  density: number;
  colorTheme: 'gold' | 'white' | 'blue' | 'rainbow';
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const count = Math.round(density * 1.5);
    interface Particle {
      x: number;
      y: number;
      size: number;
      baseSpeedY: number;
      speedY: number;
      speedX: number;
      opacity: number;
      fadeSpeed: number;
      hue: number;
      wobble: number;
      wobbleSpeed: number;
    }

    const particles: Particle[] = [];

    const getColors = (p: Particle) => {
      switch (colorTheme) {
        case 'gold':
          return `rgba(${200 + Math.random() * 55}, ${160 + Math.random() * 40}, ${30 + Math.random() * 20}, ${p.opacity})`;
        case 'white':
          return `rgba(240, 248, 255, ${p.opacity})`;
        case 'blue':
          return `rgba(${50 + Math.random() * 50}, ${150 + Math.random() * 105}, 255, ${p.opacity})`;
        case 'rainbow':
          return `hsla(${p.hue}, 85%, 65%, ${p.opacity})`;
      }
    };

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 4 + 1.5,
        baseSpeedY: -(Math.random() * 0.8 + 0.3),
        speedY: 0,
        speedX: Math.random() * 0.4 - 0.2,
        opacity: Math.random() * 0.5 + 0.2,
        fadeSpeed: Math.random() * 0.005 + 0.002,
        hue: Math.random() * 360,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.02 + 0.005
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.speedY = p.baseSpeedY * speed;
        p.y += p.speedY;
        p.wobble += p.wobbleSpeed;
        p.x += p.speedX + Math.sin(p.wobble) * 0.25 * speed;

        if (colorTheme === 'rainbow') {
          p.hue = (p.hue + 0.2) % 360;
        }

        if (p.y < -20) {
          p.y = height + 20;
          p.x = Math.random() * width;
          p.opacity = 0;
        }
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;

        if (p.opacity < 0.1) {
          p.fadeSpeed = Math.abs(p.fadeSpeed);
        } else if (p.opacity > 0.8) {
          p.fadeSpeed = -Math.abs(p.fadeSpeed);
        }
        p.opacity += p.fadeSpeed;
        p.opacity = Math.max(0.01, Math.min(0.9, p.opacity));

        const color = getColors(p);
        ctx.beginPath();
        const radGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.5);
        radGrad.addColorStop(0, color);
        radGrad.addColorStop(0.3, color);
        radGrad.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.fillStyle = radGrad;
        ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [speed, density, colorTheme]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-0 pointer-events-none" />;
}
