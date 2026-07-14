import type { Sentiment, ReputationalImpact, SourcePlatform } from "./types";

export const PLATFORMS: { value: SourcePlatform; label: string }[] = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X / Twitter" },
  { value: "threads", label: "Threads" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "news", label: "Online News" },
  { value: "blog", label: "Blog" },
  { value: "forum", label: "Forum" },
  { value: "rss", label: "RSS" },
  { value: "manual", label: "Manual Import" },
];

export const SENTIMENTS: { value: Sentiment; label: string }[] = [
  { value: "positive", label: "Positive" },
  { value: "negative", label: "Negative" },
  { value: "neutral", label: "Neutral" },
  { value: "mixed", label: "Mixed" },
];

export const ISSUE_CATEGORIES = [
  "customer service",
  "app issue",
  "pricing",
  "promo",
  "product",
  "regulation",
  "crisis",
  "fraud/scam",
  "competitor",
  "event",
  "csr",
  "public figure",
  "career",
  "irrelevant",
];

/** Daftar intent baku — dipakai prompt AI & normalisasi tampilan. */
export const INTENTS = [
  "complaint", "question", "praise", "objection", "desire",
  "fear", "confusion", "crisis signal", "information",
];

/** Petakan variasi bebas dari AI ke intent baku (mis. "mengeluh"→complaint). */
export function normalizeIntent(raw: string): string {
  const v = (raw || "").toLowerCase().trim();
  if (!v) return "information";
  if (/(complain|keluh|mengeluh|komplain)/.test(v)) return "complaint";
  if (/(question|tanya|pertanyaan|inquir)/.test(v)) return "question";
  if (/(praise|puji|apresias|positif)/.test(v)) return "praise";
  if (/(object|ragu|kebera|skeptis)/.test(v)) return "objection";
  if (/(desire|ingin|keingin|harap|request|permintaan)/.test(v)) return "desire";
  if (/(fear|takut|khawatir|cemas)/.test(v)) return "fear";
  if (/(confus|bingung)/.test(v)) return "confusion";
  if (/(crisis|krisis)/.test(v)) return "crisis signal";
  if (/(inform|netral|neutral|berita|fakta)/.test(v)) return "information";
  return INTENTS.includes(v) ? v : "information";
}

export const DATE_RANGES = [
  { value: "24h", label: "24 jam terakhir" },
  { value: "7d", label: "7 hari terakhir" },
  { value: "30d", label: "30 hari terakhir" },
  { value: "90d", label: "90 hari terakhir" },
  { value: "1y", label: "1 tahun terakhir" },
  { value: "all", label: "Semua waktu" },
];

// Warna sentiment/risk — selalu dipasangkan dengan label teks (bukan warna saja).
export const SENTIMENT_STYLES: Record<Sentiment, string> = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  negative: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  neutral: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  mixed: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
};

export const RISK_STYLES: Record<ReputationalImpact, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  medium: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  high: "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  critical: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
};

export const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.value, p.label])
);

export const SENTIMENT_CHART_COLORS: Record<Sentiment, string> = {
  positive: "#059669",
  negative: "#DC2626",
  neutral: "#64748B",
  mixed: "#7C3AED",
};

export const PAGE_SIZE_OPTIONS = [20, 50, 100];
export const DEFAULT_PAGE_SIZE = 20;
