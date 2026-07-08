import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarListChart } from "@/components/charts/bar-list-chart";
import { SentimentBadge, PlatformBadge, OriginBadge } from "@/components/shared/badges";
import { PeriodFilter } from "@/components/shared/period-filter";
import { SocialFilterBar } from "@/components/social/social-filter-bar";
import { MoreButton, type SummaryCardData } from "@/components/social/summary-section";
import { TrendChart } from "@/components/charts/trend-chart";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { resolvePeriod, resolveGranularity } from "@/lib/period";
import { getSentimentTrend } from "@/lib/trend";
import {
  buildSocialWhere, matchesCategory, SOCIAL_CATEGORIES, SOCIAL_PLATFORMS,
  type SocialSearchParams,
} from "@/lib/social";
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatDateTime, truncate } from "@/lib/utils";

const INTENT_DESCRIPTIONS: Record<string, string> = {
  praise: "Pujian — bahan social proof",
  complaint: "Keluhan — butuh respons",
  question: "Pertanyaan — kandidat FAQ/konten",
  objection: "Keraguan sebelum pakai layanan",
  desire: "Keinginan audiens",
  fear: "Kekhawatiran audiens",
  confusion: "Area yang membingungkan",
  "crisis signal": "Sinyal risiko reputasi",
  information: "Informasi netral",
};

export const dynamic = "force-dynamic";

/**
 * Social Listening dengan data integrity:
 * - SEMUA angka summary dihitung dari satu query (buildSocialWhere) yang juga
 *   dipakai drawer detail — bukan counter lokal, dummy, atau cache agregat.
 * - Setiap card bisa diklik "More" untuk membuktikan rinciannya.
 * - Duplikat tidak dihitung (dedup di ingest, guard isDuplicate=false di query).
 * - Audit Panel menampilkan jejak perhitungan untuk developer/admin.
 */
export default async function SocialListeningPage({
  searchParams,
}: {
  searchParams: SocialSearchParams & { gran?: string };
}) {
  const brand = await getActiveBrand();
  const period = resolvePeriod(searchParams);
  const where = buildSocialWhere(brand.id, searchParams);
  const granularity = resolveGranularity(searchParams.gran, period);

  // Satu query untuk summary + audit; drawer memakai where yang sama via API.
  const [mentions, trend] = await Promise.all([
    prisma.mention.findMany({
      where,
      include: { analysis: true },
      orderBy: { publishedAt: "desc" },
      take: 2000,
    }),
    getSentimentTrend(where, period, granularity),
  ]);

  // Deskripsi filter aktif untuk tooltip "sumber angka".
  const requestedPlatforms = (searchParams.platform ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const platformDesc = requestedPlatforms.length
    ? requestedPlatforms.map((p) => PLATFORM_LABELS[p] ?? p).join(" + ")
    : "semua platform sosial";
  const extraFilters = [
    searchParams.q && `keyword "${searchParams.q}"`,
    searchParams.sentiment && `sentiment ${searchParams.sentiment}`,
    searchParams.sourceType && `tipe ${searchParams.sourceType}`,
    searchParams.minRisk && `risk ≥ ${searchParams.minRisk}`,
    searchParams.minRelevance && `relevance ≥ ${searchParams.minRelevance}`,
  ].filter(Boolean).join(", ");
  const filterDesc = `Platform ${platformDesc}, ${period.label}, Brand ${brand.name}${extraFilters ? `, ${extraFilters}` : ""}`;

  const cards: SummaryCardData[] = SOCIAL_CATEGORIES.map((cat) => {
    const count = mentions.filter((m) => matchesCategory(m, cat)).length;
    const criteria =
      cat.kind === "all"
        ? "unique mention (setelah deduplication)"
        : cat.kind === "sentiment"
          ? `sentiment = ${cat.value}`
          : `intent = ${cat.value}`;
    return {
      key: cat.key,
      label: cat.label,
      count,
      tooltip: `Dihitung dari ${count} unique mentions dengan ${criteria} dalam filter aktif: ${filterDesc}. Klik More untuk melihat semua datanya.`,
    };
  });

  // Distribusi intent untuk chart (dari data yang sama).
  const intentCounts = new Map<string, number>();
  for (const m of mentions) {
    const intent = m.analysis?.intent || "information";
    intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + 1);
  }
  const intentData = [...intentCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Querystring filter aktif → diteruskan ke drawer agar query-nya identik.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string" && v) qs.set(k, v);
  }
  const queryString = qs.toString();

  // ---- Data Audit Panel ----
  const analyzedCount = mentions.filter((m) => m.analysis).length;
  const uniqueHashes = new Set(mentions.map((m) => m.contentHash || m.id)).size;
  const [dupAgg, lastJob, sources] = await Promise.all([
    prisma.refreshJob.aggregate({
      where: { brandId: brand.id },
      _sum: { duplicatesSkipped: true, updatedMentions: true, newMentions: true },
    }),
    prisma.refreshJob.findFirst({ where: { brandId: brand.id }, orderBy: { createdAt: "desc" } }),
    prisma.source.findMany({
      where: { brandId: brand.id, platform: { in: SOCIAL_PLATFORMS } },
      orderBy: { platform: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Social Listening</h1>
        <p className="text-sm text-muted-foreground">
          {mentions.length} percakapan sosial unik tentang {brand.name} — {period.label.toLowerCase()}.
          Setiap angka bisa diklik untuk melihat rincian data mentahnya.
        </p>
      </div>

      <PeriodFilter />
      <SocialFilterBar />

      <Card>
        <CardHeader>
          <CardTitle>Trendline Sentimen</CardTitle>
          <CardDescription>
            Volume percakapan per sentimen dari waktu ke waktu — {period.label.toLowerCase()}, mengikuti
            filter platform &amp; sentimen aktif. Ganti granularity di bawah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrendChart data={trend} granularity={granularity} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distribusi Intent Audiens</CardTitle>
          <CardDescription>
            Dihitung dari {mentions.length} unique mentions pada filter aktif: {filterDesc}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BarListChart data={intentData} color="#25D366" height={Math.max(200, intentData.length * 36)} />
        </CardContent>
      </Card>

      {/* Grup per kategori intent — beberapa postingan contoh per kategori */}
      {(() => {
        const byIntent = new Map<string, typeof mentions>();
        for (const m of mentions) {
          const intent = m.analysis?.intent || "information";
          if (!byIntent.has(intent)) byIntent.set(intent, []);
          byIntent.get(intent)!.push(m);
        }
        const groups = [...byIntent.entries()].sort((a, b) => b[1].length - a[1].length);
        if (groups.length === 0) {
          return (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Belum ada percakapan sosial pada periode ini. Aktifkan connector API di halaman
                Sources (isi API key di .env) atau import data CSV/JSON.
              </CardContent>
            </Card>
          );
        }
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map(([intent, items]) => (
              <Card key={intent}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="capitalize">
                      {intent} <span className="font-mono text-sm text-muted-foreground">({items.length})</span>
                    </CardTitle>
                    <MoreButton
                      label={intent}
                      count={items.length}
                      filterParams={{ intent }}
                      queryString={queryString}
                    />
                  </div>
                  <CardDescription>{INTENT_DESCRIPTIONS[intent] ?? "Kelompok percakapan audiens"}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.slice(0, 4).map((m) => (
                    <div key={m.id} className="rounded-md border p-3 transition-colors hover:border-primary">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <PlatformBadge platform={m.sourcePlatform} />
                        <OriginBadge origin={m.origin} />
                        {m.analysis && <SentimentBadge sentiment={m.analysis.sentiment} />}
                        <span className="font-mono text-xs text-muted-foreground">{formatDateTime(m.publishedAt)}</span>
                      </div>
                      <Link href={`/mentions/${m.id}`} className="block hover:text-primary">
                        <p className="text-sm">{truncate(m.content, 140)}</p>
                      </Link>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {m.authorName} {m.authorHandle && `· ${m.authorHandle}`}
                        </p>
                        {m.url && (
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                          >
                            Sumber asli <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })()}

      {/* Audit Panel — developer/admin */}
      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
          Audit Panel (developer/admin) — jejak perhitungan &amp; status crawl
        </summary>
        <div className="grid gap-4 border-t p-5 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <p className="font-semibold">Query &amp; Data</p>
            <dl className="space-y-1 text-muted-foreground">
              <div className="flex justify-between gap-4">
                <dt>Filter aktif (querystring)</dt>
                <dd className="break-all font-mono text-xs">{queryString || "(default: range=7d)"}</dd>
              </div>
              <div className="flex justify-between"><dt>Total raw mentions (scope filter)</dt><dd className="font-mono">{mentions.length}</dd></div>
              <div className="flex justify-between"><dt>Unique berdasarkan content hash</dt><dd className="font-mono">{uniqueHashes}</dd></div>
              <div className="flex justify-between"><dt>Sudah dianalisis</dt><dd className="font-mono">{analyzedCount}</dd></div>
              <div className="flex justify-between"><dt>Belum dianalisis</dt><dd className="font-mono">{mentions.length - analyzedCount}</dd></div>
              <div className="flex justify-between"><dt>Kumulatif duplikat dilewati (semua refresh)</dt><dd className="font-mono">{dupAgg._sum.duplicatesSkipped ?? 0}</dd></div>
              <div className="flex justify-between"><dt>Kumulatif mention di-update</dt><dd className="font-mono">{dupAgg._sum.updatedMentions ?? 0}</dd></div>
            </dl>
            <p className="pt-2 font-semibold">Per kategori (filter aktif)</p>
            <dl className="space-y-1 text-muted-foreground">
              {cards.map((c) => (
                <div key={c.key} className="flex justify-between">
                  <dt>{c.label}</dt>
                  <dd className="font-mono">{c.count}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-semibold">Refresh Job Terakhir</p>
            {lastJob ? (
              <dl className="space-y-1 text-muted-foreground">
                <div className="flex justify-between gap-4"><dt>Job ID</dt><dd className="break-all font-mono text-xs">{lastJob.id}</dd></div>
                <div className="flex justify-between"><dt>Status</dt><dd className="font-mono capitalize">{lastJob.status}</dd></div>
                <div className="flex justify-between"><dt>Trigger</dt><dd className="font-mono">{lastJob.trigger}{lastJob.interval && ` (${lastJob.interval})`}</dd></div>
                <div className="flex justify-between"><dt>Selesai</dt><dd className="font-mono">{lastJob.finishedAt ? formatDateTime(lastJob.finishedAt) : "-"}</dd></div>
                <div className="flex justify-between"><dt>New / Updated / Dup / Failed</dt><dd className="font-mono">{lastJob.newMentions} / {lastJob.updatedMentions} / {lastJob.duplicatesSkipped} / {lastJob.failedSources}</dd></div>
                {lastJob.error && (
                  <div className="flex justify-between gap-4"><dt>Error</dt><dd className="break-all text-xs text-destructive">{lastJob.error}</dd></div>
                )}
              </dl>
            ) : (
              <p className="text-muted-foreground">Belum ada refresh job.</p>
            )}
            <p className="pt-2 font-semibold">Status Connector Sosial</p>
            <dl className="space-y-1 text-muted-foreground">
              {sources.map((s) => (
                <div key={s.id} className="flex justify-between gap-4">
                  <dt>{PLATFORM_LABELS[s.platform] ?? s.platform}</dt>
                  <dd className="font-mono text-xs">
                    {s.status} · sync {s.lastSyncAt ? formatDateTime(s.lastSyncAt) : "-"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </details>
    </div>
  );
}
