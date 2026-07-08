import type { Prisma } from "@prisma/client";
import { buildMentionWhere, type MentionFilters } from "./filters";
import { resolvePeriod, periodWhere, type PeriodSearchParams } from "./period";

export const SOCIAL_PLATFORMS = ["facebook", "instagram", "x", "threads", "tiktok", "youtube"];

export type SocialSearchParams = MentionFilters & PeriodSearchParams;

/**
 * SATU-SATUNYA sumber where-clause untuk Social Listening.
 * Dipakai oleh summary card (page) DAN drawer detail (/api/mentions) supaya
 * angka summary dan rincian data dijamin berasal dari query yang sama —
 * tidak ada dummy, local counter, atau cache agregat yang bisa tidak sinkron.
 */
export function buildSocialWhere(
  brandId: string,
  params: SocialSearchParams
): Prisma.MentionWhereInput {
  const where = buildMentionWhere(brandId, params);

  // Periode dari PeriodFilter (mendukung preset + bulan/tahun kalender).
  const period = resolvePeriod(params);
  where.publishedAt = periodWhere(period);

  // Scope sosial: tanpa filter platform → semua platform sosial;
  // dengan filter → iriskan dengan platform sosial saja.
  const requested = (params.platform ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const platforms = requested.length
    ? requested.filter((p) => SOCIAL_PLATFORMS.includes(p))
    : SOCIAL_PLATFORMS;
  where.sourcePlatform = { in: platforms.length ? platforms : SOCIAL_PLATFORMS };

  // Duplikat tidak pernah dihitung (dedup terjadi di ingest; guard ekstra di sini).
  where.isDuplicate = false;

  return where;
}

export interface SocialCategoryDef {
  key: string;
  label: string;
  kind: "all" | "sentiment" | "intent";
  value?: string;
}

/** Definisi kategori summary — dipakai page (hitung) dan API (detail). */
export const SOCIAL_CATEGORIES: SocialCategoryDef[] = [
  { key: "total", label: "Total Mention", kind: "all" },
  { key: "positive", label: "Positive", kind: "sentiment", value: "positive" },
  { key: "negative", label: "Negative", kind: "sentiment", value: "negative" },
  { key: "neutral", label: "Neutral", kind: "sentiment", value: "neutral" },
  { key: "mixed", label: "Mixed", kind: "sentiment", value: "mixed" },
  { key: "complaint", label: "Complaint", kind: "intent", value: "complaint" },
  { key: "question", label: "Question", kind: "intent", value: "question" },
  { key: "praise", label: "Praise", kind: "intent", value: "praise" },
  { key: "objection", label: "Objection", kind: "intent", value: "objection" },
  { key: "desire", label: "Desire", kind: "intent", value: "desire" },
  { key: "fear", label: "Fear", kind: "intent", value: "fear" },
  { key: "crisis-signal", label: "Crisis Signal", kind: "intent", value: "crisis signal" },
];

/** Persempit where sesuai kategori card yang diklik. */
export function applyCategory(
  where: Prisma.MentionWhereInput,
  cat: SocialCategoryDef
): Prisma.MentionWhereInput {
  if (cat.kind === "all") return where;
  const analysis = (where.analysis ?? {}) as Prisma.MentionAnalysisWhereInput;
  if (cat.kind === "sentiment") analysis.sentiment = cat.value;
  if (cat.kind === "intent") analysis.intent = cat.value;
  return { ...where, analysis };
}

/** Cek apakah sebuah mention (in-memory) masuk kategori — definisi identik dengan applyCategory. */
export function matchesCategory(
  m: { analysis: { sentiment: string; intent: string } | null },
  cat: SocialCategoryDef
): boolean {
  if (cat.kind === "all") return true;
  if (!m.analysis) return false;
  if (cat.kind === "sentiment") return m.analysis.sentiment === cat.value;
  return m.analysis.intent === cat.value;
}
