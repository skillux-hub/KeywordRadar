"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-accent hover:text-foreground"
      aria-label={dark ? "切换到浅色" : "切换到深色"}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
