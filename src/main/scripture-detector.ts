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
  const key = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  return BOOK_MAP[key] ?? null;
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

// Matches numbered book prefix: "1 ", "2 ", "3 "
const NUM_PREFIX = `(?:(?:1|2|3)\\s+)`;
// Matches "first/second/third " (already handled by normalizer → but keep as fallback)
const ORD_PREFIX = `(?:(?:1st|2nd|3rd)\\s+)`;
// Book name: 1-3 words
const BOOK_PATTERN = `(?:${NUM_PREFIX}|${ORD_PREFIX})?(?:[A-Za-z]+(?:\\s+of\\s+[A-Za-z]+)?(?:\\s+[A-Za-z]+)?)`;

// Chapter:Verse or Chapter Verse (with optional verse range)
const CHAP_VERSE_COLON = `(\\d{1,3}):(\\d{1,3})(?:\\s*[-–through]+\\s*(\\d{1,3}))?`;
const CHAP_VERSE_WORDS = `chapter\\s+(\\d{1,3})(?:\\s+(?:verse|verses)\\s+(\\d{1,3})(?:\\s*(?:through|-|to)\\s*(\\d{1,3}))?)?`;
const CHAP_VERSE_SPACE = `(\\d{1,3})\\s+(\\d{1,3})(?:\\s*(?:through|-|to)\\s*(\\d{1,3}))?`;
const CHAP_ONLY       = `(\\d{1,3})`;

// Full patterns — ordered most-specific to least-specific
const PATTERNS: Array<{ re: RegExp; groups: 'colon' | 'words' | 'space' | 'chapter' }> = [
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
      `(?:book\\s+of\\s+|turn\\s+to\\s+|open\\s+to\\s+|in\\s+)` +
      `(${BOOK_PATTERN})\\s+` +
      CHAP_ONLY, 'gi'),
    groups: 'chapter',
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
      } else {
        // chapter only
        chapter = parseInt(match[2], 10);
      }

      if (!chapter || chapter > 150) continue;
      if (verse !== undefined && (verse < 1 || verse > 176)) continue;

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
