"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";

type Seed = { id: number; topic: string; region: string };
type Region = { id: string; label: string };

export function SeedSelect({
  seeds,
  regions,
  selected,
  onChange,
  onAdd,
  onRemove,
}: {
  seeds: Seed[];
  regions: Region[];
  selected: number[];
  onChange: (ids: number[]) => void;
  onAdd: (topic: string, region: string) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");
  const [region, setRegion] = useState(regions[0]?.id || "US");
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return seeds;
    return seeds.filter((seed) => seed.topic.toLowerCase().includes(needle) || seed.region.toLowerCase().includes(needle));
  }, [seeds, query]);

  const selectedSet = new Set(selected);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const next = topic.trim();
    if (next.length < 2 || busy) return;
    setBusy(true);
    try {
      await onAdd(next, region);
      setTopic("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <button type="button" className="field flex items-center justify-between gap-2 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="truncate">{selected.length} 个种子词</span>
        <ChevronDown size={14} className={`shrink-0 text-faint transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-border bg-card p-2 shadow-xl sm:right-auto sm:w-80">
          <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索种子词" />
          <div className="mt-2 flex items-center justify-between px-1 text-xs">
            <button type="button" className="text-primary" onClick={() => onChange(seeds.map((seed) => seed.id))}>全选</button>
            <button type="button" className="text-muted" onClick={() => onChange([])}>清空</button>
          </div>
          <ul className="mt-1 max-h-52 space-y-0.5 overflow-y-auto">
            {!visible.length && <li className="px-2 py-3 text-xs text-faint">没有匹配的种子词</li>}
            {visible.map((seed) => {
              const checked = selectedSet.has(seed.id);
              return (
                <li key={seed.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                    onClick={() => onChange(checked ? selected.filter((id) => id !== seed.id) : [...selected, seed.id])}
                  >
                    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                      {checked && <Check size={12} />}
                    </span>
                    <span className="truncate">{seed.topic}</span>
                    <span className="shrink-0 text-[11px] text-faint">{seed.region}</span>
                  </button>
                  <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-background hover:text-foreground" aria-label={`删除 ${seed.topic}`} onClick={() => void onRemove(seed.id)}>
                    <X size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
          <form onSubmit={add} className="mt-2 grid grid-cols-[minmax(0,1fr)_92px_auto] gap-1.5 border-t border-border pt-2">
            <input className="field" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="新种子词" />
            <select className="field px-2" value={region} onChange={(event) => setRegion(event.target.value)}>
              {regions.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
            </select>
            <button type="submit" className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-2.5 text-primary-foreground disabled:opacity-50" disabled={busy || topic.trim().length < 2} aria-label="添加种子词">
              <Plus size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
