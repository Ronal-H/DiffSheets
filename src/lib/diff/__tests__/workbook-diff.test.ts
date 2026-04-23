import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { computeWorkbookDiff } from "../workbook-diff";
import { defaultComparisonOptions } from "../../../types/diff";
import type { Cell, DiffResult, ParsedSpreadsheet, SheetData } from "../../../types";

function makeCell(value: string | number | null): Cell {
  if (value === null) {
    return { value: null, type: "empty" };
  }
  if (typeof value === "number") {
    return { value, type: "number" };
  }
  return { value, type: "string" };
}

function makeSheet(name: string, rows: Array<Array<string | number | null>>, colCount?: number): SheetData {
  const columnCount = colCount ?? rows[0]?.length ?? 0;
  return {
    name,
    rows: rows.map((row) => row.map((value) => makeCell(value))),
    columns: Array.from({ length: columnCount }, (_, index) => ({
      index,
      letter: String.fromCharCode(65 + index),
    })),
    headerRow: 1,
  };
}

function makeWorkbook(filename: string, sheets: SheetData[]): ParsedSpreadsheet {
  return {
    filename,
    fileSize: 0,
    sheets: sheets.map((sheet) => ({
      name: sheet.name,
      rowCount: sheet.rows.length,
      columnCount: sheet.columns.length,
    })),
    activeSheet: sheets[0]?.name ?? "",
    data: new Map(sheets.map((sheet) => [sheet.name, sheet])),
  };
}

function rowsEqual(originalRows: SheetData["rows"], modifiedRows: SheetData["rows"]): boolean {
  if (originalRows.length !== modifiedRows.length) return false;
  for (let rowIndex = 0; rowIndex < originalRows.length; rowIndex++) {
    const originalRow = originalRows[rowIndex];
    const modifiedRow = modifiedRows[rowIndex];
    if (originalRow.length !== modifiedRow.length) return false;
    for (let colIndex = 0; colIndex < originalRow.length; colIndex++) {
      if (originalRow[colIndex]?.value !== modifiedRow[colIndex]?.value) {
        return false;
      }
    }
  }
  return true;
}

function stubSheetDiffComputer(
  originalSheet: SheetData,
  modifiedSheet: SheetData,
): Promise<DiffResult> {
  const isEqual = rowsEqual(originalSheet.rows, modifiedSheet.rows);
  const addedRows = Math.max(0, modifiedSheet.rows.length - originalSheet.rows.length);
  const removedRows = Math.max(0, originalSheet.rows.length - modifiedSheet.rows.length);
  const modifiedRows =
    !isEqual && addedRows === 0 && removedRows === 0 && originalSheet.rows.length > 0 ? 1 : 0;
  const unchangedRows = isEqual ? originalSheet.rows.length : 0;

  return Promise.resolve({
    rows: [],
    columns: [],
    summary: {
      totalRows: Math.max(originalSheet.rows.length, modifiedSheet.rows.length),
      addedRows,
      removedRows,
      modifiedRows,
      unchangedRows,
      modifiedCells: modifiedRows > 0 ? 1 : 0,
    },
  });
}

describe("computeWorkbookDiff", () => {
  test("compares same-name sheets and marks modified summary", async () => {
    const original = makeWorkbook("original.xlsx", [
      makeSheet("Orders", [
        [1, "Alice"],
        [2, "Bob"],
      ]),
    ]);
    const modified = makeWorkbook("modified.xlsx", [
      makeSheet("Orders", [
        [1, "Alice"],
        [2, "Bobby"],
      ]),
    ]);

    const result = await computeWorkbookDiff(original, modified, defaultComparisonOptions, {
      computeSheetDiff: stubSheetDiffComputer,
    });

    assert.equal(result.summary.totalSheets, 1);
    assert.equal(result.summary.modifiedSheets, 1);
    assert.equal(result.summary.comparedSheets, 1);
    assert.equal(result.sheets[0]?.changeType, "modified");
    assert.equal(result.sheets[0]?.summary.modifiedRows, 1);
  });

  test("handles multi-sheet workbook and keeps original order", async () => {
    const original = makeWorkbook("original.xlsx", [
      makeSheet("Summary", [["ok"]]),
      makeSheet("Orders", [[1, "A"]]),
    ]);
    const modified = makeWorkbook("modified.xlsx", [
      makeSheet("Summary", [["ok"]]),
      makeSheet("Orders", [[1, "B"]]),
    ]);

    const result = await computeWorkbookDiff(original, modified, defaultComparisonOptions, {
      computeSheetDiff: stubSheetDiffComputer,
    });

    assert.deepEqual(
      result.sheets.map((sheet) => sheet.sheetName),
      ["Summary", "Orders"],
    );
    assert.equal(result.sheets[0]?.changeType, "unchanged");
    assert.equal(result.sheets[1]?.changeType, "modified");
    assert.equal(result.summary.unchangedSheets, 1);
    assert.equal(result.summary.modifiedSheets, 1);
  });

  test("marks single-side sheets as added or removed", async () => {
    const original = makeWorkbook("original.xlsx", [
      makeSheet("Keep", [[1]]),
      makeSheet("OnlyInOriginal", [[1], [2]]),
    ]);
    const modified = makeWorkbook("modified.xlsx", [
      makeSheet("Keep", [[1]]),
      makeSheet("OnlyInModified", [[7], [8]]),
    ]);

    const result = await computeWorkbookDiff(original, modified, defaultComparisonOptions, {
      computeSheetDiff: stubSheetDiffComputer,
    });
    const removedSheet = result.sheets.find((sheet) => sheet.sheetName === "OnlyInOriginal");
    const addedSheet = result.sheets.find((sheet) => sheet.sheetName === "OnlyInModified");

    assert.equal(removedSheet?.changeType, "removed");
    assert.equal(addedSheet?.changeType, "added");
    assert.equal(result.summary.addedSheets, 1);
    assert.equal(result.summary.removedSheets, 1);
  });

  test("treats empty sheets as unchanged", async () => {
    const original = makeWorkbook("original.xlsx", [makeSheet("Empty", [], 0)]);
    const modified = makeWorkbook("modified.xlsx", [makeSheet("Empty", [], 0)]);

    const result = await computeWorkbookDiff(original, modified, defaultComparisonOptions, {
      computeSheetDiff: stubSheetDiffComputer,
    });

    assert.equal(result.sheets[0]?.changeType, "unchanged");
    assert.equal(result.sheets[0]?.summary.totalRows, 0);
    assert.equal(result.summary.modifiedSheets, 0);
    assert.equal(result.summary.unchangedSheets, 1);
  });
});
