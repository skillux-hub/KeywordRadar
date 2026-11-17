import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_SEEDS,
  MEDIUM_TAGS,
  NEWSLETTERS,
  SITES,
  SOURCE_META,
  BOOTSTRAP_SUBREDDITS,
  BOOTSTRAP_X,
  YOUTUBE_CHANNELS,
} from "./catalog";

const globalStore = globalThis as unknown as { __radarDb?: DatabaseSync };

export type SqlRow = Record<string, unknown>;

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS seeds (
      id INTEGER PRIMARY KEY,
      topic TEXT NOT NULL,
      region TEXT NOT NULL DEFAULT 'US',
      industry TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE(topic, region)
    );
    CREATE TABLE IF NOT EXISTS x_accounts (
      id INTEGER PRIMARY KEY,
      industry TEXT NOT NULL,
      handle TEXT NOT NULL,
      display_name TEXT,
      user_id TEXT,
      status TEXT NOT NULL,
      origin TEXT NOT NULL,
      reason TEXT,
      last_fetched_at TEXT,
      UNIQUE(industry, handle)
    );
    CREATE TABLE IF NOT EXISTS subreddits (
      id INTEGER PRIMARY KEY,
      industry TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      origin TEXT NOT NULL,
      reason TEXT,
      last_fetched_at TEXT,
      UNIQUE(industry, name)
    );
    CREATE TABLE IF NOT EXISTS reddit_users (
      id INTEGER PRIMARY KEY,
      industry TEXT NOT NULL,
      username TEXT NOT NULL,
      karma INTEGER,
      status TEXT NOT NULL,
      origin TEXT NOT NULL,
      reason TEXT,
      UNIQUE(industry, username)
    );
    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY,
      industry TEXT NOT NULL,
      domain TEXT NOT NULL,
      name TEXT,
      status TEXT NOT NULL,
      origin TEXT NOT NULL,
      reason TEXT,
      last_fetched_at TEXT,
      UNIQUE(industry, domain)
    );
    CREATE TABLE IF NOT EXISTS newsletters (
      id INTEGER PRIMARY KEY,
      industry TEXT NOT NULL,
      name TEXT,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      UNIQUE(url)
    );
    CREATE TABLE IF NOT EXISTS youtube_channels (
      id INTEGER PRIMARY KEY,
      industry TEXT NOT NULL,
      name TEXT,
      channel_id TEXT NOT NULL,
      status TEXT NOT NULL,
      UNIQUE(channel_id)
    );
    CREATE TABLE IF NOT EXISTS medium_tags (
      id INTEGER PRIMARY KEY,
      industry TEXT NOT NULL,
      tag TEXT NOT NULL,
      status TEXT NOT NULL,
      UNIQUE(industry, tag)
    );
    CREATE TABLE IF NOT EXISTS source_status (
      source TEXT PRIMARY KEY,
      name_zh TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      last_run_at TEXT,
      item_count INTEGER DEFAULT 0,
      keys_hint TEXT
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY,
      trigger TEXT,
      started_at TEXT,
      finished_at TEXT,
      status TEXT,
      summary TEXT
    );
    CREATE TABLE IF NOT EXISTS job_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      running INTEGER NOT NULL DEFAULT 0,
      trigger TEXT,
      phase TEXT,
      done INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      started_at TEXT,
      finished_at TEXT,
      last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS terms (
      id INTEGER PRIMARY KEY,
      normalized TEXT NOT NULL UNIQUE,
      display TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      stage TEXT,
      discovery_score REAL DEFAULT 0,
      opportunity_score REAL DEFAULT 0,
      momentum_score REAL DEFAULT 0,
      newness_score REAL DEFAULT 0,
      intent TEXT,
      summary TEXT,
      on_suggest INTEGER DEFAULT 0,
      on_trends INTEGER DEFAULT 0,
      google_at_discovery INTEGER DEFAULT 0,
      google_first_seen_at TEXT,
      lead_hours REAL,
      influencer_count INTEGER DEFAULT 0,
      spark_json TEXT,
      checked_google_at TEXT
    );
    CREATE TABLE IF NOT EXISTS term_observations (
      id INTEGER PRIMARY KEY,
      term_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      seed_id INTEGER,
      industry TEXT,
      collected_at TEXT NOT NULL,
      count INTEGER DEFAULT 1,
      engagement REAL DEFAULT 0,
      run_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS term_evidence (
      id INTEGER PRIMARY KEY,
      term_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      industry TEXT,
      url TEXT,
      title TEXT,
      quote TEXT,
      author TEXT,
      engagement REAL,
      published_at TEXT,
      intent TEXT,
      kind TEXT,
      collected_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS term_sources (
      term_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (term_id, source)
    );
    CREATE TABLE IF NOT EXISTS term_industries (
      term_id INTEGER NOT NULL,
      industry TEXT NOT NULL,
      PRIMARY KEY (term_id, industry)
    );
    CREATE TABLE IF NOT EXISTS term_seeds (
      term_id INTEGER NOT NULL,
      seed_id INTEGER NOT NULL,
      PRIMARY KEY (term_id, seed_id)
    );
    CREATE TABLE IF NOT EXISTS feed_items (
      id INTEGER PRIMARY KEY,
      source TEXT NOT NULL,
      industry TEXT,
      external_id TEXT NOT NULL,
      author TEXT,
      title TEXT,
      text TEXT,
      url TEXT,
      engagement REAL,
      velocity REAL,
      intent TEXT,
      published_at TEXT,
      fetched_at TEXT NOT NULL,
      UNIQUE(source, external_id)
    );
    CREATE TABLE IF NOT EXISTS sitemap_urls (
      id INTEGER PRIMARY KEY,
      domain TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      lastmod TEXT,
      first_seen_at TEXT NOT NULL,
      title TEXT,
      h1 TEXT,
      description TEXT,
      is_new INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS term_analysis (
      term_id INTEGER PRIMARY KEY,
      competition_label TEXT,
      competition_score REAL,
      competition_note TEXT,
      competition_json TEXT,
      domain TEXT,
      domain_status TEXT,
      domain_registered_at TEXT,
      land_score REAL,
      land_note TEXT,
      lifecycle TEXT,
      lifecycle_confidence REAL,
      lifecycle_note TEXT,
      commercial_score REAL,
      commercial_note TEXT,
      cluster_json TEXT,
      outline_method TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS digests (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      local_date TEXT,
      trigger TEXT,
      payload_json TEXT NOT NULL,
      delivery_json TEXT
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS demand_keywords (
      id INTEGER PRIMARY KEY,
      term_id INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      decision TEXT NOT NULL,
      volume REAL,
      trend TEXT,
      note TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(term_id, keyword)
    );
    CREATE TABLE IF NOT EXISTS repo_snapshots (
      id INTEGER PRIMARY KEY,
      full_name TEXT NOT NULL,
      stars INTEGER NOT NULL,
      created_at TEXT,
      collected_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS repo_breakouts (
      full_name TEXT PRIMARY KEY,
      first_breakout_at TEXT NOT NULL,
      stars INTEGER,
      reason TEXT
    );
    CREATE TABLE IF NOT EXISTS trends_reviews (
      term_id INTEGER PRIMARY KEY,
      source TEXT,
      reviewed_at TEXT NOT NULL,
      hit INTEGER NOT NULL,
      lead_days REAL,
      baseline REAL,
      peak REAL,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_obs_term ON term_observations(term_id, collected_at);
    CREATE INDEX IF NOT EXISTS idx_evi_term ON term_evidence(term_id, source);
    CREATE TABLE IF NOT EXISTS source_posts (
      id INTEGER PRIMARY KEY,
      platform TEXT NOT NULL,
      account_key TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT,
      text TEXT,
      url TEXT,
      engagement REAL,
      score REAL,
      comments REAL,
      discussion_type TEXT,
      published_at TEXT,
      collected_at TEXT NOT NULL,
      UNIQUE(platform, account_key, external_id)
    );
    CREATE TABLE IF NOT EXISTS discovery_runs (
      id INTEGER PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      trigger TEXT,
      candidates INTEGER DEFAULT 0,
      added INTEGER DEFAULT 0,
      retired INTEGER DEFAULT 0,
      message TEXT
    );
    CREATE TABLE IF NOT EXISTS discovery_events (
      id INTEGER PRIMARY KEY,
      run_id INTEGER,
      platform TEXT NOT NULL,
      industry TEXT,
      account_key TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      score REAL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_discovery_events ON discovery_events(action, created_at);
    CREATE TABLE IF NOT EXISTS http_cache (
      cache_key TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      stored_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feed_industry ON feed_items(industry, source, fetched_at);
  `);
  db.prepare("INSERT OR IGNORE INTO job_state (id, running) VALUES (1, 0)").run();
  ensureColumn(db, "terms", "name_score", "REAL");
  ensureColumn(db, "term_analysis", "serp_shape", "TEXT");
  ensureColumn(db, "term_analysis", "platform_share", "REAL");
  ensureColumn(db, "term_analysis", "young_loosened", "INTEGER");
  ensureColumn(db, "term_analysis", "kgr", "REAL");
  ensureColumn(db, "term_analysis", "ads_present", "INTEGER");
  ensureColumn(db, "term_analysis", "page_mix_json", "TEXT");
  ensureColumn(db, "term_evidence", "channel", "TEXT");
  ensureColumn(db, "discovery_events", "evidence_url", "TEXT");
  for (const column of [
    ["x_accounts", "followers", "INTEGER"],
    ["x_accounts", "bio", "TEXT"],
    ["x_accounts", "heat_score", "REAL"],
    ["x_accounts", "posts_per_day", "REAL"],
    ["x_accounts", "avg_engagement", "REAL"],
    ["x_accounts", "trend", "REAL"],
    ["x_accounts", "stats_at", "TEXT"],
    ["x_accounts", "discovered_reason", "TEXT"],
    ["x_accounts", "retired_reason", "TEXT"],
    ["x_accounts", "relevance", "REAL"],
    ["subreddits", "subscribers", "INTEGER"],
    ["subreddits", "active_users", "INTEGER"],
    ["subreddits", "heat_score", "REAL"],
    ["subreddits", "posts_per_day", "REAL"],
    ["subreddits", "avg_engagement", "REAL"],
    ["subreddits", "trend", "REAL"],
    ["subreddits", "stats_at", "TEXT"],
    ["subreddits", "discovered_reason", "TEXT"],
    ["subreddits", "retired_reason", "TEXT"],
    ["subreddits", "relevance", "REAL"],
  ] as const) {
    ensureColumn(db, column[0], column[1], column[2]);
  }
}

function ensureColumn(db: DatabaseSync, table: string, column: string, type: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

function seed(db: DatabaseSync) {
  const now = new Date().toISOString();
  const count = (table: string) => Number(db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get()?.c ?? 0);
  if (count("seeds") === 0) {
    const stmt = db.prepare("INSERT INTO seeds (topic, region, industry, active, created_at) VALUES (?, ?, ?, 1, ?)");
    for (const seedRow of DEFAULT_SEEDS) stmt.run(seedRow.topic, seedRow.region, seedRow.industry, now);
  }
  if (count("x_accounts") === 0) {
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO x_accounts (industry, handle, display_name, status, origin, discovered_reason) VALUES (?, ?, ?, 'active', 'bootstrap', '起步种子，方便第一次发现有地方出发')",
    );
    for (const row of BOOTSTRAP_X) stmt.run(row.industry, row.handle.toLowerCase(), row.name);
  }
  if (count("subreddits") === 0) {
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO subreddits (industry, name, status, origin, discovered_reason) VALUES (?, ?, 'active', 'bootstrap', '起步板块，方便顺着侧栏和帖子继续发现')",
    );
    for (const row of BOOTSTRAP_SUBREDDITS) stmt.run(row.industry, row.name);
  }
  if (count("sites") === 0) {
    const stmt = db.prepare("INSERT OR IGNORE INTO sites (industry, domain, name, status, origin) VALUES (?, ?, ?, 'active', 'seed')");
    for (const row of SITES) stmt.run(row.industry, row.domain.toLowerCase(), row.name);
  }
  if (count("newsletters") === 0) {
    const stmt = db.prepare("INSERT OR IGNORE INTO newsletters (industry, name, url, status) VALUES (?, ?, ?, 'active')");
    for (const row of NEWSLETTERS) stmt.run(row.industry, row.name, row.url);
  }
  if (count("youtube_channels") === 0) {
    const stmt = db.prepare("INSERT OR IGNORE INTO youtube_channels (industry, name, channel_id, status) VALUES (?, ?, ?, 'active')");
    for (const row of YOUTUBE_CHANNELS) stmt.run(row.industry, row.name, row.channelId);
  }
  if (count("medium_tags") === 0) {
    const stmt = db.prepare("INSERT OR IGNORE INTO medium_tags (industry, tag, status) VALUES (?, ?, 'active')");
    for (const row of MEDIUM_TAGS) stmt.run(row.industry, row.tag);
  }
  const src = db.prepare(
    `INSERT OR IGNORE INTO source_status (source, name_zh, role, status, message, item_count, keys_hint)
     VALUES (?, ?, ?, 'idle', '尚未运行', 0, ?)`,
  );
  for (const source of SOURCE_META) src.run(source.id, source.nameZh, source.role, source.keys);
}

export function getDb() {
  if (!globalStore.__radarDb) {
    const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, "radar.db"));
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    migrate(db);
    seed(db);
    globalStore.__radarDb = db;
  }
  return globalStore.__radarDb;
}

export function all<T = SqlRow>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function get<T = SqlRow>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: unknown[]) {
  return getDb().prepare(sql).run(...params);
}

export function num(value: unknown) {
  const n = typeof value === "bigint" ? Number(value) : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
