import type {
  ComparisonOptions,
  DiffResult,
  DiffSummary,
  ParsedSpreadsheet,
  SheetChangeType,
  SheetData,
  SheetDiffResult,
  WorkbookDiffResult,
  WorkbookDiffSummary,
} from "@/types";

const EMPTY_DIFF_SUMMARY: DiffSummary = {
  totalRows: 0,
  addedRows: 0,
  removedRows: 0,
  modifiedRows: 0,
  unchangedRows: 0,
  modifiedCells: 0,
};

function buildSheetId(sheetName: string, index: number): string {
  return `${sheetName}::${index}`;
}

function hasRowOrCellChanges(summary: DiffSummary): boolean {
  return (
    summary.addedRows > 0 ||
    summary.removedRows > 0 ||
    summary.modifiedRows > 0 ||
    summary.modifiedCells > 0
  );
}

function cloneSummary(summary: DiffSummary): DiffSummary {
  return {
    totalRows: summary.totalRows,
    addedRows: summary.addedRows,
    removedRows: summary.removedRows,
    modifiedRows: summary.modifiedRows,
    unchangedRows: summary.unchangedRows,
    modifiedCells: summary.modifiedCells,
  };
}

function createEmptySheetLike(reference: SheetData, name: string): SheetData {
  return {
    name,
    rows: [],
    // Clone columns so the downstream diff engine can treat this as a standalone sheet model.
    columns: reference.columns.map((column) => ({ ...column })),
    headerRow: reference.headerRow,
  };
}

function accumulateWorkbookSummary(
  workbookSummary: WorkbookDiffSummary,
  sheetSummary: DiffSummary,
  changeType: SheetChangeType,
  isComparedSheet: boolean,
): void {
  workbookSummary.totalRows += sheetSummary.totalRows;
  workbookSummary.addedRows += sheetSummary.addedRows;
  workbookSummary.removedRows += sheetSummary.removedRows;
  workbookSummary.modifiedRows += sheetSummary.modifiedRows;
  workbookSummary.unchangedRows += sheetSummary.unchangedRows;
  workbookSummary.modifiedCells += sheetSummary.modifiedCells;

  if (isComparedSheet) {
    workbookSummary.comparedSheets += 1;
  }

  switch (changeType) {
    case "added":
      workbookSummary.addedSheets += 1;
      break;
    case "removed":
      workbookSummary.removedSheets += 1;
      break;
    case "modified":
      workbookSummary.modifiedSheets += 1;
      break;
    case "unchanged":
      workbookSummary.unchangedSheets += 1;
      break;
  }
}

type SheetDiffComputer = (
  originalSheet: SheetData,
  modifiedSheet: SheetData,
  options: ComparisonOptions,
) => Promise<DiffResult>;

interface WorkbookDiffDependencies {
  /**
   * Optional override for sheet diff computation.
   * Primarily used by tests so workbook orchestration can be validated in isolation.
   */
  computeSheetDiff?: SheetDiffComputer;
}

/**
 * Compute workbook-level diff by orchestrating existing single-sheet diff engine.
 * Sheet comparison remains name-based (MVP scope): same-name sheets are compared directly.
 */
export async function computeWorkbookDiff(
  originalWorkbook: ParsedSpreadsheet,
  modifiedWorkbook: ParsedSpreadsheet,
  options: ComparisonOptions,
  dependencies: WorkbookDiffDependencies = {},
): Promise<WorkbookDiffResult> {
  let computeSheetDiff: SheetDiffComputer;
  if (dependencies.computeSheetDiff) {
    computeSheetDiff = dependencies.computeSheetDiff;
  } else {
    const module = await import("./index");
    if (!module.computeSpreadsheetDiff) {
      throw new Error("computeSpreadsheetDiff is not available");
    }
    computeSheetDiff = module.computeSpreadsheetDiff;
  }

  const originalSheetMap = new Map<string, { data: SheetData; index: number }>();
  const modifiedSheetMap = new Map<string, { data: SheetData; index: number }>();

  for (let index = 0; index < originalWorkbook.sheets.length; index++) {
    const sheetName = originalWorkbook.sheets[index]?.name;
    if (!sheetName) continue;
    const sheetData = originalWorkbook.data.get(sheetName);
    if (!sheetData) continue;
    originalSheetMap.set(sheetName, { data: sheetData, index });
  }

  for (let index = 0; index < modifiedWorkbook.sheets.length; index++) {
    const sheetName = modifiedWorkbook.sheets[index]?.name;
    if (!sheetName) continue;
    const sheetData = modifiedWorkbook.data.get(sheetName);
    if (!sheetData) continue;
    modifiedSheetMap.set(sheetName, { data: sheetData, index });
  }

  // Keep original workbook order first, then append modified-only sheets.
  const orderedSheetNames: string[] = [];
  for (const sheet of originalWorkbook.sheets) {
    if (!orderedSheetNames.includes(sheet.name)) {
      orderedSheetNames.push(sheet.name);
    }
  }
  for (const sheet of modifiedWorkbook.sheets) {
    if (!orderedSheetNames.includes(sheet.name)) {
      orderedSheetNames.push(sheet.name);
    }
  }

  const workbookSummary: WorkbookDiffSummary = {
    ...EMPTY_DIFF_SUMMARY,
    totalSheets: 0,
    comparedSheets: 0,
    addedSheets: 0,
    removedSheets: 0,
    modifiedSheets: 0,
    unchangedSheets: 0,
  };

  const sheets: SheetDiffResult[] = [];
  const sheetNameMap: Record<string, string[]> = {};

  // Run sheet comparison sequentially so large workbooks do not block UI as a single long task.
  for (let index = 0; index < orderedSheetNames.length; index++) {
    const sheetName = orderedSheetNames[index];
    const originalSheet = originalSheetMap.get(sheetName)?.data ?? null;
    const modifiedSheet = modifiedSheetMap.get(sheetName)?.data ?? null;

    if (!originalSheet && !modifiedSheet) {
      continue;
    }

    const baselineSheet = originalSheet ?? modifiedSheet;
    if (!baselineSheet) {
      continue;
    }

    const originalComparable = originalSheet ?? createEmptySheetLike(baselineSheet, sheetName);
    const modifiedComparable = modifiedSheet ?? createEmptySheetLike(baselineSheet, sheetName);
    const diffResult = await computeSheetDiff(
      originalComparable,
      modifiedComparable,
      options,
    );

    const changeType: SheetChangeType =
      !originalSheet
        ? "added"
        : !modifiedSheet
          ? "removed"
          : hasRowOrCellChanges(diffResult.summary)
            ? "modified"
            : "unchanged";

    const sheetId = buildSheetId(sheetName, index);
    const sheetSummary = cloneSummary(diffResult.summary);

    const sheetResult: SheetDiffResult = {
      sheetId,
      sheetName,
      originalSheetName: originalSheet?.name ?? null,
      modifiedSheetName: modifiedSheet?.name ?? null,
      changeType,
      diffResult,
      summary: sheetSummary,
    };

    sheets.push(sheetResult);
    sheetNameMap[sheetName] = [...(sheetNameMap[sheetName] ?? []), sheetId];

    accumulateWorkbookSummary(
      workbookSummary,
      sheetSummary,
      changeType,
      Boolean(originalSheet && modifiedSheet),
    );
  }

  workbookSummary.totalSheets = sheets.length;

  return {
    sheets,
    summary: workbookSummary,
    sheetNameMap,
  };
}
