"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { Sparkline } from "@/components/sparkline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  discovery: number;
  intentLabel: string;
  summary: string;
  firstSeen: string;
  sourceLabels: string[];
  industryLabels: string[];
  spark: number[];
  onGoogle: boolean;
};

type Status = {
  running: boolean;
  phase: string;
  done: number;
  total: number;
  finishedAt: string | null;
  lastError: string;
  termCount: number;
  xDisabled: boolean;
  xMessage: string;
};

const STAGE_CLASS: Record<string, string> = {
  earliest: "border-[#b7dfc8] bg-[#e7f6ee] text-[#14643d]",
  spreading: "border-[#f0d7a4] bg-[#fff4df] text-[#8a4e08]",
  published: "border-[#c9d7ee] bg-[#eef3fb] text-[#1e4f86]",
  on_google: "border-[#f0c9d0] bg-[#fdecef] text-[#8d3d4e]",
};

export function Dashboard() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [items, setItems] = useState<Keyword[]>([]);
  const [summary, setSummary] = useState({ total: 0, earliest: 0, spreading: 0, published: 0, onGoogle: 0, avgOpportunity: 0 });
  const [error, setError] = useState("");
  const [topic, setTopic] = useState("");
  const [region, setRegion] = useState("US");
  const [industry, setIndustry] = useState("");
  const [filters, setFilters] = useState({ industry: "", source: "", stage: "", window: "7d", seed: "", q: "" });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  async function loadKeywords() {
    const res = await fetch(`/api/keywords?${query}`);
    if (!res.ok) throw new Error("词表加载失败");
    const data = await res.json();
    setItems(data.items);
    setSummary(data.summary);
  }

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
          setError(data.lastError || "");
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
      loadKeywords().catch(() => {
        if (!stop) setError("词表还没准备好");
      });
    };
    tick();
    const timer = setInterval(tick, status?.running ? 4000 : 20000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [query, status?.running]);

  async function refresh() {
    setError("");
    const res = await fetch("/api/refresh", { method: "POST" });
    const data = await res.json();
    if (!data.started) setError("已有一轮采集在跑");
  }

  async function addSeed(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/seeds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic, region, industry: industry || null }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "种子没有加上");
      return;
    }
    setTopic("");
    const data = await fetch("/api/seeds").then((item) => item.json());
    setSeeds(data.seeds);
  }

  async function removeSeed(id: number) {
    await fetch(`/api/seeds?id=${id}`, { method: "DELETE" });
    setSeeds((current) => current.filter((seed) => seed.id !== id));
  }

  return (
    <Shell>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs tracking-[0.16em] text-muted">OVERSEAS SEARCH · EARLY WINDOW</p>
          <h1 className="display mt-1 text-3xl break-words text-ink sm:text-4xl">在搜索框补全之前下手</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            发现来自 Reddit、Hacker News、GitHub、Product Hunt、Bluesky 和竞品新页面。Google 自动补全和每日趋势只用来确认：已经出现在 Google，就不再算最早的机会。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/export?${query}`}>导出 CSV</a>
          </Button>
          <Button onClick={() => void refresh()} disabled={status?.running}>
            {status?.running ? `刷新中 · ${status.phase}` : "立即刷新"}
          </Button>
        </div>
      </div>

      {status?.xDisabled && (
        <div className="mb-4 rounded-2xl border border-[#f0d7a4] bg-[#fff6e8] px-4 py-3 text-sm text-[#7a4b08]">{status.xMessage}</div>
      )}
      {error && <div className="mb-4 rounded-2xl border border-[#f0c9d0] bg-[#fff1f3] px-4 py-3 text-sm text-[#8d3d4e]">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Stat label="最早窗口" value={summary.earliest} hint="社区已出现，Google 还没有" />
        <Stat label="多源发酵" value={summary.spreading} hint="至少两个早期来源" />
        <Stat label="平均机会分" value={summary.avgOpportunity} hint={`当前筛选 ${summary.total} 个词`} />
        <Stat label="词库" value={status?.termCount ?? 0} hint={status?.finishedAt ? `上次跑完 ${ago(status.finishedAt)}` : "等待首轮采集"} />
      </div>

      {status?.running && (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-[#eadfcd]">
          <div className="h-full bg-primary transition-all" style={{ width: `${status.total ? (status.done / status.total) * 100 : 8}%` }} />
        </div>
      )}

      <form onSubmit={addSeed} className="panel mb-4 grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_160px_160px_auto]">
        <Input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="种子词，例如 AI coding tools" />
        <select className="h-10 rounded-full border border-border bg-card px-3 text-sm" value={region} onChange={(event) => setRegion(event.target.value)}>
          {meta?.regions.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        <select className="h-10 rounded-full border border-border bg-card px-3 text-sm" value={industry} onChange={(event) => setIndustry(event.target.value)}>
          <option value="">行业自动判断</option>
          {meta?.industries.map((item) => (
            <option key={item.slug} value={item.slug}>{item.nameZh}</option>
          ))}
        </select>
        <Button type="submit">添加种子</Button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        {seeds.map((seed) => (
          <button key={seed.id} className="rounded-full border border-border bg-card px-3 py-1 text-xs" onClick={() => void removeSeed(seed.id)}>
            {seed.topic} · {seed.region} ×
          </button>
        ))}
      </div>

      <FilterBar meta={meta} filters={filters} setFilters={setFilters} open={filtersOpen} setOpen={setFiltersOpen} />

      {!items.length && (
        <div className="panel px-5 py-12 text-center">
          <p className="display text-2xl">{status?.running ? "正在听早期信号" : "这一筛里还没有词"}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            {status?.running ? "Hacker News、Reddit、GitHub 和新闻会先回来，Google 验证放在最后。" : "点立即刷新，或放宽阶段和时间窗口。"}
          </p>
        </div>
      )}

      <div className="space-y-2 md:hidden">
        {items.map((item, index) => (
          <Link key={item.id} href={`/terms/${item.id}`} className="panel block p-4">
            <KeywordBody item={item} index={index} />
          </Link>
        ))}
      </div>

      {!!items.length && (
        <div className="panel hidden overflow-hidden md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#fbf6ee] text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-3 py-3 font-medium">关键词</th>
                <th className="px-3 py-3 font-medium">阶段</th>
                <th className="px-3 py-3 font-medium">机会分</th>
                <th className="px-3 py-3 font-medium">来源</th>
                <th className="px-3 py-3 font-medium">首次发现</th>
                <th className="px-3 py-3 font-medium">14 日</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id} className="border-t border-border hover:bg-[#fffdf8]">
                  <td className="px-4 py-3 text-muted">{index + 1}</td>
                  <td className="px-3 py-3">
                    <Link href={`/terms/${item.id}`} className="font-medium hover:text-primary">{item.term}</Link>
                    <div className="mt-1 text-xs text-muted">{item.intentLabel} · {item.industryLabels.join(" / ") || "未分类"}</div>
                  </td>
                  <td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-xs ${STAGE_CLASS[item.stage]}`}>{item.stageLabel}</span></td>
                  <td className="display px-3 py-3 text-xl">{item.opportunity}</td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-[240px] flex-wrap gap-1">
                      {item.sourceLabels.slice(0, 4).map((label) => (
                        <Badge key={label}>{label}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-muted">{ago(item.firstSeen)}</td>
                  <td className="px-3 py-3"><Sparkline data={item.spark} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}

function KeywordBody({ item, index }: { item: Keyword; index: number }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted">#{index + 1} · {item.intentLabel} · {ago(item.firstSeen)}</div>
          <div className="mt-1 break-words font-medium">{item.term}</div>
        </div>
        <div className="display shrink-0 text-2xl">{item.opportunity}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <span className={`rounded-full border px-2 py-0.5 text-xs ${STAGE_CLASS[item.stage]}`}>{item.stageLabel}</span>
        {item.sourceLabels.slice(0, 3).map((label) => (
          <Badge key={label}>{label}</Badge>
        ))}
      </div>
      <div className="mt-2"><Sparkline data={item.spark} /></div>
    </div>
  );
}

function FilterBar({
  meta,
  filters,
  setFilters,
  open,
  setOpen,
}: {
  meta: Meta | null;
  filters: { industry: string; source: string; stage: string; window: string; seed: string; q: string };
  setFilters: (filters: { industry: string; source: string; stage: string; window: string; seed: string; q: string }) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const active = [filters.stage, filters.industry, filters.source, filters.q, filters.window !== "7d" ? filters.window : ""].filter(Boolean).length;
  const fields = <FilterFields meta={meta} filters={filters} setFilters={setFilters} />;
  return (
    <>
      <div className="mb-3 md:hidden">
        <button type="button" className="h-10 w-full rounded-full border border-border bg-card text-sm" onClick={() => setOpen(true)}>
          筛选{active ? ` · ${active}` : ""}
        </button>
      </div>
      <div className="mb-3 hidden gap-2 md:grid md:grid-cols-5">{fields}</div>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" className="absolute inset-0 bg-[#241c16]/40" aria-label="关闭筛选" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-card p-4 pb-28 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">筛选</h2>
              <button type="button" className="text-sm text-primary" onClick={() => setOpen(false)}>完成</button>
            </div>
            <div className="grid gap-2">{fields}</div>
          </div>
        </div>
      )}
    </>
  );
}

function FilterFields({
  meta,
  filters,
  setFilters,
}: {
  meta: Meta | null;
  filters: { industry: string; source: string; stage: string; window: string; seed: string; q: string };
  setFilters: (filters: { industry: string; source: string; stage: string; window: string; seed: string; q: string }) => void;
}) {
  return (
    <>
      <select className="h-10 w-full rounded-full border border-border bg-card px-3 text-sm" value={filters.window} onChange={(event) => setFilters({ ...filters, window: event.target.value })}>
        <option value="24h">近 24 小时</option>
        <option value="7d">近 7 天</option>
        <option value="30d">近 30 天</option>
        <option value="all">全部时间</option>
      </select>
      <select className="h-10 w-full rounded-full border border-border bg-card px-3 text-sm" value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value })}>
        <option value="">全部阶段</option>
        {meta?.stages.map((stage) => (
          <option key={stage.id} value={stage.id}>{stage.label}</option>
        ))}
      </select>
      <select className="h-10 w-full rounded-full border border-border bg-card px-3 text-sm" value={filters.industry} onChange={(event) => setFilters({ ...filters, industry: event.target.value })}>
        <option value="">全部行业</option>
        <option value="none">未分类</option>
        {meta?.industries.map((item) => (
          <option key={item.slug} value={item.slug}>{item.nameZh}</option>
        ))}
      </select>
      <select className="h-10 w-full rounded-full border border-border bg-card px-3 text-sm" value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}>
        <option value="">全部来源</option>
        {meta?.sources.filter((source) => source.id !== "google").map((source) => (
          <option key={source.id} value={source.id}>{source.nameZh}</option>
        ))}
      </select>
      <Input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="筛选关键词" />
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="panel px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="display text-2xl sm:text-3xl">{value}</div>
      <div className="text-xs text-muted">{hint}</div>
    </div>
  );
}
