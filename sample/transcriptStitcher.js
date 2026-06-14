/**
 * transcriptStitcher.js — Main Process
 *
 * Merges overlapping transcript chunks into a single clean, continuous
 * transcript with no repeated or dropped words.
 *
 * Problem: Chunk 1 ends with "...the world" and Chunk 2 starts with
 * "the world, that he gave..." — "the world" appears twice.
 *
 * Solution: Find the longest matching suffix of the previous transcript
 * that appears as a prefix of the new transcript, then join them cleanly.
 *
 * Uses word-level timestamps (from Whisper) as the primary method,
 * falling back to text-based overlap detection as a safety net.
 */

const OVERLAP_SECONDS = 2;      // must match audioCapture.js
const MIN_MATCH_WORDS = 2;      // minimum words needed to confirm an overlap match
const MAX_SEARCH_WORDS = 30;    // how far back to search for overlap in previous text

class TranscriptStitcher {
  constructor() {
    // Full stitched transcript so far
    this.fullTranscript = '';

    // Last N words with their absolute timestamps for overlap detection
    // absolute time = chunkIndex * strideSeconds + word.start
    this.wordHistory = [];   // [{word, absoluteStart, absoluteEnd, probability}]

    // Seconds of new audio per chunk (chunk - overlap)
    this.strideSeconds = 4;   // CHUNK_SECONDS(6) - OVERLAP_SECONDS(2)

    // Index of last chunk we successfully processed
    this.lastChunkIndex = -1;
  }

  /**
   * Ingest a new transcript chunk and return the newly added text only.
   *
   * @param {object} result — from transcribe.py:
   *   { chunkIndex, text, words: [{word, start, end, probability}] }
   * @returns {string} — only the new words added (not duplicates)
   */
  ingest(result) {
    const { chunkIndex, text, words } = result;

    // First chunk — no overlap to resolve
    if (this.lastChunkIndex === -1) {
      this.fullTranscript = text;
      this._addWordsToHistory(words, chunkIndex);
      this.lastChunkIndex = chunkIndex;
      return text;
    }

    // Skip out-of-order chunks (shouldn't happen, but guard anyway)
    if (chunkIndex <= this.lastChunkIndex) return '';

    // ── Primary method: timestamp-based deduplication ─────────────────────
    // The overlap region covers the last OVERLAP_SECONDS of the previous chunk,
    // which equals the first OVERLAP_SECONDS of the new chunk.
    // Any word with start < OVERLAP_SECONDS in the new chunk is likely a duplicate.

    const cutoffTime = OVERLAP_SECONDS + 0.1; // small buffer for timing jitter
    let newWords;
    let newText;

    if (words && words.length > 0) {
      newWords = words.filter(w => w.start >= cutoffTime);
      newText = newWords.map(w => w.word).join('').trim();

      // If timestamp method gives nothing (e.g. the preacher paused through
      // the overlap zone), fall back to text matching
      if (newText === '' && text.trim() !== '') {
        newText = this._textOverlapFallback(text);
        newWords = words; // keep all words since we couldn't filter by time
      }
    } else {
      // No word timestamps — use text overlap fallback
      newText = this._textOverlapFallback(text);
      newWords = [];
    }

    // Append to full transcript with proper spacing
    if (newText) {
      const needsSpace = this.fullTranscript.length > 0 &&
                         !this.fullTranscript.endsWith(' ') &&
                         !newText.startsWith(' ');
      this.fullTranscript += (needsSpace ? ' ' : '') + newText;
    }

    this._addWordsToHistory(newWords, chunkIndex);
    this.lastChunkIndex = chunkIndex;

    return newText;
  }

  /**
   * Fallback: find the longest suffix of our existing transcript that
   * appears as a prefix of the new chunk text, then return only the
   * part of the new text after that overlap.
   *
   * Example:
   *   existing:  "...For God so loved the world"
   *   new chunk: "the world, that he gave his only begotten son"
   *   overlap:   "the world"
   *   returns:   ", that he gave his only begotten son"
   */
  _textOverlapFallback(newText) {
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

    // No overlap found — return the whole new text
    // (can happen when there's a long pause and no shared words)
    return newText;
  }

  /**
   * Store words in history with absolute timestamps for future reference.
   */
  _addWordsToHistory(words, chunkIndex) {
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

  /**
   * Get the full transcript so far.
   */
  getFullTranscript() {
    return this.fullTranscript;
  }

  /**
   * Get recent words as a plain string (for Bible quote matching).
   * Returns the last N seconds of spoken words.
   */
  getRecentText(seconds = 15) {
    if (this.wordHistory.length === 0) return this.fullTranscript;

    const latestTime = this.wordHistory[this.wordHistory.length - 1].absoluteEnd;
    const cutoff = latestTime - seconds;

    return this.wordHistory
      .filter(w => w.absoluteStart >= cutoff)
      .map(w => w.word)
      .join('')
      .trim();
  }

  reset() {
    this.fullTranscript = '';
    this.wordHistory = [];
    this.lastChunkIndex = -1;
  }
}

/**
 * Normalise a word for comparison:
 * lowercase, strip punctuation, trim whitespace.
 */
function normalise(word) {
  return word.toLowerCase().replace(/[^\w]/g, '').trim();
}

module.exports = { TranscriptStitcher };
