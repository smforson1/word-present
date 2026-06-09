import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BibleDatabase } from '../main/db';

// Mock electron path resolution since it's not available in vitest pure-node context
vi.mock('electron', () => {
  return {
    app: {
      getPath: () => './'
    }
  };
});

describe('Bible Database Fuzzy Parser and Resolver', () => {
  let db: BibleDatabase;

  beforeEach(async () => {
    db = new BibleDatabase();
    await db.ready();
  });

  it('should successfully parse standard reference strings', () => {
    const ref1 = db.parseReference('John 3:16');
    expect(ref1).not.toBeNull();
    expect(ref1?.book).toBe('John');
    expect(ref1?.chapter).toBe(3);
    expect(ref1?.verseStart).toBe(16);
    expect(ref1?.verseEnd).toBeUndefined();

    const ref2 = db.parseReference('1 Cor 13:1-4');
    expect(ref2).not.toBeNull();
    expect(ref2?.book).toBe('1 Corinthians');
    expect(ref2?.chapter).toBe(13);
    expect(ref2?.verseStart).toBe(1);
    expect(ref2?.verseEnd).toBe(4);
  });

  it('should resolve loose abbreviation formats', () => {
    const ref1 = db.parseReference('1cor 13 1');
    expect(ref1?.book).toBe('1 Corinthians');
    
    const ref2 = db.parseReference('psa 23');
    expect(ref2?.book).toBe('Psalms');
    expect(ref2?.chapter).toBe(23);
    expect(ref2?.verseStart).toBeUndefined();
  });

  it('should reject invalid scripture reference formats', () => {
    const ref1 = db.parseReference('Hello world');
    expect(ref1).toBeNull();

    const ref2 = db.parseReference('Genesis chapter 3');
    expect(ref2).toBeNull();
  });

  it('should query seeded verses successfully', () => {
    const verses = db.queryVerses({
      translation: 'KJV',
      book: 'John',
      chapter: 3,
      verseStart: 16
    });

    expect(verses).toHaveLength(1);
    expect(verses[0].text).toContain('For God so loved the world');
  });

  it('should resolve ranges of verses', () => {
    const verses = db.queryVerses({
      translation: 'KJV',
      book: 'Psalms',
      chapter: 23,
      verseStart: 1,
      verseEnd: 3
    });

    expect(verses).toHaveLength(3);
    expect(verses[0].verse).toBe(1);
    expect(verses[1].verse).toBe(2);
    expect(verses[2].verse).toBe(3);
  });

  describe('Bible Browser features', () => {
    it('should list all available books for a translation', () => {
      const books = db.getBooks('KJV');
      expect(books.length).toBeGreaterThan(0);
      expect(books).toContain('Genesis');
      expect(books).toContain('Revelation');
    });

    it('should return correct chapter counts', () => {
      const psCount = db.getChapterCount('KJV', 'Psalms');
      expect(psCount).toBe(150);
      const johnCount = db.getChapterCount('KJV', 'John');
      expect(johnCount).toBe(21);
    });

    it('should return correct verse counts for a chapter', () => {
      const john3Count = db.getVerseCount('KJV', 'John', 3);
      expect(john3Count).toBe(36);
    });
  });

  describe('Full-Text Search', () => {
    it('should find verses matching a query', () => {
      const results = db.searchText('KJV', 'God so loved the world');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].book).toBe('John');
      expect(results[0].chapter).toBe(3);
      expect(results[0].verse).toBe(16);
    });

    it('should limit search results', () => {
      const results = db.searchText('KJV', 'faith', 5);
      expect(results).toHaveLength(5);
    });
  });

  describe('Bookmarks System', () => {
    it('should add, list, and remove bookmarks', () => {
      const initialBookmarks = db.getBookmarks();
      const initialLength = initialBookmarks.length;

      const id = db.addBookmark({
        translation: 'KJV',
        book: 'John',
        chapter: 11,
        verseStart: 35,
        label: 'Shortest verse',
        createdAt: new Date().toISOString()
      });

      expect(id).toBeGreaterThan(0);

      const updatedBookmarks = db.getBookmarks();
      expect(updatedBookmarks).toHaveLength(initialLength + 1);
      expect(updatedBookmarks[0].label).toBe('Shortest verse');

      db.removeBookmark(id);
      expect(db.getBookmarks()).toHaveLength(initialLength);
    });
  });
});
