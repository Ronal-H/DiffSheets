import { create } from "zustand";
import type {
  ComparisonOptions,
  FileUploadState,
  ParsedSpreadsheet,
  WorkbookDiffResult,
} from "@/types";
import { defaultComparisonOptions } from "@/types";

interface SpreadsheetStore {
  // File states
  originalFile: FileUploadState;
  modifiedFile: FileUploadState;

  // Workbook-level diff state
  workbookDiffResult: WorkbookDiffResult | null;
  currentSheetName: string | null;
  isComparing: boolean;
  comparisonError: string | null;
  comparisonVersion: number; // Used for cancellation

  // Options
  options: ComparisonOptions;

  // Actions - Original file
  setOriginalFile: (file: File | null) => void;
  setOriginalParsed: (parsed: ParsedSpreadsheet | null) => void;
  setOriginalSheet: (sheet: string) => void;
  setOriginalHeaderRow: (row: number) => void;
  setOriginalLoading: (loading: boolean) => void;
  setOriginalError: (error: string | null) => void;

  // Actions - Modified file
  setModifiedFile: (file: File | null) => void;
  setModifiedParsed: (parsed: ParsedSpreadsheet | null) => void;
  setModifiedSheet: (sheet: string) => void;
  setModifiedHeaderRow: (row: number) => void;
  setModifiedLoading: (loading: boolean) => void;
  setModifiedError: (error: string | null) => void;

  // Actions - Diff
  setWorkbookDiffResult: (result: WorkbookDiffResult | null) => void;
  setCurrentSheetName: (sheetName: string | null) => void;
  setIsComparing: (comparing: boolean) => void;
  setComparisonError: (error: string | null) => void;

  // Actions - Options
  setOptions: (options: Partial<ComparisonOptions>) => void;

  // Actions - Reset
  reset: () => void;
  resetOriginal: () => void;
  resetModified: () => void;

  // Actions - Recompare
  recompare: () => Promise<void>;
}

const initialFileState: FileUploadState = {
  file: null,
  parsed: null,
  selectedSheet: "",
  headerRow: 1,
  isLoading: false,
  error: null,
};

export const useSpreadsheetStore = create<SpreadsheetStore>((set) => ({
  // Initial states
  originalFile: { ...initialFileState },
  modifiedFile: { ...initialFileState },
  workbookDiffResult: null,
  currentSheetName: null,
  isComparing: false,
  comparisonError: null,
  comparisonVersion: 0,
  options: { ...defaultComparisonOptions },

  // Original file actions
  setOriginalFile: (file) =>
    set((state) => ({
      originalFile: { ...state.originalFile, file },
      workbookDiffResult: null,
      currentSheetName: null,
    })),
  setOriginalParsed: (parsed) =>
    set((state) => ({
      originalFile: {
        ...state.originalFile,
        parsed,
        selectedSheet: parsed?.sheets[0]?.name || "",
      },
      workbookDiffResult: null,
      currentSheetName: null,
    })),
  setOriginalSheet: (sheet) =>
    set((state) => ({
      originalFile: { ...state.originalFile, selectedSheet: sheet },
      workbookDiffResult: null,
      currentSheetName: null,
    })),
  setOriginalHeaderRow: (row) =>
    set((state) => ({
      originalFile: { ...state.originalFile, headerRow: row },
      workbookDiffResult: null,
      currentSheetName: null,
    })),
  setOriginalLoading: (isLoading) =>
    set((state) => ({
      originalFile: { ...state.originalFile, isLoading },
    })),
  setOriginalError: (error) =>
    set((state) => ({
      originalFile: { ...state.originalFile, error },
    })),

  // Modified file actions
  setModifiedFile: (file) =>
    set((state) => ({
      modifiedFile: { ...state.modifiedFile, file },
      workbookDiffResult: null,
      currentSheetName: null,
    })),
  setModifiedParsed: (parsed) =>
    set((state) => ({
      modifiedFile: {
        ...state.modifiedFile,
        parsed,
        selectedSheet: parsed?.sheets[0]?.name || "",
      },
      workbookDiffResult: null,
      currentSheetName: null,
    })),
  setModifiedSheet: (sheet) =>
    set((state) => ({
      modifiedFile: { ...state.modifiedFile, selectedSheet: sheet },
      workbookDiffResult: null,
      currentSheetName: null,
    })),
  setModifiedHeaderRow: (row) =>
    set((state) => ({
      modifiedFile: { ...state.modifiedFile, headerRow: row },
      workbookDiffResult: null,
      currentSheetName: null,
    })),
  setModifiedLoading: (isLoading) =>
    set((state) => ({
      modifiedFile: { ...state.modifiedFile, isLoading },
    })),
  setModifiedError: (error) =>
    set((state) => ({
      modifiedFile: { ...state.modifiedFile, error },
    })),

  // Diff actions
  setWorkbookDiffResult: (workbookDiffResult) => set({ workbookDiffResult }),
  setCurrentSheetName: (currentSheetName) => set({ currentSheetName }),
  setIsComparing: (isComparing) => set({ isComparing }),
  setComparisonError: (comparisonError) => set({ comparisonError }),

  // Options actions
  setOptions: (newOptions) =>
    set((state) => ({
      options: { ...state.options, ...newOptions },
    })),

  // Reset actions
  reset: () =>
    set({
      originalFile: { ...initialFileState },
      modifiedFile: { ...initialFileState },
      workbookDiffResult: null,
      currentSheetName: null,
      isComparing: false,
      comparisonError: null,
      options: { ...defaultComparisonOptions },
    }),
  resetOriginal: () =>
    set({
      originalFile: { ...initialFileState },
      workbookDiffResult: null,
      currentSheetName: null,
    }),
  resetModified: () =>
    set({
      modifiedFile: { ...initialFileState },
      workbookDiffResult: null,
      currentSheetName: null,
    }),

  // Recompare all sheets with current options (supports cancellation via version check)
  recompare: async () => {
    const currentState = useSpreadsheetStore.getState();
    const originalParsed = currentState.originalFile.parsed;
    const modifiedParsed = currentState.modifiedFile.parsed;

    if (!originalParsed || !modifiedParsed) {
      set({ comparisonError: "Missing workbook data" });
      return;
    }

    // Increment version to cancel any ongoing comparison
    const newVersion = currentState.comparisonVersion + 1;
    set({ isComparing: true, comparisonError: null, comparisonVersion: newVersion });

    try {
      const { computeWorkbookDiff } = await import("@/lib/diff/workbook-diff");

      // Yield to main thread before heavy workbook processing to keep UI responsive.
      await new Promise((resolve) => setTimeout(resolve, 0));

      const optionsForCompare = useSpreadsheetStore.getState().options;
      const workbookResult = await computeWorkbookDiff(
        originalParsed,
        modifiedParsed,
        optionsForCompare,
      );

      // Check if this comparison is still current (not cancelled)
      const latestState = useSpreadsheetStore.getState();
      if (latestState.comparisonVersion === newVersion) {
        const hasCurrentSheet = workbookResult.sheets.some(
          (sheet) => sheet.sheetName === latestState.currentSheetName,
        );
        const nextSheetName = hasCurrentSheet
          ? latestState.currentSheetName
          : (workbookResult.sheets[0]?.sheetName ?? null);

        set({
          workbookDiffResult: workbookResult,
          currentSheetName: nextSheetName,
          isComparing: false,
          comparisonError:
            workbookResult.sheets.length > 0 ? null : "No sheets available for comparison",
        });
      }
      // If version doesn't match, another comparison started - don't update state
    } catch (error) {
      // Only set error if this comparison is still current
      const latestState = useSpreadsheetStore.getState();
      if (latestState.comparisonVersion === newVersion) {
        set({
          comparisonError: error instanceof Error ? error.message : "Comparison failed",
          isComparing: false,
        });
      }
    }
  },
}));
