/**
 * transcriptStitcher.ts
 *
 * Merges overlapping transcript chunks into a single clean, continuous
 * transcript with no repeated or dropped words.
 */

const MIN_MATCH_WORDS = 2;
const MAX_SEARCH_WORDS = 30;

export interface StitcherWord {
  word: string;
  start: number;
  end: number;
  probability: number;
}

export interface StitcherInput {
  chunkIndex: number;
  text: string;
  words?: StitcherWord[];
}

export interface WordHistoryItem {
  word: string;
  absoluteStart: number;
  absoluteEnd: number;
  probability: number;
}

export class TranscriptStitcher {
  private fullTranscript = '';
  private wordHistory: WordHistoryItem[] = [];
  private strideSeconds = 4;
  private overlapSeconds = 2;
  private lastChunkIndex = -1;

  constructor(chunkSeconds = 6) {
    this.overlapSeconds = chunkSeconds > 3 ? 2 : 1;
    this.strideSeconds = chunkSeconds - this.overlapSeconds;
    if (this.strideSeconds <= 0) {
      this.strideSeconds = 1; // safety fallback
    }
  }

  setChunkSize(chunkSeconds: number) {
    this.overlapSeconds = chunkSeconds > 3 ? 2 : 1;
    this.strideSeconds = chunkSeconds - this.overlapSeconds;
    if (this.strideSeconds <= 0) {
      this.strideSeconds = 1;
    }
  }

  ingest(result: StitcherInput): string {
    const { chunkIndex, text, words } = result;

    // First chunk — no overlap to resolve
    if (this.lastChunkIndex === -1) {
      this.fullTranscript = text;
      this.addWordsToHistory(words || [], chunkIndex);
      this.lastChunkIndex = chunkIndex;
      return text;
    }

    // Skip out-of-order chunks
    if (chunkIndex <= this.lastChunkIndex) return '';

    // ── Primary method: timestamp-based deduplication ─────────────────────
    const cutoffTime = this.overlapSeconds + 0.1; // small buffer for timing jitter
    let newWords: StitcherWord[] = [];
    let newText = '';

    if (words && words.length > 0) {
      newWords = words.filter(w => w.start >= cutoffTime);
      newText = newWords.map(w => w.word).join('').trim();

      // If timestamp method gives nothing, fall back to text matching
      if (newText === '' && text.trim() !== '') {
        newText = this.textOverlapFallback(text);
        newWords = words;
      }
    } else {
      // No word timestamps — use text overlap fallback
      newText = this.textOverlapFallback(text);
      newWords = [];
    }

    // Append to full transcript with proper spacing
    if (newText) {
      const needsSpace = this.fullTranscript.length > 0 &&
                         !this.fullTranscript.endsWith(' ') &&
                         !newText.startsWith(' ');
      this.fullTranscript += (needsSpace ? ' ' : '') + newText;
    }

    this.addWordsToHistory(newWords, chunkIndex);
    this.lastChunkIndex = chunkIndex;

    return newText;
  }

  private textOverlapFallback(newText: string): string {
    const existingWords = this.fullTranscript
      .trim()
      .split(/\s+/)
      .slice(-MAX_SEARCH_WORDS);

    const newWords = newText.trim().split(/\s+/);

    let bestMatchLength = 0;
    let bestMatchPos = 0;

    // Try matching suffixes of existing text against prefixes of new text
    for (let matchLen = Math.min(existingWords.length, newWords.length, MAX_SEARCH_WORDS);
         matchLen >= MIN_MATCH_WORDS;
         matchLen--) {

      const existingSuffix = existingWords
        .slice(-matchLen)
        .map(w => normalise(w))
        .join(' ');

      const newPrefix = newWords
        .slice(0, matchLen)
        .map(w => normalise(w))
        .join(' ');

      if (existingSuffix === newPrefix) {
        bestMatchLength = matchLen;
        bestMatchPos = matchLen;
        break;
      }
    }

    if (bestMatchLength >= MIN_MATCH_WORDS) {
      // Return everything after the overlapping prefix
      return newWords.slice(bestMatchPos).join(' ');
    }

    return newText;
  }

  private addWordsToHistory(words: StitcherWord[], chunkIndex: number) {
    const chunkStartAbsolute = chunkIndex * this.strideSeconds;

    for (const w of words) {
      this.wordHistory.push({
        word: w.word,
        absoluteStart: chunkStartAbsolute + (w.start || 0),
        absoluteEnd: chunkStartAbsolute + (w.end || 0),
        probability: w.probability || 1,
      });
    }

    // Keep history bounded — 500 words is plenty for Bible quote detection
    if (this.wordHistory.length > 500) {
      this.wordHistory = this.wordHistory.slice(-500);
    }
  }

  getFullTranscript(): string {
    return this.fullTranscript;
  }

  getRecentText(seconds = 15): string {
    if (this.wordHistory.length === 0) return this.fullTranscript;

    const latestTime = this.wordHistory[this.wordHistory.length - 1].absoluteEnd;
    const cutoff = latestTime - seconds;

    const filtered = this.wordHistory
      .filter(w => w.absoluteStart >= cutoff)
      .map(w => w.word)
      .join('')
      .trim();

    return filtered || this.fullTranscript;
  }

  reset() {
    this.fullTranscript = '';
    this.wordHistory = [];
    this.lastChunkIndex = -1;
  }
}

function normalise(word: string): string {
  return word.toLowerCase().replace(/[^\w]/g, '').trim();
}
