import { all, get, run } from "./db";

export function readCursor(source: string) {
  const ready = Boolean(get<{ value: string }>("select value from meta where key = ?", `baseline_${source}`)?.value);
  const seen = new Set(all<{ external_id: string }>("select external_id from source_cursors where source = ?", source).map((row) => row.external_id));
  return { baselined: ready, seen };
}

export function adoptStoredSitemapBaseline() {
  const ready = Boolean(get<{ value: string }>("select value from meta where key = ?", "baseline_sitemap")?.value);
  const stored = Number(get<{ c: number }>("select count(*) as c from sitemap_urls")?.c ?? 0);
  if (ready) return { adopted: false, stored };
  run("update sitemap_urls set is_new = 0");
  run("insert into meta (key, value) values ('baseline_sitemap', '1') on conflict(key) do update set value = excluded.value");
  return { adopted: true, stored };
}

export function commitCursor(source: string, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  for (const id of unique) {
    run("insert or ignore into source_cursors (source, external_id, first_seen_at) values (?, ?, ?)", source, id, new Date().toISOString());
  }
  run("insert into meta (key, value) values (?, '1') on conflict(key) do update set value = excluded.value", `baseline_${source}`);
}
