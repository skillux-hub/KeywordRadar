"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const params = useSearchParams();
  const unconfigured = params.get("unconfigured") === "1";
  const next = params.get("next") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState(unconfigured ? "生产环境必须设置 APP_PASSWORD，否则雷达不会对外开放。" : "");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setPending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "登录失败");
      return;
    }
    window.location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6">
        <div className="display text-3xl">新词雷达</div>
        <p className="mt-2 text-sm leading-6 text-muted">这是一份给自己用的英语市场早报。输入访问密码后，手机会记住 14 天。</p>
        <label className="mt-5 block text-sm" htmlFor="password">访问密码</label>
        <Input id="password" className="mt-2" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <p className="mt-3 text-sm text-[#8d3d4e]">{error}</p>}
        <Button className="mt-4 w-full" type="submit" disabled={pending || unconfigured}>
          {pending ? "正在核对" : "进入"}
        </Button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
