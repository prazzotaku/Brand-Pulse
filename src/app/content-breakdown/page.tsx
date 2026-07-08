import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodFilter } from "@/components/shared/period-filter";
import { QuickFilterBar } from "@/components/shared/quick-filter-bar";
import { StackedTypeChart } from "@/components/charts/stacked-type-chart";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { buildMentionWhere, type MentionFilters } from "@/lib/filters";
import { resolvePeriod, periodWhere, type PeriodSearchParams } from "@/lib/period";
import {
  getContentBreakdown, contentLabel, SOURCE_TYPES, SOURCE_TYPE_LABELS,
} from "@/lib/content-breakdown";
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Content Breakdown — berapa jumlah berita, komentar Instagram, video TikTok, dst.
 * Sumber angka: mention dikelompokkan per platform × tipe konten, mengikuti
 * filter aktif (periode, platform, sentimen, keyword, risk).
 */
export default async function ContentBreakdownPage({
  searchParams,
}: {
  searchParams: MentionFilters & PeriodSearchParams;
}) {
  const brand = await getActiveBrand();
  const period = resolvePeriod(searchParams);
  const where = buildMentionWhere(brand.id, searchParams);
  where.publishedAt = periodWhere(period);

  const bd = await getContentBreakdown(where);

  // Stat cards: 8 kombinasi platform×tipe teratas.
  const headline = bd.cells.slice(0, 8);
  // Data chart bertumpuk: per platform, key = tipe.
  const chartData = bd.rows.map((r) => {
    const row: Record<string, string | number> = { platform: PLATFORM_LABELS[r.platform] ?? r.platform };
    for (const t of SOURCE_TYPES) row[t] = r.byType[t] ?? 0;
    return row;
  });
  // Tipe yang benar-benar muncul (untuk kolom tabel).
  const activeTypes = SOURCE_TYPES.filter((t) => bd.byType.some((b) => b.sourceType === t && b.count > 0));

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Content Breakdown</h1>
        <p className="text-sm text-muted-foreground">
          Jumlah mention per sumber &amp; tipe konten — {period.label.toLowerCase()}: total{" "}
          <strong>{bd.total}</strong> mention, {formatNumber(bd.totalEngagement)} engagement.
        </p>
      </div>

      <PeriodFilter />
      <QuickFilterBar />

      {/* Stat cards headline */}
      {headline.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Belum ada data pada rentang &amp; filter ini.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {headline.map((c) => (
            <div key={`${c.platform}-${c.sourceType}`} className="rounded-lg border bg-card p-4 shadow-sm">
              <p className="text-sm font-medium text-muted-foreground">{contentLabel(c.platform, c.sourceType)}</p>
              <p className="mt-1 font-mono text-2xl font-bold">{c.count}</p>
              <p className="text-xs text-muted-foreground">{formatNumber(c.engagement)} engagement</p>
            </div>
          ))}
        </div>
      )}

      {/* Bar chart bertumpuk */}
      <Card>
        <CardHeader>
          <CardTitle>Komposisi Tipe Konten per Platform</CardTitle>
          <CardDescription>Setiap batang = platform, segmen warna = tipe konten.</CardDescription>
        </CardHeader>
        <CardContent>
          <StackedTypeChart data={chartData} />
        </CardContent>
      </Card>

      {/* Tabel matriks platform × tipe */}
      <Card>
        <CardHeader>
          <CardTitle>Matriks Platform × Tipe Konten</CardTitle>
          <CardDescription>Jumlah mention per kombinasi, plus total &amp; engagement per platform.</CardDescription>
        </CardHeader>
        <CardContent>
          {bd.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada data.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  {activeTypes.map((t) => (
                    <TableHead key={t} className="text-right">{SOURCE_TYPE_LABELS[t]}</TableHead>
                  ))}
                  <TableHead className="text-right font-bold">Total</TableHead>
                  <TableHead className="text-right">Engagement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bd.rows.map((r) => (
                  <TableRow key={r.platform}>
                    <TableCell className="font-medium">{PLATFORM_LABELS[r.platform] ?? r.platform}</TableCell>
                    {activeTypes.map((t) => (
                      <TableCell key={t} className="text-right font-mono">
                        {r.byType[t] ? r.byType[t] : <span className="text-muted-foreground">·</span>}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-mono font-bold">{r.total}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{formatNumber(r.engagement)}</TableCell>
                  </TableRow>
                ))}
                {/* Baris total */}
                <TableRow className="border-t-2">
                  <TableCell className="font-bold">Total</TableCell>
                  {activeTypes.map((t) => (
                    <TableCell key={t} className="text-right font-mono font-bold">
                      {bd.byType.find((b) => b.sourceType === t)?.count ?? 0}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-mono font-bold">{bd.total}</TableCell>
                  <TableCell className="text-right font-mono font-bold">{formatNumber(bd.totalEngagement)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
