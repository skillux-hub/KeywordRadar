import { fetchJson } from "../http";

function authHeader() {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

export function dataForSeoEnabled() {
  return Boolean(authHeader());
}

async function post<T>(path: string, body: unknown): Promise<T | null> {
  const authorization = authHeader();
  if (!authorization) return null;
  const res = await fetchJson<T>(`https://api.dataforseo.com${path}`, {
    method: "POST",
    timeoutMs: 20000,
    hostKey: "api.dataforseo.com",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok ? res.data : null;
}

export async function monthlySearchVolume(keyword: string) {
  const data = await post<{ tasks?: { result?: { search_volume?: number }[] }[] }>(
    "/v3/keywords_data/google_ads/search_volume/live",
    [{ keywords: [keyword], location_code: 2840, language_code: "en" }],
  );
  const volume = data?.tasks?.[0]?.result?.[0]?.search_volume;
  return typeof volume === "number" ? volume : null;
}

export async function trendsInterest(keyword: string) {
  const data = await post<{ tasks?: { result?: { items?: { data?: { date_from?: string; values?: number[] }[] }[] }[] }[] }>(
    "/v3/keywords_data/google_trends/explore/live",
    [{ keywords: [keyword], location_code: 2840, language_code: "en", time_range: "past_12_months", type: "web" }],
  );
  const points = data?.tasks?.[0]?.result?.[0]?.items?.[0]?.data ?? [];
  const series = points
    .map((point) => ({ day: point.date_from || "", value: point.values?.[0] ?? 0 }))
    .filter((point) => point.day);
  return series.length ? series : null;
}

export async function serpExtras(keyword: string) {
  const data = await post<{ tasks?: { result?: { items?: { type?: string; url?: string; title?: string }[]; se_results_count?: number }[] }[] }>(
    "/v3/serp/google/organic/live/advanced",
    [{ keyword: `allintitle:${keyword}`, location_code: 2840, language_code: "en", depth: 10 }],
  );
  const result = data?.tasks?.[0]?.result?.[0];
  if (!result) return { allintitle: null as number | null, ads: null as boolean | null, rows: [] as { url: string; title: string; type: string }[] };
  const rows = (result.items ?? [])
    .filter((item) => item.url)
    .map((item) => ({ url: item.url as string, title: item.title || "", type: item.type || "" }));
  return {
    allintitle: typeof result.se_results_count === "number" ? result.se_results_count : null,
    ads: rows.some((row) => row.type === "paid"),
    rows,
  };
}
