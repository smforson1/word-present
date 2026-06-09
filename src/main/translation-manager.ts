import https from 'https';
import http from 'http';
import fs from 'fs';
import { BibleDatabase } from './db';

// Format 1: thiagobodruk/bible
interface ThiagoBook {
  name: string;
  abbrev: string;
  chapters: string[][];
}

// Format 2: Flat Array (like our KJV fallback)
interface FlatVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

function httpGet(url: string, maxRedirects = 5): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 120000 }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        res.resume(); // consume the response to free memory
        return httpGet(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Failed to download translation. Status Code: ${res.statusCode}`));
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf-8');
        resolve({ statusCode: res.statusCode!, data });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Download timed out')); });
  });
}

export async function downloadOpenSourceTranslation(db: BibleDatabase, translationCode: string, url: string): Promise<boolean> {
  const { data } = await httpGet(url);

  // Strip BOM if present
  const cleaned = data.charCodeAt(0) === 0xFEFF ? data.slice(1) : data;

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e: any) {
    throw new Error(`Failed to parse downloaded JSON: ${e?.message ?? 'invalid JSON'}. Response size: ${data.length} bytes.`);
  }
  return importParsedTranslation(db, translationCode, parsed);
}

export async function importLocalFile(db: BibleDatabase, filePath: string, translationCode: string): Promise<boolean> {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(data);
    return importParsedTranslation(db, translationCode, parsed);
  } catch (err) {
    console.error('Failed to import local file', err);
    return false;
  }
}

// Standard Bible book names by number (1-66)
const BOOK_NAMES: Record<number, string> = {
  1: 'Genesis', 2: 'Exodus', 3: 'Leviticus', 4: 'Numbers', 5: 'Deuteronomy',
  6: 'Joshua', 7: 'Judges', 8: 'Ruth', 9: '1 Samuel', 10: '2 Samuel',
  11: '1 Kings', 12: '2 Kings', 13: '1 Chronicles', 14: '2 Chronicles',
  15: 'Ezra', 16: 'Nehemiah', 17: 'Esther', 18: 'Job', 19: 'Psalms',
  20: 'Proverbs', 21: 'Ecclesiastes', 22: 'Song of Solomon', 23: 'Isaiah',
  24: 'Jeremiah', 25: 'Lamentations', 26: 'Ezekiel', 27: 'Daniel',
  28: 'Hosea', 29: 'Joel', 30: 'Amos', 31: 'Obadiah', 32: 'Jonah',
  33: 'Micah', 34: 'Nahum', 35: 'Habakkuk', 36: 'Zephaniah', 37: 'Haggai',
  38: 'Zechariah', 39: 'Malachi', 40: 'Matthew', 41: 'Mark', 42: 'Luke',
  43: 'John', 44: 'Acts', 45: 'Romans', 46: '1 Corinthians', 47: '2 Corinthians',
  48: 'Galatians', 49: 'Ephesians', 50: 'Philippians', 51: 'Colossians',
  52: '1 Thessalonians', 53: '2 Thessalonians', 54: '1 Timothy', 55: '2 Timothy',
  56: 'Titus', 57: 'Philemon', 58: 'Hebrews', 59: 'James', 60: '1 Peter',
  61: '2 Peter', 62: '1 John', 63: '2 John', 64: '3 John', 65: 'Jude', 66: 'Revelation'
};

/** Strip HTML tags from text, decode common entities */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function importParsedTranslation(db: BibleDatabase, translationCode: string, parsedData: any): boolean {
  const verses: FlatVerse[] = [];

  if (Array.isArray(parsedData)) {
    if (parsedData.length > 0) {
      const firstItem = parsedData[0];
      
      // Check if ThiagoBodruk format
      if ('chapters' in firstItem && Array.isArray(firstItem.chapters)) {
        for (const b of parsedData as ThiagoBook[]) {
          const bookName = b.name;
          b.chapters.forEach((chapterVerses, cIdx) => {
            chapterVerses.forEach((verseText, vIdx) => {
              verses.push({
                book: bookName,
                chapter: cIdx + 1,
                verse: vIdx + 1,
                text: verseText
              });
            });
          });
        }
      } 
      // Check if Bolls Bible format (book is a number 1-66)
      else if ('book' in firstItem && 'chapter' in firstItem && 'verse' in firstItem && 'text' in firstItem
               && typeof firstItem.book === 'number') {
        for (const v of parsedData) {
          const bookNum = Number(v.book);
          const bookName = BOOK_NAMES[bookNum] || `Book_${bookNum}`;
          verses.push({
            book: bookName,
            chapter: Number(v.chapter),
            verse: Number(v.verse),
            text: stripHtml(String(v.text))
          });
        }
      }
      // Check if Flat format (book is a string name)
      else if ('book' in firstItem && 'chapter' in firstItem && 'verse' in firstItem && 'text' in firstItem) {
        for (const v of parsedData as FlatVerse[]) {
          verses.push({
            book: String(v.book),
            chapter: Number(v.chapter),
            verse: Number(v.verse),
            text: String(v.text)
          });
        }
      } else {
        throw new Error('Unrecognized JSON format. Must be thiagobodruk, Bolls, or flat array of verses.');
      }
    }
  } else if (typeof parsedData === 'object' && parsedData !== null) {
    throw new Error('Object-based JSON format not supported. Please use a flat array or ThiagoBodruk format.');
  } else {
    throw new Error('Invalid JSON format.');
  }

  if (verses.length === 0) {
    throw new Error('No verses found in the file.');
  }

  return db.importTranslation(translationCode.toUpperCase(), verses);
}
