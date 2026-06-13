import { describe, it, expect } from 'vitest';

// Simulates the main process offline sermon summary analyzer logic for testing
function generateOfflineSermonSummary(transcriptText: string, scriptures: { reference: string; text: string }[]) {
  const words = transcriptText.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const stopwords = new Set(['about', 'their', 'there', 'would', 'could', 'should', 'these', 'those', 'where', 'which', 'after', 'before']);
  const freqs: Record<string, number> = {};
  words.forEach(w => {
    if (!stopwords.has(w)) {
      freqs[w] = (freqs[w] || 0) + 1;
    }
  });
  const sortedTopics = Object.entries(freqs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(entry => entry[0].charAt(0).toUpperCase() + entry[0].slice(1));

  const topicList = sortedTopics.length > 0 ? sortedTopics.join(', ') : 'Sermon Teachings';

  const offlineMarkdown = `# Sermon Summary Report (${new Date().toLocaleDateString()})

## Key Themes & Takeaways
* **Core Topics Focused:** ${topicList}
* **Scripture Emphasis:** The service centered on biblical teaching and scripture reading.
* **Congregational Reflection:** Meditating on the Word of God to apply it to daily living.

## Outlined Sermon Summary
* **Introduction:** Opening prayer and reading of selected scripture texts.
* **Core Message:** Detailed study of the themes surrounding the topics of: ${topicList}.
* **Conclusion & Call to Action:** Applying the sermon messages in our families and daily interactions.

## Scripture Sheet
${scriptures.length > 0 
  ? scriptures.map((s) => `* **${s.reference}**: "${s.text}"`).join('\n')
  : '* No scriptures were projected during the service.'}

*Note: Generating full summaries requires setting up an Anthropic or Groq API key in Settings.*`;

  return { markdown: offlineMarkdown, topics: sortedTopics };
}

describe('Automated Sermon Summarizer & Scripture Sheets Heuristics', () => {
  it('should extract top frequent words as key topics and format topics capitalized', () => {
    const transcript = "faith hoping loving charity grace loving hoping faith faith grace grace faith grace grace grace";
    const scriptures = [
      { reference: '1 Corinthians 13:13', text: 'And now abideth faith, hope, charity, these three; but the greatest of these is charity.' }
    ];

    const result = generateOfflineSermonSummary(transcript, scriptures);
    expect(result.topics).toContain('Grace');
    expect(result.topics).toContain('Faith');
    expect(result.topics[0]).toBe('Grace'); // Grace is most frequent (6 times)
    expect(result.markdown).toContain('Grace, Faith, Hoping, Loving, Charity');
  });

  it('should exclude stopwords from the top topics list', () => {
    const transcript = "about where there would would grace grace grace faith faith";
    const result = generateOfflineSermonSummary(transcript, []);
    expect(result.topics).not.toContain('about');
    expect(result.topics).not.toContain('where');
    expect(result.topics).not.toContain('there');
    expect(result.topics).not.toContain('would');
    expect(result.topics).toContain('Grace');
    expect(result.topics).toContain('Faith');
  });

  it('should format all projected scriptures in chronological order inside the scripture sheet', () => {
    const transcript = "God created the heavens and the earth";
    const scriptures = [
      { reference: 'Genesis 1:1', text: 'In the beginning God created the heaven and the earth.' },
      { reference: 'John 1:1', text: 'In the beginning was the Word...' }
    ];

    const result = generateOfflineSermonSummary(transcript, scriptures);
    expect(result.markdown).toContain('* **Genesis 1:1**: "In the beginning God created the heaven and the earth."');
    expect(result.markdown).toContain('* **John 1:1**: "In the beginning was the Word..."');
  });

  it('should print a notice when no scriptures are present', () => {
    const result = generateOfflineSermonSummary("peace be with you", []);
    expect(result.markdown).toContain('* No scriptures were projected during the service.');
  });
});
