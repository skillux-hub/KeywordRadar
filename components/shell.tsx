"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Database, LayoutDashboard, LogOut, Newspaper, Radar, Users } from "lucide-react";
import { ThemeToggle } from "@/components/theme";

const LINKS = [
  { href: "/", label: "雷达", icon: LayoutDashboard },
  { href: "/feeds", label: "动态", icon: Activity },
  { href: "/watchlists", label: "名单", icon: Users },
  { href: "/intel", label: "信息源", icon: Radar },
  { href: "/sources", label: "来源", icon: Database },
  { href: "/digest", label: "日报", icon: Newspaper },
];

const FULL: Record<string, string> = {
  "/": "雷达",
  "/feeds": "行业动态",
  "/watchlists": "监控名单",
  "/intel": "信息源",
  "/sources": "数据源",
  "/digest": "日报与回测",
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [canLogout, setCanLogout] = useState(false);

  useEffect(() => {
    void fetch("/api/login").then((res) => res.json()).then((data) => setCanLogout(Boolean(data.configured))).catch(() => undefined);
    void fetch("/api/status").then((res) => {
      if (res.status === 401 || res.status === 503) window.location.href = "/login";
    });
  }, []);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur md:static md:min-h-screen md:border-b-0 md:border-r md:bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-4 md:py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-button text-sm font-semibold text-white">径</span>
            <span>
              <span className="block text-sm font-semibold leading-none tracking-tight">新词雷达</span>
              <span className="mt-1 block text-[11px] text-faint">英语市场 · 早于 Google</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {canLogout && (
              <button type="button" onClick={() => void logout()} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-accent" aria-label="退出">
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
        <nav className="hidden space-y-0.5 px-3 pb-6 md:block">
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href} data-active={pathname === link.href || (link.href !== "/" && pathname.startsWith(`${link.href}/`))} className="nav-link">
                <Icon size={16} />
                {FULL[link.href]}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 px-4 py-4 pb-24 md:px-8 md:py-6 md:pb-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} data-active={pathname === link.href || (link.href !== "/" && pathname.startsWith(`${link.href}/`))} className="nav-link flex-1 flex-col justify-center gap-0.5 px-1 py-2 text-[10px]">
              <Icon size={16} />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
