import type { Cell, CellValue } from "./spreadsheet";

export type RowChangeType = "unchanged" | "added" | "removed" | "modified";
export type CellChangeType = "unchanged" | "added" | "removed" | "modified";

export interface InlineDiff {
  type: "unchanged" | "added" | "removed";
  value: string;
}

export interface DiffCell {
  columnIndex: number;
  original: Cell | null;
  modified: Cell | null;
  changeType: CellChangeType;
  inlineDiff?: InlineDiff[];
}

export interface DiffRow {
  originalIndex: number | null;
  modifiedIndex: number | null;
  changeType: RowChangeType;
  cells: DiffCell[];
}

export interface ColumnDiff {
  index: number;
  letter: string;
  hasChanges: boolean;
}

export interface DiffSummary {
  totalRows: number;
  addedRows: number;
  removedRows: number;
  modifiedRows: number;
  unchangedRows: number;
  modifiedCells: number;
}

export interface DiffResult {
  rows: DiffRow[];
  columns: ColumnDiff[];
  summary: DiffSummary;
}

export type SheetChangeType = "unchanged" | "modified" | "added" | "removed";

export interface SheetDiffResult {
  /**
   * Stable sheet identifier for UI state and list keys.
   * Uses name + index to avoid collisions when names are duplicated externally.
   */
  sheetId: string;
  /** Display name shown in sidebar navigation. */
  sheetName: string;
  /** Original workbook sheet name; null when the sheet only exists in modified file. */
  originalSheetName: string | null;
  /** Modified workbook sheet name; null when the sheet only exists in original file. */
  modifiedSheetName: string | null;
  /** Sheet-level change classification used by sidebar badges. */
  changeType: SheetChangeType;
  /** Sheet diff payload rendered by the grid view. */
  diffResult: DiffResult;
  /** Per-sheet row/cell summary displayed in navigation and header. */
  summary: DiffSummary;
}

export interface WorkbookDiffSummary extends DiffSummary {
  totalSheets: number;
  comparedSheets: number;
  addedSheets: number;
  removedSheets: number;
  modifiedSheets: number;
  unchangedSheets: number;
}

export interface WorkbookDiffResult {
  /** Ordered sheet diff results used by sidebar and current-sheet selection. */
  sheets: SheetDiffResult[];
  /** Aggregated workbook-level counts for metrics and quick status. */
  summary: WorkbookDiffSummary;
  /**
   * Name to sheetId map for fast lookup.
   * Value is an array to support potential duplicate names from external normalization.
   */
  sheetNameMap: Record<string, string[]>;
}

export type MatchingStrategy = "position" | "key-column" | "lcs";

export interface ComparisonOptions {
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
  hideUnchangedRows: boolean;
  hideUnchangedColumns: boolean;
  compareFormulas: boolean;
  matchingStrategy: MatchingStrategy;
  keyColumnIndex?: number;
  /** Column indices to ignore when comparing (0-based) */
  ignoredColumns?: number[];
}

export const defaultComparisonOptions: ComparisonOptions = {
  ignoreWhitespace: false,
  ignoreCase: false,
  hideUnchangedRows: false,
  hideUnchangedColumns: false,
  compareFormulas: false,
  matchingStrategy: "lcs",
};
