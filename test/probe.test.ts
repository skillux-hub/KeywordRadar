import assert from "node:assert/strict";
import test from "node:test";
import { budgetItems, capCursor, parseProbe } from "../lib/probe.ts";

test("probe whitelist rejects addresses and unknown sources", () => {
  assert.equal("error" in parseProbe({ source: "github", url: "https://example.com" }), true);
  assert.equal("error" in parseProbe({ source: "reddit" }), true);
  assert.equal("error" in parseProbe({ command: "ls", source: "pypi" }), true);
  const github = parseProbe({ source: "github", maxItems: 100, budgetMs: 1, dryRun: true });
  assert.equal("error" in github, false);
  if (!("error" in github)) {
    assert.equal(github.maxItems, 20);
    assert.equal(github.budgetMs, 5000);
    assert.equal(github.dryRun, true);
    assert.equal(github.source, "github");
  }
});

test("item and term budgets keep unprocessed ids for the next run", () => {
  const twenty = Array.from({ length: 20 }, (_, index) => ({ id: `item-${index}`, terms: 1 }));
  const first = budgetItems(twenty, 1, 1);
  assert.deepEqual(first.kept, ["item-0"]);
  assert.equal(first.deferred.includes("item-1"), true);
  assert.equal(first.itemCount, 1);
  const second = budgetItems(twenty.filter((item) => first.deferred.includes(item.id) || !first.kept.includes(item.id)).filter((item) => !first.kept.includes(item.id)), 1, 1);
  assert.deepEqual(second.kept, ["item-1"]);
  const wide = budgetItems(twenty, 20, 20);
  assert.equal(wide.itemCount, 20);
  assert.equal(wide.deferred.length, 0);
});

test("a limited emit does not mark the rest of the window as seen", () => {
  const first = capCursor(["a", "b", "c", "d"], ["c", "d"], 1, true);
  assert.deepEqual(first.emitIds, ["c"]);
  assert.equal(first.nextCursor.includes("d"), false);
  assert.equal(first.nextCursor.includes("a"), true);
  const baseline = capCursor(["a", "b"], ["a"], 1, false);
  assert.deepEqual(baseline.emitIds, []);
  assert.deepEqual(baseline.nextCursor, ["a", "b"]);
});
