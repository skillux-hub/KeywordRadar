"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Industry = { slug: string; nameZh: string };
type Row = { id: number; industry: string; status: string; reason?: string | null; handle?: string; display_name?: string | null; name?: string | null; username?: string; domain?: string; url?: string; tag?: string; channel_id?: string };

export default function WatchlistsPage() {
  const [industry, setIndustry] = useState("ai");
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [message, setMessage] = useState("");

  async function load() {
    const payload = await fetch("/api/watchlists").then((res) => res.json());
    setIndustries(payload.industries);
    setData(payload);
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(body: Record<string, unknown>) {
    const res = await fetch("/api/watchlists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    setMessage(json.error || "");
    await load();
  }

  const current = (key: string) => (data[key] || []).filter((row) => row.industry === industry);

  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">监控名单</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">X 账号、Reddit 社区和竞品站按行业维护。系统只能建议新增，点「采用」才会进下一轮采集。不会关注任何 X 账号。</p>
      <div className="mt-4 flex gap-2 overflow-x-auto">
        {industries.map((item) => (
          <button key={item.slug} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm ${industry === item.slug ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`} onClick={() => setIndustry(item.slug)}>
            {item.nameZh}
          </button>
        ))}
      </div>
      {message && <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{message}</p>}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <List title="X 大V" rows={current("x")} label={(row) => `@${row.handle} ${row.display_name || ""}`} kind="x" industry={industry} act={act} placeholder="@handle" />
        <List title="Reddit 社区" rows={current("subreddits")} label={(row) => `r/${row.name}`} kind="subreddit" industry={industry} act={act} placeholder="subreddit" />
        <List title="Reddit 用户" rows={current("redditUsers")} label={(row) => `u/${row.username}`} kind="reddit_user" industry={industry} act={act} placeholder="username" />
        <List title="竞品网站" rows={current("sites")} label={(row) => `${row.domain}`} kind="site" industry={industry} act={act} placeholder="example.com" />
      </div>
    </Shell>
  );
}

function List({
  title, rows, label, kind, industry, act, placeholder,
}: {
  title: string;
  rows: Row[];
  label: (row: Row) => string;
  kind: string;
  industry: string;
  act: (body: Record<string, unknown>) => Promise<void>;
  placeholder: string;
}) {
  const [value, setValue] = useState("");
  const active = rows.filter((row) => row.status === "active");
  const suggested = rows.filter((row) => row.status === "suggested");
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
      {!!suggested.length && <h3 className="mt-4 text-xs text-muted">建议加入，需你确认</h3>}
      <ul className="mt-2 space-y-2 text-sm">
        {suggested.map((row) => (
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
    </section>
  );
}
