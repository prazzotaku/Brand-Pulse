import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { buildBucketsByGranularity, type Granularity, type ResolvedPeriod } from "./period";

export interface TrendPoint {
  label: string;
  positive: number;
  negative: number;
  neutral: number;
  mixed: number;
  total: number;
}

/**
 * Hitung trendline sentimen dari mention yang cocok `where`, dibucket menurut
 * granularity terpilih (jam/hari/bulan/tahun) sepanjang periode. Filter platform
 * & sentimen sudah tercakup di `where` (dari buildSocialWhere/buildMentionWhere),
 * jadi trend selalu konsisten dengan filter aktif.
 */
export async function getSentimentTrend(
  where: Prisma.MentionWhereInput,
  period: ResolvedPeriod,
  gran: Granularity
): Promise<TrendPoint[]> {
  const rows = await prisma.mention.findMany({
    where,
    select: { publishedAt: true, analysis: { select: { sentiment: true } } },
    orderBy: { publishedAt: "asc" },
    take: 5000,
  });

  const from = period.from ?? rows[0]?.publishedAt ?? new Date(period.to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const buckets = buildBucketsByGranularity(from, period.to, gran);
  const points: TrendPoint[] = buckets.map((b) => ({
    label: b.label, positive: 0, negative: 0, neutral: 0, mixed: 0, total: 0,
  }));

  // Dua-pointer: rows & buckets sama-sama urut menaik → O(rows + buckets).
  let bi = 0;
  for (const r of rows) {
    while (bi < buckets.length && r.publishedAt >= buckets[bi].end) bi++;
    if (bi >= buckets.length) break;
    if (r.publishedAt >= buckets[bi].start) {
      const s = r.analysis?.sentiment;
      if (s === "positive" || s === "negative" || s === "neutral" || s === "mixed") points[bi][s]++;
      points[bi].total++;
    }
  }
  return points;
}
