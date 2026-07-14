import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarListChart } from "@/components/charts/bar-list-chart";
import { PeriodFilter } from "@/components/shared/period-filter";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { resolvePeriod, periodWhere, type PeriodSearchParams } from "@/lib/period";
import { parseJsonArray } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Competitor Watch — share of voice brand utama vs kompetitor, bisa dianalisis
 * per periode (hari/minggu/bulan/tahun) lewat PeriodFilter.
 */
export default async function CompetitorWatchPage({
  searchParams,
}: {
  searchParams: PeriodSearchParams;
}) {
  const brand = await getActiveBrand();
  const competitors = parseJsonArray(brand.competitors);
  const period = resolvePeriod({ range: "30d", ...searchParams });
  const publishedAt = periodWhere(period);

  const brandCount = await prisma.mention.count({
    where: { brandId: brand.id, publishedAt },
  });

  const competitorCounts = await Promise.all(
    competitors.map(async (name) => ({
      label: name,
      count: await prisma.mention.count({
        where: {
          brandId: brand.id,
          publishedAt,
          OR: [{ content: { contains: name } }, { title: { contains: name } }],
        },
      }),
    }))
  );

  const data = [{ label: `${brand.name} (kamu)`, count: brandCount }, ...competitorCounts];
  const totalVoice = data.reduce((a, b) => a + b.count, 0) || 1;

  const competitorMentions = await prisma.mention.findMany({
    where: {
      brandId: brand.id,
      publishedAt,
      OR: competitors.flatMap((name) => [
        { content: { contains: name } },
        { title: { contains: name } },
      ]),
    },
    include: { analysis: true },
    orderBy: { publishedAt: "desc" }, // yang terbaru dahulu
    take: 6,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Competitor Watch</h1>
        <p className="text-sm text-muted-foreground">
          Share of voice {brand.name} vs kompetitor ({competitors.join(", ")}) — {period.label.toLowerCase()}.
        </p>
      </div>

      <PeriodFilter />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Share of Voice</CardTitle>
            <CardDescription>Volume mention yang menyebut masing-masing brand.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarListChart data={data} height={Math.max(200, data.length * 44)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Posisi Brand</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.map((d) => (
              <div key={d.label} className="flex items-center justify-between text-sm">
                <span className="font-medium">{d.label}</span>
                <span className="font-mono text-muted-foreground">
                  {Math.round((d.count / totalVoice) * 100)}%
                </span>
              </div>
            ))}
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Catatan MVP: perbandingan dihitung dari mention brand yang menyinggung kompetitor.
              Fase berikutnya: crawl akun kompetitor secara langsung di lebih banyak connector.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Percakapan yang Menyinggung Kompetitor</CardTitle>
          <CardDescription>Terbaru dahulu — bahan gap analysis: apa yang audiens bandingkan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {competitorMentions.length === 0 && (
            <p className="text-sm text-muted-foreground">Belum ada mention yang menyebut kompetitor pada periode ini.</p>
          )}
          {competitorMentions.map((m) => (
            <div key={m.id} className="rounded-md border p-3 text-sm transition-colors hover:border-primary">
              <Link href={`/mentions/${m.id}`} className="block hover:text-primary">
                <p>{m.content}</p>
              </Link>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {m.authorName} · {m.sourcePlatform} · {formatDateTime(m.publishedAt)} · engagement {m.engagementCount}
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
    </div>
  );
}
