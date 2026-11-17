import { get, run } from "../db";

export function readCache(key: string, maxAgeMs: number) {
  const row = get<{ body: string; stored_at: string }>("select body, stored_at from http_cache where cache_key = ?", key);
  if (!row) return null;
  const age = Date.now() - Date.parse(row.stored_at);
  if (!Number.isFinite(age) || age > maxAgeMs) return null;
  return row.body;
}

export function writeCache(key: string, body: string) {
  run(
    `insert into http_cache (cache_key, body, stored_at) values (?, ?, ?)
     on conflict(cache_key) do update set body = excluded.body, stored_at = excluded.stored_at`,
    key,
    body.slice(0, 400000),
    new Date().toISOString(),
  );
}
