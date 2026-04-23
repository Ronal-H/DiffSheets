import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DynamicComparisonSection } from "@/components/landing/dynamic-comparison";
import { CompareHeader } from "@/components/layout/compare-header";
import type { Locale } from "@/i18n/routing";
import { BASE_URL, getAlternates, getLocalizedUrl } from "@/lib/utils";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "compare" });

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    alternates: getAlternates(locale, "/compare"),
    openGraph: {
      title: t("meta.title"),
      description: t("meta.description"),
      url: getLocalizedUrl(locale, "/compare"),
      type: "website",
      images: [`${BASE_URL}/og-image.png`],
    },
  };
}

export default async function ComparePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="relative flex min-h-screen flex-col bg-background overflow-x-hidden">
      {/* Background glow */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px]"
        style={{
          background: "radial-gradient(circle, rgba(34, 197, 94, 0.06) 0%, transparent 70%)",
        }}
      />

      <CompareHeader locale={locale as Locale} />

      <main className="relative flex-1 px-3 py-4 sm:px-4 lg:px-6">
        <DynamicComparisonSection />
      </main>
    </div>
  );
}
