import { all } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  const rows = all<{ source: string; name_zh: string; role: string; status: string; message: string | null; last_run_at: string | null; item_count: number; keys_hint: string | null }>(
    "select source, name_zh, role, status, message, last_run_at, item_count, keys_hint from source_status order by role, source",
  );
  return Response.json({
    sources: rows.map((row) => ({
      id: row.source,
      name: row.name_zh,
      role: row.role,
      roleLabel: row.role === "validation" ? "验证" : row.role === "watch" ? "监控" : "发现",
      status: forcedStatus(row.source, row.status),
      message: forcedMessage(row.source, row.message || ""),
      lastRunAt: row.last_run_at,
      count: row.item_count,
      keys: row.keys_hint,
    })),
  });
}

function forcedStatus(source: string, status: string) {
  if (source === "x" && !process.env.X_BEARER_TOKEN) return "disabled";
  if (source === "discord" && !process.env.DISCORD_BOT_TOKEN) return "disabled";
  if (source === "telegram" && !process.env.TELEGRAM_BOT_TOKEN) return "disabled";
  if (source === "threads" && !process.env.THREADS_ACCESS_TOKEN) return "disabled";
  return status;
}

function forcedMessage(source: string, message: string) {
  if (source === "x" && !process.env.X_BEARER_TOKEN) return "未配置 X_BEARER_TOKEN，采集器已关闭。";
  if (source === "discord" && !process.env.DISCORD_BOT_TOKEN) return "未配置 DISCORD_BOT_TOKEN 与频道 ID。";
  if (source === "telegram" && !process.env.TELEGRAM_BOT_TOKEN) return "未配置 TELEGRAM_BOT_TOKEN。";
  if (source === "threads" && !process.env.THREADS_ACCESS_TOKEN) return "未配置 THREADS_ACCESS_TOKEN。";
  return message;
}
