import assert from "node:assert/strict";
import test from "node:test";
import { filterDigestPayload } from "../lib/digest-filter.ts";

test("a saved digest hides terms that are no longer novel without rewriting the snapshot", () => {
  const items = [
    { id: 1, term: "Windows 10" },
    { id: 2, term: "TeamViewer" },
    { id: 3, term: "HyperFrames" },
  ];
  const demands = [
    { term: "Windows 10", keyword: "remote desktop", decision: "观察" },
    { term: "HyperFrames", keyword: "ai video editor", decision: "优先" },
  ];
  const status = new Map([
    [1, "established"],
    [2, "unverified"],
    [3, "novel"],
  ]);
  const filtered = filterDigestPayload(items, demands, (item) => status.get(item.id ?? 0) === "novel");
  assert.deepEqual(filtered.items.map((item) => item.term), ["HyperFrames"]);
  assert.deepEqual(filtered.demands.map((item) => item.term), ["HyperFrames"]);
  assert.equal(filtered.hiddenCount, 2);
  assert.equal(filtered.snapshotFiltered, true);
  assert.equal(items.length, 3);
  assert.equal(demands.length, 2);
});
