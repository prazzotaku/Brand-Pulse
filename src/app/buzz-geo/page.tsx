import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodFilter } from "@/components/shared/period-filter";
import { QuickFilterBar } from "@/components/shared/quick-filter-bar";
import { VolumeBarChart } from "@/components/charts/volume-bar-chart";
import { BarListChart } from "@/components/charts/bar-list-chart";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { buildMentionWhere, type MentionFilters } from "@/lib/filters";
import { resolvePeriod, periodWhere, buildTimeBuckets, type PeriodSearchParams } from "@/lib/period";
import { PLATFORM_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

type BuzzParams = MentionFilters & PeriodSearchParams;

const CONFIDENCE_LABEL = (c: number) => (c >= 80 ? "high" : c >= 60 ? "medium" : "low");

/**
 * Buzz Geo — kapan & di mana brand paling sering dibicarakan.
 * Lokasi berasal dari deteksi AI (explicit/profil/teks/domain media/inferensi)
 * dengan confidence score, level agregat (negara/provinsi/kota) — bukan
 * lokasi personal detail.
 */
export default async function BuzzGeoPage({ searchParams }: { searchParams: BuzzParams }) {
  const brand = await getActiveBrand();
  const period = resolvePeriod(searchParams);
  const where = buildMentionWhere(brand.id, searchParams);
  where.publishedAt = periodWhere(period);

  const mentions = await prisma.mention.findMany({
    where,
    include: { analysis: true, geoMentions: true },
    orderBy: { publishedAt: "desc" },
    take: 2000,
  });

  // Growth vs periode sebelumnya (durasi sama).
  const to = period.to.getTime();
  const from = (period.from ?? new Date(to - 7 * 86400000)).getTime();
  const prevCount = await prisma.mention.count({
    where: {
      ...buildMentionWhere(brand.id, searchParams),
      publishedAt: { gte: new Date(from - (to - from)), lt: new Date(from) },
    },
  });
  const growth = prevCount > 0 ? Math.round(((mentions.length - prevCount) / prevCount) * 100) : null;

  // Volume per hari (bucket mengikuti granularity periode).
  const fallbackFrom = mentions.length ? mentions[mentions.length - 1].publishedAt : new Date(from);
  const perDay = buildTimeBuckets(period, fallbackFrom).map((b) => ({
    label: b.label,
    count: mentions.filter((m) => m.publishedAt >= b.start && m.publishedAt < b.end).length,
  }));

  // Volume per jam (0-23, akumulasi seluruh periode).
  const perHour = Array.from({ length: 24 }, (_, h) => ({
    label: `${String(h).padStart(2, "0")}:00`,
    count: mentions.filter((m) => m.publishedAt.getHours() === h).length,
    negative: mentions.filter((m) => m.publishedAt.getHours() === h && m.analysis?.sentiment === "negative").length,
  }));

  // Agregasi per wilayah.
  interface LocationAgg {
    name: string;
    type: string;
    count: number;
    negative: number;
    positive: number;
    confidenceSum: number;
    issues: Map<string, number>;
    platforms: Map<string, number>;
  }
  const locMap = new Map<string, LocationAgg>();
  for (const m of mentions) {
    for (const g of m.geoMentions) {
      const agg = locMap.get(g.name) ?? {
        name: g.name, type: g.type, count: 0, negative: 0, positive: 0,
        confidenceSum: 0, issues: new Map(), platforms: new Map(),
      };
      agg.count++;
      agg.confidenceSum += g.confidence;
      if (m.analysis?.sentiment === "negative") agg.negative++;
      if (m.analysis?.sentiment === "positive") agg.positive++;
      if (m.analysis?.issueCategory && m.analysis.issueCategory !== "irrelevant") {
        agg.issues.set(m.analysis.issueCategory, (agg.issues.get(m.analysis.issueCategory) ?? 0) + 1);
      }
      agg.platforms.set(m.sourcePlatform, (agg.platforms.get(m.sourcePlatform) ?? 0) + 1);
      locMap.set(g.name, agg);
    }
  }
  const locations = [...locMap.values()].sort((a, b) => b.count - a.count).slice(0, 15);
  const geoTagged = mentions.filter((m) => m.geoMentions.length > 0).length;

  // Insight otomatis (template, berbasis data yang sama dengan chart).
  const topCities = locations.filter((l) => l.type === "city").slice(0, 3).map((l) => l.name);
  const peakNegHour = [...perHour].sort((a, b) => b.negative - a.negative)[0];
  const negLoc = [...locations].sort((a, b) => b.negative - a.negative)[0];
  const insight =
    mentions.length === 0
      ? `Belum ada percakapan pada ${period.label.toLowerCase()} dengan filter aktif.`
      : [
          `Pada ${period.label.toLowerCase()}, ${brand.name} tercatat dalam ${mentions.length} mention${growth !== null ? ` (${growth >= 0 ? "+" : ""}${growth}% vs periode sebelumnya)` : ""}.`,
          topCities.length ? `Kota yang paling banyak membicarakan: ${topCities.join(", ")}.` : `Belum banyak sinyal lokasi kota (${geoTagged}/${mentions.length} mention punya konteks geo).`,
          negLoc && negLoc.negative > 0
            ? `Percakapan negatif tertinggi di ${negLoc.name}${peakNegHour && peakNegHour.negative > 0 ? ` sekitar pukul ${peakNegHour.label}` : ""}, didominasi isu ${[...negLoc.issues.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-"}.`
            : "Tidak ada konsentrasi percakapan negatif per wilayah yang menonjol.",
        ].join(" ");

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Buzz Geo</h1>
        <p className="text-sm text-muted-foreground">
          Kapan &amp; di mana {brand.name} paling sering dibicarakan — {period.label.toLowerCase()},{" "}
          {geoTagged} dari {mentions.length} mention punya konteks lokasi.
        </p>
      </div>

      <PeriodFilter />
      <QuickFilterBar />

      <Card className="border-l-4 border-l-primary">
        <CardContent className="py-4">
          <p className="text-sm leading-relaxed"><strong>Insight:</strong> {insight}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mention per Hari</CardTitle>
            <CardDescription>Volume percakapan sepanjang periode.</CardDescription>
          </CardHeader>
          <CardContent>
            <VolumeBarChart data={perDay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mention per Jam</CardTitle>
            <CardDescription>Jam berapa audiens paling aktif (akumulasi periode).</CardDescription>
          </CardHeader>
          <CardContent>
            <VolumeBarChart data={perHour.map(({ label, count }) => ({ label, count }))} color="#25D366" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Heatmap Wilayah</CardTitle>
            <CardDescription>Volume mention per lokasi terdeteksi.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarListChart
              data={locations.map((l) => ({ label: l.name, count: l.count }))}
              height={Math.max(200, locations.length * 32)}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top Locations</CardTitle>
            <CardDescription>
              Sentiment, isu utama, sumber, dan confidence per wilayah — klik untuk drill-down.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {locations.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Belum ada lokasi terdeteksi pada periode/filter ini. Lokasi diisi otomatis dari
                analisis AI saat data baru masuk.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lokasi</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead className="text-right">Mentions</TableHead>
                    <TableHead className="text-right">Negatif</TableHead>
                    <TableHead className="text-right">Positif</TableHead>
                    <TableHead>Top Issue</TableHead>
                    <TableHead>Sumber</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locations.map((l) => {
                    const avgConf = Math.round(l.confidenceSum / l.count);
                    const topIssue = [...l.issues.entries()].sort((a, b) => b[1] - a[1])[0];
                    return (
                      <TableRow key={l.name}>
                        <TableCell>
                          <Link
                            href={`/mentions?location=${encodeURIComponent(l.name)}&range=${searchParams.range ?? "7d"}`}
                            className="font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {l.name}
                          </Link>
                        </TableCell>
                        <TableCell className="capitalize text-sm">{l.type}</TableCell>
                        <TableCell className="text-right font-mono">{l.count}</TableCell>
                        <TableCell className="text-right font-mono text-red-600">{l.negative}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-600">{l.positive}</TableCell>
                        <TableCell className="capitalize text-sm">{topIssue?.[0] ?? "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[...l.platforms.entries()].map(([p, n]) => `${PLATFORM_LABELS[p] ?? p} (${n})`).join(", ")}
                        </TableCell>
                        <TableCell>
                          <span className="rounded-full border bg-muted px-2 py-0.5 text-xs font-medium">
                            {CONFIDENCE_LABEL(avgConf)} · {avgConf}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Privasi: lokasi ditampilkan pada level agregat (negara/provinsi/kota) — bukan alamat personal.
        Sumber geo: explicit/place tag (high), profil akun &amp; domain media lokal (medium), inferensi teks (low).
      </p>
    </div>
  );
}
