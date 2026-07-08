import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PeriodFilter } from "@/components/shared/period-filter";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { resolvePeriod, periodWhere, type PeriodSearchParams } from "@/lib/period";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

interface TrendRow {
  topic: string;
  velocity: number;
  brandRelevance: number;
  audienceFit: number;
  contentPotential: number;
  riskLevel: number;
  opportunityScore: number;
  currentCount: number;
  previousCount: number;
}

/**
 * Trend Radar — memantau isu yang naik. Velocity dihitung dari perbandingan
 * paruh kedua vs paruh pertama periode terpilih (default 7 hari), lalu
 * menerapkan formula Trend Opportunity Score dari PRD.
 */
export default async function TrendRadarPage({
  searchParams,
}: {
  searchParams: PeriodSearchParams;
}) {
  const brand = await getActiveBrand();
  const period = resolvePeriod(searchParams);
  const to = period.to.getTime();
  const from = (period.from ?? new Date(to - 6 * DAY)).getTime();
  const mid = from + (to - from) / 2;

  const analyses = await prisma.mentionAnalysis.findMany({
    where: {
      mention: { brandId: brand.id, publishedAt: periodWhere({ ...period, from: new Date(from) }) },
      issueCategory: { notIn: ["", "irrelevant"] },
    },
    include: { mention: { select: { publishedAt: true } } },
  });

  const topics = new Map<string, { current: number; previous: number; risk: number[] }>();
  for (const a of analyses) {
    const t = topics.get(a.issueCategory) ?? { current: 0, previous: 0, risk: [] };
    if (a.mention.publishedAt.getTime() >= mid) t.current++;
    else t.previous++;
    t.risk.push(a.riskScore);
    topics.set(a.issueCategory, t);
  }

  const CONTENT_FRIENDLY: Record<string, number> = {
    promo: 90, product: 85, csr: 80, event: 75, "customer service": 60,
    pricing: 70, "app issue": 55, regulation: 35, crisis: 20, "fraud/scam": 45,
  };

  const rows: TrendRow[] = [...topics.entries()]
    .map(([topic, t]) => {
      const velocity = Math.min(100, Math.round((t.current / Math.max(t.previous, 1)) * 40 + t.current * 5));
      const avgRisk = t.risk.length ? Math.round(t.risk.reduce((a, b) => a + b, 0) / t.risk.length) : 0;
      const brandRelevance = 80;
      const audienceFit = 70;
      const contentPotential = CONTENT_FRIENDLY[topic] ?? 60;
      const opportunityScore = Math.round(
        velocity * 0.25 + brandRelevance * 0.25 + audienceFit * 0.2 + contentPotential * 0.2 - avgRisk * 0.1
      );
      return {
        topic, velocity, brandRelevance, audienceFit, contentPotential,
        riskLevel: avgRisk, opportunityScore, currentCount: t.current, previousCount: t.previous,
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trend Radar</h1>
        <p className="text-sm text-muted-foreground">
          Topik yang bergerak pada {period.label.toLowerCase()} (paruh kedua vs paruh pertama),
          diberi Trend Opportunity Score (velocity 25% + relevance 25% + audience fit 20% +
          content potential 20% − risk 10%).
        </p>
      </div>

      <PeriodFilter />

      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.topic}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="capitalize">{r.topic}</CardTitle>
                <span className={`font-mono text-2xl font-bold ${r.opportunityScore >= 60 ? "text-emerald-600" : r.opportunityScore >= 40 ? "text-amber-600" : "text-red-600"}`}>
                  {r.opportunityScore}
                </span>
              </div>
              <CardDescription>
                {r.currentCount} mention (sebelumnya {r.previousCount}) — {r.currentCount > r.previousCount ? "naik" : r.currentCount < r.previousCount ? "turun" : "stabil"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {[
                { label: "Trend velocity", value: r.velocity },
                { label: "Brand relevance", value: r.brandRelevance },
                { label: "Audience fit", value: r.audienceFit },
                { label: "Content potential", value: r.contentPotential },
                { label: "Risk level", value: r.riskLevel, danger: true },
              ].map((s) => (
                <div key={s.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-mono font-medium">{s.value}</span>
                  </div>
                  <Progress value={s.value} indicatorClassName={s.danger ? "bg-red-500" : undefined} />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && (
          <Card className="md:col-span-2">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Belum cukup data untuk radar tren. Tambahkan mention lewat refresh atau import.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
