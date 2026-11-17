import assert from "node:assert/strict";
import test from "node:test";
import { classifyBreakout, repoSearchVariants } from "../lib/signals/breakout.ts";
import { decideDemand, filterDemandPhrases, heuristicDemandPhrases } from "../lib/signals/demand.ts";
import { properNounCandidates } from "../lib/signals/names.ts";
import { classifyResultPage, deriveSerpShape, kgr, loosenCompetition } from "../lib/signals/serp.ts";
import { evaluateTrendsHit, summarizeReviews } from "../lib/signals/trends.ts";

test("young repo with high daily stars is a breakout", () => {
  const created = new Date("2026-11-10T00:00:00Z").toISOString();
  const result = classifyBreakout({
    createdAt: created,
    stars: 1600,
    previousStars: null,
    now: new Date("2026-11-17T00:00:00Z").getTime(),
    thresholds: { maxAgeDays: 14, starsPerDay: 200, starDelta: 400 },
  });
  assert.equal(result.breakout, true);
});

test("star jump of 400 since the last snapshot is a breakout", () => {
  const result = classifyBreakout({
    createdAt: "2024-01-01T00:00:00Z",
    stars: 900,
    previousStars: 400,
    now: new Date("2026-11-17T00:00:00Z").getTime(),
    thresholds: { maxAgeDays: 14, starsPerDay: 200, starDelta: 400 },
  });
  assert.equal(result.breakout, true);
});

test("repo variants split hyphens and camel case", () => {
  const variants = repoSearchVariants("acme/SynthID-Detector");
  assert.ok(variants.some((item) => /synth id detector/i.test(item)));
  assert.ok(variants.some((item) => /acme/i.test(item)));
});

test("generic demand phrases stay generic and relevant", () => {
  const phrases = filterDemandPhrases(
    ["ai image detector", "detect ai generated images", "SynthID Detector", "xyz"],
    "SynthID Detector",
    "image detector generated photos",
  );
  assert.deepEqual(phrases, ["ai image detector", "detect ai generated images"]);
  assert.ok(heuristicDemandPhrases("SynthID Detector", "detect generated images").includes("ai image detector"));
});

test("crowded serp downgrades a rising keyword", () => {
  assert.equal(decideDemand({ trend: "up", stillHigh: true, volume: 1000, crowded: false }), "优先");
  assert.equal(decideDemand({ trend: "up", stillHigh: true, volume: 1000, crowded: true }), "观察");
  assert.equal(decideDemand({ trend: "down", stillHigh: false, volume: 10, crowded: false }), "跳过");
});

test("proper names keep versions and internal capitals", () => {
  const names = properNounCandidates("HyperFrames released Opus 5.5 today");
  assert.ok(names.includes("HyperFrames"));
  assert.ok(names.some((name) => name.startsWith("Opus 5")));
});

test("trends hit ignores a high old baseline and the last two days", () => {
  const reported = "2026-10-01";
  const series = [
    { day: "2026-09-01", value: 50 },
    { day: "2026-09-20", value: 55 },
    { day: "2026-10-20", value: 80 },
    { day: "2026-11-16", value: 100 },
  ];
  const oldMeaning = evaluateTrendsHit(series, reported, new Date("2026-11-17T00:00:00Z").getTime());
  assert.equal(oldMeaning.hit, false);
  const fresh = evaluateTrendsHit(
    [
      { day: "2026-09-01", value: 4 },
      { day: "2026-09-20", value: 6 },
      { day: "2026-10-20", value: 30 },
    ],
    reported,
    new Date("2026-11-17T00:00:00Z").getTime(),
  );
  assert.equal(fresh.hit, true);
  assert.equal(fresh.leadDays, 19);
});

test("review summary reports hit rate and median lead", () => {
  const rows = summarizeReviews([
    { source: "hn", hit: true, leadDays: 4 },
    { source: "hn", hit: true, leadDays: 10 },
    { source: "hn", hit: false, leadDays: null },
  ]);
  assert.equal(rows[0].hitRate, 2 / 3);
  assert.equal(rows[0].medianLeadDays, 7);
});

test("serp shape and young-term loosening", () => {
  const pages = [
    classifyResultPage("https://www.youtube.com/watch?v=1", "demo"),
    classifyResultPage("https://example.com/blog/how-to-detect-images", "How to detect images"),
    classifyResultPage("https://small.dev/", "Home"),
  ];
  assert.equal(pages[0].kind, "video");
  assert.equal(pages[1].homepage, false);
  assert.equal(deriveSerpShape(pages).shape, "有争夺");
  assert.equal(loosenCompetition("红海", 30).label, "竞争中等");
  assert.equal(loosenCompetition("红海", 200).loosened, false);
  assert.equal(kgr(20, 200), 0.1);
});
