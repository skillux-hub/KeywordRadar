"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, RefreshCw, Waves } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { SeedSelect } from "@/components/seed-select";
import { Shell } from "@/components/shell";
import { Sparkline } from "@/components/sparkline";
import { SourceMark } from "@/components/source-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parsePage, parseSize } from "@/lib/pagination";
import { ago } from "@/lib/utils";

type Meta = {
  industries: { slug: string; nameZh: string }[];
  regions: { id: string; label: string }[];
  stages: { id: string; label: string; hint: string }[];
  sources: { id: string; nameZh: string }[];
};

type Seed = { id: number; topic: string; region: string; industry: string | null };

type Keyword = {
  id: number;
  term: string;
  stage: string;
  stageLabel: string;
  opportunity: number;
  intentLabel: string;
  firstSeen: string;
  sources: string[];
  sourceLabels: string[];
  industryLabels: string[];
  spark: number[];
  nameScore: number | null;
  independentSources?: number;
  focusIndustry?: string;
  serpShape: string;
  noveltyReason?: string;
};

type Kpis = {
  newToday: number;
  blueOcean: number;
  avgLeadHours: number | null;
  leadSamples: number;
  sourcesOk: number;
  sourcesError: number;
  sourcesTotal: number;
};

type Status = {
  running: boolean;
  phase: string;
  done: number;
  total: number;
  finishedAt: string | null;
  lastError: string;
  xDisabled: boolean;
  xMessage: string;
  kpis?: Kpis;
};

type Filters = { industry: string; source: string; stage: string; window: string; seed: string; q: string; shape: string };

export function Dashboard({ initial }: { initial?: { items: Keyword[]; total: number; summary: { total: number }; pending: Keyword[]; pendingTotal: number; rawTotal: number; excludedTotal: number; status: Status; seeds: Seed[] } }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [seeds, setSeeds] = useState<Seed[]>(initial?.seeds ?? []);
  const [status, setStatus] = useState<Status | null>(initial?.status ?? null);
  const [items, setItems] = useState<Keyword[]>(initial?.items ?? []);
  const [pending, setPending] = useState<Keyword[]>(initial?.pending ?? []);
  const [pendingTotal, setPendingTotal] = useState(initial?.pendingTotal ?? 0);
  const [rawTotal, setRawTotal] = useState(initial?.rawTotal ?? 0);
  const [rawItems, setRawItems] = useState<Keyword[]>([]);
  const [rawQuery, setRawQuery] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [excludedTotal, setExcludedTotal] = useState(initial?.excludedTotal ?? 0);
  const [excludedItems, setExcludedItems] = useState<Keyword[]>([]);
  const [showExcluded, setShowExcluded] = useState(false);
  const [archiveReady, setArchiveReady] = useState(false);
  const [summary, setSummary] = useState(initial?.summary ?? { total: 0 });
  const [loaded, setLoaded] = useState(Boolean(initial));
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [seedReady, setSeedReady] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({ industry: "", source: "", stage: "", window: "7d", seed: "", q: "", shape: "" });
  const [total, setTotal] = useState(initial?.total ?? 0);
  const seenSeeds = useRef<number[]>([]);
  const filterKey = useRef<string | null>(null);
  const router = useRouter();
  const search = useSearchParams();
  const page = parsePage(search.get("page"));
  const size = parseSize(search.get("size"));
  const pendingPage = parsePage(search.get("pendingPage"));
  const rawPage = parsePage(search.get("rawPage"));

  useEffect(() => {
    const ids = seeds.map((seed) => seed.id);
    const previous = new Set(seenSeeds.current);
    setPicked((current) => {
      const alive = current.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !previous.has(id));
      if (seenSeeds.current.length === 0 && current.length === 0) return ids;
      return [...alive, ...added];
    });
    seenSeeds.current = ids;
    setSeedReady(true);
  }, [seeds]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    if (seedReady && seeds.length && picked.length === 0) params.set("seed", "none");
    else if (picked.length > 0 && picked.length < seeds.length) params.set("seed", picked.join(","));
    return params.toString();
  }, [filters, picked, seeds.length, seedReady]);

  useEffect(() => {
    if (filterKey.current == null) {
      filterKey.current = query;
      return;
    }
    if (filterKey.current === query) return;
    filterKey.current = query;
    if (!search.get("page")) return;
    const params = new URLSearchParams(search.toString());
    params.delete("page");
    const next = params.toString();
    router.replace(next ? `/?${next}` : "/", { scroll: false });
  }, [query, router, search]);

  useEffect(() => {
    void fetch("/api/meta").then((res) => res.json()).then(setMeta);
    void fetch("/api/seeds").then((res) => res.json()).then((data) => setSeeds(data.seeds));
  }, []);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/status");
        const data = (await res.json()) as Status;
        if (!stop) {
          setStatus(data);
          if (data.lastError) setError(data.lastError);
        }
      } catch {
        if (!stop) setError("状态接口暂时不可用");
      }
    };
    void tick();
    const timer = setInterval(tick, 2500);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let stop = false;
    const tick = () => {
      fetch(`/api/keywords?${query}${query ? "&" : ""}page=${page}&size=${size}`)
        .then(async (res) => {
          if (!res.ok) throw new Error("词表加载失败");
          return res.json();
        })
        .then((data) => {
          if (stop) return;
          setItems(data.items);
          setSummary(data.summary);
          setTotal(Number(data.total || data.summary?.total || 0));
          setLoaded(true);
        })
        .catch(() => {
          if (!stop) setError("词表还没准备好");
        });
      fetch(`/api/keywords?view=pending&noise=hide&page=${pendingPage}&size=${size}`)
        .then(async (res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (stop || !data) return;
          setPending(data.items || []);
          setPendingTotal(Number(data.total || 0));
        })
        .catch(() => undefined);
    };
    tick();
    const timer = setInterval(tick, status?.running ? 4000 : 20000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [query, page, size, pendingPage, status?.running]);

  useEffect(() => {
    if (!showRaw && !showExcluded) return;
    let stop = false;
    setArchiveReady(false);
    const view = showExcluded ? "excluded" : "raw";
    const pageNo = showExcluded ? 1 : rawPage;
    fetch(`/api/keywords?view=${view}&q=${encodeURIComponent(rawQuery)}&page=${pageNo}&size=${size}`)
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (stop || !data) return;
        if (showExcluded) {
          setExcludedItems(data.items || []);
          setExcludedTotal(Number(data.total || 0));
        } else {
          setRawItems(data.items || []);
          setRawTotal(Number(data.total || 0));
        }
        setArchiveReady(true);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [showRaw, showExcluded, size, rawPage, rawQuery]);

  async function refresh() {
    setError("");
    const res = await fetch("/api/refresh", { method: "POST" });
    const data = await res.json();
    if (!data.started) setError("已有一轮采集在跑");
  }

  async function addSeed(topic: string, region: string) {
    const res = await fetch("/api/seeds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic, region }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "种子没有加上");
      return;
    }
    const next = await fetch("/api/seeds").then((item) => item.json());
    setSeeds(next.seeds);
  }

  async function removeSeed(id: number) {
    await fetch(`/api/seeds?id=${id}`, { method: "DELETE" });
    setSeeds((current) => current.filter((seed) => seed.id !== id));
  }

  const kpis = status?.kpis;
  const activeFilters = [filters.stage, filters.industry, filters.source, filters.q, filters.shape, filters.window !== "7d" ? filters.window : ""].filter(Boolean).length;

  return (
    <Shell>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-faint">Keyword radar</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]">英语市场的新词候选</h1>
          <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-muted sm:block">
            {loaded ? summary.total : "—"} 个已确认的新词在当前筛选里。要同时有独立诞生记录、历史排除，以及窗口内两组可分开来源。只有讨论、旧词、新域名或新仓库都不会进入；筛空是正常结果。上次采集 {status?.finishedAt ? ago(status.finishedAt) : status ? "还没完成" : "正在读取"}。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/export?${query}`}><Download size={15} />导出</a>
          </Button>
          <Button onClick={() => void refresh()} disabled={status?.running}>
            <RefreshCw size={15} className={status?.running ? "animate-spin" : ""} />
            {status?.running ? status.phase || "刷新中" : "立即刷新"}
          </Button>
        </div>
      </div>

      {status?.running && (
        <div className="mb-4 h-1 overflow-hidden rounded-full bg-accent">
          <div className="h-full bg-primary transition-all" style={{ width: `${status.total ? (status.done / status.total) * 100 : 8}%` }} />
        </div>
      )}

      {status?.xDisabled && <div className="mb-4 rounded-xl border border-border bg-accent px-3 py-2.5 text-sm text-muted">{status.xMessage}</div>}
      {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</div>}

      <div className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-4 sm:mb-5 sm:gap-3">
        <Kpi label="今日新词" value={kpis ? String(kpis.newToday) : "—"} hint="上海时区，首次发现" />
        <Kpi label="蓝海" value={kpis ? String(kpis.blueOcean) : "—"} hint="竞争检测标成蓝海" />
        <Kpi label="补全时间差" value={kpis?.avgLeadHours == null ? "—" : `${kpis.avgLeadHours}h`} hint={kpis?.leadSamples ? `${kpis.leadSamples} 个对照，不是收录证明` : "还没有对照样本"} />
        <Kpi label="来源健康" value={kpis ? `${kpis.sourcesOk}/${kpis.sourcesTotal}` : "—"} hint={kpis ? `${kpis.sourcesError} 个失败` : "等待状态"} />
      </div>

      <div className="mb-3">
        <SeedSelect
          seeds={seeds}
          regions={meta?.regions || []}
          selected={picked}
          onChange={setPicked}
          onAdd={addSeed}
          onRemove={removeSeed}
        />
      </div>
      <div className="mb-3 md:hidden">
        <button type="button" className="field text-left" onClick={() => setFiltersOpen(true)}>筛选{activeFilters ? ` · ${activeFilters}` : ""}</button>
      </div>
      <div className="mb-3 hidden gap-2 md:grid md:grid-cols-3 xl:grid-cols-6">
        <FilterFields meta={meta} filters={filters} setFilters={setFilters} />
      </div>
      {filtersOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="关闭筛选" onClick={() => setFiltersOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-border bg-card p-4 pb-28 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">筛选</h2>
              <button type="button" className="text-sm text-primary" onClick={() => setFiltersOpen(false)}>完成</button>
            </div>
            <div className="grid gap-2"><FilterFields meta={meta} filters={filters} setFilters={setFilters} /></div>
          </div>
        </div>
      )}

      <h2 className="mb-2 text-lg font-semibold">正式推荐 <span className="text-sm font-normal text-muted">{loaded ? total : "—"}</span></h2>
      {!loaded && <SkeletonTable />}
      {loaded && !items.length && (
        <div className="panel px-5 py-16 text-center">
          <Waves className="mx-auto text-faint" size={28} />
          <p className="mt-3 text-base font-medium">{status?.running ? "正在听早期信号" : "正式推荐是空的"}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{status?.running ? "社区和仓库会先回来，搜索校验只做辅助，不表示已经收录。" : "放宽阶段或时间，或点立即刷新。筛空是正常结果。"}</p>
        </div>
      )}

      <div className="space-y-2 md:hidden">
        {items.map((item, index) => (
          <Link key={item.id} href={`/terms/${item.id}`} className="panel block p-3.5 transition hover:border-primary/40">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] text-faint">#{index + 1} · {item.intentLabel} · {ago(item.firstSeen)}{item.focusIndustry ? ` · ${item.focusIndustry}` : ""}{item.independentSources ? ` · 独立源 ${item.independentSources}` : ""}{item.nameScore != null ? ` · 专名 ${Math.round(item.nameScore * 100)}` : ""}{item.serpShape ? ` · ${item.serpShape}` : ""}</div>
                <div className="mt-0.5 break-words text-[15px] font-medium">{item.term}</div>
              </div>
              <Score value={item.opportunity} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={`stage stage-${item.stage}`}>{item.stageLabel}</span>
              {item.sources.slice(0, 3).map((source, sourceIndex) => (
                <SourceMark key={source} id={source} label={item.sourceLabels[sourceIndex] || source} />
              ))}
            </div>
            <div className="mt-2"><Sparkline data={item.spark} /></div>
          </Link>
        ))}
      </div>

      {!!items.length && (
        <div className="panel hidden overflow-hidden md:block">
          <div className="max-h-[calc(100vh-12rem)] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="sticky top-0 z-10 bg-card text-xs text-faint">
                <tr>
                  <th className="border-b border-border px-4 py-2.5 font-medium">#</th>
                  <th className="border-b border-border px-3 py-2.5 font-medium">关键词</th>
                  <th className="border-b border-border px-3 py-2.5 font-medium">阶段</th>
                  <th className="border-b border-border px-3 py-2.5 font-medium">机会分</th>
                  <th className="border-b border-border px-3 py-2.5 font-medium">来源</th>
                  <th className="border-b border-border px-3 py-2.5 font-medium">首次发现</th>
                  <th className="border-b border-border px-3 py-2.5 font-medium">14 日</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className="transition-colors hover:bg-accent/70">
                    <td className="border-b border-border px-4 py-3 text-faint">{index + 1}</td>
                    <td className="border-b border-border px-3 py-3">
                      <Link href={`/terms/${item.id}`} className="font-medium hover:text-primary">{item.term}</Link>
                      <div className="mt-0.5 text-xs text-faint">{item.intentLabel} · {item.industryLabels.join(" / ") || "未分类"}{item.focusIndustry ? ` · 基线 ${item.focusIndustry}` : ""}{item.independentSources ? ` · 独立源 ${item.independentSources}` : ""}{item.nameScore != null ? ` · 专名 ${Math.round(item.nameScore * 100)}` : ""}{item.serpShape ? ` · ${item.serpShape}` : ""}</div>
                    </td>
                    <td className="border-b border-border px-3 py-3"><span className={`stage stage-${item.stage}`}>{item.stageLabel}</span></td>
                    <td className="border-b border-border px-3 py-3"><Score value={item.opportunity} /></td>
                    <td className="border-b border-border px-3 py-3">
                      <div className="flex max-w-[280px] flex-wrap gap-1">
                        {item.sources.slice(0, 4).map((source, sourceIndex) => (
                          <SourceMark key={source} id={source} label={item.sourceLabels[sourceIndex] || source} />
                        ))}
                      </div>
                    </td>
                    <td className="border-b border-border px-3 py-3 text-muted">{ago(item.firstSeen)}</td>
                    <td className="border-b border-border px-3 py-3"><Sparkline data={item.spark} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Pagination page={page} size={size} total={total} />
      <section className="mt-6">
        <h2 className="text-lg font-semibold">待核候选 <span className="text-sm font-normal text-muted">{loaded ? pendingTotal : "—"}</span></h2>
        <p className="mt-1 text-sm text-muted">待核只收已经绑到该实体、并且有近期创建或原始首发时间的名字。仓库地址本身不够。这里为空，只说明原始记录里还没有可证明的近期首发，不是发现质量已经达标。不是正式推荐。</p>
        <ul className="mt-3 space-y-2">
          {pending.map((item) => (
            <li key={item.id} className="panel px-4 py-3">
              <Link href={`/terms/${item.id}`} className="font-medium hover:text-primary">{item.term}</Link>
              <p className="mt-1 text-xs text-faint">{item.sourceLabels?.join("、") || "来源未标"}</p>
              <p className="mt-1 text-sm text-muted">{item.noveltyReason || "待核"}</p>
            </li>
          ))}
          {!loaded && <li className="text-sm text-muted">正在读取待验证，不是 0 条。</li>}
          {loaded && !pending.length && <li className="text-sm text-muted">待核候选这一页是空的。原始记录还有 {rawTotal} 条待补证据，默认不铺在首页。这不是质量达标。</li>}
        </ul>
        <Pagination page={pendingPage} size={size} total={pendingTotal} pageParam="pendingPage" />
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <button type="button" className="text-sm text-primary" onClick={() => { setShowExcluded(false); setShowRaw((value) => !value); }}>
              原始记录 {loaded ? rawTotal : "—"} 条。默认不展开，可搜索。
            </button>
            <button type="button" className="text-sm text-primary" onClick={() => { setShowRaw(false); setShowExcluded((value) => !value); }}>
              已排除 {loaded ? excludedTotal : "—"} 条。基线名称留在这里，不从库里删。
            </button>
          </div>
          {(showRaw || showExcluded) && (
            <>
              <Input value={rawQuery} onChange={(event) => setRawQuery(event.target.value)} placeholder={showExcluded ? "搜索已排除" : "搜索原始记录"} />
              <ul className="space-y-2">
                {(showExcluded ? excludedItems : rawItems).map((item) => (
                  <li key={item.id} className="panel px-4 py-3">
                    <Link href={`/terms/${item.id}`} className="font-medium hover:text-primary">{item.term}</Link>
                    <p className="mt-1 text-sm text-muted">{item.noveltyReason}</p>
                  </li>
                ))}
                {!(showExcluded ? excludedItems : rawItems).length && <li className="text-sm text-muted">{archiveReady ? "这一页没有匹配。换个词或翻页，记录还在库里。" : "正在读取，不是 0 条。"}</li>}
              </ul>
              {showRaw && <Pagination page={rawPage} size={size} total={rawTotal} pageParam="rawPage" />}
            </>
          )}
        </div>
      </section>
    </Shell>
  );
}

function Score({ value }: { value: number }) {
  return (
    <div className="w-16">
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-accent">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel px-4 py-3">
      <div className="text-xs text-faint">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

function FilterFields({ meta, filters, setFilters }: { meta: Meta | null; filters: Filters; setFilters: (filters: Filters) => void }) {
  return (
    <>
      <select className="field" value={filters.window} onChange={(event) => setFilters({ ...filters, window: event.target.value })}>
        <option value="24h">近 24 小时</option>
        <option value="7d">近 7 天</option>
        <option value="30d">近 30 天</option>
        <option value="all">全部时间</option>
      </select>
      <select className="field" value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value })}>
        <option value="">全部阶段</option>
        {meta?.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
      </select>
      <select className="field" value={filters.industry} onChange={(event) => setFilters({ ...filters, industry: event.target.value })}>
        <option value="">全部行业</option>
        <option value="none">未分类</option>
        {meta?.industries.map((item) => <option key={item.slug} value={item.slug}>{item.nameZh}</option>)}
      </select>
      <select className="field" value={filters.shape} onChange={(event) => setFilters({ ...filters, shape: event.target.value })}>
        <option value="">全部 SERP 形态</option>
        <option value="平台占据">平台占据</option>
        <option value="可超越">可超越</option>
        <option value="有争夺">有争夺</option>
      </select>
      <select className="field" value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}>
        <option value="">全部来源</option>
        {meta?.sources.filter((source) => source.id !== "google").map((source) => <option key={source.id} value={source.id}>{source.nameZh}</option>)}
      </select>
      <Input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="搜索关键词" />
    </>
  );
}

function SkeletonTable() {
  return (
    <div className="panel space-y-3 p-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="skel h-4 w-8" />
          <div className="skel h-4 flex-1" />
          <div className="skel h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
