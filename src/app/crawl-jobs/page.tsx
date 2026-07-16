import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { formatDateTime } from "@/lib/utils";
import { PLATFORM_LABELS } from "@/lib/constants";
import { parseJsonArray } from "@/lib/types";

export const dynamic = "force-dynamic";

const RUN_STATUS_STYLE: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  queued: "bg-violet-50 text-violet-700 border-violet-200",
  pending: "bg-violet-50 text-violet-700 border-violet-200",
  running: "bg-sky-50 text-sky-700 border-sky-200",
  error: "bg-red-50 text-red-700 border-red-200",
  rate_limited: "bg-orange-50 text-orange-800 border-orange-200",
  pending_auth: "bg-amber-50 text-amber-800 border-amber-200",
  skipped: "bg-slate-100 text-slate-600 border-slate-200",
};

/** Crawl Jobs — riwayat background job per connector, credential, dan rate limit. */
export default async function CrawlJobsPage() {
  const brand = await getActiveBrand();
  const [jobs, runs, credentials, rateLimits] = await Promise.all([
    prisma.refreshJob.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.crawlRun.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.connectorCredential.findMany({ where: { brandId: brand.id }, orderBy: { platform: "asc" } }),
    prisma.rateLimitLog.findMany({ orderBy: { loggedAt: "desc" }, take: 10 }),
  ]);

  const runsByJob = new Map<string, typeof runs>();
  for (const r of runs) {
    if (!runsByJob.has(r.refreshJobId)) runsByJob.set(r.refreshJobId, []);
    runsByJob.get(r.refreshJobId)!.push(r);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Crawl Jobs</h1>
        <p className="text-sm text-muted-foreground">
          Riwayat background job: setiap refresh tercatat per connector (CrawlRun) lengkap dengan
          status, jumlah data, error, dan rate limit.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Status Kredensial Connector</CardTitle>
          <CardDescription>Env key yang dibutuhkan per platform (nilai rahasia tidak disimpan di database).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {credentials.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border p-2.5 text-sm">
                <span className="font-medium">{PLATFORM_LABELS[c.platform] ?? c.platform}</span>
                <span className="text-right">
                  <Badge variant={c.isConfigured ? "default" : "secondary"}>
                    {c.isConfigured ? "Terkonfigurasi" : "Butuh key"}
                  </Badge>
                  {!c.isConfigured && parseJsonArray(c.requiredKeys).length > 0 && (
                    <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                      {parseJsonArray(c.requiredKeys).join(", ")}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {jobs.map((job) => {
        const jobRuns = runsByJob.get(job.id) ?? [];
        return (
          <Card key={job.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={job.status === "success" ? "default" : job.status === "failed" ? "destructive" : "secondary"} className="capitalize">
                  {job.status}
                </Badge>
                <Badge variant="outline">{job.trigger}{job.interval && ` · ${job.interval}`}</Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {job.startedAt ? formatDateTime(job.startedAt) : "-"} → {job.finishedAt ? formatDateTime(job.finishedAt) : "…"}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  Baru {job.newMentions} · Update {job.updatedMentions} · Dup {job.duplicatesSkipped} · Gagal {job.failedSources}
                </span>
              </div>
            </CardHeader>
            {jobRuns.length > 0 && (
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Connector</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Fetched</TableHead>
                      <TableHead className="text-right">Baru</TableHead>
                      <TableHead className="text-right">Update</TableHead>
                      <TableHead className="text-right">Dup</TableHead>
                      <TableHead>Catatan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobRuns.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{PLATFORM_LABELS[r.connector] ?? r.connector}</TableCell>
                        <TableCell>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${RUN_STATUS_STYLE[r.status] ?? RUN_STATUS_STYLE.skipped}`}>
                            {r.status.replace("_", " ")}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{r.fetched}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{r.inserted}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{r.updated}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{r.duplicates}</TableCell>
                        <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground" title={r.error}>
                          {r.error || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        );
      })}
      {jobs.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Belum ada crawl job. Tekan Reload now di bar atas.
          </CardContent>
        </Card>
      )}

      {rateLimits.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Rate Limit Log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {rateLimits.map((r) => (
              <p key={r.id} className="text-muted-foreground">
                <span className="font-mono text-xs">{formatDateTime(r.loggedAt)}</span> —{" "}
                <strong className="text-foreground">{r.platform}</strong>: {r.note || "terkena rate limit"}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
