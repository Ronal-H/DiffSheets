"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import type {
  CollapsedUnchangedRenderItem,
  DiffRenderItem,
  DiffRowRenderItem,
} from "@/lib/diff/unchanged-blocks";
import type { DiffCell, DiffRow } from "@/types";
import { CollapsedUnchangedBlock } from "./collapsed-unchanged-block";

interface SideBySideGridProps {
  renderItems: DiffRenderItem[];
  visibleColumns: number[];
  currentChangeIndex: number;
  sheetKey: string | null;
  originalLabel: string;
  modifiedLabel: string;
  expandedBlockIds: ReadonlySet<string>;
  onToggleCollapsedBlock: (blockId: string) => void;
  onCellClick?: (cell: DiffCell, rowIndex: number, colIndex: number) => void;
  className?: string;
}

function getColumnLetter(index: number): string {
  let letter = "";
  let temp = index;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

function calculateColumnWidths(rows: DiffRow[], columns: number[]): Map<number, number> {
  const CHAR_WIDTH = 8;
  const MIN_WIDTH = 80;
  const MAX_WIDTH = 400;
  const PADDING = 20;
  const SAMPLE_SIZE = 100;

  const maxChars = new Map<number, number>();
  for (const colIndex of columns) {
    maxChars.set(colIndex, 2);
  }

  const sampleRows = rows.slice(0, SAMPLE_SIZE);
  for (const row of sampleRows) {
    for (const colIndex of columns) {
      const cell = row.cells[colIndex];
      if (!cell) continue;
      const originalLen = String(cell.original?.value ?? "").length;
      const modifiedLen = String(cell.modified?.value ?? "").length;
      const maxLen = Math.max(originalLen, modifiedLen);
      maxChars.set(colIndex, Math.max(maxChars.get(colIndex) ?? 0, maxLen));
    }
  }

  const widths = new Map<number, number>();
  for (const [col, chars] of maxChars) {
    const calculatedWidth = chars * CHAR_WIDTH + PADDING;
    widths.set(col, Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, calculatedWidth)));
  }
  return widths;
}

export function SideBySideGrid({
  renderItems,
  visibleColumns,
  currentChangeIndex,
  sheetKey,
  originalLabel,
  modifiedLabel,
  expandedBlockIds,
  onToggleCollapsedBlock,
  onCellClick,
  className,
}: SideBySideGridProps) {
  const t = useTranslations("diff");
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingSourceRef = useRef<"left" | "right" | null>(null);

  const rowItems = useMemo(
    () => renderItems.filter((item): item is DiffRowRenderItem => item.type === "row"),
    [renderItems],
  );

  const columnWidths = useMemo(
    () => calculateColumnWidths(rowItems.map((item) => item.row), visibleColumns),
    [rowItems, visibleColumns],
  );

  const totalWidth = useMemo(() => {
    let width = 50; // row number column
    for (const colIndex of visibleColumns) {
      width += columnWidths.get(colIndex) ?? 80;
    }
    return width;
  }, [visibleColumns, columnWidths]);

  // Keep navigation aligned to rendered row index so collapsed blocks are skipped naturally.
  const changedRenderIndices = useMemo(() => {
    const indices: number[] = [];
    for (let renderIndex = 0; renderIndex < renderItems.length; renderIndex++) {
      const item = renderItems[renderIndex];
      if (item.type === "row" && item.row.changeType !== "unchanged") {
        indices.push(renderIndex);
      }
    }
    return indices;
  }, [renderItems]);

  const rowVirtualizer = useVirtualizer({
    count: renderItems.length,
    getScrollElement: () => leftRef.current,
    estimateSize: (index) => (renderItems[index]?.type === "collapsed" ? 44 : 36),
    overscan: 10,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [renderItems, rowVirtualizer]);

  const handleScroll = useCallback((source: "left" | "right") => {
    if (syncingSourceRef.current && syncingSourceRef.current !== source) {
      return;
    }

    const sourceEl = source === "left" ? leftRef.current : rightRef.current;
    const targetEl = source === "left" ? rightRef.current : leftRef.current;
    if (!sourceEl || !targetEl) {
      return;
    }

    syncingSourceRef.current = source;
    if (targetEl.scrollTop !== sourceEl.scrollTop) {
      targetEl.scrollTop = sourceEl.scrollTop;
    }
    if (targetEl.scrollLeft !== sourceEl.scrollLeft) {
      targetEl.scrollLeft = sourceEl.scrollLeft;
    }

    requestAnimationFrame(() => {
      if (syncingSourceRef.current === source) {
        syncingSourceRef.current = null;
      }
    });
  }, []);

  useEffect(() => {
    if (currentChangeIndex >= 0 && currentChangeIndex < changedRenderIndices.length) {
      const targetRenderIndex = changedRenderIndices[currentChangeIndex];
      rowVirtualizer.scrollToIndex(targetRenderIndex, { align: "center", behavior: "smooth" });
    }
  }, [currentChangeIndex, changedRenderIndices, rowVirtualizer]);

  // Reset both panes only when sheet changes; avoid resetting on normal rerenders.
  useEffect(() => {
    rowVirtualizer.scrollToOffset(0);
    const left = leftRef.current;
    const right = rightRef.current;
    if (left) {
      left.scrollTop = 0;
      left.scrollLeft = 0;
    }
    if (right) {
      right.scrollTop = 0;
      right.scrollLeft = 0;
    }
  }, [sheetKey]);

  const renderCell = (
    rowItem: DiffRowRenderItem,
    colIndex: number,
    side: "original" | "modified",
  ) => {
    const cell = rowItem.row.cells[colIndex];
    const width = columnWidths.get(colIndex) ?? 80;
    const value = side === "original" ? cell?.original?.value : cell?.modified?.value;
    const displayValue = value !== null && value !== undefined ? String(value) : "";

    const isChanged =
      cell?.changeType === "modified" ||
      (side === "original" && cell?.changeType === "removed") ||
      (side === "modified" && cell?.changeType === "added");

    const isEmpty =
      (side === "original" && cell?.changeType === "added") ||
      (side === "modified" && cell?.changeType === "removed");

    return (
      <td
        key={colIndex}
        className={cn(
          "cursor-pointer truncate border-r px-2 py-1.5 transition-colors",
          "hover:bg-muted/50",
          isChanged && side === "original" && "bg-red-100/80 dark:bg-red-900/30",
          isChanged && side === "modified" && "bg-green-100/80 dark:bg-green-900/30",
          isEmpty && "bg-muted/30",
        )}
        style={{ width, minWidth: width, maxWidth: width }}
        onClick={() => cell && onCellClick?.(cell, rowItem.sourceIndex, colIndex)}
        title={displayValue}
      >
        <span
          className={cn(
            isChanged && side === "original" && "text-red-700 dark:text-red-400",
            isChanged && side === "modified" && "text-green-700 dark:text-green-400",
            isEmpty && "text-muted-foreground/50",
          )}
        >
          {isEmpty ? "—" : displayValue || <span className="text-muted-foreground">-</span>}
        </span>
      </td>
    );
  };

  const renderCollapsedRow = (
    item: CollapsedUnchangedRenderItem,
    virtualRow: ReturnType<typeof rowVirtualizer.getVirtualItems>[number],
    side: "original" | "modified",
  ) => (
    <tr
      key={`${virtualRow.key}-${side}`}
      className="border-b"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: virtualRow.size,
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      <td colSpan={visibleColumns.length + 1} className="p-0">
        <CollapsedUnchangedBlock
          hiddenRowCount={item.hiddenRowCount}
          isExpanded={expandedBlockIds.has(item.id)}
          onToggle={() => onToggleCollapsedBlock(item.id)}
        />
      </td>
    </tr>
  );

  const renderTable = (
    side: "original" | "modified",
    ref: React.RefObject<HTMLDivElement | null>,
  ) => (
    <div className="min-w-0 flex-1">
      <div
        className={cn(
          "sticky top-0 z-20 flex items-center justify-center gap-2 border-b py-2 font-semibold",
          side === "original"
            ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400"
            : "bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400",
        )}
      >
        <span
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white",
            side === "original" ? "bg-red-500" : "bg-green-500",
          )}
        >
          {side === "original" ? "A" : "B"}
        </span>
        <span className="max-w-[220px] truncate" title={side === "original" ? originalLabel : modifiedLabel}>
          {side === "original" ? originalLabel : modifiedLabel}
        </span>
      </div>
      <div
        ref={ref}
        className="h-[calc(100vh-180px)] overflow-auto"
        onScroll={() => handleScroll(side === "original" ? "left" : "right")}
      >
        <table
          className="w-full border-collapse text-sm"
          style={{ tableLayout: "fixed", minWidth: totalWidth }}
        >
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-muted">
              <th
                className="border-r bg-muted px-2 py-2 text-center text-xs font-medium text-muted-foreground"
                style={{ width: 50 }}
              >
                #
              </th>
              {visibleColumns.map((colIndex) => (
                <th
                  key={colIndex}
                  className="border-r bg-muted px-2 py-2 text-center text-xs font-semibold"
                  style={{ width: columnWidths.get(colIndex) ?? 80 }}
                >
                  {getColumnLetter(colIndex)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = renderItems[virtualRow.index];
              if (!item) {
                return null;
              }

              if (item.type === "collapsed") {
                return renderCollapsedRow(item, virtualRow, side);
              }

              const rowNumber =
                side === "original" ? item.row.originalIndex : item.row.modifiedIndex;
              const isCurrentChange = changedRenderIndices[currentChangeIndex] === virtualRow.index;

              return (
                <tr
                  key={`${virtualRow.key}-${side}`}
                  className={cn(
                    "border-b transition-colors",
                    item.row.changeType === "added" && "bg-green-50/50 dark:bg-green-900/10",
                    item.row.changeType === "removed" && "bg-red-50/50 dark:bg-red-900/10",
                    item.row.changeType === "modified" && "bg-yellow-50/30 dark:bg-yellow-900/5",
                    isCurrentChange && "ring-1 ring-inset ring-primary/40 bg-primary/5",
                  )}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <td
                    className="border-r bg-muted/50 px-2 py-1.5 text-center text-xs text-muted-foreground tabular-nums"
                    style={{ width: 50 }}
                  >
                    {rowNumber !== null ? rowNumber + 1 : ""}
                  </td>
                  {visibleColumns.map((colIndex) => renderCell(item, colIndex, side))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (renderItems.length === 0) {
    return (
      <div
        className={cn("flex items-center justify-center rounded-xl border bg-card p-12", className)}
      >
        <p className="text-muted-foreground">{t("noChanges")}</p>
      </div>
    );
  }

  return (
    <div className={cn("w-full min-w-0 overflow-hidden rounded-xl border bg-card", className)}>
      <div className="flex w-full min-w-0">
        {renderTable("original", leftRef)}
        <div className="relative w-1 flex-shrink-0 bg-border">
          <div className="absolute inset-0 bg-gradient-to-b from-red-500/20 via-muted-foreground/20 to-green-500/20" />
        </div>
        {renderTable("modified", rightRef)}
      </div>
    </div>
  );
}
