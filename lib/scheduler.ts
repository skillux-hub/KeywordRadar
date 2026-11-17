import { get, run } from "./db";
import { maybeSendScheduledDigest } from "./digest";
import { beginRefresh } from "./pipeline";

const globalStore = globalThis as unknown as { __radarScheduler?: boolean };

export function startScheduler() {
  if (globalStore.__radarScheduler) return;
  globalStore.__radarScheduler = true;
  run("update job_state set running = 0 where id = 1");
  const hours = Number(process.env.CRON_HOURS || 4);
  setTimeout(() => {
    const last = get<{ finished_at: string | null; running: number }>("select finished_at, running from job_state where id = 1");
    const stale = !last?.finished_at || Date.now() - new Date(last.finished_at).getTime() > hours * 3600000;
    if (stale && !last?.running) beginRefresh("startup");
  }, 1500);
  setInterval(() => beginRefresh("schedule"), Math.max(1, hours) * 3600000);
  setInterval(() => {
    void maybeSendScheduledDigest().catch(() => undefined);
  }, 60 * 1000);
}
