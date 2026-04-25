#!/usr/bin/env python3
import re
import sqlite3
from pathlib import Path


SOURCE = Path(__file__).resolve().parents[1] / "src" / "index.js"
TEXT = SOURCE.read_text()


def extract_insert_sql():
    match = re.search(
        r"INSERT INTO platform_uploads\s*\((.*?)\)\s*VALUES\s*\((.*?)\)",
        TEXT,
        re.S,
    )
    if not match:
        raise RuntimeError("platform_uploads insert SQL not found")
    return f"INSERT INTO platform_uploads ({match.group(1)}) VALUES ({match.group(2)})"


def extract_platform_alters():
    return re.findall(r"ALTER TABLE platform_uploads ADD COLUMN [^`']+|'ALTER TABLE platform_uploads ADD COLUMN [^']+'|`ALTER TABLE platform_uploads ADD COLUMN [^`]+`", TEXT)


def normalize_sql_string(token):
    token = token.strip()
    if token.startswith("`") and token.endswith("`"):
        return token[1:-1]
    if token.startswith("'") and token.endswith("'"):
        return token[1:-1]
    return token


def fresh_schema(conn):
    conn.executescript(
        """
        CREATE TABLE platform_uploads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          schema TEXT NOT NULL,
          source_app TEXT NOT NULL,
          exporter_version TEXT,
          timezone TEXT,
          locale TEXT,
          upload_source TEXT NOT NULL DEFAULT 'extension',
          payload_hash TEXT NOT NULL UNIQUE,
          block_event_count INTEGER NOT NULL DEFAULT 0,
          report_event_count INTEGER NOT NULL DEFAULT 0,
          total_event_count INTEGER NOT NULL DEFAULT 0,
          source_post_count INTEGER NOT NULL DEFAULT 0,
          topic_seed_count INTEGER NOT NULL DEFAULT 0,
          source_coverage_pct INTEGER NOT NULL DEFAULT 0,
          report_source_coverage_pct INTEGER NOT NULL DEFAULT 0,
          source_concentration_pct REAL NOT NULL DEFAULT 0,
          repeated_narrative_pct REAL NOT NULL DEFAULT 0,
          short_term_diffusion_pct REAL NOT NULL DEFAULT 0,
          client_source_id TEXT,
          client_platform TEXT,
          ip_hash TEXT,
          taxonomy_version TEXT NOT NULL DEFAULT 'topic-taxonomy.v1',
          trust_tier TEXT NOT NULL DEFAULT 'probation',
          risk_score_band TEXT NOT NULL DEFAULT 'low',
          sync_enabled INTEGER,
          upload_trigger TEXT,
          note TEXT
        );
        """
    )


def legacy_schema(conn):
    conn.executescript(
        """
        CREATE TABLE platform_uploads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          schema TEXT NOT NULL,
          source_app TEXT NOT NULL,
          exporter_version TEXT,
          timezone TEXT,
          locale TEXT,
          payload_hash TEXT NOT NULL UNIQUE,
          block_event_count INTEGER NOT NULL DEFAULT 0,
          report_event_count INTEGER NOT NULL DEFAULT 0,
          total_event_count INTEGER NOT NULL DEFAULT 0,
          source_post_count INTEGER NOT NULL DEFAULT 0,
          topic_seed_count INTEGER NOT NULL DEFAULT 0,
          source_coverage_pct INTEGER NOT NULL DEFAULT 0,
          report_source_coverage_pct INTEGER NOT NULL DEFAULT 0,
          client_source_id TEXT,
          client_platform TEXT,
          ip_hash TEXT
        );
        """
    )
    for raw in extract_platform_alters():
        sql = normalize_sql_string(raw)
        try:
            conn.execute(sql)
        except sqlite3.OperationalError as exc:
            if "duplicate column name" in str(exc):
                continue
            raise


def insert_platform_upload(conn):
    sql = extract_insert_sql()
    payload = (
        "threadsblocker.platform_upload.v2",
        "ThreadsBlocker",
        "2.6.0-beta62",
        "Asia/Taipei",
        "zh-TW",
        "hash-123",
        1,
        2,
        3,
        1,
        1,
        90,
        80,
        75.5,
        40.5,
        35.0,
        "client-abc",
        "chrome_extension",
        "iphash",
        "topic-taxonomy.v1",
        "trusted",
        "low",
        1,
        "manual",
        '{"ok":true}',
    )
    conn.execute(sql, payload)
    row = conn.execute(
        "SELECT upload_source, source_concentration_pct, repeated_narrative_pct, short_term_diffusion_pct, upload_trigger, note FROM platform_uploads"
    ).fetchone()
    assert row == ("extension", 75.5, 40.5, 35.0, "manual", '{"ok":true}')


def main():
    for name, schema_builder in (("fresh", fresh_schema), ("legacy", legacy_schema)):
        conn = sqlite3.connect(":memory:")
        schema_builder(conn)
        insert_platform_upload(conn)
        conn.close()
        print(f"{name}: ok")


if __name__ == "__main__":
    main()
