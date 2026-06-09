import Anthropic from '@anthropic-ai/sdk';

export interface ExtractedReference {
  book: string;
  chapter: number;
  verse?: number;
  endVerse?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spoken-number normalizer
// Converts spoken word numbers (up to 150) into digits so Claude has an easier
// time parsing references like "john three sixteen" → "john 3 16"
// ─────────────────────────────────────────────────────────────────────────────
const ONES = ['zero','one','two','three','four','five','six','seven','eight','nine',
              'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen',
              'seventeen','eighteen','nineteen'];
const TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];

function wordsToNumber(word: string): number | null {
  const w = word.toLowerCase().trim();
  const onesIdx = ONES.indexOf(w);
  if (onesIdx !== -1) return onesIdx;
  const tensIdx = TENS.indexOf(w);
  if (tensIdx !== -1) return tensIdx * 10;
  return null;
}

export function normalizeSpokenNumbers(text: string): string {
  // Replace ordinals: first → 1, second → 2, third → 3
  const ordinals: Record<string, string> = {
    first: '1', second: '2', third: '3', fourth: '4', fifth: '5',
    sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10',
  };
  let result = text.replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi,
    (m) => ordinals[m.toLowerCase()] ?? m);

  // Replace compound spoken numbers: "twenty three" → "23", "thirty one" → "31"
  result = result.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_, tens, ones) => {
      const t = TENS.indexOf(tens.toLowerCase());
      const o = ONES.indexOf(ones.toLowerCase());
      if (t !== -1 && o !== -1) return String(t * 10 + o);
      return _;
    }
  );

  // Replace single spoken numbers: "sixteen" → "16" etc.
  result = result.replace(/\b([a-z]+)\b/gi, (m) => {
    const n = wordsToNumber(m);
    return n !== null ? String(n) : m;
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Local fast pre-filter
// Returns true if the text is worth sending to Claude — i.e., it contains at
// least one Bible-book name (or ordinal prefix like "first") near a number.
// This avoids API calls for pure conversational noise.
// ─────────────────────────────────────────────────────────────────────────────
const BIBLE_BOOKS = [
  'genesis','exodus','leviticus','numbers','deuteronomy','joshua','judges','ruth',
  'samuel','kings','chronicles','ezra','nehemiah','esther','job','psalm','psalms',
  'proverbs','ecclesiastes','isaiah','jeremiah','lamentations','ezekiel','daniel',
  'hosea','joel','amos','obadiah','jonah','micah','nahum','habakkuk','zephaniah',
  'haggai','zechariah','malachi','matthew','mark','luke','john','acts','romans',
  'corinthians','galatians','ephesians','philippians','colossians','thessalonians',
  'timothy','titus','philemon','hebrews','james','peter','revelation',
  // common abbreviations / short forms
  'gen','exo','lev','num','deut','josh','jdg','psa','pro','ecc','isa','jer',
  'lam','eze','dan','hos','amo','jon','mic','nah','hab','zep','hag','zec','mal',
  'matt','mrk','luk','joh','rom','cor','gal','eph','php','col','thes','tim',
  'tit','phlm','heb','jas','pet','rev',
];

const BOOK_REGEX = new RegExp(
  `\\b(${BIBLE_BOOKS.join('|')})\\b`,
  'i'
);

export function mightContainScriptureReference(text: string): boolean {
  if (!BOOK_REGEX.test(text)) return false;
  // Must also have at least one digit or number word near the book name
  const normalized = normalizeSpokenNumbers(text);
  return /\d/.test(normalized);
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude detection
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert AI Bible Scripture Reference Detector.
Your task is to analyze the provided transcript chunk from a spoken sermon and identify any spoken Bible scripture references.

The input text has already been pre-processed to convert spoken word-numbers into digits (e.g., "john three sixteen" → "john 3 16"). Use this to your advantage.

Analyze the text and output a JSON array of objects. Each object must have:
- "book": The normalized full name of the Bible book (e.g., "Genesis", "John", "1 Corinthians", "Psalms").
- "chapter": The chapter number (integer).
- "verse": The verse number (integer, optional).
- "endVerse": The ending verse number if a range is mentioned (integer, optional).

Example output:
[
  {"book": "John", "chapter": 3, "verse": 16},
  {"book": "Psalms", "chapter": 23, "verse": 1, "endVerse": 6}
]

Strict Rules:
1. Return ONLY the raw JSON array — no markdown, no explanation.
2. If no scripture reference is detected, return: []
3. Ignore casual mentions that are not clear citations.
4. Numbered books: "1 Corinthians", "2 Timothy", "1 John" — always include the number prefix.`;

export async function detectScriptureReferences(apiKey: string, transcriptText: string): Promise<ExtractedReference[]> {
  if (!apiKey || !transcriptText.trim()) return [];

  // Local pre-filter — skip API call if no book name is present
  if (!mightContainScriptureReference(transcriptText)) return [];

  // Normalize spoken numbers before sending to Claude
  const normalizedText = normalizeSpokenNumbers(transcriptText);

  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // Faster + cheaper; accuracy is sufficient for reference extraction
      max_tokens: 512,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Transcript chunk: "${normalizedText}"` }]
    });

    const contentBlock = response.content[0];
    if (!contentBlock || contentBlock.type !== 'text') return [];

    let raw = contentBlock.text.trim();
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExtractedReference[]) : [];
  } catch (error) {
    console.error('Claude API Error:', error);
    return [];
  }
}
