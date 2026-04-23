"use client";

import { Loader2, Settings2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  materializeDiffRenderItems,
  splitDiffRowsIntoRenderItems,
  type DiffRenderItem,
} from "@/lib/diff/unchanged-blocks";
import { filterDiffColumns, filterDiffRows } from "@/lib/diff";
import { SUPPORTED_EXTENSIONS, isFileSupported, parseSpreadsheet } from "@/lib/parser";
import { useSpreadsheetStore } from "@/store";
import type { DiffCell, MatchingStrategy } from "@/types";
import { CellInspector } from "./cell-inspector";
import { ChangeNavigation } from "./change-navigation";
import { DiffGrid } from "./diff-grid";
import { DiffSummary } from "./diff-summary";
import { SheetDiffSidebar } from "./sheet-diff-sidebar";
import { SideBySideGrid } from "./side-by-side-grid";
import { type ViewMode, ViewModeSelector } from "./view-mode-selector";

export function DiffView() {
  const t = useTranslations("diff");
  const tOptions = useTranslations("diff.options");
  const tMatching = useTranslations("matching");
  const {
    workbookDiffResult,
    currentSheetName,
    setCurrentSheetName,
    setComparisonError,
    setIsComparing,
    options,
    setOptions,
    isComparing,
    recompare,
    originalFile,
    modifiedFile,
  } = useSpreadsheetStore();

  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
  const [expandedBlockIds, setExpandedBlockIds] = useState<Set<string>>(new Set());
  const [selectedCell, setSelectedCell] = useState<{
    cell: DiffCell;
    rowIndex: number;
    colIndex: number;
  } | null>(null);

  const currentSheetResult = useMemo(() => {
    if (!workbookDiffResult || workbookDiffResult.sheets.length === 0) {
      return null;
    }
    if (currentSheetName) {
      const matched = workbookDiffResult.sheets.find(
        (sheet) => sheet.sheetName === currentSheetName,
      );
      if (matched) {
        return matched;
      }
    }
    return workbookDiffResult.sheets[0] ?? null;
  }, [workbookDiffResult, currentSheetName]);
  const originalReplaceInputRef = useRef<HTMLInputElement>(null);
  const modifiedReplaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!workbookDiffResult || workbookDiffResult.sheets.length === 0) {
      return;
    }
    if (!currentSheetResult) {
      setCurrentSheetName(workbookDiffResult.sheets[0]?.sheetName ?? null);
    }
  }, [workbookDiffResult, currentSheetResult, setCurrentSheetName]);

  const diffResult = currentSheetResult?.diffResult ?? null;

  const visibleRows = useMemo(() => {
    if (!diffResult) return [];
    return filterDiffRows(diffResult, options);
  }, [diffResult, options]);

  const visibleColumns = useMemo(() => {
    if (!diffResult) return [];
    return filterDiffColumns(diffResult, options);
  }, [diffResult, options]);

  const collapsedBaseItems = useMemo(() => {
    if (options.hideUnchangedRows) {
      // hideUnchangedRows already removes unchanged entries, so we keep a flat row list.
      return visibleRows.map((row, index) => ({
        type: "row",
        id: `row-${index}`,
        sourceIndex: index,
        row,
      })) as DiffRenderItem[];
    }
    return splitDiffRowsIntoRenderItems(visibleRows);
  }, [visibleRows, options.hideUnchangedRows]);

  const renderItems = useMemo(
    () => materializeDiffRenderItems(collapsedBaseItems, expandedBlockIds),
    [collapsedBaseItems, expandedBlockIds],
  );

  const totalChanges = useMemo(() => {
    return renderItems.filter(
      (item) => item.type === "row" && item.row.changeType !== "unchanged",
    ).length;
  }, [renderItems]);

  useEffect(() => {
    if (currentChangeIndex >= totalChanges) {
      setCurrentChangeIndex(Math.max(0, totalChanges - 1));
    }
  }, [totalChanges, currentChangeIndex]);

  // Reset per-sheet UI state when sheet changes, so navigation and fold state stay consistent.
  useEffect(() => {
    setCurrentChangeIndex(0);
    setExpandedBlockIds(new Set());
    setSelectedCell(null);
  }, [currentSheetResult?.sheetId]);

  const handleCellClick = useCallback((cell: DiffCell, rowIndex: number, colIndex: number) => {
    setSelectedCell({ cell, rowIndex, colIndex });
  }, []);

  const handleCloseInspector = useCallback(() => {
    setSelectedCell(null);
  }, []);

  const handleToggleCollapsedBlock = useCallback((blockId: string) => {
    setExpandedBlockIds((previous) => {
      const next = new Set(previous);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  const recompareTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedRecompare = useCallback(() => {
    if (recompareTimeoutRef.current) {
      clearTimeout(recompareTimeoutRef.current);
    }
    recompareTimeoutRef.current = setTimeout(() => {
      recompare();
    }, 100);
  }, [recompare]);

  useEffect(() => {
    return () => {
      if (recompareTimeoutRef.current) {
        clearTimeout(recompareTimeoutRef.current);
      }
    };
  }, []);

  const handleMatchingStrategyChange = useCallback(
    (strategy: string) => {
      setOptions({ matchingStrategy: strategy as MatchingStrategy });
      debouncedRecompare();
    },
    [setOptions, debouncedRecompare],
  );

  const handleKeyColumnChange = useCallback(
    (columnIndex: number) => {
      setOptions({ keyColumnIndex: columnIndex });
      debouncedRecompare();
    },
    [setOptions, debouncedRecompare],
  );

  const handleIgnoredColumnToggle = useCallback(
    (columnIndex: number) => {
      const currentIgnored = options.ignoredColumns ?? [];
      const newIgnored = currentIgnored.includes(columnIndex)
        ? currentIgnored.filter((i) => i !== columnIndex)
        : [...currentIgnored, columnIndex];
      setOptions({ ignoredColumns: newIgnored });
      debouncedRecompare();
    },
    [options.ignoredColumns, setOptions, debouncedRecompare],
  );

  const availableColumns = useMemo(() => {
    if (!currentSheetResult) return [];

    const sourceSheet =
      (currentSheetResult.originalSheetName
        ? originalFile.parsed?.data.get(currentSheetResult.originalSheetName)
        : null) ??
      (currentSheetResult.modifiedSheetName
        ? modifiedFile.parsed?.data.get(currentSheetResult.modifiedSheetName)
        : null);

    if (!sourceSheet) return [];

    return sourceSheet.columns.map((column) => ({
      index: column.index,
      letter: column.letter,
      header: sourceSheet.rows[0]?.[column.index]?.value,
    }));
  }, [currentSheetResult, originalFile.parsed, modifiedFile.parsed]);

  const handleReplaceFile = useCallback(
    async (side: "original" | "modified", file: File) => {
      if (!isFileSupported(file)) {
        setComparisonError("Unsupported file type");
        return;
      }

      const oppositeParsed =
        side === "original" ? modifiedFile.parsed : originalFile.parsed;
      if (!oppositeParsed) {
        setComparisonError("Missing workbook data");
        return;
      }

      setIsComparing(true);
      setComparisonError(null);

      try {
        const parsed = await parseSpreadsheet(file);
        const nextOriginalParsed = side === "original" ? parsed : originalFile.parsed;
        const nextModifiedParsed = side === "modified" ? parsed : modifiedFile.parsed;

        if (!nextOriginalParsed || !nextModifiedParsed) {
          throw new Error("Missing workbook data");
        }

        const { computeWorkbookDiff } = await import("@/lib/diff/workbook-diff");
        const workbookResult = await computeWorkbookDiff(
          nextOriginalParsed,
          nextModifiedParsed,
          options,
        );

        if (workbookResult.sheets.length === 0) {
          throw new Error("No sheets available for comparison");
        }

        const preferredSheetName = currentSheetResult?.sheetName ?? currentSheetName;
        const hasPreferredSheet = workbookResult.sheets.some(
          (sheet) => sheet.sheetName === preferredSheetName,
        );
        const nextSheetName = hasPreferredSheet
          ? preferredSheetName
          : (workbookResult.sheets[0]?.sheetName ?? null);

        // Update files + workbook result in one state commit to avoid diff view flicker.
        useSpreadsheetStore.setState((state) => {
          const nextOriginalFile =
            side === "original"
              ? {
                  ...state.originalFile,
                  file,
                  parsed,
                  selectedSheet:
                    parsed.sheets.find((sheet) => sheet.name === state.originalFile.selectedSheet)
                      ?.name ?? parsed.sheets[0]?.name ?? "",
                  isLoading: false,
                  error: null,
                }
              : state.originalFile;
          const nextModifiedFile =
            side === "modified"
              ? {
                  ...state.modifiedFile,
                  file,
                  parsed,
                  selectedSheet:
                    parsed.sheets.find((sheet) => sheet.name === state.modifiedFile.selectedSheet)
                      ?.name ?? parsed.sheets[0]?.name ?? "",
                  isLoading: false,
                  error: null,
                }
              : state.modifiedFile;

          return {
            originalFile: nextOriginalFile,
            modifiedFile: nextModifiedFile,
            workbookDiffResult: workbookResult,
            currentSheetName: nextSheetName,
            comparisonError: null,
            isComparing: false,
          };
        });
      } catch (error) {
        setComparisonError(error instanceof Error ? error.message : "Comparison failed");
        setIsComparing(false);
      }
    },
    [
      modifiedFile.parsed,
      originalFile.parsed,
      options,
      currentSheetResult?.sheetName,
      currentSheetName,
      setComparisonError,
      setIsComparing,
    ],
  );

  const triggerReplaceFileDialog = useCallback((side: "original" | "modified") => {
    if (side === "original") {
      originalReplaceInputRef.current?.click();
      return;
    }
    modifiedReplaceInputRef.current?.click();
  }, []);

  const handleOriginalReplacementPick = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      await handleReplaceFile("original", file);
    },
    [handleReplaceFile],
  );

  const handleModifiedReplacementPick = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      await handleReplaceFile("modified", file);
    },
    [handleReplaceFile],
  );

  if (!workbookDiffResult || !currentSheetResult || !diffResult) {
    return null;
  }

  return (
    <div className="flex h-full flex-col animate-slide-up-fade">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-base font-semibold">{t("title")}</h2>
          <DiffSummary summary={currentSheetResult.summary} />
          <span className="text-xs text-muted-foreground">
            {t("activeSheet", { name: currentSheetResult.sheetName })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ViewModeSelector mode={viewMode} onChange={setViewMode} />

          <input
            ref={originalReplaceInputRef}
            type="file"
            accept={SUPPORTED_EXTENSIONS.join(",")}
            className="hidden"
            onChange={handleOriginalReplacementPick}
          />
          <input
            ref={modifiedReplaceInputRef}
            type="file"
            accept={SUPPORTED_EXTENSIONS.join(",")}
            className="hidden"
            onChange={handleModifiedReplacementPick}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => triggerReplaceFileDialog("original")}
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("actions.replaceOriginal")}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => triggerReplaceFileDialog("modified")}
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("actions.replaceModified")}</span>
          </Button>

          {totalChanges > 0 && (
            <ChangeNavigation
              currentIndex={currentChangeIndex}
              totalChanges={totalChanges}
              onNavigate={setCurrentChangeIndex}
            />
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tOptions("title")}</span>
                {isComparing && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>{tMatching("strategy.label")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={options.matchingStrategy}
                onValueChange={handleMatchingStrategyChange}
              >
                <DropdownMenuRadioItem value="position">
                  {tMatching("strategy.position.label")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="key-column">
                  {tMatching("strategy.keyColumn.label")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="lcs">
                  {tMatching("strategy.lcs.label")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>

              {options.matchingStrategy === "key-column" && availableColumns.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>{tMatching("keyColumn.label")}</DropdownMenuLabel>
                  <div className="max-h-[200px] overflow-y-auto">
                    <DropdownMenuRadioGroup
                      value={options.keyColumnIndex?.toString() ?? ""}
                      onValueChange={(value) => handleKeyColumnChange(Number(value))}
                    >
                      {availableColumns.map((column) => (
                        <DropdownMenuRadioItem
                          key={column.index}
                          value={column.index.toString()}
                        >
                          <span className="font-mono">{column.letter}</span>
                          {column.header && (
                            <span className="ml-2 max-w-[150px] truncate text-muted-foreground">
                              - {String(column.header)}
                            </span>
                          )}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </div>
                </>
              )}

              {availableColumns.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>
                    {tMatching("ignoredColumns.label")}
                    {(options.ignoredColumns?.length ?? 0) > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({options.ignoredColumns?.length})
                      </span>
                    )}
                  </DropdownMenuLabel>
                  <div className="max-h-[200px] overflow-y-auto">
                    {availableColumns.map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.index}
                        checked={options.ignoredColumns?.includes(column.index) ?? false}
                        onCheckedChange={() => handleIgnoredColumnToggle(column.index)}
                      >
                        <span className="font-mono">{column.letter}</span>
                        {column.header && (
                          <span className="ml-2 max-w-[150px] truncate text-muted-foreground">
                            - {String(column.header)}
                          </span>
                        )}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                </>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuLabel>{t("displayLabel")}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={options.hideUnchangedRows}
                onCheckedChange={(checked) => setOptions({ hideUnchangedRows: checked })}
              >
                {tOptions("hideUnchangedRows")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={options.hideUnchangedColumns}
                onCheckedChange={(checked) => setOptions({ hideUnchangedColumns: checked })}
              >
                {tOptions("hideUnchangedCols")}
              </DropdownMenuCheckboxItem>

              <DropdownMenuSeparator />

              <DropdownMenuLabel>{t("comparisonLabel")}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={options.ignoreWhitespace}
                onCheckedChange={(checked) => {
                  setOptions({ ignoreWhitespace: checked });
                  debouncedRecompare();
                }}
              >
                {tOptions("ignoreWhitespace")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={options.ignoreCase}
                onCheckedChange={(checked) => {
                  setOptions({ ignoreCase: checked });
                  debouncedRecompare();
                }}
              >
                {tOptions("ignoreCase")}
              </DropdownMenuCheckboxItem>

              <DropdownMenuSeparator />

              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                <span className="font-medium">Shortcuts:</span>{" "}
                <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">n</kbd>/
                <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">p</kbd> navigate
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
        <SheetDiffSidebar
          sheets={workbookDiffResult.sheets}
          summary={workbookDiffResult.summary}
          currentSheetName={currentSheetResult.sheetName}
          onSelectSheet={setCurrentSheetName}
        />

        <div className="relative min-h-0 min-w-0 flex-1">
          {viewMode === "side-by-side" ? (
            <SideBySideGrid
              renderItems={renderItems}
              visibleColumns={visibleColumns}
              currentChangeIndex={currentChangeIndex}
              sheetKey={currentSheetResult.sheetId}
              originalLabel={originalFile.file?.name || "Original"}
              modifiedLabel={modifiedFile.file?.name || "Modified"}
              expandedBlockIds={expandedBlockIds}
              onToggleCollapsedBlock={handleToggleCollapsedBlock}
              onCellClick={handleCellClick}
            />
          ) : (
            <DiffGrid
              diffResult={diffResult}
              visibleRows={visibleRows}
              visibleColumns={visibleColumns}
            />
          )}

          {isComparing && (
            <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-green-500" />
                <p className="text-sm font-medium text-muted-foreground">{t("processing")}</p>
              </div>
            </div>
          )}

          {selectedCell && (
            <CellInspector
              cell={selectedCell.cell}
              rowIndex={selectedCell.rowIndex}
              colIndex={selectedCell.colIndex}
              onClose={handleCloseInspector}
            />
          )}
        </div>
      </div>
    </div>
  );
}
