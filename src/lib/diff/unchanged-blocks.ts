import type { DiffRow } from "@/types";

export interface UnchangedBlockOptions {
  /** Minimum unchanged run length required before we create a collapsible block. */
  minCollapseRows: number;
  /** Context rows to keep visible before and after each collapsed unchanged block. */
  contextRows: number;
}

export interface DiffRowRenderItem {
  type: "row";
  id: string;
  sourceIndex: number;
  row: DiffRow;
}

export interface CollapsedUnchangedRenderItem {
  type: "collapsed";
  id: string;
  sourceStartIndex: number;
  sourceEndIndex: number;
  hiddenRowCount: number;
  hiddenRows: DiffRow[];
}

export type DiffRenderItem = DiffRowRenderItem | CollapsedUnchangedRenderItem;

export const DEFAULT_UNCHANGED_BLOCK_OPTIONS: UnchangedBlockOptions = {
  minCollapseRows: 8,
  contextRows: 2,
};

function createRowRenderItem(sourceIndex: number, row: DiffRow, idSuffix = ""): DiffRowRenderItem {
  return {
    type: "row",
    id: idSuffix ? `row-${sourceIndex}-${idSuffix}` : `row-${sourceIndex}`,
    sourceIndex,
    row,
  };
}

function appendRowRange(
  output: DiffRenderItem[],
  rows: DiffRow[],
  startIndex: number,
  endIndexExclusive: number,
): void {
  for (let sourceIndex = startIndex; sourceIndex < endIndexExclusive; sourceIndex++) {
    output.push(createRowRenderItem(sourceIndex, rows[sourceIndex]));
  }
}

/**
 * Convert diff rows into render items with collapsible unchanged blocks.
 * Long unchanged runs are split into [context rows] + [collapsed block] + [context rows].
 */
export function splitDiffRowsIntoRenderItems(
  rows: DiffRow[],
  options: UnchangedBlockOptions = DEFAULT_UNCHANGED_BLOCK_OPTIONS,
): DiffRenderItem[] {
  const output: DiffRenderItem[] = [];
  const minCollapseRows = Math.max(1, options.minCollapseRows);
  const contextRows = Math.max(0, options.contextRows);

  let index = 0;
  while (index < rows.length) {
    if (rows[index]?.changeType !== "unchanged") {
      const changedStart = index;
      while (index < rows.length && rows[index]?.changeType !== "unchanged") {
        index++;
      }
      appendRowRange(output, rows, changedStart, index);
      continue;
    }

    const runStart = index;
    while (index < rows.length && rows[index]?.changeType === "unchanged") {
      index++;
    }
    const runEndExclusive = index;
    const runLength = runEndExclusive - runStart;

    if (runLength < minCollapseRows) {
      appendRowRange(output, rows, runStart, runEndExclusive);
      continue;
    }

    const leadContext = Math.min(contextRows, runLength);
    const tailContext = Math.min(contextRows, Math.max(0, runLength - leadContext));
    const hiddenStart = runStart + leadContext;
    const hiddenEndExclusive = runEndExclusive - tailContext;
    const hiddenRowCount = hiddenEndExclusive - hiddenStart;

    // If no hidden rows remain after context reservation, keep the run fully expanded.
    if (hiddenRowCount <= 0) {
      appendRowRange(output, rows, runStart, runEndExclusive);
      continue;
    }

    appendRowRange(output, rows, runStart, hiddenStart);

    output.push({
      type: "collapsed",
      id: `collapsed-${hiddenStart}-${hiddenEndExclusive - 1}`,
      sourceStartIndex: hiddenStart,
      sourceEndIndex: hiddenEndExclusive - 1,
      hiddenRowCount,
      hiddenRows: rows.slice(hiddenStart, hiddenEndExclusive),
    });

    appendRowRange(output, rows, hiddenEndExclusive, runEndExclusive);
  }

  return output;
}

/**
 * Expand selected collapsed blocks by replacing them with their original unchanged rows.
 */
export function materializeDiffRenderItems(
  baseItems: DiffRenderItem[],
  expandedBlockIds: ReadonlySet<string>,
): DiffRenderItem[] {
  const output: DiffRenderItem[] = [];

  for (const item of baseItems) {
    if (item.type === "row") {
      output.push(item);
      continue;
    }

    if (!expandedBlockIds.has(item.id)) {
      output.push(item);
      continue;
    }

    // Keep the control row visible in expanded mode so users can collapse it again.
    output.push(item);

    for (let offset = 0; offset < item.hiddenRows.length; offset++) {
      const sourceIndex = item.sourceStartIndex + offset;
      const row = item.hiddenRows[offset];
      output.push(createRowRenderItem(sourceIndex, row, `expanded-${item.id}-${offset}`));
    }
  }

  return output;
}
