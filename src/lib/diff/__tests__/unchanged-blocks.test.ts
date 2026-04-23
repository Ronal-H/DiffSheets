import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  materializeDiffRenderItems,
  splitDiffRowsIntoRenderItems,
} from "../unchanged-blocks";
import type { DiffRow, RowChangeType } from "../../../types";

function makeRow(changeType: RowChangeType, index: number): DiffRow {
  return {
    originalIndex: index,
    modifiedIndex: index,
    changeType,
    cells: [],
  };
}

describe("splitDiffRowsIntoRenderItems", () => {
  test("does not collapse unchanged run below threshold", () => {
    const rows: DiffRow[] = [
      ...Array.from({ length: 7 }, (_, index) => makeRow("unchanged", index)),
      makeRow("modified", 7),
    ];

    const items = splitDiffRowsIntoRenderItems(rows, { minCollapseRows: 8, contextRows: 2 });
    const collapsedCount = items.filter((item) => item.type === "collapsed").length;

    assert.equal(collapsedCount, 0);
    assert.equal(items.length, rows.length);
  });

  test("collapses long unchanged run with preserved context rows", () => {
    const rows: DiffRow[] = Array.from({ length: 12 }, (_, index) => makeRow("unchanged", index));
    const items = splitDiffRowsIntoRenderItems(rows, { minCollapseRows: 8, contextRows: 2 });

    assert.equal(items.length, 5);
    assert.equal(items[0]?.type, "row");
    assert.equal(items[1]?.type, "row");
    assert.equal(items[2]?.type, "collapsed");
    assert.equal(items[3]?.type, "row");
    assert.equal(items[4]?.type, "row");

    if (items[2]?.type !== "collapsed") {
      throw new Error("Expected collapsed item at index 2");
    }
    assert.equal(items[2].hiddenRowCount, 8);
    assert.equal(items[2].sourceStartIndex, 2);
    assert.equal(items[2].sourceEndIndex, 9);
  });
});

describe("materializeDiffRenderItems", () => {
  test("expands collapsed block back to row items", () => {
    const rows: DiffRow[] = Array.from({ length: 10 }, (_, index) => makeRow("unchanged", index));
    const baseItems = splitDiffRowsIntoRenderItems(rows, { minCollapseRows: 8, contextRows: 2 });
    const collapsed = baseItems.find((item) => item.type === "collapsed");

    if (!collapsed || collapsed.type !== "collapsed") {
      throw new Error("Expected at least one collapsed block");
    }

    const expanded = materializeDiffRenderItems(baseItems, new Set([collapsed.id]));
    assert.equal(expanded.filter((item) => item.type === "collapsed").length, 1);
    assert.equal(expanded.filter((item) => item.type === "row").length, 10);
    assert.equal(expanded.length, 11);
  });
});
