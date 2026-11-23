import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { judgeBirth, reviewLane, sameSubject, type ReleaseRow } from "../lib/novelty.ts";

const sample = JSON.parse(readFileSync(new URL("./fixtures/subject-binding.json", import.meta.url), "utf8")) as {
  now: string;
  items: {
    id: number;
    name: string;
    age: { kind: ReleaseRow["eventKind"]; observed_at: string; note: string | null }[];
    snapshots: { full_name: string; created_at: string }[];
    evidence: { kind?: string; title?: string; quote?: string; url?: string; published_at?: string | null; collected_at?: string | null }[];
  }[];
};

const now = Date.parse(sample.now);

const expectLane: Record<number, "candidate" | "raw"> = {
  13: "raw",
  3242: "candidate",
  283: "candidate",
  3219: "candidate",
  454: "candidate",
  2497: "candidate",
  475: "candidate",
  1022: "candidate",
  2030: "candidate",
  575: "raw",
  1878: "candidate",
  105: "candidate",
  2420: "candidate",
  478: "candidate",
  866: "raw",
  103: "candidate",
  108: "candidate",
  24: "candidate",
  102: "candidate",
  489: "candidate",
  2209: "candidate",
  104: "candidate",
  487: "candidate",
  2878: "candidate",
  493: "raw",
  494: "raw",
  3290: "candidate",
  1953: "candidate",
  30: "candidate",
  470: "raw",
  37: "raw",
  38: "raw",
  1366: "raw",
  3244: "candidate",
  3248: "raw",
  724: "raw",
  786: "raw",
  788: "raw",
  3011: "raw",
  1213: "candidate",
  3245: "candidate",
  3293: "candidate",
};

function rowsFor(item: (typeof sample.items)[number]): ReleaseRow[] {
  return [
    ...item.evidence.map((row) => ({
      kind: row.kind,
      title: row.title,
      quote: row.quote,
      url: row.url,
      publishedAt: row.published_at,
      collectedAt: row.collected_at,
    })),
    ...item.age.map((row) => ({ url: row.note, eventKind: row.kind, eventAt: row.observed_at })),
    ...item.snapshots.map((row) => ({ url: `https://github.com/${row.full_name}`, eventKind: "repo_created" as const, eventAt: row.created_at })),
  ];
}

test("live recommend and pending pages replay with subject binding", () => {
  assert.equal(sample.items.length, 42);
  const mismatches = sample.items.flatMap((item) => {
    const verdict = reviewLane(item.name, rowsFor(item), now);
    return verdict.lane === expectLane[item.id] ? [] : [`${item.id} ${item.name}: got ${verdict.lane}, want ${expectLane[item.id]}. ${verdict.reason}`];
  });
  assert.deepEqual(mismatches, []);
});

test("snapshot fallback cannot move a mention onto another entity", () => {
  const byId = new Map(sample.items.map((item) => [item.id, item]));
  const opencode = reviewLane("OpenCode", rowsFor(byId.get(13)!), now);
  assert.equal(opencode.lane, "raw");
  assert.match(opencode.reason, /blender-ai-mcp-addon/);
  assert.match(opencode.reason, /不是「OpenCode」/);
  const born = judgeBirth({
    term: "OpenCode",
    industries: ["ai"],
    sightings: [
      { source: "github", industry: "ai", at: "2026-11-19T14:43:10Z", url: "https://github.com/bookwjitchieni1986/blender-ai-mcp-addon", title: "Works with OpenCode" },
      { source: "bluesky", industry: "ai", at: "2026-11-20T19:33:11Z", url: "https://bsky.app/profile/undercode.bsky.social/post/1", author: "undercode", title: "OpenCode agents" },
      { source: "hn", industry: "ai", at: "2026-11-19T05:18:23Z", url: "https://github.com/orsenthil/git-hook-model-identification", author: "orsenthil", title: "via OpenCode" },
    ],
    ageEvidence: [{ kind: "repo_created", at: "2026-11-19T14:43:10Z", url: "https://github.com/bookwjitchieni1986/blender-ai-mcp-addon" }],
    now,
    windowHours: 48,
  });
  assert.notEqual(born.status, "novel");
  assert.equal(sameSubject("SteelSeries", "https://github.com/krisgfx9/Wireless-Device-Battery-Monitor").ok, false);
  assert.match(reviewLane("SteelSeries", rowsFor(byId.get(493)!), now).reason, /wireless-device-battery-monitor/i);
  assert.match(reviewLane("DualSense", rowsFor(byId.get(494)!), now).reason, /wireless-device-battery-monitor/i);
  assert.match(reviewLane("Auto 6", rowsFor(byId.get(575)!), now).reason, /leonida/i);
  assert.match(reviewLane("ToolJet", rowsFor(byId.get(1366)!), now).reason, /重上架|目录/);
  assert.match(reviewLane("sketch", rowsFor(byId.get(3248)!), now).reason, /通名/);
  const battery = reviewLane("Wireless Device Battery Monitor", rowsFor(byId.get(475)!), now);
  assert.equal(battery.lane, "candidate");
  assert.match(battery.reason, /wireless-device-battery-monitor/i);
  const verfy = reviewLane("Verfy", rowsFor(byId.get(3219)!), now);
  assert.equal(verfy.lane, "candidate");
  assert.match(verfy.reason, /verfy-dev\/verfy/);
  const code = reviewLane("codescope-ai", rowsFor(byId.get(3290)!), now);
  assert.equal(code.lane, "candidate");
  assert.match(code.reason, /pypi.org\/project\/codescope-ai/i);
  const cert = reviewLane("CertNudge", rowsFor(byId.get(3293)!), now);
  assert.equal(cert.lane, "candidate");
  assert.match(cert.reason, /声称的发布时间/);
  assert.match(cert.reason, /2026-11-23T19:02:46Z/);
  const certBirth = judgeBirth({
    term: "CertNudge",
    industries: ["devtools"],
    sightings: [
      { source: "hn", industry: "devtools", at: "2026-11-23T19:02:46Z", url: "https://certnudge.dev/", title: "CertNudge" },
      { source: "bluesky", industry: "devtools", at: "2026-11-23T19:10:00Z", url: "https://bsky.app/profile/a/post/1", author: "a", title: "CertNudge alerts" },
    ],
    ageEvidence: [{ kind: "product_launch", at: "2026-11-23T19:02:46Z", url: "https://certnudge.dev/" }],
    now,
    windowHours: 48,
  });
  assert.notEqual(certBirth.status, "novel");
});
