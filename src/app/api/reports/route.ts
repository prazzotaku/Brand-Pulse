import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAI } from "@/lib/ai";
import { getActiveBrand, toBrandContext } from "@/lib/brand";
import { getOverviewStats } from "@/lib/stats";
import { resolvePeriod } from "@/lib/period";
import { getContentBreakdown } from "@/lib/content-breakdown";
import { normalizeIntent } from "@/lib/constants";

const RANGE_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/**
 * POST /api/reports — generate laporan komprehensif untuk manajemen
 * (daily/weekly/monthly): ringkasan AI multi-bagian + data lengkap
 * (sentimen, platform, isu, geografis, mention berisiko tinggi).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const type = ["daily", "weekly", "monthly"].includes(body.type) ? body.type : "weekly";
  const rangeMs = RANGE_MS[type];
  const since = new Date(Date.now() - rangeMs);
  const prevSince = new Date(Date.now() - 2 * rangeMs);

  const brand = await getActiveBrand();
  const brandCtx = toBrandContext(brand);
  const stats = await getOverviewStats(
    brand.id,
    resolvePeriod({ range: type === "daily" ? "24h" : type === "weekly" ? "7d" : "30d" })
  );

  // ---- Data komprehensif tambahan ----
  const [
    analyses,
    issueGroups,
    geoGroups,
    highRiskMentions,
    positiveHighlights,
    prevTotal,
    prevNegative,
    detailRows,
    topSlang,
    activeAlerts,
    engagementAgg,
  ] = await Promise.all([
    prisma.mentionAnalysis.findMany({
      where: { mention: { brandId: brand.id, publishedAt: { gte: since } } },
      include: { mention: { select: { content: true, sourcePlatform: true } } },
      take: 40,
    }),
    prisma.mentionAnalysis.groupBy({
      by: ["issueCategory"],
      where: {
        mention: { brandId: brand.id, publishedAt: { gte: since } },
        issueCategory: { notIn: ["", "irrelevant"] },
      },
      _count: { _all: true },
      orderBy: { _count: { issueCategory: "desc" } },
      take: 6,
    }),
    prisma.geoMention.groupBy({
      by: ["name"],
      where: { mention: { brandId: brand.id, publishedAt: { gte: since } } },
      _count: { _all: true },
      orderBy: { _count: { name: "desc" } },
      take: 6,
    }),
    prisma.mention.findMany({
      where: { brandId: brand.id, publishedAt: { gte: since }, analysis: { riskScore: { gte: 40 } } },
      include: { analysis: true },
      orderBy: { analysis: { riskScore: "desc" } },
      take: 6,
    }),
    prisma.mention.findMany({
      where: { brandId: brand.id, publishedAt: { gte: since }, analysis: { sentiment: "positive" } },
      include: { analysis: true },
      orderBy: { engagementCount: "desc" },
      take: 4,
    }),
    prisma.mention.count({
      where: { brandId: brand.id, publishedAt: { gte: prevSince, lt: since } },
    }),
    prisma.mentionAnalysis.count({
      where: { sentiment: "negative", mention: { brandId: brand.id, publishedAt: { gte: prevSince, lt: since } } },
    }),
    // Baris ringan untuk agregasi per-platform, distribusi risiko, intent.
    prisma.mention.findMany({
      where: { brandId: brand.id, publishedAt: { gte: since } },
      select: {
        sourcePlatform: true,
        analysis: { select: { sentiment: true, reputationalImpact: true, intent: true, relatedCompetitors: true } },
      },
      take: 5000,
    }),
    prisma.slangTerm.findMany({
      where: { brandId: brand.id, status: { not: "rejected" } },
      orderBy: { frequency: "desc" },
      take: 6,
    }),
    prisma.alert.count({ where: { brandId: brand.id, status: "open" } }),
    prisma.mention.aggregate({
      where: { brandId: brand.id, publishedAt: { gte: since } },
      _sum: { engagementCount: true, viewCount: true, likeCount: true, commentCount: true, shareCount: true },
    }),
  ]);

  const growthPct = prevTotal > 0 ? Math.round(((stats.totalMentions - prevTotal) / prevTotal) * 100) : null;
  const negativeGrowthPct =
    prevNegative > 0 ? Math.round(((stats.sentimentSplit.negative - prevNegative) / prevNegative) * 100) : null;
  const topIssues = issueGroups.map((g) => ({ category: g.issueCategory, count: g._count._all }));
  const topLocations = geoGroups.map((g) => ({ name: g.name, count: g._count._all }));
  const breakdown = await getContentBreakdown({ brandId: brand.id, publishedAt: { gte: since } });

  // --- Agregasi in-memory dari detailRows (1 query) ---
  const riskDist = { low: 0, medium: 0, high: 0, critical: 0 };
  const intentCount = new Map<string, number>();
  const platSent = new Map<string, { positive: number; negative: number; neutral: number; mixed: number; total: number }>();
  let competitorMentions = 0;
  for (const r of detailRows) {
    const a = r.analysis;
    if (!a) continue;
    if (a.reputationalImpact in riskDist) riskDist[a.reputationalImpact as keyof typeof riskDist]++;
    if (a.intent) {
      const ni = normalizeIntent(a.intent);
      intentCount.set(ni, (intentCount.get(ni) ?? 0) + 1);
    }
    if (a.relatedCompetitors && a.relatedCompetitors !== "[]" && a.relatedCompetitors !== "") competitorMentions++;
    const ps = platSent.get(r.sourcePlatform) ?? { positive: 0, negative: 0, neutral: 0, mixed: 0, total: 0 };
    if (a.sentiment === "positive" || a.sentiment === "negative" || a.sentiment === "neutral" || a.sentiment === "mixed") ps[a.sentiment]++;
    ps.total++;
    platSent.set(r.sourcePlatform, ps);
  }
  const topIntents = [...intentCount.entries()]
    .filter(([k]) => k && k !== "information")
    .map(([intent, count]) => ({ intent, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const sentimentByPlatform = [...platSent.entries()]
    .map(([platform, s]) => ({ platform, ...s }))
    .sort((a, b) => b.total - a.total);
  const emergingSlang = topSlang.map((s) => ({ term: s.slangTerm, meaning: s.normalizedMeaning, frequency: s.frequency }));
  const engagement = {
    total: engagementAgg._sum.engagementCount ?? 0,
    views: engagementAgg._sum.viewCount ?? 0,
    likes: engagementAgg._sum.likeCount ?? 0,
    comments: engagementAgg._sum.commentCount ?? 0,
    shares: engagementAgg._sum.shareCount ?? 0,
  };

  const summary = await getAI().summarizeReport(
    {
      brandHealthScore: stats.brandHealthScore,
      totalMentions: stats.totalMentions,
      previousTotalMentions: prevTotal,
      growthPercent: growthPct,
      negativeGrowthPercent: negativeGrowthPct,
      positiveCount: stats.sentimentSplit.positive,
      negativeCount: stats.sentimentSplit.negative,
      neutralCount: stats.sentimentSplit.neutral,
      mixedCount: stats.sentimentSplit.mixed,
      avgRisk: stats.avgRisk,
      riskDistribution: riskDist,
      topIssue: stats.topIssue?.category ?? "-",
      topIssues,
      topLocations,
      platformCounts: stats.platformCounts,
      sentimentByPlatform,
      topIntents,
      emergingSlang,
      competitorMentions,
      activeAlerts,
      totalEngagement: engagement.total,
      totalViews: engagement.views,
      contentBreakdown: breakdown.cells.slice(0, 10),
      negativeSpike: stats.negativeSpike,
    },
    analyses.map((a) => ({
      content: a.mention.content,
      sentiment: a.sentiment,
      intent: a.intent,
      issueCategory: a.issueCategory,
      sourcePlatform: a.mention.sourcePlatform,
    })),
    brandCtx
  );

  const labels: Record<string, string> = { daily: "Daily Brief", weekly: "Weekly Insight", monthly: "Monthly Brand Health" };
  const report = await prisma.report.create({
    data: {
      brandId: brand.id,
      type,
      title: `${labels[type]} — ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`,
      periodStart: since,
      periodEnd: new Date(),
      summary,
      data: JSON.stringify({
        brandName: brand.name,
        reportType: type,
        brandHealthScore: stats.brandHealthScore,
        totalMentions: stats.totalMentions,
        previousTotalMentions: prevTotal,
        growthPercent: growthPct,
        negativeGrowthPercent: negativeGrowthPct,
        sentimentSplit: stats.sentimentSplit,
        avgRisk: stats.avgRisk,
        riskDistribution: riskDist,
        topIssue: stats.topIssue,
        topIssues,
        topLocations,
        platformCounts: stats.platformCounts,
        sentimentByPlatform,
        topIntents,
        emergingSlang,
        competitorMentions,
        activeAlerts,
        engagement,
        contentBreakdown: breakdown.rows.map((r) => ({ platform: r.platform, total: r.total, byType: r.byType })),
        contentTotals: breakdown.byType,
        negativeSpike: stats.negativeSpike,
        audienceMood: stats.audienceMood,
        highRiskMentions: highRiskMentions.map((m) => ({
          content: m.content.slice(0, 200),
          platform: m.sourcePlatform,
          url: m.url,
          riskScore: m.analysis?.riskScore ?? 0,
          sentiment: m.analysis?.sentiment ?? "",
          issueCategory: m.analysis?.issueCategory ?? "",
          reputationalImpact: m.analysis?.reputationalImpact ?? "",
        })),
        positiveHighlights: positiveHighlights.map((m) => ({
          content: m.content.slice(0, 200),
          platform: m.sourcePlatform,
          url: m.url,
          engagementCount: m.engagementCount,
        })),
      }),
    },
  });

  return NextResponse.json({ ok: true, report });
}
