/**
 * Offline Scripture Reference Detector
 *
 * Pure regex/pattern-matching — zero internet, zero API calls.
 * Handles the patterns real preachers actually use:
 *   - "John 3:16"               (numeric reference)
 *   - "John chapter 3 verse 16" (spoken-out reference)
 *   - "John three sixteen"      (fully spoken numbers)
 *   - "First Corinthians 13"    (ordinal book prefix)
 *   - "the book of Romans 8:28" (with "book of" prefix)
 *   - "Psalm 23"                (chapter only, no verse)
 *   - "Genesis 1:1 through 3"   (verse range)
 */

import { normalizeSpokenNumbers, ExtractedReference } from './claude';

// ─────────────────────────────────────────────────────────────────────────────
// Book name → canonical name mapping
// Keys include every abbreviation and alternate spelling a preacher might say
// ─────────────────────────────────────────────────────────────────────────────
const BOOK_MAP: Record<string, string> = {
  // Old Testament
  genesis: 'Genesis', gen: 'Genesis',
  exodus: 'Exodus', exo: 'Exodus', exod: 'Exodus',
  leviticus: 'Leviticus', lev: 'Leviticus',
  numbers: 'Numbers', num: 'Numbers',
  deuteronomy: 'Deuteronomy', deut: 'Deuteronomy', deu: 'Deuteronomy',
  joshua: 'Joshua', josh: 'Joshua',
  judges: 'Judges', judg: 'Judges',
  ruth: 'Ruth',
  '1samuel': '1 Samuel', '1sam': '1 Samuel', 'first samuel': '1 Samuel',
  '2samuel': '2 Samuel', '2sam': '2 Samuel', 'second samuel': '2 Samuel',
  '1kings': '1 Kings', '1kgs': '1 Kings', 'first kings': '1 Kings',
  '2kings': '2 Kings', '2kgs': '2 Kings', 'second kings': '2 Kings',
  '1chronicles': '1 Chronicles', '1chr': '1 Chronicles', 'first chronicles': '1 Chronicles',
  '2chronicles': '2 Chronicles', '2chr': '2 Chronicles', 'second chronicles': '2 Chronicles',
  ezra: 'Ezra',
  nehemiah: 'Nehemiah', neh: 'Nehemiah',
  esther: 'Esther', esth: 'Esther',
  job: 'Job',
  psalm: 'Psalms', psalms: 'Psalms', psa: 'Psalms', ps: 'Psalms',
  proverbs: 'Proverbs', prov: 'Proverbs', pro: 'Proverbs',
  ecclesiastes: 'Ecclesiastes', eccl: 'Ecclesiastes', ecc: 'Ecclesiastes',
  'song of solomon': 'Song of Solomon', 'song of songs': 'Song of Solomon',
  'songs': 'Song of Solomon', sos: 'Song of Solomon',
  isaiah: 'Isaiah', isa: 'Isaiah',
  jeremiah: 'Jeremiah', jer: 'Jeremiah',
  lamentations: 'Lamentations', lam: 'Lamentations',
  ezekiel: 'Ezekiel', ezek: 'Ezekiel', eze: 'Ezekiel',
  daniel: 'Daniel', dan: 'Daniel',
  hosea: 'Hosea', hos: 'Hosea',
  joel: 'Joel',
  amos: 'Amos',
  obadiah: 'Obadiah', obad: 'Obadiah',
  jonah: 'Jonah', jon: 'Jonah',
  micah: 'Micah', mic: 'Micah',
  nahum: 'Nahum', nah: 'Nahum',
  habakkuk: 'Habakkuk', hab: 'Habakkuk',
  zephaniah: 'Zephaniah', zeph: 'Zephaniah', zep: 'Zephaniah',
  haggai: 'Haggai', hag: 'Haggai',
  zechariah: 'Zechariah', zech: 'Zechariah', zec: 'Zechariah',
  malachi: 'Malachi', mal: 'Malachi',

  // New Testament
  matthew: 'Matthew', matt: 'Matthew', mat: 'Matthew',
  mark: 'Mark', mrk: 'Mark',
  luke: 'Luke', luk: 'Luke',
  john: 'John', joh: 'John', jn: 'John',
  acts: 'Acts',
  romans: 'Romans', rom: 'Romans',
  '1corinthians': '1 Corinthians', '1cor': '1 Corinthians', 'first corinthians': '1 Corinthians',
  '2corinthians': '2 Corinthians', '2cor': '2 Corinthians', 'second corinthians': '2 Corinthians',
  galatians: 'Galatians', gal: 'Galatians',
  ephesians: 'Ephesians', eph: 'Ephesians',
  philippians: 'Philippians', phil: 'Philippians', php: 'Philippians',
  colossians: 'Colossians', col: 'Colossians',
  '1thessalonians': '1 Thessalonians', '1thess': '1 Thessalonians', 'first thessalonians': '1 Thessalonians',
  '2thessalonians': '2 Thessalonians', '2thess': '2 Thessalonians', 'second thessalonians': '2 Thessalonians',
  '1timothy': '1 Timothy', '1tim': '1 Timothy', 'first timothy': '1 Timothy',
  '2timothy': '2 Timothy', '2tim': '2 Timothy', 'second timothy': '2 Timothy',
  titus: 'Titus', tit: 'Titus',
  philemon: 'Philemon', phlm: 'Philemon',
  hebrews: 'Hebrews', heb: 'Hebrews',
  james: 'James', jas: 'James',
  '1peter': '1 Peter', '1pet': '1 Peter', 'first peter': '1 Peter',
  '2peter': '2 Peter', '2pet': '2 Peter', 'second peter': '2 Peter',
  '1john': '1 John', '1jn': '1 John', 'first john': '1 John',
  '2john': '2 John', '2jn': '2 John', 'second john': '2 John',
  '3john': '3 John', '3jn': '3 John', 'third john': '3 John',
  jude: 'Jude',
  revelation: 'Revelation', rev: 'Revelation', 'the revelation': 'Revelation',
};

function resolveBook(raw: string): string | null {
  const key = raw.toLowerCase().replace(/\s+/g, '').trim();
  const exactKey = Object.keys(BOOK_MAP).find(k => k.replace(/\s+/g, '') === key);
  return exactKey ? BOOK_MAP[exactKey] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Protestant Bible Book Chapter Counts (for disambiguating concatenated digits)
// ─────────────────────────────────────────────────────────────────────────────
const BOOK_CHAPTER_COUNTS: Record<string, number> = {
  'Genesis': 50, 'Exodus': 40, 'Leviticus': 27, 'Numbers': 36, 'Deuteronomy': 34,
  'Joshua': 24, 'Judges': 21, 'Ruth': 4, '1 Samuel': 31, '2 Samuel': 24,
  '1 Kings': 22, '2 Kings': 25, '1 Chronicles': 29, '2 Chronicles': 36, 'Ezra': 10,
  'Nehemiah': 13, 'Esther': 10, 'Job': 42, 'Psalms': 150, 'Proverbs': 31,
  'Ecclesiastes': 12, 'Song of Solomon': 8, 'Isaiah': 66, 'Jeremiah': 52, 'Lamentations': 5,
  'Ezekiel': 48, 'Daniel': 12, 'Hosea': 14, 'Joel': 3, 'Amos': 9,
  'Obadiah': 1, 'Jonah': 4, 'Micah': 7, 'Nahum': 3, 'Habakkuk': 3,
  'Zephaniah': 3, 'Haggai': 2, 'Zechariah': 14, 'Malachi': 4,
  'Matthew': 28, 'Mark': 16, 'Luke': 24, 'John': 21, 'Acts': 28,
  'Romans': 16, '1 Corinthians': 16, '2 Corinthians': 13, 'Galatians': 6, 'Ephesians': 6,
  'Philippians': 4, 'Colossians': 4, '1 Thessalonians': 5, '2 Thessalonians': 3, '1 Timothy': 6,
  '2 Timothy': 4, 'Titus': 3, 'Philemon': 1, 'Hebrews': 13, 'James': 5,
  '1 Peter': 5, '2 Peter': 3, '1 John': 5, '2 John': 1, '3 John': 1,
  'Jude': 1, 'Revelation': 22
};

/**
 * Splits a concatenated 2-to-4-digit string following a book name into chapter and verse.
 * Applies book chapter limits and standard disambiguation heuristics.
 */
function splitSingleNumber(book: string, numStr: string): { chapter: number; verse: number } | null {
  const maxChapters = BOOK_CHAPTER_COUNTS[book];
  if (!maxChapters) return null;

  const len = numStr.length;
  if (len === 2) {
    // "12" -> Chapter 1, Verse 2
    const ch = parseInt(numStr[0], 10);
    const vs = parseInt(numStr[1], 10);
    if (ch >= 1 && ch <= maxChapters && vs >= 1 && vs <= 176) {
      return { chapter: ch, verse: vs };
    }
  } else if (len === 3) {
    // Split 1: C=X, V=YZ (e.g. "316" -> C=3, V=16)
    const ch1 = parseInt(numStr[0], 10);
    const vs1 = parseInt(numStr.substring(1), 10);
    const split1Valid = ch1 >= 1 && ch1 <= maxChapters && vs1 >= 1 && vs1 <= 176;

    // Split 2: C=XY, V=Z (e.g. "146" -> C=14, V=6)
    const ch2 = parseInt(numStr.substring(0, 2), 10);
    const vs2 = parseInt(numStr[2], 10);
    const split2Valid = ch2 >= 1 && ch2 <= maxChapters && vs2 >= 1 && vs2 <= 176;

    if (split1Valid && split2Valid) {
      // Both valid, prefer Split 1 (1-digit chapter) as a heuristic
      return { chapter: ch1, verse: vs1 };
    } else if (split1Valid) {
      return { chapter: ch1, verse: vs1 };
    } else if (split2Valid) {
      return { chapter: ch2, verse: vs2 };
    }
  } else if (len === 4) {
    // Split 1: C=X, V=YZW (e.g. C=1, V=191 - usually invalid since max verse <= 176)
    const ch1 = parseInt(numStr[0], 10);
    const vs1 = parseInt(numStr.substring(1), 10);
    const split1Valid = ch1 >= 1 && ch1 <= maxChapters && vs1 >= 1 && vs1 <= 176;

    // Split 2: C=XY, V=ZW (e.g. "1221" -> C=12, V=21)
    const ch2 = parseInt(numStr.substring(0, 2), 10);
    const vs2 = parseInt(numStr.substring(2), 10);
    const split2Valid = ch2 >= 1 && ch2 <= maxChapters && vs2 >= 1 && vs2 <= 176;

    // Split 3: C=XYZ, V=W (e.g. "1191" -> C=119, V=1)
    const ch3 = parseInt(numStr.substring(0, 3), 10);
    const vs3 = parseInt(numStr[3], 10);
    const split3Valid = ch3 >= 1 && ch3 <= maxChapters && vs3 >= 1 && vs3 <= 176;

    // Psalms special case: prefer 3-digit chapter (100-150) if valid
    if (book === 'Psalms' && split3Valid) {
      const chVal = ch3;
      if (chVal >= 100 && chVal <= 150) {
        return { chapter: ch3, verse: vs3 };
      }
    }

    if (split2Valid) {
      return { chapter: ch2, verse: vs2 };
    } else if (split3Valid) {
      return { chapter: ch3, verse: vs3 };
    } else if (split1Valid) {
      return { chapter: ch1, verse: vs1 };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core regex patterns
//
// After spoken-number normalization, transcript text looks like:
//   "turn to john 3 16"          (from "john three sixteen")
//   "john 3:16"                   (already numeric)
//   "john chapter 3 verse 16"
//   "1 corinthians 13 4 through 7"
// ─────────────────────────────────────────────────────────────────────────────

const BOOK_NAMES_UNION = Object.keys(BOOK_MAP)
  .sort((a, b) => b.length - a.length)
  .map(k => {
    let p = k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    p = p.replace(/\s+/g, '\\s+');
    p = p.replace(/(\d)([a-z])/gi, '$1\\s*$2');
    return p;
  })
  .join('|');

const BOOK_PATTERN = `\\b(?:${BOOK_NAMES_UNION})\\b`;

// Chapter:Verse or Chapter Verse (with optional verse range)
const CHAP_VERSE_COLON = `(\\d{1,3}):(\\d{1,3})(?:\\s*[-–through]+\\s*(\\d{1,3}))?`;
const CHAP_VERSE_WORDS = `chapter\\s+(\\d{1,3})(?:(?:\\s+|\\s*[,;]\\s*|\\s*(?:verse\\s+number|verse|verses)\\s*|\\s*[,;]\\s*(?:verse\\s+number|verse|verses)\\s*)(\\d{1,3})(?:\\s*(?:through|-|to)\\s*(\\d{1,3}))?)?`;
const CHAP_VERSE_SPACE = `(\\d{1,3})(?:\\s+|\\s*[,;]\\s*|\\s*(?:verse\\s+number|verse|verses)\\s*|\\s*[,;]\\s*(?:verse\\s+number|verse|verses)\\s*)(\\d{1,3})(?:\\s*(?:through|-|to)\\s*(\\d{1,3}))?`;
const CHAP_VERSE_SINGLE = `(\\d{2,4})`;

// Full patterns — ordered most-specific to least-specific
const PATTERNS: Array<{ re: RegExp; groups: 'colon' | 'words' | 'space' | 'single' }> = [
  {
    re: new RegExp(
      `(?:book\\s+of\\s+|turn\\s+to\\s+|open\\s+to\\s+|found\\s+in\\s+|go\\s+to\\s+|in\\s+)?` +
      `(${BOOK_PATTERN})\\s+` +
      CHAP_VERSE_COLON, 'gi'),
    groups: 'colon',
  },
  {
    re: new RegExp(
      `(?:book\\s+of\\s+|turn\\s+to\\s+|open\\s+to\\s+|found\\s+in\\s+|go\\s+to\\s+|in\\s+)?` +
      `(${BOOK_PATTERN})\\s+` +
      CHAP_VERSE_WORDS, 'gi'),
    groups: 'words',
  },
  {
    re: new RegExp(
      `(?:book\\s+of\\s+|turn\\s+to\\s+|open\\s+to\\s+|found\\s+in\\s+|go\\s+to\\s+|in\\s+)?` +
      `(${BOOK_PATTERN})\\s+` +
      CHAP_VERSE_SPACE, 'gi'),
    groups: 'space',
  },
  {
    re: new RegExp(
      `(?:book\\s+of\\s+|turn\\s+to\\s+|open\\s+to\\s+|found\\s+in\\s+|go\\s+to\\s+|in\\s+)?` +
      `(${BOOK_PATTERN})\\s+` +
      CHAP_VERSE_SINGLE + `\\b`, 'gi'),
    groups: 'single',
  },
];

interface ParseResult {
  bookRaw: string;
  chapter: number;
  verse?: number;
  endVerse?: number;
  matchStart: number;
  matchEnd: number;
}

function parseMatches(text: string): ParseResult[] {
  const results: ParseResult[] = [];
  const coveredRanges: Array<[number, number]> = [];

  const isCovered = (start: number, end: number) =>
    coveredRanges.some(([s, e]) => start >= s && end <= e);

  for (const { re, groups } of PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (isCovered(start, end)) continue;

      const bookRaw = (match[1] ?? '').trim();
      if (!bookRaw) continue;
      if (!resolveBook(bookRaw)) continue;

      let chapter = 0;
      let verse: number | undefined;
      let endVerse: number | undefined;

      if (groups === 'colon') {
        chapter = parseInt(match[2], 10);
        verse = parseInt(match[3], 10);
        endVerse = match[4] ? parseInt(match[4], 10) : undefined;
      } else if (groups === 'words') {
        chapter = parseInt(match[2], 10);
        verse = match[3] ? parseInt(match[3], 10) : undefined;
        endVerse = match[4] ? parseInt(match[4], 10) : undefined;
      } else if (groups === 'space') {
        chapter = parseInt(match[2], 10);
        verse = parseInt(match[3], 10);
        endVerse = match[4] ? parseInt(match[4], 10) : undefined;
      } else if (groups === 'single') {
        const bookName = resolveBook(bookRaw);
        if (!bookName) continue;
        const split = splitSingleNumber(bookName, match[2]);
        if (!split) continue;
        chapter = split.chapter;
        verse = split.verse;
      }

      if (!chapter || chapter > 150) continue;
      if (verse === undefined) continue; // Require a verse number to prevent accidental chapter-level projections
      if (verse < 1 || verse > 176) continue;

      results.push({ bookRaw, chapter, verse, endVerse, matchStart: start, matchEnd: end });
      coveredRanges.push([start, end]);
    }
  }

  // Sort by position in text
  results.sort((a, b) => a.matchStart - b.matchStart);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — mirrors the claude.ts interface so main.ts needs no changes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect scripture references using pure offline pattern matching.
 * Returns the same ExtractedReference[] shape as the Claude function.
 */
export function detectScriptureReferencesOffline(text: string): ExtractedReference[] {
  if (!text.trim()) return [];

  // Normalize spoken numbers first ("three sixteen" → "3 16")
  const normalized = normalizeSpokenNumbers(text);

  const matches = parseMatches(normalized);

  const seen = new Set<string>();
  const refs: ExtractedReference[] = [];

  for (const m of matches) {
    const book = resolveBook(m.bookRaw);
    if (!book) continue;

    const key = `${book}|${m.chapter}|${m.verse ?? ''}|${m.endVerse ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    refs.push({
      book,
      chapter: m.chapter,
      verse: m.verse,
      endVerse: m.endVerse,
    });
  }

  return refs;
}

/**
 * Format scripture references in transcript text into clean standard citations.
 * (e.g., "Genesis chapter 1 verse 1" -> "Genesis 1:1")
 */
export function formatScripturesInText(text: string): string {
  if (!text.trim()) return text;

  const normalized = normalizeSpokenNumbers(text);
  const matches = parseMatches(normalized);

  if (matches.length === 0) {
    return text;
  }

  // Iterate backwards to replace matched ranges in normalized text
  let result = normalized;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const book = resolveBook(m.bookRaw);
    if (!book) continue;

    const formattedRef = `${book} ${m.chapter}:${m.verse}${m.endVerse ? '-' + m.endVerse : ''}`;
    result = result.substring(0, m.matchStart) + formattedRef + result.substring(m.matchEnd);
  }

  return result;
}

