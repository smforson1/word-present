import { describe, it, expect, beforeEach } from 'vitest';
import { TranscriptStitcher, StitcherInput } from '../renderer/components/transcriptStitcher';

describe('TranscriptStitcher Deduplication and Stitching', () => {
  let stitcher: TranscriptStitcher;

  beforeEach(() => {
    // Default 6-second chunk size (stride is 4 seconds)
    stitcher = new TranscriptStitcher(6);
  });

  it('should ingest the first chunk as-is with no stitching', () => {
    const text1 = 'For God so loved the world';
    const result = stitcher.ingest({ chunkIndex: 0, text: text1 });
    expect(result).toBe(text1);
    expect(stitcher.getFullTranscript()).toBe(text1);
  });

  it('should skip out-of-order or duplicate chunk indices', () => {
    stitcher.ingest({ chunkIndex: 2, text: 'Hello' });
    const result1 = stitcher.ingest({ chunkIndex: 1, text: 'World' });
    const result2 = stitcher.ingest({ chunkIndex: 2, text: 'Again' });
    expect(result1).toBe('');
    expect(result2).toBe('');
    expect(stitcher.getFullTranscript()).toBe('Hello');
  });

  it('should resolve text-based suffix/prefix overlap fallback', () => {
    // Chunk 0
    stitcher.ingest({ chunkIndex: 0, text: 'For God so loved the world' });

    // Chunk 1 overlaps with "the world"
    const text2 = 'the world, that he gave';
    const result = stitcher.ingest({ chunkIndex: 1, text: text2 });

    // Stitched result should strip duplicate "the world" prefix
    expect(result).toBe('that he gave');
    expect(stitcher.getFullTranscript()).toBe('For God so loved the world that he gave');
  });

  it('should fall back to full new text if no text overlap matches', () => {
    stitcher.ingest({ chunkIndex: 0, text: 'For God so loved the world' });
    
    // There is no overlap with "In the beginning"
    const text2 = 'In the beginning was the Word';
    const result = stitcher.ingest({ chunkIndex: 1, text: text2 });

    expect(result).toBe(text2);
    expect(stitcher.getFullTranscript()).toBe('For God so loved the world In the beginning was the Word');
  });

  it('should resolve timestamp-based deduplication using cutoff time', () => {
    stitcher.ingest({ chunkIndex: 0, text: 'For God so loved' });

    // Chunk 1 has word-level timestamps.
    // Cutoff time is 2.1 seconds.
    // Words starting before 2.1s should be stripped as duplicates.
    const input: StitcherInput = {
      chunkIndex: 1,
      text: 'God so loved the world',
      words: [
        { word: 'God', start: 0.2, end: 0.5, probability: 0.99 },
        { word: ' ', start: 0.5, end: 0.6, probability: 0.99 },
        { word: 'so', start: 0.6, end: 0.9, probability: 0.99 },
        { word: ' ', start: 0.9, end: 1.0, probability: 0.99 },
        { word: 'loved', start: 1.0, end: 1.5, probability: 0.99 },
        { word: ' ', start: 1.5, end: 2.2, probability: 0.99 }, // transition
        { word: 'the', start: 2.2, end: 2.5, probability: 0.99 }, // keeps
        { word: ' ', start: 2.5, end: 2.6, probability: 0.99 },
        { word: 'world', start: 2.6, end: 3.1, probability: 0.99 } // keeps
      ]
    };

    const result = stitcher.ingest(input);
    expect(result).toBe('the world');
    expect(stitcher.getFullTranscript()).toBe('For God so loved the world');
  });

  it('should query recent text properly based on timestamps', () => {
    // Chunk 0: stride starts at 0, absolute time of word 'Word' is ~1.5s
    stitcher.ingest({
      chunkIndex: 0,
      text: 'In the beginning was the Word',
      words: [
        { word: 'In', start: 0.0, end: 0.2, probability: 0.9 },
        { word: ' ', start: 0.2, end: 0.3, probability: 0.9 },
        { word: 'the', start: 0.3, end: 0.5, probability: 0.9 },
        { word: ' ', start: 0.5, end: 0.6, probability: 0.9 },
        { word: 'beginning', start: 0.6, end: 1.0, probability: 0.9 },
        { word: ' ', start: 1.0, end: 1.1, probability: 0.9 },
        { word: 'was', start: 1.1, end: 1.3, probability: 0.9 },
        { word: ' ', start: 1.3, end: 1.4, probability: 0.9 },
        { word: 'the', start: 1.4, end: 1.5, probability: 0.9 },
        { word: ' ', start: 1.5, end: 1.6, probability: 0.9 },
        { word: 'Word', start: 1.6, end: 2.0, probability: 0.9 }
      ]
    });

    // Stride is 4s. Chunk 1 start absolute = 1 * 4 = 4s.
    // Absolute time of 'God' is 4 + 2.2 = 6.2s.
    stitcher.ingest({
      chunkIndex: 1,
      text: 'Word and the Word was God',
      words: [
        { word: 'Word', start: 0.2, end: 0.5, probability: 0.9 }, // stripped
        { word: ' ', start: 0.5, end: 0.6, probability: 0.9 },
        { word: 'and', start: 2.2, end: 2.5, probability: 0.9 }, // absolute: 6.2s - keeps
        { word: ' ', start: 2.5, end: 2.6, probability: 0.9 },
        { word: 'the', start: 2.6, end: 2.8, probability: 0.9 }, // absolute: 6.6s - keeps
        { word: ' ', start: 2.8, end: 2.9, probability: 0.9 },
        { word: 'Word', start: 2.9, end: 3.2, probability: 0.9 }, // absolute: 6.9s - keeps
        { word: ' ', start: 3.2, end: 3.3, probability: 0.9 },
        { word: 'was', start: 3.3, end: 3.6, probability: 0.9 }, // absolute: 7.3s - keeps
        { word: ' ', start: 3.6, end: 3.7, probability: 0.9 },
        { word: 'God', start: 3.7, end: 4.1, probability: 0.9 }  // absolute: 8.1s - keeps
      ]
    });

    // Recent 3 seconds should capture absolute times >= 5.1s (8.1 - 3.0)
    // Absolute times of chunk 1 kept words are: 6.2, 6.6, 6.9, 7.3, 8.1.
    // They are all >= 5.1s.
    // Word absolute times of chunk 0 are around 0.0 - 2.0s, which are < 5.1s.
    // So recent 3 seconds should return only the keeps from chunk 1: 'and the Word was God'
    const recent = stitcher.getRecentText(3);
    expect(recent).toBe('and the Word was God');
  });

  it('should adjust overlap and stride dynamically based on chunk size', () => {
    // When chunkSeconds <= 3, overlap should be 1 second, stride should be chunk - 1
    const stitcher3 = new TranscriptStitcher(3);
    
    // Ingest first chunk
    stitcher3.ingest({ chunkIndex: 0, text: 'For God so' });
    
    // Chunk 1 has word-level timestamps.
    // Cutoff time is 1.1s (1 + 0.1).
    // Words starting before 1.1s should be stripped as duplicates.
    const input: StitcherInput = {
      chunkIndex: 1,
      text: 'so loved the world',
      words: [
        { word: 'so', start: 0.5, end: 0.8, probability: 0.99 },   // stripped (< 1.1s)
        { word: ' ', start: 0.8, end: 0.9, probability: 0.99 },
        { word: 'loved', start: 1.2, end: 1.5, probability: 0.99 }, // kept (>= 1.1s)
        { word: ' ', start: 1.5, end: 1.6, probability: 0.99 },
        { word: 'the', start: 1.6, end: 1.8, probability: 0.99 },   // kept
        { word: ' ', start: 1.8, end: 1.9, probability: 0.99 },
        { word: 'world', start: 1.9, end: 2.4, probability: 0.99 }  // kept
      ]
    };
    
    const result = stitcher3.ingest(input);
    expect(result).toBe('loved the world');
    expect(stitcher3.getFullTranscript()).toBe('For God so loved the world');
  });
});
