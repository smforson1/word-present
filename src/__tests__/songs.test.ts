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

describe('Worship Songs Database CRUD and Search', () => {
  let db: BibleDatabase;

  beforeEach(async () => {
    db = new BibleDatabase();
    await db.ready();
  });

  it('should seed database with default worship songs on startup', () => {
    const songs = db.getSongs('');
    expect(songs.length).toBeGreaterThanOrEqual(3);
    
    const titles = songs.map(s => s.title);
    expect(titles).toContain('Amazing Grace');
    expect(titles).toContain('How Great Thou Art');
    expect(titles).toContain('It Is Well With My Soul');
  });

  it('should support searching songs by title, artist, or lyrics', () => {
    // Search by title
    const search1 = db.getSongs('Amazing');
    expect(search1).toHaveLength(1);
    expect(search1[0].title).toBe('Amazing Grace');

    // Search by artist
    const search2 = db.getSongs('Boberg');
    expect(search2).toHaveLength(1);
    expect(search2[0].title).toBe('How Great Thou Art');

    // Search by lyrics snippet
    const search3 = db.getSongs('sea billows roll');
    expect(search3).toHaveLength(1);
    expect(search3[0].title).toBe('It Is Well With My Soul');
  });

  it('should add, update, and delete songs successfully', () => {
    const initialSongsCount = db.getSongs('').length;

    // 1. Add song
    const songId = db.addSong({
      title: 'Cornerstone',
      artist: 'Hillsong Worship',
      lyrics: '[Verse 1]\nMy hope is built on nothing less\nJesus blood and righteousness'
    });
    expect(songId).toBeGreaterThan(0);

    const songsAfterAdd = db.getSongs('');
    expect(songsAfterAdd).toHaveLength(initialSongsCount + 1);

    const addedSong = db.getSongs('Cornerstone');
    expect(addedSong).toHaveLength(1);
    expect(addedSong[0].artist).toBe('Hillsong Worship');

    // 2. Update song
    const updateResult = db.updateSong(songId, {
      title: 'Cornerstone (Revised)',
      artist: 'Hillsong',
      lyrics: '[Verse 1]\nMy hope is built on nothing less\nJesus blood and righteousness\n\n[Chorus]\nChrist alone, Cornerstone'
    });
    expect(updateResult).toBe(true);

    const updatedSong = db.getSongs('Cornerstone (Revised)');
    expect(updatedSong).toHaveLength(1);
    expect(updatedSong[0].artist).toBe('Hillsong');
    expect(updatedSong[0].lyrics).toContain('Christ alone');

    // 3. Delete song
    const deleteResult = db.deleteSong(songId);
    expect(deleteResult).toBe(true);

    const songsAfterDelete = db.getSongs('');
    expect(songsAfterDelete).toHaveLength(initialSongsCount);

    const searchAfterDelete = db.getSongs('Cornerstone (Revised)');
    expect(searchAfterDelete).toHaveLength(0);
  });
});
