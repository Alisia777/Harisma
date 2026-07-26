const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const rendererPath = path.join(root, "portal-price-workbench-simple-live.js");
const renderer = fs.readFileSync(rendererPath, "utf8");

const helperStart = renderer.indexOf("  function shouldIncludePriceRowForRange(");
const helperEnd = renderer.indexOf("\n\n  function visibleRows()", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "range policy helper must remain in the price renderer");

const helperSource = renderer.slice(helperStart, helperEnd);
const createPolicy = new Function(
  "state",
  "\"use strict\";\n" + helperSource + "\nreturn shouldIncludePriceRowForRange;"
);
const state = { dateFrom: "2026-07-16", dateTo: "2026-07-22" };
const shouldInclude = createPolicy(state);

assert.equal(shouldInclude({ rangeHasPoint: true }, false), true, "rows with daily fact stay visible");
assert.equal(shouldInclude({ rangeHasPoint: false }, false), false, "unsearched stale rows stay outside the period");
assert.equal(shouldInclude({ rangeHasPoint: false }, true), true, "a searched SKU falls back to its latest snapshot");

state.dateFrom = "";
state.dateTo = "";
assert.equal(shouldInclude({ rangeHasPoint: false }, false), true, "without a period the row remains visible");

assert.match(
  renderer,
  /displayRow\.rangeFallback = Boolean\(\(state\.dateFrom \|\| state\.dateTo\) && !displayRow\.rangeHasPoint && search\)/,
  "fallback rows must be marked for a clear UI note"
);
assert.match(renderer, /Нет daily-факта за период · снимок/, "fallback rows must explain why period metrics are empty");

const prices = JSON.parse(fs.readFileSync(path.join(root, "data", "prices.json"), "utf8"));
const fallbackRangeStart = "2026-07-16";
const target = prices.platforms.wb.rows.find((row) => {
  const rowDates = (row.daily || []).map((point) => point.date).filter(Boolean).sort();
  return rowDates.length > 0 && rowDates[rowDates.length - 1] < fallbackRangeStart;
});
assert.ok(target, "WB fixture must contain at least one SKU with history outside the selected period");
const dates = (target.daily || []).map((row) => row.date).filter(Boolean).sort();
assert.ok(dates.length > 0, "fallback SKU must have price history");
assert.ok(dates[dates.length - 1] < fallbackRangeStart, "fixture must reproduce the out-of-range daily history");

for (const htmlFile of ["index.html", "live-index.html", path.join("docs", "index.html")]) {
  const html = fs.readFileSync(path.join(root, htmlFile), "utf8");
  assert.match(
    html,
    /portal-price-workbench-simple-live\.js\?v=20260726canonicalstatus1/,
    `${htmlFile} must load the fixed renderer without a stale browser cache`
  );
}

console.log("portal-price-search-range-fallback selftest: ok");
