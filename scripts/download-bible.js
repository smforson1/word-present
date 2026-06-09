/**
 * download-bible.js
 * Downloads the complete KJV Bible from the aruljohn/Bible-kjv GitHub repository
 * and saves it as a single JSON file bundled with the app.
 *
 * Run: node scripts/download-bible.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://raw.githubusercontent.com/aruljohn/Bible-kjv/master';

const BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1Samuel", "2Samuel",
  "1Kings", "2Kings", "1Chronicles", "2Chronicles", "Ezra",
  "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "SongofSolomon", "Isaiah", "Jeremiah", "Lamentations",
  "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk",
  "Zephaniah", "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1Corinthians", "2Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1Thessalonians", "2Thessalonians",
  "1Timothy", "2Timothy", "Titus", "Philemon", "Hebrews",
  "James", "1Peter", "2Peter", "1John", "2John",
  "3John", "Jude", "Revelation"
];

// The display name mapping (what we store in the DB vs the filename)
const BOOK_DISPLAY_NAMES = {
  "1Samuel": "1 Samuel", "2Samuel": "2 Samuel",
  "1Kings": "1 Kings", "2Kings": "2 Kings",
  "1Chronicles": "1 Chronicles", "2Chronicles": "2 Chronicles",
  "SongofSolomon": "Song of Solomon",
  "1Corinthians": "1 Corinthians", "2Corinthians": "2 Corinthians",
  "1Thessalonians": "1 Thessalonians", "2Thessalonians": "2 Thessalonians",
  "1Timothy": "1 Timothy", "2Timothy": "2 Timothy",
  "1Peter": "1 Peter", "2Peter": "2 Peter",
  "1John": "1 John", "2John": "2 John", "3John": "3 John",
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('📖 Downloading complete KJV Bible (66 books)...\n');

  const allVerses = [];
  let totalVerses = 0;

  for (const bookFile of BOOKS) {
    const displayName = BOOK_DISPLAY_NAMES[bookFile] || bookFile;
    const url = `${BASE_URL}/${bookFile}.json`;
    
    try {
      process.stdout.write(`  Fetching ${displayName}...`);
      const bookData = await fetchJson(url);
      
      // Structure: { book: "Genesis", chapters: [ { chapter: 1, verses: [ { verse: 1, text: "..." } ] } ] }
      if (!bookData.chapters) {
        console.log(' ⚠️  Unexpected format, skipping.');
        continue;
      }

      for (const chapterData of bookData.chapters) {
        for (const verseData of chapterData.verses) {
          allVerses.push({
            translation: 'KJV',
            book: displayName,
            chapter: chapterData.chapter,
            verse: verseData.verse,
            text: verseData.text.trim()
          });
          totalVerses++;
        }
      }

      console.log(` ✅ (${bookData.chapters.length} chapters)`);
    } catch (err) {
      console.log(` ❌ Failed: ${err.message}`);
    }
  }

  console.log(`\n✅ Downloaded ${totalVerses} verses across ${BOOKS.length} books.`);

  // Save output
  const outDir = path.join(__dirname, '..', 'src', 'main', 'data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'kjv-bible.json');
  fs.writeFileSync(outPath, JSON.stringify(allVerses, null, 2), 'utf-8');
  console.log(`\n💾 Saved to: ${outPath}`);
  console.log('   Now update db.ts to load from this file when seeding the database.\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
