"use client";

import { FilePlus2, FileSpreadsheet, FileX2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SheetChangeType, SheetDiffResult, WorkbookDiffSummary } from "@/types";

interface SheetDiffSidebarProps {
  sheets: SheetDiffResult[];
  summary: WorkbookDiffSummary;
  currentSheetName: string | null;
  onSelectSheet: (sheetName: string) => void;
  className?: string;
}

function getStatusLabelKey(changeType: SheetChangeType): string {
  switch (changeType) {
    case "added":
      return "added";
    case "removed":
      return "removed";
    case "modified":
      return "modified";
    case "unchanged":
      return "unchanged";
  }
}

function getStatusIcon(changeType: SheetChangeType) {
  switch (changeType) {
    case "added":
      return FilePlus2;
    case "removed":
      return FileX2;
    case "modified":
      return RefreshCw;
    case "unchanged":
      return FileSpreadsheet;
  }
}

function getStatusClassName(changeType: SheetChangeType): string {
  switch (changeType) {
    case "added":
      return "text-green-700 dark:text-green-400";
    case "removed":
      return "text-red-700 dark:text-red-400";
    case "modified":
      return "text-amber-700 dark:text-amber-400";
    case "unchanged":
      return "text-muted-foreground";
  }
}

export function SheetDiffSidebar({
  sheets,
  summary,
  currentSheetName,
  onSelectSheet,
  className,
}: SheetDiffSidebarProps) {
  const t = useTranslations("diff.sheetSidebar");

  return (
    <aside
      className={cn(
        "w-full rounded-xl border bg-card p-2.5",
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-xs font-semibold">{t("title")}</h3>
          <p className="text-[11px] text-muted-foreground">
            {t("sheetCount", { count: summary.totalSheets })}
          </p>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
            M {summary.modifiedSheets}
          </span>
          <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-green-700 dark:text-green-400">
            + {summary.addedSheets}
          </span>
          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-700 dark:text-red-400">
            - {summary.removedSheets}
          </span>
          <span className="rounded bg-muted/70 px-1.5 py-0.5 text-muted-foreground">
            = {summary.unchangedSheets}
          </span>
        </div>
      </div>

      {/* Use a compact horizontal strip so sheet navigation does not steal space from the diff grid. */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {sheets.map((sheet) => {
          const isActive = sheet.sheetName === currentSheetName;
          const StatusIcon = getStatusIcon(sheet.changeType);
          const statusClassName = getStatusClassName(sheet.changeType);
          const statusLabel = t(`status.${getStatusLabelKey(sheet.changeType)}`);
          const changedRowCount =
            sheet.summary.modifiedRows + sheet.summary.addedRows + sheet.summary.removedRows;

          return (
            <button
              key={sheet.sheetId}
              type="button"
              onClick={() => onSelectSheet(sheet.sheetName)}
              className={cn(
                "inline-flex flex-shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-left transition-colors",
                "hover:border-green-500/40 hover:bg-green-500/5",
                isActive ? "border-green-500/60 bg-green-500/10" : "border-border bg-background",
              )}
              title={`${sheet.sheetName} · ${statusLabel}`}
            >
              <StatusIcon className={cn("h-3.5 w-3.5 flex-shrink-0", statusClassName)} />
              <span className="max-w-[140px] truncate text-xs font-medium">{sheet.sheetName}</span>
              <span className={cn("text-[10px]", statusClassName)}>{changedRowCount}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {t("sheetCount", { count: summary.totalSheets })}
        {" · "}
        {t("modifiedCount", { count: summary.modifiedSheets })}
        {" · "}
        {t("addedCount", { count: summary.addedSheets })}
        {" · "}
        {t("removedCount", { count: summary.removedSheets })}
      </p>
    </aside>
  );
}
