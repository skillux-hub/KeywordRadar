import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reviewLane, type ReleaseRow } from "../lib/novelty.ts";

const sample = JSON.parse(readFileSync(new URL("./fixtures/pending-review.json", import.meta.url), "utf8")) as {
  now: string;
  items: {
    id: number;
    name: string;
    age_evidence: { kind: ReleaseRow["eventKind"]; observed_at: string; note: string | null }[];
    repo_snapshots_matched: { full_name: string; created_at: string }[];
    evidence: { kind?: string; title?: string; quote?: string; url?: string; published_at?: string; collected_at?: string }[];
  }[];
};

const now = Date.parse(sample.now);

const expectLane: Record<number, "candidate" | "raw"> = {
  3242: "candidate",
  2093: "raw",
  283: "candidate",
  3219: "raw",
  3080: "raw",
  2883: "raw",
  3215: "raw",
  2679: "raw",
  2497: "candidate",
  690: "raw",
  475: "candidate",
  1281: "raw",
  1609: "raw",
  1878: "candidate",
  105: "candidate",
  2420: "candidate",
  1108: "raw",
  609: "raw",
  478: "candidate",
  103: "candidate",
  108: "candidate",
  102: "candidate",
  489: "candidate",
  484: "raw",
  104: "candidate",
  487: "candidate",
  847: "raw",
  1444: "raw",
  3247: "raw",
  877: "raw",
  369: "raw",
  381: "raw",
  2738: "raw",
  3290: "candidate",
  1367: "raw",
  878: "raw",
  470: "raw",
  37: "raw",
  38: "raw",
  84: "raw",
  3293: "candidate",
};

function rowsFor(item: (typeof sample.items)[number]): ReleaseRow[] {
  const rows: ReleaseRow[] = item.evidence.map((row) => ({
    kind: row.kind,
    title: row.title,
    quote: row.quote,
    url: row.url,
    publishedAt: row.published_at,
    collectedAt: row.collected_at,
  }));
  for (const age of item.age_evidence) {
    rows.push({ url: age.note, eventKind: age.kind, eventAt: age.observed_at });
  }
  for (const snap of item.repo_snapshots_matched) {
    rows.push({ url: `https://github.com/${snap.full_name}`, eventKind: "repo_created", eventAt: snap.created_at });
  }
  return rows;
}

test("the exported pending pages follow the release evidence lanes", () => {
  assert.equal(sample.items.length, 41);
  const mismatches = sample.items.flatMap((item) => {
    const verdict = reviewLane(item.name, rowsFor(item), now);
    return verdict.lane === expectLane[item.id] ? [] : [`${item.id} ${item.name}: got ${verdict.lane}, want ${expectLane[item.id]}. ${verdict.reason}`];
  });
  assert.deepEqual(mismatches, []);
});

test("stored repo creation dates override new mentions, and missing dates stay unknown", () => {
  const byId = new Map(sample.items.map((item) => [item.id, item]));
  const posthog = reviewLane("posthog", rowsFor(byId.get(877)!), now);
  const caddy = reviewLane("caddy", rowsFor(byId.get(369)!), now);
  const airflow = reviewLane("airflow", rowsFor(byId.get(1367)!), now);
  assert.match(posthog.reason, /2020-01-23/);
  assert.match(caddy.reason, /2015-01-13/);
  assert.match(airflow.reason, /2015-04-13/);
  for (const id of [381, 84]) {
    const verdict = reviewLane(byId.get(id)!.name, rowsFor(byId.get(id)!), now);
    assert.match(verdict.reason, /待补证据/);
    assert.doesNotMatch(verdict.reason, /早于/);
  }
  assert.match(reviewLane("riemann hypothesis", rowsFor(byId.get(2883)!), now).reason, /数学通名/);
  assert.match(reviewLane("adobe-air-sdk", rowsFor(byId.get(3247)!), now).reason, /SDK/);
  assert.match(reviewLane("Summer2027 Internships", rowsFor(byId.get(878)!), now).reason, /实习清单/);
  const cert = reviewLane("CertNudge", rowsFor(byId.get(3293)!), now);
  assert.equal(cert.lane, "candidate");
  assert.match(cert.reason, /2026-11-23T19:02:46Z/);
});

test("own-domain registration alone is not a release, and a coined name with context is not blocked", () => {
  assert.equal(reviewLane("CertNudge", [
    { url: "https://certnudge.dev/", eventKind: "domain_registered", eventAt: "2026-11-20T00:00:00Z" },
  ], now).lane, "raw");
  assert.match(reviewLane("CertNudge", [
    { title: "CertNudge", quote: "Cert and domain expiry alerts", url: "https://certnudge.dev/", publishedAt: "2026-11-23T19:45:07.098Z", collectedAt: "2026-11-23T19:45:07.098Z" },
  ], now).reason, /待补证据|不是已知旧词/);
  const coined = reviewLane("Nimblequill", [
    { title: "Nimblequill", quote: "Local caption tool for short vertical clips", url: "https://github.com/example/nimblequill" },
    { url: "https://github.com/example/nimblequill", eventKind: "repo_created", eventAt: "2026-11-19T10:00:43Z" },
  ], now);
  assert.equal(coined.lane, "candidate");
  assert.match(coined.reason, /不是推荐/);
  const roundup = reviewLane("WinRust", [
    { title: "WinRust", quote: "WinRust", url: "https://github.com/Lemxy/WinRust" },
    { title: "Today on GitHub: OpenHarness, openshell, PiBot and WinRust stand out", url: "https://bsky.app/profile/alextech.ai/post/1", publishedAt: "2026-11-23T19:25:47.412644+00:00", collectedAt: "2026-11-23T19:30:22.518Z" },
    { url: "https://github.com/Lemxy/WinRust", eventKind: "repo_created", eventAt: "2026-11-17T14:27:06Z" },
  ], now);
  assert.equal(roundup.lane, "raw");
  assert.match(roundup.reason, /没有因为名字里缺少行业词/);
});
