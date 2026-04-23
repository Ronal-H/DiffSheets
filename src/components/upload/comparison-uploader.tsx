"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { parseSpreadsheet } from "@/lib/parser";
import { useSpreadsheetStore } from "@/store";
import { FileDropzone } from "./file-dropzone";
import { MatchingOptions } from "./matching-options";
import { SheetSelector } from "./sheet-selector";
import { SpreadsheetPreview } from "./spreadsheet-preview";

export function ComparisonUploader() {
  const t = useTranslations("upload");

  const {
    originalFile,
    modifiedFile,
    currentSheetName,
    isComparing,
    options,
    setOriginalFile,
    setOriginalParsed,
    setOriginalSheet,
    setOriginalLoading,
    setOriginalError,
    setModifiedFile,
    setModifiedParsed,
    setModifiedSheet,
    setModifiedLoading,
    setModifiedError,
    setWorkbookDiffResult,
    setCurrentSheetName,
    setIsComparing,
    setComparisonError,
    setOptions,
    resetOriginal,
    resetModified,
  } = useSpreadsheetStore();

  const parseAndSetFile = useCallback(
    async (side: "original" | "modified", file: File) => {
      const setFile = side === "original" ? setOriginalFile : setModifiedFile;
      const setLoading = side === "original" ? setOriginalLoading : setModifiedLoading;
      const setError = side === "original" ? setOriginalError : setModifiedError;
      const setParsed = side === "original" ? setOriginalParsed : setModifiedParsed;

      setFile(file);
      setLoading(true);
      setError(null);

      try {
        const parsed = await parseSpreadsheet(file);
        setParsed(parsed);
        return parsed;
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to parse file");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [
      setOriginalFile,
      setOriginalLoading,
      setOriginalError,
      setOriginalParsed,
      setModifiedFile,
      setModifiedLoading,
      setModifiedError,
      setModifiedParsed,
    ],
  );

  const handleOriginalFileSelect = useCallback(
    async (file: File) => {
      await parseAndSetFile("original", file);
    },
    [parseAndSetFile],
  );

  const handleModifiedFileSelect = useCallback(
    async (file: File) => {
      await parseAndSetFile("modified", file);
    },
    [parseAndSetFile],
  );

  const handleFilePairSelect = useCallback(
    async (files: [File, File]) => {
      const [originalCandidate, modifiedCandidate] = files;
      setComparisonError(null);
      await Promise.all([
        parseAndSetFile("original", originalCandidate),
        parseAndSetFile("modified", modifiedCandidate),
      ]);
    },
    [parseAndSetFile, setComparisonError],
  );

  const canCompare =
    originalFile.parsed &&
    modifiedFile.parsed &&
    !originalFile.isLoading &&
    !modifiedFile.isLoading;

  const handleCompare = useCallback(async () => {
    const originalParsed = originalFile.parsed;
    const modifiedParsed = modifiedFile.parsed;

    if (!originalParsed || !modifiedParsed) {
      setComparisonError("Missing workbook data");
      return;
    }

    setIsComparing(true);
    setComparisonError(null);

    try {
      // Lazy-load workbook diff module only when user clicks Compare to keep initial bundle small.
      const { computeWorkbookDiff } = await import("@/lib/diff/workbook-diff");
      const workbookResult = await computeWorkbookDiff(originalParsed, modifiedParsed, options);

      if (workbookResult.sheets.length === 0) {
        setWorkbookDiffResult(null);
        setCurrentSheetName(null);
        setComparisonError("No sheets available for comparison");
        return;
      }

      const hasCurrentSheet = workbookResult.sheets.some(
        (sheet) => sheet.sheetName === currentSheetName,
      );
      const nextSheetName = hasCurrentSheet
        ? currentSheetName
        : (workbookResult.sheets[0]?.sheetName ?? null);

      setWorkbookDiffResult(workbookResult);
      setCurrentSheetName(nextSheetName);
    } catch (error) {
      setComparisonError(error instanceof Error ? error.message : "Comparison failed");
    } finally {
      setIsComparing(false);
    }
  }, [
    originalFile.parsed,
    modifiedFile.parsed,
    currentSheetName,
    options,
    setWorkbookDiffResult,
    setCurrentSheetName,
    setIsComparing,
    setComparisonError,
  ]);

  const originalSheetData = originalFile.parsed?.data.get(originalFile.selectedSheet);
  const modifiedSheetData = modifiedFile.parsed?.data.get(modifiedFile.selectedSheet);

  return (
    <div className="space-y-6">
      {/* File Upload Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Original File */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-red-500/10 font-mono text-xs font-semibold text-red-600 dark:text-red-400">
              A
            </span>
            <span className="font-display text-sm font-medium text-muted-foreground">
              {t("original")}
            </span>
          </div>
          <FileDropzone
            side="original"
            file={originalFile.file}
            isLoading={originalFile.isLoading}
            error={originalFile.error}
            onFileSelect={handleOriginalFileSelect}
            onFilePairSelect={handleFilePairSelect}
            onUploadError={setComparisonError}
            onFileClear={resetOriginal}
          />

          {originalFile.parsed && (
            <SheetSelector
              sheets={originalFile.parsed.sheets}
              selectedSheet={originalFile.selectedSheet}
              onSheetChange={setOriginalSheet}
            />
          )}

          {originalSheetData && <SpreadsheetPreview data={originalSheetData} />}
        </div>

        {/* Modified File */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-green-500/10 font-mono text-xs font-semibold text-green-600 dark:text-green-400">
              B
            </span>
            <span className="font-display text-sm font-medium text-muted-foreground">
              {t("modified")}
            </span>
          </div>
          <FileDropzone
            side="modified"
            file={modifiedFile.file}
            isLoading={modifiedFile.isLoading}
            error={modifiedFile.error}
            onFileSelect={handleModifiedFileSelect}
            onFilePairSelect={handleFilePairSelect}
            onUploadError={setComparisonError}
            onFileClear={resetModified}
          />

          {modifiedFile.parsed && (
            <SheetSelector
              sheets={modifiedFile.parsed.sheets}
              selectedSheet={modifiedFile.selectedSheet}
              onSheetChange={setModifiedSheet}
            />
          )}

          {modifiedSheetData && <SpreadsheetPreview data={modifiedSheetData} />}
        </div>
      </div>

      {/* Matching Options */}
      <MatchingOptions
        originalSheet={originalSheetData ?? null}
        modifiedSheet={modifiedSheetData ?? null}
        options={options}
        onOptionsChange={setOptions}
      />

      {/* Compare Button */}
      <div className="flex justify-center pt-2">
        <Button
          size="lg"
          disabled={!canCompare || isComparing}
          onClick={handleCompare}
          className="gap-2 bg-green-500 hover:bg-green-400 text-slate-950 font-semibold px-8 shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all disabled:opacity-50 disabled:shadow-none"
        >
          {isComparing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("processing")}
            </>
          ) : (
            <>
              {t("findDifference")}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
