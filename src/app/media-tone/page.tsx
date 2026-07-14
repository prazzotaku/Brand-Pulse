import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SentimentBadge, RiskBadge, OriginBadge } from "@/components/shared/badges";
import { PeriodFilter } from "@/components/shared/period-filter";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { MediaFilterBar } from "@/components/media/media-filter-bar";
import { TrendChart } from "@/components/charts/trend-chart";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { resolvePeriod, periodWhere, resolveGranularity, type PeriodSearchParams } from "@/lib/period";
import { buildMentionWhere, type MentionFilters } from "@/lib/filters";
import { getSentimentTrend } from "@/lib/trend";
import { formatDateTime } from "@/lib/utils";
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from "@/lib/constants";

const MEDIA_PLATFORMS = ["news", "rss", "blog"];

export const dynamic = "force-dynamic";

const TIER_LABELS: Record<string, string> = {
  tier1: "Tier 1 Nasional",
  tier2: "Tier 2 Industri",
  local: "Media Lokal",
  blog: "Blog",
  aggregator: "Aggregator",
};

/**
 * Media Tone Monitor — fokus pemberitaan online. Membedakan sentiment bahasa
 * (SentimentBadge) dengan reputational impact (RiskBadge): artikel netral
 * secara bahasa bisa tetap berdampak buruk terhadap reputasi.
 */
export default async function MediaTonePage({
  searchParams,
}: {
  searchParams: MentionFilters & PeriodSearchParams & { gran?: string, page?: string, pageSize?: string };
}) {
  const brand = await getActiveBrand();
  const period = resolvePeriod(searchParams);
  const granularity = resolveGranularity(searchParams.gran, period);

  const page = Math.max(1, Number(searchParams.page) || 1);
  const pageSize = PAGE_SIZE_OPTIONS.includes(Number(searchParams.pageSize))
    ? Number(searchParams.pageSize)
    : DEFAULT_PAGE_SIZE;

  // where dari filter (sentiment/keyword/tier), lalu scope ke platform berita.
  const where = buildMentionWhere(brand.id, searchParams);
  where.publishedAt = periodWhere(period);
  const requested = (searchParams.platform ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean).filter((p) => MEDIA_PLATFORMS.includes(p));
  where.sourcePlatform = { in: requested.length ? requested : MEDIA_PLATFORMS };

  const [articles, total, trend] = await Promise.all([
    prisma.mention.findMany({
      where,
      include: { analysis: true },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mention.count({ where }),
    getSentimentTrend(where, period, granularity),
  ]);

  const negativeImpactOnPage = articles.filter((m) =>
    m.analysis && ["high", "critical"].includes(m.analysis.reputationalImpact)
  ).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Media Tone</h1>
        <p className="text-sm text-muted-foreground">
          Tone pemberitaan online tentang {brand.name} — {period.label.toLowerCase()}:{" "}
          {total} artikel cocok filter.
          {negativeImpactOnPage > 0 && ` Di halaman ini, ${negativeImpactOnPage} berdampak reputasi tinggi/kritis.`}
        </p>
      </div>

      <PeriodFilter />
      <MediaFilterBar />

      <Card>
        <CardHeader>
          <CardTitle>Trendline Tone Pemberitaan</CardTitle>
          <CardDescription>
            Volume artikel per sentimen dari waktu ke waktu — {period.label.toLowerCase()}, mengikuti
            filter sumber &amp; sentimen aktif. Ganti granularity di bawah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrendChart data={trend} granularity={granularity} />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {articles.map((m) => (
          <Card key={m.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{m.authorName}</span>
                <OriginBadge origin={m.origin} />
                <span>·</span>
                <span className="font-mono">{formatDateTime(m.publishedAt)}</span>
                {m.mediaTier && (
                  <span className="rounded-md bg-muted px-2 py-0.5 font-medium">
                    {TIER_LABELS[m.mediaTier] ?? m.mediaTier}
                  </span>
                )}
              </div>
              <CardTitle className="text-base">
                <Link href={`/mentions/${m.id}`} className="hover:text-primary">
                  {m.title || m.content.slice(0, 80)}
                </Link>
              </CardTitle>
              <CardDescription>{m.content.slice(0, 220)}…</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              {m.analysis && (
                <>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Tone bahasa:</span>
                    <SentimentBadge sentiment={m.analysis.sentiment} />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Dampak reputasi:</span>
                    <RiskBadge impact={m.analysis.reputationalImpact} score={m.analysis.riskScore} />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Confidence:</span>
                    <span className="font-mono font-medium">{m.analysis.confidenceScore}</span>
                  </div>
                  <p className="w-full text-sm text-muted-foreground">
                    <strong className="text-foreground">Saran PR:</strong> {m.analysis.suggestedAction}
                  </p>
                </>
              )}
              {m.url && (
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Buka artikel <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </CardContent>
          </Card>
        ))}
        {articles.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Belum ada artikel berita. Jalankan Reload now atau import data.
            </CardContent>
          </Card>
        )}
      </div>

      <PaginationControls page={page} pageSize={pageSize} total={total} itemLabel="artikel" />
    </div>
  );
}
