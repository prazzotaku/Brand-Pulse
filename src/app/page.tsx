import Link from "next/link";
import {
  Activity, MessageSquareText, AlertTriangle, Target, Lightbulb, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SentimentDonut } from "@/components/charts/sentiment-donut";
import { ToneTrendChart } from "@/components/charts/tone-trend-chart";
import { BarListChart } from "@/components/charts/bar-list-chart";
import { PeriodFilter } from "@/components/shared/period-filter";
import { getActiveBrand } from "@/lib/brand";
import { getOverviewStats } from "@/lib/stats";
import { resolvePeriod, type PeriodSearchParams } from "@/lib/period";
import { PLATFORM_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: PeriodSearchParams;
}) {
  const brand = await getActiveBrand();
  const period = resolvePeriod(searchParams);
  const stats = await getOverviewStats(brand.id, period);
  const healthTone =
    stats.brandHealthScore >= 70 ? "text-emerald-600" : stats.brandHealthScore >= 45 ? "text-amber-600" : "text-red-600";
  const healthLabel =
    stats.brandHealthScore >= 70 ? "Sehat" : stats.brandHealthScore >= 45 ? "Waspada" : "Berisiko";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Kondisi brand {brand.name} — {period.label.toLowerCase()}: apakah aman, isu apa yang naik, dan apa yang perlu dilakukan.
        </p>
      </div>

      <PeriodFilter />

      {/* Baris 1: skor & angka utama */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Activity className="h-4 w-4" aria-hidden="true" /> Brand Health Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-3xl font-bold ${healthTone}`}>{stats.brandHealthScore}</span>
              <span className="text-sm text-muted-foreground">/100 · {healthLabel}</span>
            </div>
            <Progress value={stats.brandHealthScore} className="mt-3" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <MessageSquareText className="h-4 w-4" aria-hidden="true" /> Total Mentions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-3xl font-bold">{stats.totalMentions}</span>
            <p className="mt-1 text-sm text-muted-foreground">
              dari {stats.platformCounts.length} platform ·{" "}
              <Link href="/mentions" className="text-primary underline-offset-2 hover:underline">
                lihat semua
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card className={stats.negativeSpike.isSpiking ? "border-red-300 bg-red-50/50 dark:bg-red-950/30" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Negative Spike Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className={`font-mono text-3xl font-bold ${stats.negativeSpike.isSpiking ? "text-red-600" : ""}`}>
              {stats.negativeSpike.current}
            </span>
            <p className="mt-1 text-sm text-muted-foreground">
              negatif 24 jam (baseline {stats.negativeSpike.baseline}) —{" "}
              <span className={stats.negativeSpike.isSpiking ? "font-semibold text-red-600" : "font-medium text-emerald-600"}>
                {stats.negativeSpike.isSpiking ? "SPIKE terdeteksi" : "normal"}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" aria-hidden="true" /> Last Refresh
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-lg font-semibold">
              {stats.lastRefresh ? formatDateTime(stats.lastRefresh) : "Belum pernah"}
            </span>
            <p className="mt-1 text-sm text-muted-foreground">
              Atur interval (5m/30m/1h) atau tekan Reload now di bar atas.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Baris 2: isu & peluang */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Target className="h-4 w-4" aria-hidden="true" /> Top Issue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topIssue ? (
              <>
                <p className="text-xl font-semibold capitalize">{stats.topIssue.category}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {stats.topIssue.count} mention —{" "}
                  <Link
                    href={`/mentions?issue=${encodeURIComponent(stats.topIssue.category)}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    telusuri sumbernya
                  </Link>
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada isu dominan.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Lightbulb className="h-4 w-4" aria-hidden="true" /> Top Opportunity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topOpportunity ? (
              <>
                <p className="text-xl font-semibold capitalize">{stats.topOpportunity.intent}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {stats.topOpportunity.count} sinyal audiens —{" "}
                  <Link href="/content-ideas" className="text-primary underline-offset-2 hover:underline">
                    ubah jadi ide konten
                  </Link>
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada sinyal peluang.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Baris 3: chart */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Media Tone Trend</CardTitle>
            <CardDescription>Distribusi sentiment — {period.label.toLowerCase()} (semua sumber).</CardDescription>
          </CardHeader>
          <CardContent>
            <ToneTrendChart data={stats.toneTrend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sentiment Split</CardTitle>
            <CardDescription>Komposisi tone periode berjalan.</CardDescription>
          </CardHeader>
          <CardContent>
            <SentimentDonut split={stats.sentimentSplit} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Social Audience Mood</CardTitle>
            <CardDescription>Intent audiens dari komentar & percakapan.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarListChart
              data={stats.audienceMood.map((m) => ({ label: m.intent, count: m.count }))}
              color="#25D366"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mention per Platform</CardTitle>
            <CardDescription>Volume percakapan per sumber.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarListChart
              data={stats.platformCounts.map((p) => ({
                label: PLATFORM_LABELS[p.platform] ?? p.platform,
                count: p.count,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
