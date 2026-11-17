"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pagination } from "@/components/pagination";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Industry = { slug: string; nameZh: string };
type Row = { id: number; industry: string; status: string; reason?: string | null; handle?: string; display_name?: string | null; name?: string | null; username?: string; domain?: string; url?: string; tag?: string; channel_id?: string };
type Page = { items: Row[]; total: number; page: number; size: number };

export default function WatchlistsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const industry = search.get("industry") || "ai";
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [data, setData] = useState<Record<string, Page>>({});
  const [message, setMessage] = useState("");

  async function load() {
    const params = new URLSearchParams(search.toString());
    params.set("industry", industry);
    const payload = await fetch(`/api/watchlists?${params}`).then((res) => res.json());
    setIndustries(payload.industries);
    setData(payload);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function act(body: Record<string, unknown>) {
    const res = await fetch("/api/watchlists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    setMessage(json.error || "");
    await load();
  }

  function chooseIndustry(value: string) {
    const params = new URLSearchParams(search.toString());
    params.set("industry", value);
    for (const key of ["xPage", "subPage", "userPage", "sitePage", "xSuggest", "subSuggest", "userSuggest", "siteSuggest"]) params.delete(key);
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">监控名单</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">X 账号、Reddit 社区和竞品站按行业维护。系统只能建议新增，点「采用」才会进下一轮采集。不会关注任何 X 账号。</p>
      <div className="mt-4 flex gap-2 overflow-x-auto">
        {industries.map((item) => (
          <button key={item.slug} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${industry === item.slug ? "btn-primary" : "border border-border bg-card text-foreground hover:bg-accent"}`} onClick={() => chooseIndustry(item.slug)}>
            {item.nameZh}
          </button>
        ))}
      </div>
      {message && <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{message}</p>}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <List title="X 大V" page={data.x} suggested={data.xSuggested} pageParam="xPage" suggestParam="xSuggest" label={(row) => `@${row.handle} ${row.display_name || ""}`} kind="x" industry={industry} act={act} placeholder="@handle" />
        <List title="Reddit 社区" page={data.subreddits} suggested={data.subredditsSuggested} pageParam="subPage" suggestParam="subSuggest" label={(row) => `r/${row.name}`} kind="subreddit" industry={industry} act={act} placeholder="subreddit" />
        <List title="Reddit 用户" page={data.redditUsers} suggested={data.redditUsersSuggested} pageParam="userPage" suggestParam="userSuggest" label={(row) => `u/${row.username}`} kind="reddit_user" industry={industry} act={act} placeholder="username" />
        <List title="竞品网站" page={data.sites} suggested={data.sitesSuggested} pageParam="sitePage" suggestParam="siteSuggest" label={(row) => `${row.domain}`} kind="site" industry={industry} act={act} placeholder="example.com" />
      </div>
    </Shell>
  );
}

function List({
  title, page, suggested, pageParam, suggestParam, label, kind, industry, act, placeholder,
}: {
  title: string;
  page?: Page;
  suggested?: Page;
  pageParam: string;
  suggestParam: string;
  label: (row: Row) => string;
  kind: string;
  industry: string;
  act: (body: Record<string, unknown>) => Promise<void>;
  placeholder: string;
}) {
  const [value, setValue] = useState("");
  const active = page?.items || [];
  const ideas = suggested?.items || [];
  return (
    <section className="panel p-4">
      <h2 className="font-medium">{title}</h2>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void act({ op: "add", kind, industry, value }); setValue(""); }}>
        <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} />
        <Button type="submit" size="sm">加入</Button>
      </form>
      <ul className="mt-3 space-y-2 text-sm">
        {active.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2">
            <span>{label(row)}</span>
            <button className="text-xs text-muted" onClick={() => void act({ op: "remove", kind, id: row.id })}>移除</button>
          </li>
        ))}
      </ul>
      <Pagination page={page?.page || 1} size={page?.size || 20} total={page?.total || 0} pageParam={pageParam} />
      {!!ideas.length && <h3 className="mt-4 text-xs text-muted">建议加入，需你确认</h3>}
      <ul className="mt-2 space-y-2 text-sm">
        {ideas.map((row) => (
          <li key={row.id}>
            <div className="flex items-center justify-between gap-2">
              <span>{label(row)}</span>
              <span className="flex gap-2">
                <button className="text-xs text-primary" onClick={() => void act({ op: "approve", kind, id: row.id })}>采用</button>
                <button className="text-xs text-muted" onClick={() => void act({ op: "reject", kind, id: row.id })}>忽略</button>
              </span>
            </div>
            {row.reason && <p className="text-xs text-muted">{row.reason}</p>}
          </li>
        ))}
      </ul>
      <Pagination page={suggested?.page || 1} size={suggested?.size || 20} total={suggested?.total || 0} pageParam={suggestParam} sizeParam="suggestSize" />
    </section>
  );
}
