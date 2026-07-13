import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/shared/badges";
import { ImportForm } from "@/components/sources/import-form";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { getConnectorDirectory, isMockMode } from "@/lib/connectors/registry";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RUN_STATUS_STYLE: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rate_limited: "bg-orange-50 text-orange-800 border-orange-200",
  pending_auth: "bg-amber-50 text-amber-800 border-amber-200",
  error: "bg-red-50 text-red-700 border-red-200",
  skipped: "bg-slate-100 text-slate-600 border-slate-200",
};

const RUN_STATUS_LABEL: Record<string, string> = {
  success: "sukses",
  active: "aktif",
  rate_limited: "kena rate limit",
  pending_auth: "butuh API key",
  error: "error",
  skipped: "dilewati",
  running: "berjalan",
};

export default async function SourcesPage() {
  const brand = await getActiveBrand();
  const directory = getConnectorDirectory();
  const mockMode = isMockMode();

  const [accounts, searchProfiles, latestRuns] = await Promise.all([
    prisma.sourceAccount.findMany({ where: { brandId: brand.id } }),
    prisma.searchProfile.findMany({ where: { brandId: brand.id } }),
    prisma.crawlRun.findMany({
      where: { brandId: brand.id },
      orderBy: { startedAt: "desc" },
      take: 100, // Ambil lebih banyak untuk mencakup semua target
      include: { sourceAccount: true, searchProfile: true },
    }),
  ]);

  const lastRunByTarget = new Map<string, (typeof latestRuns)[number]>();
  for (const r of latestRuns) {
    const targetKey = r.sourceAccountId ?? r.searchProfileId;
    if (targetKey && !lastRunByTarget.has(targetKey)) {
      lastRunByTarget.set(targetKey, r);
    }
  }

  // Buat daftar target dari SourceAccount dan SearchProfile
  const ownedTargets = accounts
    .filter((a) => a.isActive)
    .map((a) => ({
      key: a.id,
      name: a.displayName || a.handle,
      platform: a.platform,
      scope: "owned_account",
      run: lastRunByTarget.get(a.id),
    }));

  const publicTargets = searchProfiles
    .filter((p) => p.isActive)
    .map((p) => ({
      key: p.id,
      name: p.name,
      platform: p.platform,
      scope: p.scope,
      run: lastRunByTarget.get(p.id),
    }));

  const allTargets = [...ownedTargets, ...publicTargets].sort((a, b) =>
    a.platform.localeCompare(b.platform) || a.name.localeCompare(b.name)
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data Sources</h1>
        <p className="text-sm text-muted-foreground">
          Mode aktif:{" "}
          <span className={`font-semibold ${mockMode ? "text-amber-700" : "text-emerald-700"}`}>
            {mockMode ? "MOCK (data simulasi)" : "LIVE (data nyata)"}
          </span>
          . Ubah lewat <code className="font-mono">MOCK_CONNECTORS</code> di <code className="font-mono">.env</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Crawl Targets</CardTitle>
          <CardDescription>
            Daftar target fetch yang aktif (dari Owned Accounts dan Public Search Profiles di Settings).
            Setiap target di-crawl secara independen saat refresh.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {allTargets.map((t) => {
            const status = t.run?.status ?? "pending";
            const style = RUN_STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600 border-slate-200";
            const label = RUN_STATUS_LABEL[status] ?? "menunggu";
            const lastSync = t.run?.finishedAt;
            return (
              <Card key={t.key}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}>
                      {label}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PlatformBadge platform={t.platform} />
                    <Badge variant="outline" className="font-mono text-xs">{t.scope}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="text-xs text-muted-foreground">
                    Sinkronisasi terakhir: {lastSync ? formatDateTime(lastSync) : "belum pernah"}
                    {t.run && ` · ${t.run.inserted} baru, ${t.run.duplicates} duplikat`}
                  </p>
                </CardContent>
              </Card>
            );
          })}
          {allTargets.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground md:col-span-2">
              Belum ada target aktif. Konfigurasikan Owned Accounts atau Public Search Profiles di halaman Settings.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connector Directory</CardTitle>
          <CardDescription>
            Daftar semua connector yang tersedia di aplikasi. Status menunjukkan apakah API key sudah terisi.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {directory.map((c) => (
            <Card key={`${c.platform}-${c.label}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{c.label}</CardTitle>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
                      c.configured ? RUN_STATUS_STYLE.active : RUN_STATUS_STYLE.pending_auth
                    }`}
                  >
                    {c.configured ? "siap" : "butuh API key"}
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
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

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

