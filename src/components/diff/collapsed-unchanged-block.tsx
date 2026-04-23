"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CollapsedUnchangedBlockProps {
  hiddenRowCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
}

export function CollapsedUnchangedBlock({
  hiddenRowCount,
  isExpanded,
  onToggle,
  className,
}: CollapsedUnchangedBlockProps) {
  const t = useTranslations("diff.collapsed");

  return (
    <div
      className={cn(
        "flex h-full items-center justify-center border-y bg-muted/30 px-3 py-1.5",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="h-7 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {isExpanded ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
        {isExpanded
          ? t("collapse", { count: hiddenRowCount })
          : t("expand", { count: hiddenRowCount })}
      </Button>
    </div>
  );
}
