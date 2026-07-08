import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SentimentBadge, RiskBadge, PlatformBadge } from "@/components/shared/badges";
import { PdfButton } from "@/components/content/pdf-button";
import { prisma } from "@/lib/prisma";
import { PLATFORM_LABELS } from "@/lib/constants";
import { SOURCE_TYPE_LABELS } from "@/lib/content-breakdown";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface ReportData {
  brandName?: string;
  brandHealthScore?: number;
  totalMentions?: number;
  previousTotalMentions?: number;
  growthPercent?: number | null;
  negativeGrowthPercent?: number | null;
  sentimentSplit?: Record<string, number>;
  avgRisk?: number;
  riskDistribution?: { low: number; medium: number; high: number; critical: number };
  topIssue?: { category: string; count: number } | null;
  topIssues?: { category: string; count: number }[];
  topLocations?: { name: string; count: number }[];
  platformCounts?: { platform: string; count: number }[];
  sentimentByPlatform?: { platform: string; positive: number; negative: number; neutral: number; mixed: number; total: number }[];
  topIntents?: { intent: string; count: number }[];
  emergingSlang?: { term: string; meaning: string; frequency: number }[];
  competitorMentions?: number;
  activeAlerts?: number;
  engagement?: { total: number; views: number; likes: number; comments: number; shares: number };
  contentBreakdown?: { platform: string; total: number; byType: Record<string, number> }[];
  contentTotals?: { sourceType: string; count: number }[];
  negativeSpike?: { current: number; baseline: number; isSpiking: boolean };
  audienceMood?: { intent: string; count: number }[];
  highRiskMentions?: {
    content: string; platform: string; url: string; riskScore: number;
    sentiment: string; issueCategory: string; reputationalImpact: string;
  }[];
  positiveHighlights?: { content: string; platform: string; url: string; engagementCount: number }[];
}

const INTENT_LABELS: Record<string, string> = {
  complaint: "Keluhan", question: "Pertanyaan", praise: "Pujian", objection: "Keraguan",
  desire: "Keinginan", fear: "Kekhawatiran", "crisis signal": "Sinyal krisis", information: "Informasi",
};

/** Render ringkasan AI ber-format "## Judul" jadi bagian rapi. */
function renderSummary(summary: string) {
  const blocks = summary.split(/\n(?=## )/);
  return blocks.map((block, i) => {
    const lines = block.split("\n");
    const isHeading = lines[0].startsWith("## ");
    const heading = isHeading ? lines[0].replace(/^##\s*/, "") : null;
    const body = (isHeading ? lines.slice(1) : lines).join("\n").trim();
    return (
      <div key={i} className="mb-3">
        {heading && <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-primary">{heading}</h3>}
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{body}</div>
      </div>
    );
  });
}

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  const report = await prisma.report.findUnique({ where: { id: params.id } });
  if (!report) notFound();

  let data: ReportData = {};
  try { data = JSON.parse(report.data); } catch { /* report lama */ }

  const split = data.sentimentSplit ?? { positive: 0, negative: 0, neutral: 0, mixed: 0 };
  const totalSplit = Object.values(split).reduce((a, b) => a + b, 0) || 1;
  const pct = (n: number) => Math.round((n / totalSplit) * 100);
  const healthTone =
    (data.brandHealthScore ?? 0) >= 70 ? "text-emerald-600" : (data.brandHealthScore ?? 0) >= 45 ? "text-amber-600" : "text-red-600";

  return (
    <div className="mx-auto max-w-4xl space-y-5 print:max-w-none print:space-y-4">
      {/* Toolbar (disembunyikan saat print) */}
      <div className="flex flex-wrap items-center justify-between gap-2" data-print-hide>
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke Reports
        </Link>
        <PdfButton />
      </div>

      {/* Kop laporan */}
      <div className="border-b pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Laporan Brand Intelligence · {report.type}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{report.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Brand: <strong>{data.brandName ?? "-"}</strong> · Periode:{" "}
          {report.periodStart.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} –{" "}
          {report.periodEnd.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} · Dibuat:{" "}
          {formatDateTime(report.createdAt)}
        </p>
      </div>

      {/* Metrik utama */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Metrik Utama</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricBox label="Brand Health" value={`${data.brandHealthScore ?? "-"}/100`} tone={healthTone} />
          <MetricBox
            label="Total Mentions"
            value={String(data.totalMentions ?? 0)}
            sub={data.growthPercent != null ? `${data.growthPercent >= 0 ? "+" : ""}${data.growthPercent}% vs periode lalu` : undefined}
          />
          <MetricBox label="Avg Risk Score" value={`${data.avgRisk ?? 0}/100`} />
          <MetricBox label="Top Issue" value={data.topIssue?.category ?? "-"} capitalize />
        </div>
        {data.engagement && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricBox label="Total Engagement" value={formatNumber(data.engagement.total)} />
            <MetricBox label="Total Views" value={formatNumber(data.engagement.views)} />
            <MetricBox
              label="Alert Aktif"
              value={String(data.activeAlerts ?? 0)}
              tone={(data.activeAlerts ?? 0) > 0 ? "text-red-600" : "text-emerald-600"}
            />
            <MetricBox label="Menyinggung Kompetitor" value={String(data.competitorMentions ?? 0)} />
          </div>
        )}
      </section>

      {/* Distribusi tingkat risiko */}
      {data.riskDistribution && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Distribusi Tingkat Risiko</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ["low", "Low", "text-emerald-600"],
              ["medium", "Medium", "text-amber-600"],
              ["high", "High", "text-orange-600"],
              ["critical", "Critical", "text-red-600"],
            ] as const).map(([k, label, tone]) => (
              <div key={k} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`font-mono text-xl font-bold ${tone}`}>{data.riskDistribution![k]}</p>
                <p className="text-xs text-muted-foreground">mention</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ringkasan AI komprehensif */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Analisis</h2>
        <div className="rounded-lg border bg-card p-4 print:border-0 print:p-0">
          {renderSummary(report.summary)}
        </div>
      </section>

      {/* Sentimen + Platform */}
      <div className="grid gap-4 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Komposisi Sentimen</h2>
          <div className="space-y-2 rounded-lg border p-4">
            {(["positive", "negative", "neutral", "mixed"] as const).map((s) => (
              <div key={s}>
                <div className="mb-0.5 flex items-center justify-between text-sm">
                  <span className="capitalize">{s}</span>
                  <span className="font-mono">{split[s] ?? 0} ({pct(split[s] ?? 0)}%)</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      s === "positive" ? "h-full bg-emerald-500" : s === "negative" ? "h-full bg-red-500" : s === "mixed" ? "h-full bg-violet-500" : "h-full bg-slate-400"
                    }
                    style={{ width: `${pct(split[s] ?? 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Volume per Platform</h2>
          <div className="rounded-lg border p-4">
            <Table>
              <TableBody>
                {(data.platformCounts ?? []).map((p) => (
                  <TableRow key={p.platform}>
                    <TableCell className="py-1.5">{PLATFORM_LABELS[p.platform] ?? p.platform}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono">{p.count}</TableCell>
                  </TableRow>
                ))}
                {(data.platformCounts ?? []).length === 0 && (
                  <TableRow><TableCell className="text-sm text-muted-foreground">Tidak ada data.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      {/* Top isu + Top lokasi */}
      <div className="grid gap-4 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Isu Terbanyak</h2>
          <div className="rounded-lg border p-4">
            <Table>
              <TableBody>
                {(data.topIssues ?? []).map((it) => (
                  <TableRow key={it.category}>
                    <TableCell className="py-1.5 capitalize">{it.category}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono">{it.count}</TableCell>
                  </TableRow>
                ))}
                {(data.topIssues ?? []).length === 0 && (
                  <TableRow><TableCell className="text-sm text-muted-foreground">Tidak ada isu menonjol.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Wilayah Terbanyak</h2>
          <div className="rounded-lg border p-4">
            <Table>
              <TableBody>
                {(data.topLocations ?? []).map((l) => (
                  <TableRow key={l.name}>
                    <TableCell className="py-1.5">{l.name}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono">{l.count}</TableCell>
                  </TableRow>
                ))}
                {(data.topLocations ?? []).length === 0 && (
                  <TableRow><TableCell className="text-sm text-muted-foreground">Belum ada data lokasi.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      {/* Sentimen per Platform */}
      {(data.sentimentByPlatform ?? []).length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Sentimen per Platform</h2>
          <div className="rounded-lg border p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Positif</TableHead>
                  <TableHead className="text-right">Negatif</TableHead>
                  <TableHead className="text-right">Netral</TableHead>
                  <TableHead className="text-right">Mixed</TableHead>
                  <TableHead className="text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sentimentByPlatform!.map((p) => (
                  <TableRow key={p.platform}>
                    <TableCell className="font-medium">{PLATFORM_LABELS[p.platform] ?? p.platform}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">{p.positive}</TableCell>
                    <TableCell className="text-right font-mono text-red-600">{p.negative}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{p.neutral}</TableCell>
                    <TableCell className="text-right font-mono text-violet-600">{p.mixed}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{p.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Suara Audiens + Slang */}
      <div className="grid gap-4 md:grid-cols-2">
        {(data.topIntents ?? []).length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Suara Audiens (Intent)</h2>
            <div className="rounded-lg border p-4">
              <Table>
                <TableBody>
                  {data.topIntents!.map((it) => (
                    <TableRow key={it.intent}>
                      <TableCell className="py-1.5">{INTENT_LABELS[it.intent] ?? it.intent}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono">{it.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}
        {(data.emergingSlang ?? []).length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Slang / Istilah Audiens</h2>
            <div className="rounded-lg border p-4">
              <Table>
                <TableBody>
                  {data.emergingSlang!.map((s) => (
                    <TableRow key={s.term}>
                      <TableCell className="py-1.5 font-mono">&ldquo;{s.term}&rdquo;</TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground">{s.meaning}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono">{s.frequency}×</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}
      </div>

      {/* Sebaran sumber & tipe konten */}
      {(data.contentBreakdown ?? []).length > 0 && (() => {
        const types = (data.contentTotals ?? []).map((t) => t.sourceType);
        return (
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Sebaran Sumber &amp; Tipe Konten
            </h2>
            <div className="rounded-lg border p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Platform</TableHead>
                    {types.map((t) => (
                      <TableHead key={t} className="text-right">{SOURCE_TYPE_LABELS[t] ?? t}</TableHead>
                    ))}
                    <TableHead className="text-right font-bold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.contentBreakdown!.map((r) => (
                    <TableRow key={r.platform}>
                      <TableCell className="font-medium">{PLATFORM_LABELS[r.platform] ?? r.platform}</TableCell>
                      {types.map((t) => (
                        <TableCell key={t} className="text-right font-mono">
                          {r.byType[t] ? r.byType[t] : <span className="text-muted-foreground">·</span>}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-mono font-bold">{r.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })()}

      {/* Mention berisiko tinggi */}
      {(data.highRiskMentions ?? []).length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Percakapan Berisiko Tinggi (perlu perhatian)
          </h2>
          <div className="space-y-2">
            {data.highRiskMentions!.map((m, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <PlatformBadge platform={m.platform} />
                  <SentimentBadge sentiment={m.sentiment} />
                  <RiskBadge impact={m.reputationalImpact} score={m.riskScore} />
                  <span className="text-xs capitalize text-muted-foreground">{m.issueCategory}</span>
                </div>
                <p className="text-sm">{m.content}</p>
                {m.url && (
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline" data-print-hide>
                    Sumber <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Highlight positif */}
      {(data.positiveHighlights ?? []).length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Highlight Positif (bahan amplifikasi)
          </h2>
          <div className="space-y-2">
            {data.positiveHighlights!.map((m, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="mb-1 flex items-center gap-2">
                  <PlatformBadge platform={m.platform} />
                  <span className="text-xs text-muted-foreground">engagement {formatNumber(m.engagementCount)}</span>
                </div>
                <p className="text-sm">{m.content}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="pt-4 text-center text-xs text-muted-foreground">
        Dihasilkan otomatis oleh Brand Pulse OS · {formatDateTime(report.createdAt)}
      </p>
    </div>
  );
}

function MetricBox({ label, value, sub, tone, capitalize }: { label: string; value: string; sub?: string; tone?: string; capitalize?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono text-xl font-bold ${tone ?? ""} ${capitalize ? "font-sans capitalize" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
