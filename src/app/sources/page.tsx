import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/shared/badges";
import { ImportForm } from "@/components/sources/import-form";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { getConnectorDirectory, isMockMode } from "@/lib/connectors/registry";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Status hasil crawl terakhir per connector (dari CrawlRun) untuk badge live.
const RUN_STATUS_STYLE: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rate_limited: "bg-orange-50 text-orange-800 border-orange-200",
  pending_auth: "bg-amber-50 text-amber-800 border-amber-200",
  error: "bg-red-50 text-red-700 border-red-200",
  skipped: "bg-slate-100 text-slate-600 border-slate-200",
};

const RUN_STATUS_LABEL: Record<string, string> = {
  success: "aktif", active: "aktif", rate_limited: "kena rate limit",
  pending_auth: "butuh API key", error: "error", skipped: "manual",
};

export default async function SourcesPage() {
  const brand = await getActiveBrand();
  const directory = getConnectorDirectory();
  const mockMode = isMockMode();

  // Ambil status crawl terakhir + lastSync per platform dari DB.
  const [sources, latestRuns] = await Promise.all([
    prisma.source.findMany({ where: { brandId: brand.id } }),
    prisma.crawlRun.findMany({
      where: { brandId: brand.id },
      orderBy: { startedAt: "desc" },
      take: 60,
    }),
  ]);
  const lastRunByConnector = new Map<string, (typeof latestRuns)[number]>();
  for (const r of latestRuns) {
    if (!lastRunByConnector.has(r.connector)) lastRunByConnector.set(r.connector, r);
  }
  const lastSyncByPlatform = new Map(sources.map((s) => [s.platform, s.lastSyncAt]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sources &amp; Connectors</h1>
        <p className="text-sm text-muted-foreground">
          Mode aktif:{" "}
          <span className={`font-semibold ${mockMode ? "text-amber-700" : "text-emerald-700"}`}>
            {mockMode ? "MOCK (data simulasi)" : "LIVE (data nyata)"}
          </span>
          . Ubah lewat <code className="font-mono">MOCK_CONNECTORS</code> di <code className="font-mono">.env</code>.
          Label &amp; status di bawah dibaca langsung dari registry connector.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {directory.map((c) => {
          const run = lastRunByConnector.get(c.platform);
          // Status tampil: hasil crawl terakhir bila ada; kalau belum, dari konfigurasi.
          const status = run?.status ?? (c.configured ? "ready" : "pending_auth");
          const style = RUN_STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600 border-slate-200";
          const label = RUN_STATUS_LABEL[status] ?? (c.configured ? "siap" : "butuh API key");
          const lastSync = lastSyncByPlatform.get(c.platform);
          return (
            <Card key={`${c.platform}-${c.label}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{c.label}</CardTitle>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}>
                    {label}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PlatformBadge platform={c.platform} />
                  <Badge variant="outline" className="font-mono text-xs">{c.method}</Badge>
                  {c.mock && <Badge variant="secondary" className="text-xs">mock</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p className="text-muted-foreground">{c.scopeNotes}</p>
                {!c.configured && c.requiredEnvKeys.length > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Butuh env: <span className="font-mono">{c.requiredEnvKeys.join(", ")}</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Sinkronisasi terakhir: {lastSync ? formatDateTime(lastSync) : "belum pernah"}
                  {run && ` · crawl terakhir: +${run.inserted} baru, ${run.duplicates} duplikat`}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manual Import (CSV / JSON)</CardTitle>
          <CardDescription>
            Upload export data dari platform mana pun. Setiap baris otomatis masuk pipeline
            dedup + AI analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prinsip Compliance</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>Tidak bypass login, captcha, atau paywall.</li>
            <li>Tidak melakukan scraping agresif; hormati rate limit dan robots.txt.</li>
            <li>Social media: connector berbasis API resmi/data provider berlisensi atau manual import.</li>
            <li>Tidak menyimpan data personal yang tidak dibutuhkan.</li>
            <li>Raw data disimpan secukupnya dan setiap mention menyertakan source URL.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
