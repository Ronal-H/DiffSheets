import type {
  Cell,
  CellChangeType,
  CellValue,
  ComparisonOptions,
  DiffCell,
  InlineDiff,
} from "@/types";

// Lazy-load diff library - only when needed for inline text diffs (saves ~8KB from initial bundle)
let diffLib: typeof import("diff") | null = null;

async function getDiffLib() {
  if (!diffLib) {
    diffLib = await import("diff");
  }
  return diffLib;
}

/**
 * Normalize cell value for comparison based on options
 */
function normalizeValue(value: CellValue, options: ComparisonOptions): string {
  if (value === null || value === undefined) return "";

  let str = String(value);
  // Normalize platform line endings so visually identical multiline text does not diff as changed.
  str = str.replace(/\r\n?/g, "\n");

  if (options.ignoreWhitespace) {
    str = str.replace(/\s+/g, " ").trim();
  }

  if (options.ignoreCase) {
    str = str.toLowerCase();
  }

  return str;
}

/**
 * Normalize formula text so semantically identical formulas compare equal,
 * even when spreadsheet engines serialize with minor formatting differences.
 */
function normalizeFormula(formula: string, options: ComparisonOptions): string {
  let normalized = formula.trim();
  if (normalized.startsWith("=")) {
    normalized = normalized.slice(1);
  }
  if (options.ignoreWhitespace) {
    normalized = normalized.replace(/\s+/g, " ").trim();
  }
  if (options.ignoreCase) {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

/**
 * Compare two cell values and return if they are equal
 */
export function areCellsEqual(
  original: Cell | null,
  modified: Cell | null,
  options: ComparisonOptions,
): boolean {
  const origFormula = original?.formula ?? "";
  const modFormula = modified?.formula ?? "";
  const hasOrigFormula = origFormula.trim().length > 0;
  const hasModFormula = modFormula.trim().length > 0;

  // Prefer formula equality when both sides are formulas to avoid false added/removed signals
  // caused by stale cached values in spreadsheet files.
  if (hasOrigFormula && hasModFormula) {
    const formulasEqual = normalizeFormula(origFormula, options) === normalizeFormula(modFormula, options);
    if (formulasEqual) {
      return true;
    }
    if (options.compareFormulas) {
      return false;
    }
  }

  if (options.compareFormulas && hasOrigFormula !== hasModFormula) {
    return false;
  }

  const origValue = original?.value ?? null;
  const modValue = modified?.value ?? null;

  // Both empty
  if ((origValue === null || origValue === "") && (modValue === null || modValue === "")) {
    return true;
  }

  // One is empty, other is not
  if ((origValue === null || origValue === "") !== (modValue === null || modValue === "")) {
    return false;
  }

  // Normalize and compare
  return normalizeValue(origValue, options) === normalizeValue(modValue, options);
}

/**
 * Generate inline diff for text changes
 */
export async function generateInlineDiff(
  originalValue: CellValue,
  modifiedValue: CellValue,
): Promise<InlineDiff[]> {
  const origStr = originalValue === null ? "" : String(originalValue);
  const modStr = modifiedValue === null ? "" : String(modifiedValue);

  const { diffChars } = await getDiffLib();
  const changes = diffChars(origStr, modStr);

  return changes.map((change) => ({
    type: change.added ? "added" : change.removed ? "removed" : "unchanged",
    value: change.value,
  }));
}

/**
 * Determine cell change type
 */
export function getCellChangeType(
  original: Cell | null,
  modified: Cell | null,
  options: ComparisonOptions,
): CellChangeType {
  const origHasFormula = Boolean(original?.formula?.trim());
  const modHasFormula = Boolean(modified?.formula?.trim());
  // Formula-only cells should not be considered empty, otherwise equal formulas can be misclassified
  // as added/removed when one side lacks a cached value.
  const origEmpty = !original || (!origHasFormula && (original.value === null || original.value === ""));
  const modEmpty = !modified || (!modHasFormula && (modified.value === null || modified.value === ""));

  if (origEmpty && modEmpty) return "unchanged";
  if (origEmpty && !modEmpty) return "added";
  if (!origEmpty && modEmpty) return "removed";

  if (areCellsEqual(original, modified, options)) {
    return "unchanged";
  }

  return "modified";
}

/**
 * Check if a column should be ignored
 */
function isColumnIgnored(columnIndex: number, options: ComparisonOptions): boolean {
  return options.ignoredColumns?.includes(columnIndex) ?? false;
}

// Debug: track if we've logged ignored columns info
let _debugIgnoredLogged = false;

// Reset debug flag (call at start of each comparison)
export function _resetDebugFlag() {
  _debugIgnoredLogged = false;
}

/**
 * Compare two cells and return diff result
 */
export async function compareCells(
  columnIndex: number,
  original: Cell | null,
  modified: Cell | null,
  options: ComparisonOptions,
): Promise<DiffCell> {
  // Log ignored columns info once per comparison
  if (!_debugIgnoredLogged && options.ignoredColumns && options.ignoredColumns.length > 0) {
    console.log("[DEBUG] compareCells - ignoredColumns in options:", options.ignoredColumns);
    _debugIgnoredLogged = true;
  }

  // If column is ignored, always return unchanged
  if (isColumnIgnored(columnIndex, options)) {
    return {
      columnIndex,
      original,
      modified,
      changeType: "unchanged",
    };
  }

  const changeType = getCellChangeType(original, modified, options);

  const result: DiffCell = {
    columnIndex,
    original,
    modified,
    changeType,
  };

  // Generate inline diff for modified text cells
  if (changeType === "modified" && original?.type === "string" && modified?.type === "string") {
    result.inlineDiff = await generateInlineDiff(original.value, modified.value);
  }

  return result;
}
