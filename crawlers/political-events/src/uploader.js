export async function uploadEvents(events) {
    if (process.env.DRY_RUN === 'true') {
        console.log('[uploadEvents] DRY_RUN enabled, skipping upload');
        return { dry_run: true, count: events.length };
    }

    const url = `${process.env.CF_WORKER_URL}/api/v1/admin/political-events/ingest`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.PLATFORM_ADMIN_TOKEN}`,
        },
        body: JSON.stringify({ events }),
    });

    const responseText = await response.text();
    if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${responseText}`);
    }

    return responseText ? JSON.parse(responseText) : {};
}
