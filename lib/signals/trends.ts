export type TrendPoint = { day: string; value: number };

export function evaluateTrendsHit(series: TrendPoint[], reportedAt: string, now = Date.now()) {
  const reported = new Date(reportedAt).getTime();
  const cutoff = now - 2 * 86400000;
  const usable = series
    .map((point) => ({ time: new Date(point.day).getTime(), value: point.value }))
    .filter((point) => Number.isFinite(point.time) && point.time <= cutoff)
    .sort((a, b) => a.time - b.time);
  const before = usable.filter((point) => point.time < reported);
  const after = usable.filter((point) => point.time >= reported);
  const baseline = median(before.map((point) => point.value));
  const peak = after.reduce((max, point) => Math.max(max, point.value), 0);
  if (!before.length || !after.length) {
    return { hit: false, leadDays: null as number | null, baseline, peak, note: "报告前后的曲线不完整" };
  }
  if (baseline >= 40) {
    return { hit: false, leadDays: null, baseline, peak, note: "报告前基线已经很高，更像旧词义，不计入命中" };
  }
  const hit = peak > baseline * 2 && peak > baseline + 10;
  if (!hit) return { hit: false, leadDays: null, baseline, peak, note: "报告后没有形成足够高的新峰" };
  const crossed = after.find((point) => point.value > baseline * 2 && point.value > baseline + 10);
  const leadDays = crossed ? Math.max(0, Math.round((crossed.time - reported) / 86400000)) : null;
  return { hit: true, leadDays, baseline, peak, note: "报告后热度超过自身基线两倍，并且高出 10 点" };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function summarizeReviews(rows: { source: string; hit: boolean; leadDays: number | null }[]) {
  const groups = new Map<string, { hits: number; total: number; leads: number[] }>();
  for (const row of rows) {
    const group = groups.get(row.source) ?? { hits: 0, total: 0, leads: [] };
    group.total += 1;
    if (row.hit) {
      group.hits += 1;
      if (row.leadDays != null) group.leads.push(row.leadDays);
    }
    groups.set(row.source, group);
  }
  return [...groups.entries()].map(([source, group]) => ({
    source,
    total: group.total,
    hits: group.hits,
    hitRate: group.total ? group.hits / group.total : 0,
    medianLeadDays: group.leads.length ? median(group.leads) : null,
  }));
}
