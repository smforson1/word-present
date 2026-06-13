import { describe, it, expect } from 'vitest';
import { detectScriptureReferencesOffline, formatScripturesInText } from '../main/scripture-detector';

describe('Verify current detection behavior', () => {
  it('test John one two', () => {
    const refs = detectScriptureReferencesOffline('John one two');
    console.log('REFS FOR John one two:', refs);
    expect(refs).toHaveLength(1);
    expect(refs[0].book).toBe('John');
    expect(refs[0].chapter).toBe(1);
    expect(refs[0].verse).toBe(2);
    expect(formatScripturesInText('John one two')).toBe('John 1:2');
  });

  it('test John 316', () => {
    const refs = detectScriptureReferencesOffline('John 316');
    console.log('REFS FOR John 316:', refs);
    expect(formatScripturesInText('John 316')).toBe('John 3:16');
  });

  it('test John 12', () => {
    const refs = detectScriptureReferencesOffline('John 12');
    console.log('REFS FOR John 12:', refs);
    expect(formatScripturesInText('John 12')).toBe('John 1:2');
  });

  it('test psalm 119 verse 105', () => {
    const refs = detectScriptureReferencesOffline('psalm 119 verse 105');
    console.log('REFS FOR psalm 119 verse 105:', refs);
    expect(refs).toHaveLength(1);
    expect(refs[0].book).toBe('Psalms');
    expect(refs[0].chapter).toBe(119);
    expect(refs[0].verse).toBe(105);
    expect(formatScripturesInText('psalm 119 verse 105')).toBe('Psalms 119:105');
  });

  it('test John one verse two', () => {
    const refs = detectScriptureReferencesOffline('John one verse two');
    console.log('REFS FOR John one verse two:', refs);
    expect(refs).toHaveLength(1);
    expect(formatScripturesInText('John one verse two')).toBe('John 1:2');
  });

  it('test John one twenty two', () => {
    const refs = detectScriptureReferencesOffline('John one twenty two');
    console.log('REFS FOR John one twenty two:', refs);
    expect(refs).toHaveLength(1);
    expect(formatScripturesInText('John one twenty two')).toBe('John 1:22');
  });
});
