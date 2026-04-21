import 'dotenv/config';

import { classify } from './classifier.js';
import { fetchGTrendsEvents } from './crawlers/gtrends.js';
import { fetchRssEvents } from './crawlers/rss.js';
import { uploadEvents } from './uploader.js';

function dedupeEvents(events) {
    const seen = new Set();

    return events.filter((event) => {
        const key = `${event.title}::${event.event_date}`;
        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

function countBySource(events) {
    return events.reduce((counts, event) => {
        counts[event.source_name] = (counts[event.source_name] ?? 0) + 1;
        return counts;
    }, {});
}

async function main() {
    const [rssEvents, gtrendsEvents] = await Promise.all([
        fetchRssEvents(),
        fetchGTrendsEvents(),
    ]);

    const merged = dedupeEvents([...rssEvents, ...gtrendsEvents]);
    const classified = merged.map((event) => {
        const category = classify(event.title);
        if (!category) {
            return null;
        }

        return {
            ...event,
            category,
        };
    }).filter(Boolean);

    console.log(`找到 ${classified.length} 則可分類事件`);
    console.log('各來源數量:', countBySource(classified));

    const result = await uploadEvents(classified);
    console.log(result);
}

try {
    await main();
} catch (error) {
    console.error('[political-events-crawler] failed:', error);
    process.exit(1);
}
