import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { join } from 'path';
import { app } from 'electron';
import * as fs from 'fs';
import kjvBibleData from './data/kjv-bible.json';

// Simple LRU Cache
class LRUCache<K, V> {
  private max: number;
  private cache: Map<K, V>;

  constructor(max = 100) {
    this.max = max;
    this.cache = new Map<K, V>();
  }

  get(key: K): V | undefined {
    const item = this.cache.get(key);
    if (item !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  set(key: K, val: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.max) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, val);
  }

  clear(): void {
    this.cache.clear();
  }
}

export interface VerseRecord {
  id?: number;
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface ScriptureQuery {
  translation: string;
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}

export interface BookmarkRecord {
  id?: number;
  translation: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
  label: string;
  createdAt: string;
}

export interface SongRecord {
  id?: number;
  title: string;
  artist: string;
  lyrics: string;
  createdAt?: string;
}

export interface SearchResult {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  translation: string;
}

// Full 66 book abbreviation mapping
const bookNameMap: Record<string, string> = {
  // Old Testament
  "gen": "Genesis", "ge": "Genesis", "gn": "Genesis",
  "exo": "Exodus", "ex": "Exodus",
  "lev": "Leviticus", "le": "Leviticus", "lv": "Leviticus",
  "num": "Numbers", "nu": "Numbers", "nm": "Numbers", "nb": "Numbers",
  "deut": "Deuteronomy", "dt": "Deuteronomy", "de": "Deuteronomy",
  "josh": "Joshua", "jos": "Joshua", "js": "Joshua",
  "judg": "Judges", "jud": "Judges", "jdg": "Judges", "jg": "Judges",
  "ruth": "Ruth", "rut": "Ruth", "ru": "Ruth",
  "1samuel": "1 Samuel", "1sam": "1 Samuel", "1sa": "1 Samuel", "1s": "1 Samuel", "1 samuel": "1 Samuel",
  "2samuel": "2 Samuel", "2sam": "2 Samuel", "2sa": "2 Samuel", "2s": "2 Samuel", "2 samuel": "2 Samuel",
  "1kings": "1 Kings", "1ki": "1 Kings", "1kg": "1 Kings", "1k": "1 Kings", "1 kings": "1 Kings",
  "2kings": "2 Kings", "2ki": "2 Kings", "2kg": "2 Kings", "2k": "2 Kings", "2 kings": "2 Kings",
  "1chronicles": "1 Chronicles", "1chr": "1 Chronicles", "1ch": "1 Chronicles", "1 chron": "1 Chronicles", "1 chronicles": "1 Chronicles",
  "2chronicles": "2 Chronicles", "2chr": "2 Chronicles", "2ch": "2 Chronicles", "2 chron": "2 Chronicles", "2 chronicles": "2 Chronicles",
  "ezra": "Ezra", "ezr": "Ezra", "ez": "Ezra",
  "nehemiah": "Nehemiah", "neh": "Nehemiah", "ne": "Nehemiah",
  "esther": "Esther", "est": "Esther", "esth": "Esther", "es": "Esther",
  "job": "Job", "jb": "Job",
  "psalms": "Psalms", "ps": "Psalms", "psa": "Psalms", "psalm": "Psalms",
  "proverbs": "Proverbs", "prov": "Proverbs", "pr": "Proverbs", "pro": "Proverbs",
  "ecclesiastes": "Ecclesiastes", "ecc": "Ecclesiastes", "eccl": "Ecclesiastes",
  "songofsolomon": "Song of Solomon", "song": "Song of Solomon", "solomon": "Song of Solomon", "canticles": "Song of Solomon",
  "isaiah": "Isaiah", "isa": "Isaiah", "is": "Isaiah",
  "jeremiah": "Jeremiah", "jer": "Jeremiah", "je": "Jeremiah", "jr": "Jeremiah",
  "lamentations": "Lamentations", "lam": "Lamentations", "la": "Lamentations",
  "ezekiel": "Ezekiel", "eze": "Ezekiel", "ezek": "Ezekiel", "ek": "Ezekiel",
  "daniel": "Daniel", "dan": "Daniel", "da": "Daniel", "dn": "Daniel",
  "hosea": "Hosea", "hos": "Hosea", "ho": "Hosea",
  "joel": "Joel", "joe": "Joel", "jl": "Joel",
  "amos": "Amos", "amo": "Amos", "am": "Amos",
  "obadiah": "Obadiah", "obad": "Obadiah", "ob": "Obadiah",
  "jonah": "Jonah", "jon": "Jonah",
  "micah": "Micah", "mic": "Micah", "mi": "Micah",
  "nahum": "Nahum", "nah": "Nahum", "na": "Nahum",
  "habakkuk": "Habakkuk", "hab": "Habakkuk", "ha": "Habakkuk",
  "zephaniah": "Zephaniah", "zep": "Zephaniah", "zp": "Zephaniah",
  "haggai": "Haggai", "hag": "Haggai", "hg": "Haggai",
  "zechariah": "Zechariah", "zec": "Zechariah", "zc": "Zechariah",
  "malachi": "Malachi", "mal": "Malachi", "ml": "Malachi",

  // New Testament
  "matthew": "Matthew", "mat": "Matthew", "matt": "Matthew", "mt": "Matthew",
  "mark": "Mark", "mrk": "Mark", "mar": "Mark", "mk": "Mark",
  "luke": "Luke", "luk": "Luke", "lu": "Luke", "lk": "Luke",
  "john": "John", "joh": "John", "jhn": "John", "jn": "John", "jo": "John",
  "acts": "Acts", "act": "Acts", "ac": "Acts",
  "romans": "Romans", "rom": "Romans", "ro": "Romans", "rm": "Romans",
  "1corinthians": "1 Corinthians", "1cor": "1 Corinthians", "1co": "1 Corinthians", "1c": "1 Corinthians", "1 corinthians": "1 Corinthians",
  "2corinthians": "2 Corinthians", "2cor": "2 Corinthians", "2co": "2 Corinthians", "2c": "2 Corinthians", "2 corinthians": "2 Corinthians",
  "galatians": "Galatians", "gal": "Galatians", "ga": "Galatians",
  "ephesians": "Ephesians", "eph": "Ephesians", "ep": "Ephesians",
  "philippians": "Philippians", "phil": "Philippians", "php": "Philippians", "pp": "Philippians",
  "colossians": "Colossians", "col": "Colossians", "co": "Colossians",
  "1thessalonians": "1 Thessalonians", "1thess": "1 Thessalonians", "1the": "1 Thessalonians", "1th": "1 Thessalonians", "1ts": "1 Thessalonians", "1 thessalonians": "1 Thessalonians",
  "2thessalonians": "2 Thessalonians", "2thess": "2 Thessalonians", "2the": "2 Thessalonians", "2th": "2 Thessalonians", "2ts": "2 Thessalonians", "2 thessalonians": "2 Thessalonians",
  "1timothy": "1 Timothy", "1tim": "1 Timothy", "1ti": "1 Timothy", "1tm": "1 Timothy", "1 timothy": "1 Timothy",
  "2timothy": "2 Timothy", "2tim": "2 Timothy", "2ti": "2 Timothy", "2tm": "2 Timothy", "2 timothy": "2 Timothy",
  "titus": "Titus", "tit": "Titus", "ti": "Titus",
  "philemon": "Philemon", "philem": "Philemon", "phm": "Philemon", "pm": "Philemon",
  "hebrews": "Hebrews", "heb": "Hebrews", "he": "Hebrews",
  "james": "James", "jas": "James", "ja": "James",
  "1peter": "1 Peter", "1pet": "1 Peter", "1pe": "1 Peter", "1pt": "1 Peter", "1p": "1 Peter", "1 peter": "1 Peter",
  "2peter": "2 Peter", "2pet": "2 Peter", "2pe": "2 Peter", "2pt": "2 Peter", "2p": "2 Peter", "2 peter": "2 Peter",
  "1john": "1 John", "1jo": "1 John", "1jn": "1 John", "1j": "1 John", "1 john": "1 John",
  "2john": "2 John", "2jo": "2 John", "2jn": "2 John", "2j": "2 John", "2 john": "2 John",
  "3john": "3 John", "3jo": "3 John", "3jn": "3 John", "3j": "3 John", "3 john": "3 John",
  "jude": "Jude", "jde": "Jude", "jd": "Jude",
  "revelation": "Revelation", "rev": "Revelation", "re": "Revelation", "apoc": "Revelation"
};

export class BibleDatabase {
  private db: SqlJsDatabase | null = null;
  private cache: LRUCache<string, VerseRecord[]>;
  private dbPath: string;
  private _ready: Promise<void>;

  constructor() {
    this.cache = new LRUCache<string, VerseRecord[]>(200);

    // Set up database path in user data folder, fallback to current dir in dev
    let dbDir = '';
    try {
      dbDir = app.getPath('userData');
    } catch {
      dbDir = process.cwd();
    }
    this.dbPath = join(dbDir, 'bible.db');

    // Initialize asynchronously but store the promise for callers to await
    this._ready = this.initAsync();
  }

  private async initAsync(): Promise<void> {
    const SQL = await initSqlJs();

    // Load existing database file if it exists, otherwise create new
    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.initSchema();
    this.seedDatabase();
    this.seedSongs();
    this.saveToDisk();
  }

  /** Wait for the database to be fully initialized */
  public async ready(): Promise<void> {
    return this._ready;
  }

  private saveToDisk(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  private initSchema() {
    if (!this.db) return;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS verses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        translation TEXT NOT NULL,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        verse INTEGER NOT NULL,
        text TEXT NOT NULL
      );
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_verses_lookup ON verses(translation, book, chapter, verse);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_verses_book ON verses(book);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_verses_text ON verses(text);`);

    // Bookmarks table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        translation TEXT NOT NULL,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        verse_start INTEGER NOT NULL,
        verse_end INTEGER,
        label TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Songs table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        artist TEXT NOT NULL DEFAULT '',
        lyrics TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_songs_lyrics ON songs(lyrics);`);
  }

  // Parse reference string like "John 3:16" or "1 Cor 13:1-4" or "Psalm 23"
  public parseReference(refStr: string): Omit<ScriptureQuery, 'translation'> | null {
    const trimmed = refStr.trim();
    // Matcher regex:
    // Group 1: Book name (could start with number, e.g. "1 John" or "1Cor" or "Genesis")
    // Group 2: Chapter number
    // Group 3: Verse start (optional, after colon or space)
    // Group 4: Verse end (optional, after hyphen)
    const regex = /^(\d?\s*[a-zA-Z\s]+)\s+(\d+)(?:[:\s]+(\d+)(?:-(\d+))?)?$/;
    const match = trimmed.match(regex);

    if (!match) {
      return null;
    }

    const rawBook = match[1].trim();
    const chapter = parseInt(match[2], 10);
    const verseStart = match[3] ? parseInt(match[3], 10) : undefined;
    const verseEnd = match[4] ? parseInt(match[4], 10) : undefined;

    const book = this.normalizeBookName(rawBook);
    if (!book) return null;

    return {
      book,
      chapter,
      verseStart,
      verseEnd
    };
  }

  private normalizeBookName(rawBook: string): string | null {
    const key = rawBook.toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
    const mapped = bookNameMap[key];
    if (mapped) return mapped;

    // Direct match check in values
    const values = Object.values(bookNameMap);
    const exactMatch = values.find(v => v.toLowerCase() === rawBook.toLowerCase());
    if (exactMatch) return exactMatch;

    return null;
  }

  public queryVerses(query: ScriptureQuery): VerseRecord[] {
    if (!this.db) return [];

    const cacheKey = `${query.translation}_${query.book}_${query.chapter}_${query.verseStart || 0}_${query.verseEnd || 0}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let records: VerseRecord[] = [];

    if (query.verseStart !== undefined) {
      if (query.verseEnd !== undefined) {
        // Range query
        const stmt = this.db.prepare(`
          SELECT * FROM verses 
          WHERE translation = ? AND book = ? AND chapter = ? AND verse >= ? AND verse <= ?
          ORDER BY verse ASC
        `);
        stmt.bind([query.translation, query.book, query.chapter, query.verseStart, query.verseEnd]);
        while (stmt.step()) {
          const row = stmt.getAsObject() as unknown as VerseRecord;
          records.push(row);
        }
        stmt.free();
      } else {
        // Single verse query
        const stmt = this.db.prepare(`
          SELECT * FROM verses 
          WHERE translation = ? AND book = ? AND chapter = ? AND verse = ?
        `);
        stmt.bind([query.translation, query.book, query.chapter, query.verseStart]);
        while (stmt.step()) {
          const row = stmt.getAsObject() as unknown as VerseRecord;
          records.push(row);
        }
        stmt.free();
      }
    } else {
      // Entire chapter query
      const stmt = this.db.prepare(`
        SELECT * FROM verses 
        WHERE translation = ? AND book = ? AND chapter = ?
        ORDER BY verse ASC
      `);
      stmt.bind([query.translation, query.book, query.chapter]);
      while (stmt.step()) {
        const row = stmt.getAsObject() as unknown as VerseRecord;
        records.push(row);
      }
      stmt.free();
    }

    this.cache.set(cacheKey, records);
    return records;
  }

  /**
   * Get the adjacent verse (next or previous) for a given reference.
   */
  public getAdjacentVerse(translation: string, book: string, chapter: number, verse: number, direction: 'next' | 'prev'): VerseRecord | null {
    if (!this.db) return null;

    // 1. Get current verse ID
    let currentId: number | null = null;
    const stmtId = this.db.prepare(`
      SELECT id FROM verses 
      WHERE translation = ? AND book = ? AND chapter = ? AND verse = ?
      LIMIT 1
    `);
    stmtId.bind([translation, book, chapter, verse]);
    if (stmtId.step()) {
      currentId = (stmtId.getAsObject() as { id: number }).id;
    }
    stmtId.free();

    if (currentId === null) return null;

    // 2. Query adjacent verse
    let result: VerseRecord | null = null;
    const queryStr = direction === 'next'
      ? `SELECT * FROM verses WHERE translation = ? AND id > ? ORDER BY id ASC LIMIT 1`
      : `SELECT * FROM verses WHERE translation = ? AND id < ? ORDER BY id DESC LIMIT 1`;

    const stmtAdj = this.db.prepare(queryStr);
    stmtAdj.bind([translation, currentId]);
    if (stmtAdj.step()) {
      result = stmtAdj.getAsObject() as unknown as VerseRecord;
    }
    stmtAdj.free();

    return result;
  }

  // ── Bible Browser Methods ──────────────────────────────────────────

  /** Get ordered list of all books for a translation */
  public getBooks(translation: string): string[] {
    if (!this.db) return [];
    const stmt = this.db.prepare(`
      SELECT DISTINCT book FROM verses WHERE translation = ? ORDER BY id ASC
    `);
    stmt.bind([translation]);
    const books: string[] = [];
    const seen = new Set<string>();
    while (stmt.step()) {
      const row = stmt.getAsObject() as { book: string };
      if (!seen.has(row.book)) {
        seen.add(row.book);
        books.push(row.book);
      }
    }
    stmt.free();
    return books;
  }

  /** Get the number of chapters in a book */
  public getChapterCount(translation: string, book: string): number {
    if (!this.db) return 0;
    const result = this.db.exec(
      `SELECT MAX(chapter) as max_ch FROM verses WHERE translation = ? AND book = ?`,
      [translation, book] as any
    );
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as number;
    }
    return 0;
  }

  /** Get the number of verses in a chapter */
  public getVerseCount(translation: string, book: string, chapter: number): number {
    if (!this.db) return 0;
    const result = this.db.exec(
      `SELECT MAX(verse) as max_v FROM verses WHERE translation = ? AND book = ? AND chapter = ?`,
      [translation, book, chapter] as any
    );
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as number;
    }
    return 0;
  }

  // ── Full-Text Search ───────────────────────────────────────────────

  /** Search verse text for a keyword/phrase */
  public searchText(translation: string, query: string, limit: number = 50): SearchResult[] {
    if (!this.db || !query.trim()) return [];

    const sanitized = query.trim().replace(/'/g, "''");
    const stmt = this.db.prepare(`
      SELECT book, chapter, verse, text, translation FROM verses
      WHERE translation = ? AND text LIKE '%' || ? || '%'
      ORDER BY id ASC
      LIMIT ?
    `);
    stmt.bind([translation, sanitized, limit]);
    const results: SearchResult[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as SearchResult;
      results.push(row);
    }
    stmt.free();
    return results;
  }

  // ── Bookmarks CRUD ─────────────────────────────────────────────────

  public addBookmark(bookmark: Omit<BookmarkRecord, 'id'>): number {
    if (!this.db) return -1;
    this.db.run(
      `INSERT INTO bookmarks (translation, book, chapter, verse_start, verse_end, label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [bookmark.translation, bookmark.book, bookmark.chapter, bookmark.verseStart,
       bookmark.verseEnd || null, bookmark.label, bookmark.createdAt] as any
    );
    const result = this.db.exec('SELECT last_insert_rowid()');
    const id = result.length > 0 ? (result[0].values[0][0] as number) : -1;
    this.saveToDisk();
    return id;
  }

  public removeBookmark(id: number): void {
    if (!this.db) return;
    this.db.run(`DELETE FROM bookmarks WHERE id = ?`, [id] as any);
    this.saveToDisk();
  }

  public getBookmarks(): BookmarkRecord[] {
    if (!this.db) return [];
    const stmt = this.db.prepare(`SELECT * FROM bookmarks ORDER BY created_at DESC`);
    const bookmarks: BookmarkRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      bookmarks.push({
        id: row.id,
        translation: row.translation,
        book: row.book,
        chapter: row.chapter,
        verseStart: row.verse_start,
        verseEnd: row.verse_end || undefined,
        label: row.label,
        createdAt: row.created_at
      });
    }
    stmt.free();
    return bookmarks;
  }

  // ── Translation Introspection ──────────────────────────────────────

  public getAvailableTranslations(): { translation: string; verseCount: number }[] {
    if (!this.db) return [];
    const stmt = this.db.prepare(`
      SELECT translation, COUNT(*) as cnt FROM verses GROUP BY translation ORDER BY translation ASC
    `);
    const results: { translation: string; verseCount: number }[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      results.push({ translation: row.translation, verseCount: row.cnt });
    }
    stmt.free();
    return results;
  }

  // ── Dynamic Translation Management ───────────────────────────────────

  /** Import a full translation into the database */
  public importTranslation(translation: string, verses: { book: string, chapter: number, verse: number, text: string }[]): boolean {
    if (!this.db) return false;
    console.log(`[BibleDB] Importing translation ${translation} with ${verses.length} verses...`);

    // Remove existing translation if it exists to avoid duplicates
    this.deleteTranslation(translation);

    this.db.run('BEGIN TRANSACTION');
    try {
      const insertStmt = this.db.prepare(`
        INSERT INTO verses (translation, book, chapter, verse, text)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const v of verses) {
        insertStmt.run([translation, v.book, v.chapter, v.verse, v.text]);
      }
      insertStmt.free();
      this.db.run('COMMIT');
      
      // Clear cache since database changed
      this.cache.clear();
      this.saveToDisk();
      return true;
    } catch (err) {
      this.db.run('ROLLBACK');
      console.error('[BibleDB] Import failed:', err);
      return false;
    }
  }

  /** Delete a translation from the database */
  public deleteTranslation(translation: string): boolean {
    if (!this.db) return false;
    
    // Don't allow deleting the last fallback translation
    const available = this.getAvailableTranslations();
    if (available.length <= 1 && available[0]?.translation === translation) {
      console.warn('[BibleDB] Cannot delete the only available translation.');
      return false;
    }

    this.db.run(`DELETE FROM verses WHERE translation = ?`, [translation] as any);
    this.cache.clear();
    this.saveToDisk();
    return true;
  }

  // ── Songs CRUD ─────────────────────────────────────────────────────

  public addSong(song: Omit<SongRecord, 'id' | 'createdAt'>): number {
    if (!this.db) return -1;
    this.db.run(
      `INSERT INTO songs (title, artist, lyrics) VALUES (?, ?, ?)`,
      [song.title, song.artist || '', song.lyrics] as any
    );
    const result = this.db.exec('SELECT last_insert_rowid()');
    const id = result.length > 0 ? (result[0].values[0][0] as number) : -1;
    this.saveToDisk();
    return id;
  }

  public updateSong(id: number, song: Omit<SongRecord, 'id' | 'createdAt'>): boolean {
    if (!this.db) return false;
    this.db.run(
      `UPDATE songs SET title = ?, artist = ?, lyrics = ? WHERE id = ?`,
      [song.title, song.artist || '', song.lyrics, id] as any
    );
    this.saveToDisk();
    return true;
  }

  public deleteSong(id: number): boolean {
    if (!this.db) return false;
    this.db.run(`DELETE FROM songs WHERE id = ?`, [id] as any);
    this.saveToDisk();
    return true;
  }

  public getSongs(query: string): SongRecord[] {
    if (!this.db) return [];
    const sanitized = query.trim().replace(/'/g, "''");
    let stmt;
    if (sanitized) {
      stmt = this.db.prepare(`
        SELECT * FROM songs 
        WHERE title LIKE '%' || ? || '%' OR artist LIKE '%' || ? || '%' OR lyrics LIKE '%' || ? || '%'
        ORDER BY title ASC
      `);
      stmt.bind([sanitized, sanitized, sanitized]);
    } else {
      stmt = this.db.prepare(`SELECT * FROM songs ORDER BY title ASC`);
    }
    const songs: SongRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      songs.push({
        id: row.id,
        title: row.title,
        artist: row.artist,
        lyrics: row.lyrics,
        createdAt: row.created_at
      });
    }
    stmt.free();
    return songs;
  }

  private seedSongs() {
    if (!this.db) return;
    const result = this.db.exec("SELECT COUNT(*) as count FROM songs");
    const count = result.length > 0 ? (result[0].values[0][0] as number) : 0;
    if (count > 0) return;

    console.log('[BibleDB] Seeding database with standard worship songs...');
    this.addSong({
      title: 'Amazing Grace',
      artist: 'John Newton',
      lyrics: `[Verse 1]\nAmazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.\n\n[Verse 2]\n'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.\n\n[Verse 3]\nThrough many dangers, toils and snares,\nI have already come;\n'Tis grace hath brought me safe thus far,\nAnd grace will lead me home.\n\n[Verse 4]\nWhen we've been there ten thousand years,\nBright shining as the sun,\nWe've no less days to sing God's praise\nThan when we first begun.`
    });

    this.addSong({
      title: 'How Great Thou Art',
      artist: 'Carl Boberg',
      lyrics: `[Verse 1]\nO Lord my God, when I in awesome wonder\nConsider all the worlds Thy hands have made\nI see the stars, I hear the rolling thunder\nThy power throughout the universe displayed\n\n[Chorus]\nThen sings my soul, my Savior God, to Thee\nHow great Thou art, how great Thou art\nThen sings my soul, my Savior God, to Thee\nHow great Thou art, how great Thou art\n\n[Verse 2]\nWhen through the woods, and forest glades I wander\nAnd hear the birds sing sweetly in the trees\nWhen I look down, from lofty mountain grandeur\nAnd hear the brook, and feel the gentle breeze\n\n[Verse 3]\nAnd when I think, that God, His Son not sparing\nSent Him to die, I scarce can take it in\nThat on the Cross, my burden gladly bearing\nHe bled and died to take away my sin`
    });

    this.addSong({
      title: 'It Is Well With My Soul',
      artist: 'Horatio Spafford',
      lyrics: `[Verse 1]\nWhen peace like a river, attendeth my way,\nWhen sorrows like sea billows roll;\nWhatever my lot, Thou hast taught me to say,\nIt is well, it is well, with my soul.\n\n[Chorus]\nIt is well (it is well)\nWith my soul (with my soul)\nIt is well, it is well with my soul.\n\n[Verse 2]\nThough Satan should buffet, though trials should come,\nLet this blest assurance control,\nThat Christ hath regarded my helpless estate,\nAnd hath shed His own blood for my soul.\n\n[Verse 3]\nMy sin, oh, the bliss of this glorious thought!\nMy sin, not in part but the whole,\nIs nailed to the cross, and I bear it no more,\nPraise the Lord, praise the Lord, O my soul!`
    });
  }

  // Seed the database with the full KJV Bible (31,102 verses)
  private seedDatabase() {
    if (!this.db) return;

    // 1. Clean up any dummy translations that have very few verses (e.g. <= 500)
    // This removes old dummy KJV, ESV, NIV, NKJV, NLT from developer builds
    try {
      const stmt = this.db.prepare(`
        SELECT translation, COUNT(*) as cnt FROM verses GROUP BY translation
      `);
      const translationsToDelete: string[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as { translation: string; cnt: number };
        if (row.cnt <= 500) {
          translationsToDelete.push(row.translation);
        }
      }
      stmt.free();

      if (translationsToDelete.length > 0) {
        console.log('[BibleDB] Cleaning up dummy translations:', translationsToDelete);
        for (const t of translationsToDelete) {
          this.db.run(`DELETE FROM verses WHERE translation = ?`, [t] as any);
        }
      }
    } catch (err) {
      console.error('[BibleDB] Cleanup of dummy translations failed:', err);
    }

    // 2. Check if KJV needs to be seeded
    const result = this.db.exec("SELECT COUNT(*) as count FROM verses WHERE translation = 'KJV'");
    const kjvCount = result.length > 0 ? (result[0].values[0][0] as number) : 0;
    
    if (kjvCount >= 31000) {
      return; // Already seeded with full KJV
    }

    console.log('[BibleDB] Seeding database with full KJV Bible...');

    // Use a transaction for fast bulk insert
    const insertStmt = this.db.prepare(`
      INSERT INTO verses (translation, book, chapter, verse, text)
      VALUES (?, ?, ?, ?, ?)
    `);

    // kjvBibleData is the full 31,102-verse KJV array bundled at build time
    const verses = kjvBibleData as unknown as Array<{ translation: string; book: string; chapter: number; verse: number; text: string }>;

    this.db.run('BEGIN TRANSACTION');
    try {
      for (const v of verses) {
        insertStmt.run([v.translation, v.book, v.chapter, v.verse, v.text]);
      }
      this.db.run('COMMIT');
      console.log(`[BibleDB] Seeded ${verses.length} KJV verses successfully.`);
    } catch (err) {
      this.db.run('ROLLBACK');
      console.error('[BibleDB] Seed failed:', err);
    }
    insertStmt.free();
  }
}
