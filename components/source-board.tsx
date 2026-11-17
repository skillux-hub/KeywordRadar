"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink } from "@/components/external-link";
import { Pagination } from "@/components/pagination";
import { profileUrl, safeExternalUrl } from "@/lib/source-links";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { DETAIL_SIZES, parsePage, parseSize } from "@/lib/pagination";

type Industry = { slug: string; nameZh: string };
type EventRow = { id: number; platform: string; industry: string | null; account_key: string; action: string; reason: string | null; evidence_url?: string | null; created_at: string };
type EventPage = { items: EventRow[]; total: number; page: number; size: number };

type Card = {
  platform: "x" | "reddit";
  key: string;
  label: string;
  status: string;
  origin: string;
  reason: string;
  retiredReason: string;
  industries: string[];
  industryLabels: string[];
  heat: number | null;
  audience: number | null;
  activeUsers: number | null;
  perDay: number | null;
  avgEngagement: number | null;
  trend: number | null;
  topics: string[];
  posts: { title: string; url: string; engagement: number; discussion: string; publishedAt: string }[];
  discussion: { ask: number; pain: number; compare: number; recommend: number; other: number };
  terms: { id: number; display: string }[];
};

const TALK: Record<string, string> = { ask: "求助/找工具", pain: "痛点吐槽", compare: "对比", recommend: "推荐", other: "其他" };

function threadHref(search: { toString(): string }, itemPlatform: string, key: string) {
  const params = new URLSearchParams(search.toString());
  params.set("thread", `${itemPlatform}:${key}`);
  params.delete("threadPage");
  return params.toString();
}

function EventList({ title, rows, pageParam, sizeParam, empty }: { title: string; rows: EventPage; pageParam: string; sizeParam: string; empty: string }) {
  return (
    <section className="mt-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {!rows.items.length && <p className="mt-2 text-sm text-muted">{empty}</p>}
      <ul className="mt-2 space-y-1 text-sm">
        {rows.items.map((row) => (
          <li key={row.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-muted">
            <ExternalLink href={profileUrl(row.platform, row.account_key)}>{row.platform === "x" ? "@" : "r/"}{row.account_key}</ExternalLink>
            <span>{row.action === "added" ? "加入" : row.action === "retired" ? "退出" : "候选"}{row.reason ? ` · ${row.reason}` : ""}</span>
            {safeExternalUrl(row.evidence_url) && <ExternalLink href={safeExternalUrl(row.evidence_url)} className="text-xs">来源</ExternalLink>}
          </li>
        ))}
      </ul>
      <Pagination page={rows.page} size={rows.size} total={rows.total} pageParam={pageParam} sizeParam={sizeParam} sizes={DETAIL_SIZES} />
    </section>
  );
}

export function SourceBoard({ platform }: { platform: "x" | "reddit" | "all" }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const page = parsePage(search.get("page"));
  const size = parseSize(search.get("size"));
  const [items, setItems] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [retired, setRetired] = useState<{ items: Card[]; total: number; page: number; size: number }>({ items: [], total: 0, page: 1, size: 10 });
  const [candidates, setCandidates] = useState<EventPage>({ items: [], total: 0, page: 1, size: 10 });
  const [history, setHistory] = useState<EventPage>({ items: [], total: 0, page: 1, size: 10 });
  const [thread, setThread] = useState<{ items: { title: string; url: string; engagement: number; discussion: string }[]; total: number; page: number; size: number; topics: string[]; discussion: Card["discussion"] } | null>(null);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [industry, setIndustry] = useState(search.get("industry") || "");
  const [notice, setNotice] = useState("");
  const [run, setRun] = useState<{ started_at?: string; candidates?: number; added?: number; retired?: number; message?: string | null } | null>(null);
  const [limits, setLimits] = useState({ x: 30, reddit: 15, days: 7 });
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams(search.toString());
    if (platform !== "all") params.set("platform", platform);
    if (industry) params.set("industry", industry);
    else params.delete("industry");
    const data = await fetch(`/api/intel?${params}`).then((res) => res.json());
    setItems(data.items?.items || []);
    setTotal(data.items?.total || 0);
    setRetired(data.retired || { items: [], total: 0, page: 1, size: 10 });
    setCandidates(data.candidates || { items: [], total: 0, page: 1, size: 10 });
    setHistory(data.history || { items: [], total: 0, page: 1, size: 10 });
    setIndustries(data.industries || []);
    setNotice(data.xNotice || "");
    setRun(data.run);
    setLimits(data.limits || limits);
    const focus = search.get("thread") || "";
    const [focusPlatform, focusKey] = focus.split(":");
    if ((focusPlatform === "x" || focusPlatform === "reddit") && focusKey) {
      const posts = new URLSearchParams({ platform: focusPlatform, key: focusKey, page: String(parsePage(search.get("threadPage"))), size: String(parseSize(search.get("threadSize"), 10, DETAIL_SIZES)) });
      setThread(await fetch(`/api/intel/posts?${posts}`).then((res) => res.json()));
    } else setThread(null);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, industry, search]);

  async function discover() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/intel/discover", { method: "POST" });
    const data = await res.json();
    if (!res.ok || data.started === false) setError(data.reason === "running" ? "已经有一轮在跑" : "没能开始发现");
    setBusy(false);
    setTimeout(() => void load(), 1500);
  }

  async function act(body: Record<string, unknown>) {
    const res = await fetch("/api/intel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) setError(data.error || "没有完成");
    await load();
  }

  const title = platform === "x" ? "X 大V" : platform === "reddit" ? "Reddit 板块" : "信息源";
  const focus = search.get("thread") || "";

  return (
    <Shell>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-faint">信息源</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            {platform === "all"
              ? "按热度看正在跟踪的账号和板块。发现任务每周自动跑，也可以现在补一轮。"
              : platform === "x"
                ? `每个行业自动保留大约 ${limits.x} 个账号，每 ${limits.days} 天重排一次。手动添加只是例外。`
                : `每个行业自动保留大约 ${limits.reddit} 个板块，每 ${limits.days} 天重排一次。手动添加只是例外。`}
          </p>
        </div>
        <Button onClick={() => void discover()} disabled={busy}>{busy ? "正在排队" : "立即发现"}</Button>
      </div>
      {platform !== "reddit" && <p className="mt-3 text-sm text-muted">{notice}</p>}
      {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
      <section className="panel mt-4 p-4 text-sm">
        <h2 className="font-medium">最近一次发现</h2>
        {!run && <p className="mt-1 text-muted">还没有跑过。点「立即发现」，或等下一次定时采集。</p>}
        {run && (
          <p className="mt-1 text-muted">
            {run.started_at ? new Date(run.started_at).toLocaleString("zh-CN") : "—"} · 候选 {run.candidates ?? 0} · 加入 {run.added ?? 0} · 退出 {run.retired ?? 0}
            {run.message ? `。${run.message}` : ""}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link className={platform === "all" ? "text-primary" : "text-muted"} href="/intel">总览</Link>
          <Link className={platform === "x" ? "text-primary" : "text-muted"} href="/intel/x">X 大V</Link>
          <Link className={platform === "reddit" ? "text-primary" : "text-muted"} href="/intel/reddit">Reddit 板块</Link>
        </div>
      </section>
      <div className="mt-3">
        <select className="field max-w-xs" value={industry} onChange={(event) => {
          const value = event.target.value;
          setIndustry(value);
          const params = new URLSearchParams(search.toString());
          if (value) params.set("industry", value); else params.delete("industry");
          for (const key of ["page", "retiredPage", "candidatePage", "historyPage", "thread", "threadPage"]) params.delete(key);
          const next = params.toString();
          router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
        }}>
          <option value="">全部行业</option>
          {industries.map((item) => <option key={item.slug} value={item.slug}>{item.nameZh}</option>)}
        </select>
      </div>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <article key={`${item.platform}:${item.key}`} className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold"><ExternalLink href={profileUrl(item.platform, item.key)}>{item.label}</ExternalLink></h2>
                  <span className="text-xs text-faint">{item.origin} · {item.status === "paused" ? "已暂停" : "跟踪中"}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{item.industryLabels.join("、") || "行业还没定"}{item.reason ? ` · ${item.reason}` : ""}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold tabular-nums">{item.heat ?? "—"}</div>
                <div className="text-[11px] text-faint">热度</div>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-4">
              <div><dt>{item.platform === "x" ? "粉丝" : "订阅"}</dt><dd className="text-sm text-foreground">{item.audience ?? "—"}</dd></div>
              <div><dt>每天内容</dt><dd className="text-sm text-foreground">{item.perDay == null ? "—" : item.perDay.toFixed(1)}</dd></div>
              <div><dt>平均互动</dt><dd className="text-sm text-foreground">{item.avgEngagement ?? "—"}</dd></div>
              <div><dt>7 日趋势</dt><dd className="text-sm text-foreground">{item.trend == null ? "—" : `${item.trend.toFixed(2)}x`}</dd></div>
            </dl>
            {item.platform === "reddit" && item.activeUsers != null && <p className="mt-2 text-xs text-muted">在线约 {item.activeUsers}</p>}
            {focus === `${item.platform}:${item.key}` && thread && (
              <div className="mt-3">
                {!!thread.topics.length && <p className="text-sm">讨论：{thread.topics.join("、")}</p>}
                {item.platform === "reddit" && <p className="mt-1 text-xs text-muted">{Object.entries(thread.discussion).filter(([, count]) => count).map(([kind, count]) => `${TALK[kind] || kind} ${count}`).join(" · ")}</p>}
                <ul className="mt-2 space-y-1 text-sm">
                  {thread.items.map((post) => (
                    <li key={post.url || post.title}>
                      <ExternalLink href={safeExternalUrl(post.url)}>{post.title}</ExternalLink>
                      <span className="ml-2 text-xs text-faint">{TALK[post.discussion] || ""} · {post.engagement}</span>
                    </li>
                  ))}
                </ul>
                <Pagination page={thread.page} size={thread.size} total={thread.total} pageParam="threadPage" sizeParam="threadSize" sizes={DETAIL_SIZES} />
              </div>
            )}
            {!!item.terms.length && (
              <p className="mt-3 text-xs text-muted">
                贡献的新词：{item.terms.map((term) => <Link key={term.id} className="mr-2 text-primary" href={`/terms/${term.id}`}>{term.display}</Link>)}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {item.status === "paused" ? (
                <Button size="sm" variant="outline" onClick={() => void act({ op: "resume", platform: item.platform, key: item.key })}>恢复</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => void act({ op: "pause", platform: item.platform, key: item.key })}>暂停</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => void act({ op: "remove", platform: item.platform, key: item.key })}>移除</Button>
              <Link className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs" href={`?${threadHref(search, item.platform, item.key)}`}>讨论</Link>
            </div>
          </article>
        ))}
        {!items.length && <p className="panel px-4 py-10 text-center text-sm text-muted">这一筛里还没有跟踪对象。跑一次发现之后会自动补上。</p>}
      </div>
      <Pagination page={page} size={size} total={total} />
      <EventList title="发现候选" rows={candidates} pageParam="candidatePage" sizeParam="candidateSize" empty="还没有候选记录。跑一次发现后会出现。" />
      <EventList title="加入与退出" rows={history} pageParam="historyPage" sizeParam="historySize" empty="还没有加入或退出记录。" />
      <section className="mt-4">
        <h2 className="text-sm font-medium">已退出的来源</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {retired.items.map((item) => (
            <li key={`${item.platform}:${item.key}`} className="break-words"><ExternalLink href={profileUrl(item.platform, item.key)}>{item.label}</ExternalLink> · {item.retiredReason || item.reason || "已退出"}</li>
          ))}
          {!retired.items.length && <li>这一页没有退出记录。</li>}
        </ul>
        <Pagination page={retired.page} size={retired.size} total={retired.total} pageParam="retiredPage" sizeParam="retiredSize" sizes={DETAIL_SIZES} />
      </section>
      {platform !== "all" && (
        <details className="panel mt-4 p-4 text-sm">
          <summary className="cursor-pointer font-medium">手动添加（可选）</summary>
          <p className="mt-2 text-muted">平时不用填。只有自动名单漏了你非跟不可的账号或板块时再用。</p>
          <textarea className="field mt-3 h-24 py-2" value={manual} onChange={(event) => setManual(event.target.value)} placeholder={platform === "x" ? "@handle 或 https://x.com/handle，可多行" : "r/name 或板块 URL，可多行"} />
          <div className="mt-2 flex flex-wrap gap-2">
            {industries.map((item) => (
              <button key={item.slug} type="button" className={`rounded-lg px-2 py-1 text-xs ${picked.includes(item.slug) ? "btn-primary" : "border border-border"}`} onClick={() => setPicked((current) => current.includes(item.slug) ? current.filter((id) => id !== item.slug) : [...current, item.slug])}>
                {item.nameZh}
              </button>
            ))}
          </div>
          <Button className="mt-3" size="sm" onClick={() => void act({ op: "add", platform, value: manual, industries: picked })}>加入跟踪</Button>
        </details>
      )}
    </Shell>
  );
}
