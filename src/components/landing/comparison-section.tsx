"use client";

import { Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { DiffView } from "@/components/diff";
import { ComparisonUploader } from "@/components/upload";
import { cn } from "@/lib/utils";
import { useSpreadsheetStore } from "@/store";

export function ComparisonSection() {
  const t = useTranslations("upload");
  const { workbookDiffResult } = useSpreadsheetStore();
  const hasDiffResult = Boolean(workbookDiffResult);

  return (
    <section
      id="compare"
      className={cn("transition-all", hasDiffResult ? "py-0" : "py-4")}
      aria-label="File comparison tool"
    >
      {!hasDiffResult && (
        // Keep onboarding copy only in upload state; hide it after comparison to maximize diff viewport.
        <div className="mb-6 text-center">
          <h1 className="mb-2 font-display text-xl font-bold tracking-tight md:text-2xl">
            {t("title")}
          </h1>
          <p className="mx-auto mb-3 max-w-lg text-sm text-muted-foreground md:text-base">
            {t("subtitle")}
          </p>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-xs text-green-600 dark:text-green-400">
            <Shield className="h-3 w-3" />
            <span>100% Private</span>
          </div>
        </div>
      )}

      {hasDiffResult ? (
        <DiffView />
      ) : (
        <div className="mx-auto max-w-5xl">
          <ComparisonUploader />
        </div>
      )}
    </section>
  );
}
