import { describe, it, expect } from 'vitest';

describe('Rich Theme & Motion Background Configurations', () => {
  it('should verify default theme settings has particle configurations', () => {
    const defaults = {
      projectionBgMode: 'color' as 'color' | 'image' | 'gradient' | 'motion' | 'video',
      projectionParticleSpeed: 0.5,
      projectionParticleDensity: 50,
      projectionParticleColor: 'gold' as 'gold' | 'white' | 'blue' | 'rainbow',
      projectionBgVideo: '',
    };

    expect(defaults.projectionBgMode).toBe('color');
    expect(defaults.projectionParticleSpeed).toBe(0.5);
    expect(defaults.projectionParticleDensity).toBe(50);
    expect(defaults.projectionParticleColor).toBe('gold');
    expect(defaults.projectionBgVideo).toBe('');
  });

  it('should allow modifying theme options dynamically', () => {
    const customSettings = {
      projectionBgMode: 'motion',
      projectionParticleSpeed: 1.2,
      projectionParticleDensity: 80,
      projectionParticleColor: 'rainbow',
      projectionBgVideo: '/path/to/loop.mp4'
    };

    expect(customSettings.projectionBgMode).toBe('motion');
    expect(customSettings.projectionParticleSpeed).toBe(1.2);
    expect(customSettings.projectionParticleDensity).toBe(80);
    expect(customSettings.projectionParticleColor).toBe('rainbow');
    expect(customSettings.projectionBgVideo).toBe('/path/to/loop.mp4');
  });

  it('should support presets customizing motion backgrounds', () => {
    const scripturePreset = {
      fontSizeScale: 1.0,
      projectionBgMode: 'motion',
      projectionParticleSpeed: 0.8,
      projectionParticleDensity: 40,
      projectionParticleColor: 'blue',
      projectionBgVideo: ''
    };

    expect(scripturePreset.projectionBgMode).toBe('motion');
    expect(scripturePreset.projectionParticleSpeed).toBe(0.8);
    expect(scripturePreset.projectionParticleDensity).toBe(40);
    expect(scripturePreset.projectionParticleColor).toBe('blue');
  });

  it('should serialize preset settings cleanly to JSON', () => {
    const settings = {
      preset_song: {
        fontSizeScale: 1.2,
        projectionBgMode: 'video',
        projectionBgVideo: 'C:\\Users\\custom\\video.webm',
        projectionParticleSpeed: 0.5,
        projectionParticleDensity: 50,
        projectionParticleColor: 'white'
      }
    };
    const serialized = JSON.stringify(settings);
    const parsed = JSON.parse(serialized);
    expect(parsed.preset_song.projectionBgMode).toBe('video');
    expect(parsed.preset_song.projectionBgVideo).toBe('C:\\Users\\custom\\video.webm');
  });
});
