const G_TRENDS_LIMIT = 15;

function normalizeTitle(rawTitle) {
    return rawTitle
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatEventDate(pubDate) {
    const parsed = new Date(pubDate);
    if (Number.isNaN(parsed.getTime())) {
        return new Date().toISOString().slice(0, 10);
    }

    return parsed.toISOString().slice(0, 10);
}

export async function fetchGTrendsEvents() {
    try {
        const response = await fetch('https://trends.google.com/trending/rss?geo=TW', {
            headers: {
                'User-Agent': 'political-events-crawler/1.0',
                Accept: 'application/rss+xml,application/xml,text/xml,text/plain,*/*',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const xml = await response.text();
        const items = [...xml.matchAll(/<item\b[\s\S]*?>([\s\S]*?)<\/item>/gi)];

        const allEvents = [];
        for (const match of items) {
            const block = match[1];
            const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? '';
            const newsItemTitles = [...block.matchAll(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/gi)];

            for (const titleMatch of newsItemTitles) {
                const title = titleMatch[1];
                allEvents.push({
                    title: normalizeTitle(title),
                    event_date: formatEventDate(pubDate.trim()),
                    source_name: 'Google Trends TW',
                });
            }
        }

        return allEvents.slice(0, G_TRENDS_LIMIT).filter((event) => event.title);
    } catch (error) {
        console.warn('[fetchGTrendsEvents] Google Trends fetch failed:', error.message);
        return [];
    }
}
