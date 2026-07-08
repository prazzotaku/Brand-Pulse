import { prisma } from "./prisma";
import { buildTimeBuckets, periodWhere, resolvePeriod, type ResolvedPeriod } from "./period";
import type { Sentiment } from "./types";

export interface OverviewStats {
  brandHealthScore: number;
  totalMentions: number;
  sentimentSplit: Record<Sentiment, number>;
  negativeSpike: { current: number; baseline: number; isSpiking: boolean };
  topIssue: { category: string; count: number } | null;
  topOpportunity: { intent: string; count: number } | null;
  platformCounts: { platform: string; count: number }[];
  toneTrend: { date: string; positive: number; negative: number; neutral: number; mixed: number }[];
  audienceMood: { intent: string; count: number }[];
  lastRefresh: Date | null;
  avgRisk: number;
  periodLabel: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getOverviewStats(
  brandId: string,
  period?: ResolvedPeriod
): Promise<OverviewStats> {
  const p = period ?? resolvePeriod({ range: "7d" });

  const mentions = await prisma.mention.findMany({
    where: { brandId, publishedAt: periodWhere(p) },
    include: { analysis: true },
    orderBy: { publishedAt: "desc" },
  });

  const sentimentSplit: Record<Sentiment, number> = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
  const issueCounts = new Map<string, number>();
  const intentCounts = new Map<string, number>();
  const platformMap = new Map<string, number>();
  let riskSum = 0;
  let riskN = 0;

  for (const m of mentions) {
    platformMap.set(m.sourcePlatform, (platformMap.get(m.sourcePlatform) ?? 0) + 1);
    const a = m.analysis;
    if (!a) continue;
    if (a.sentiment in sentimentSplit) sentimentSplit[a.sentiment as Sentiment]++;
    if (a.issueCategory && a.issueCategory !== "irrelevant") {
      issueCounts.set(a.issueCategory, (issueCounts.get(a.issueCategory) ?? 0) + 1);
    }
    if (a.intent) intentCounts.set(a.intent, (intentCounts.get(a.intent) ?? 0) + 1);
    riskSum += a.riskScore;
    riskN++;
  }

  // Negative spike selalu dievaluasi real-time: 24 jam terakhir vs 24 jam sebelumnya
  // (independen dari periode analisis yang dipilih user).
  const now = Date.now();
  const [currentNeg, baselineNeg] = await Promise.all([
    prisma.mentionAnalysis.count({
      where: { sentiment: "negative", mention: { brandId, publishedAt: { gte: new Date(now - DAY_MS) } } },
    }),
    prisma.mentionAnalysis.count({
      where: {
        sentiment: "negative",
        mention: { brandId, publishedAt: { gte: new Date(now - 2 * DAY_MS), lt: new Date(now - DAY_MS) } },
      },
    }),
  ]);

  // Tren tone per bucket (jam/hari/minggu/bulan) sesuai granularity periode.
  const fallbackFrom = mentions.length
    ? mentions[mentions.length - 1].publishedAt
    : new Date(now - 6 * DAY_MS);
  const buckets = buildTimeBuckets(p, fallbackFrom);
  const toneTrend = buckets.map((b) => {
    const point = { date: b.label, positive: 0, negative: 0, neutral: 0, mixed: 0 };
    for (const m of mentions) {
      if (m.publishedAt >= b.start && m.publishedAt < b.end && m.analysis) {
        const s = m.analysis.sentiment as Sentiment;
        if (s in point) point[s]++;
      }
    }
    return point;
  });

  const analyzed = sentimentSplit.positive + sentimentSplit.negative + sentimentSplit.neutral + sentimentSplit.mixed;
  const avgRisk = riskN ? Math.round(riskSum / riskN) : 0;

  // Brand Health Score: gabungan sentimen (60%) dan kebalikan risiko (40%).
  const sentimentComponent = analyzed
    ? ((sentimentSplit.positive + sentimentSplit.neutral * 0.6 + sentimentSplit.mixed * 0.4) / analyzed) * 100
    : 70;
  const brandHealthScore = Math.round(sentimentComponent * 0.6 + (100 - avgRisk) * 0.4);

  const topIssueEntry = [...issueCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const opportunityIntents = ["question", "desire", "praise", "feature request"];
  const topOppEntry = [...intentCounts.entries()]
    .filter(([k]) => opportunityIntents.includes(k))
    .sort((a, b) => b[1] - a[1])[0];

  const lastJob = await prisma.refreshJob.findFirst({
    where: { brandId, status: "success" },
    orderBy: { createdAt: "desc" },
  });

  return {
    brandHealthScore,
    totalMentions: mentions.length,
    sentimentSplit,
    negativeSpike: {
      current: currentNeg,
      baseline: baselineNeg,
      isSpiking: currentNeg >= 5 && currentNeg > baselineNeg * 1.5,
    },
    topIssue: topIssueEntry ? { category: topIssueEntry[0], count: topIssueEntry[1] } : null,
    topOpportunity: topOppEntry ? { intent: topOppEntry[0], count: topOppEntry[1] } : null,
    platformCounts: [...platformMap.entries()]
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count),
    toneTrend,
    audienceMood: [...intentCounts.entries()]
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    lastRefresh: lastJob?.finishedAt ?? null,
    avgRisk,
    periodLabel: p.label,
  };
}
