const RSS_LIMIT = 20;

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

function extractXmlItems(xml) {
    const items = [...xml.matchAll(/<item\b[\s\S]*?>([\s\S]*?)<\/item>/gi)];

    return items.map((match) => {
        const block = match[1];
        const title = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
        const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? '';

        return { title: normalizeTitle(title), pubDate: pubDate.trim() };
    });
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'political-events-crawler/1.0',
            Accept: 'application/json,text/plain,*/*',
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
}

async function fetchText(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'political-events-crawler/1.0',
            Accept: 'application/rss+xml,application/xml,text/xml,text/plain,*/*',
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
}

async function fetchXmlEvents(url, sourceName) {
    const xml = await fetchText(url);
    const items = extractXmlItems(xml);

    return items.slice(0, RSS_LIMIT).map((item) => ({
        title: item.title,
        event_date: formatEventDate(item.pubDate),
        source_name: sourceName,
    })).filter((event) => event.title);
}

async function fetchSetnEvents() {
    try {
        const xml = await fetchText('https://www.setn.com/rss.xml');

        // Extract all items
        const items = [...xml.matchAll(/<item\b[\s\S]*?>([\s\S]*?)<\/item>/gi)];

        const events = [];

        for (const match of items) {
            if (events.length >= 10) break;

            const block = match[1];

            // Extract first link
            const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
            if (!linkMatch) continue;

            const url = linkMatch[1].trim();

            // Only include URLs with NewsID parameter
            if (!url.includes('NewsID=')) continue;

            // Extract pubDate
            const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
            const pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';

            // Fetch the article page to get the title
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            try {
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'political-events-crawler/1.0',
                        Accept: 'text/html,application/xhtml+xml,*/*',
                    },
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    console.warn(`[fetchSetnEvents] Failed to fetch ${url}: HTTP ${response.status}`);
                    continue;
                }

                const html = await response.text();

                // Extract title from <title> tag
                const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
                if (!titleMatch) {
                    console.warn(`[fetchSetnEvents] No title found in ${url}`);
                    continue;
                }

                let title = titleMatch[1].trim();

                // Remove suffixes like " - 三立新聞"
                title = title.split(/[-|｜]/)[0].trim();

                if (title) {
                    events.push({
                        title,
                        event_date: formatEventDate(pubDate),
                        source_name: '三立新聞',
                    });
                }
            } catch (error) {
                clearTimeout(timeoutId);
                console.warn(`[fetchSetnEvents] Error fetching article ${url}:`, error.message);
                continue;
            }
        }

        return events;
    } catch (error) {
        console.warn('[fetchSetnEvents] Fetch failed:', error.message);
        return [];
    }
}

export async function fetchRssEvents() {
    const sources = [
        {
            sourceName: '聯合新聞網',
            handler: () => fetchXmlEvents('https://udn.com/rssfeed/news/2/0?ch=politics', '聯合新聞網'),
        },
        {
            sourceName: '自由時報',
            handler: () => fetchXmlEvents('https://news.ltn.com.tw/rss/politics.xml', '自由時報'),
        },
        {
            sourceName: '三立新聞',
            handler: fetchSetnEvents,
        },
    ];

    const results = await Promise.all(
        sources.map(async ({ sourceName, handler }) => {
            try {
                return await handler();
            } catch (error) {
                console.warn(`[fetchRssEvents] ${sourceName} fetch failed:`, error.message);
                return [];
            }
        }),
    );

    return results.flat();
}
