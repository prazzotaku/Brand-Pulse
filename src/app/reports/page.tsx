import Link from "next/link";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenerateReportButton } from "@/components/content/report-actions";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

interface ReportData {
  brandHealthScore?: number;
  totalMentions?: number;
  sentimentSplit?: Record<string, number>;
  avgRisk?: number;
  topIssue?: { category: string; count: number } | null;
}

export default async function ReportsPage() {
  const brand = await getActiveBrand();
  const reports = await prisma.report.findMany({
    where: { brandId: brand.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Laporan komprehensif kondisi brand untuk manajemen — klik untuk melihat detail & export PDF.
          </p>
        </div>
        <GenerateReportButton />
      </div>

      <div className="space-y-4">
        {reports.map((r) => {
          let data: ReportData = {};
          try { data = JSON.parse(r.data); } catch { /* report lama */ }
          const preview = r.summary.replace(/##\s*[^\n]+\n?/g, " ").replace(/\s+/g, " ").trim();
          return (
            <Card key={r.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="capitalize">{r.type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {r.periodStart.toLocaleDateString("id-ID")} — {r.periodEnd.toLocaleDateString("id-ID")}
                  </span>
                  <Link
                    href={`/reports/${r.id}`}
                    className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Buka & export PDF
                  </Link>
                </div>
                <CardTitle className="text-lg">
                  <Link href={`/reports/${r.id}`} className="hover:text-primary">{r.title}</Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{preview}</p>
                {data.totalMentions !== undefined && (
                  <div className="grid grid-cols-2 gap-3 border-t pt-4 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Health Score</p>
                      <p className="font-mono text-lg font-bold">{data.brandHealthScore}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Mentions</p>
                      <p className="font-mono text-lg font-bold">{data.totalMentions}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Risk</p>
                      <p className="font-mono text-lg font-bold">{data.avgRisk}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Top Issue</p>
                      <p className="text-lg font-semibold capitalize">{data.topIssue?.category ?? "-"}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {reports.length === 0 && (
          <Card>
            <CardDescription className="py-10 text-center">
              Belum ada report. Generate report pertama di atas.
            </CardDescription>
          </Card>
        )}
      </div>
    </div>
  );
}
