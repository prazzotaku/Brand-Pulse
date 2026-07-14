import { cn } from "@/lib/utils";
import { SENTIMENT_STYLES, RISK_STYLES, PLATFORM_LABELS } from "@/lib/constants";
import type { ReputationalImpact, Sentiment } from "@/lib/types";

/* Badge sentiment & risk selalu menampilkan label teks — tidak mengandalkan warna saja. */

export function SentimentBadge({ sentiment }: { sentiment: string }) {
  const style = SENTIMENT_STYLES[sentiment as Sentiment] ?? SENTIMENT_STYLES.neutral;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize", style)}>
      {sentiment || "n/a"}
    </span>
  );
}

export function RiskBadge({ impact, score }: { impact: string; score?: number }) {
  const style = RISK_STYLES[impact as ReputationalImpact] ?? RISK_STYLES.low;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize", style)}>
      {impact}
      {typeof score === "number" && <span className="font-mono">{score}</span>}
    </span>
  );
}

export function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className="inline-flex items-center rounded-md border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      {PLATFORM_LABELS[platform] ?? platform}
    </span>
  );
}

const ORIGIN_META: Record<string, { label: string; style: string; title: string }> = {
  mock: {
    label: "Legacy",
    style: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
    title: "Data lama dari konfigurasi sebelumnya. Tautan sumber mungkin tidak lagi tersedia.",
  },
  rss: {
    label: "Live",
    style: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    title: "Data nyata dari RSS publik — artikel & link asli.",
  },
  api: {
    label: "Live",
    style: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    title: "Data nyata dari API resmi platform.",
  },
  import: {
    label: "Import",
    style: "bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
    title: "Data hasil upload manual CSV/JSON oleh user.",
  },
};

/** Pembeda asal data — selalu dengan label teks + tooltip. */
export function OriginBadge({ origin }: { origin: string }) {
  const meta = ORIGIN_META[origin] ?? ORIGIN_META.import;
  return (
    <span
      title={meta.title}
      className={cn("inline-flex cursor-help items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide", meta.style)}
    >
      {meta.label}
    </span>
  );
}
