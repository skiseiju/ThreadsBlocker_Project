#!/usr/bin/env node
/**
 * 本機診斷接收端。beta 版 extension 會把 runtime diagnostics 直接 POST 過來，
 * 開發端不必再請使用者手動複製貼上，也不需要開 Chrome 的除錯埠或給終端機
 * 完整磁碟存取權。
 *
 * 只在 beta build 生效（src/config.js 的 ENABLE_BETA_DIAGNOSTICS），
 * 正式版不會送出任何東西。
 *
 * 用法：
 *   node scripts/diag-receiver.mjs            # 監聽 8787，最新一筆寫入 .ai/live-diag.json
 *   PORT=9000 node scripts/diag-receiver.mjs
 *
 * 讀取：直接看 .ai/live-diag.json（每次推送覆蓋），或看本行程的即時輸出。
 */

import { createServer } from 'node:http';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.ai', 'live-diag.json');

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

const summarize = payload => {
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    const byFeature = entries.reduce((acc, entry) => {
        const key = `${entry.feature}/${entry.stage}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const top = Object.entries(byFeature).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return `${payload?.version || '?'} | ${entries.length} 筆 | ` + top.map(([k, v]) => `${k}:${v}`).join(' ');
};

createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        res.end();
        return;
    }
    if (req.method !== 'POST') {
        res.writeHead(405, CORS);
        res.end();
        return;
    }

    let body = '';
    req.on('data', chunk => {
        body += chunk;
        // 單次推送上限，避免異常 payload 撐爆記憶體。
        if (body.length > 8 * 1024 * 1024) req.destroy();
    });
    req.on('end', async () => {
        res.writeHead(204, CORS);
        res.end();
        try {
            const payload = JSON.parse(body);
            await mkdir(dirname(OUT), { recursive: true });
            await writeFile(OUT, JSON.stringify(payload, null, 2));
            console.log(new Date().toLocaleTimeString('zh-TW'), summarize(payload));
        } catch (error) {
            console.error('解析失敗：', error.message);
        }
    });
}).listen(PORT, '127.0.0.1', () => {
    console.log(`診斷接收端已啟動：http://127.0.0.1:${PORT}`);
    console.log(`最新一筆會寫入：${OUT}`);
});
