import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SentimentBadge, RiskBadge, PlatformBadge, OriginBadge } from "@/components/shared/badges";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Detail mention: insight AI berdampingan dengan sumber mentah (raw payload + URL). */
export default async function MentionDetailPage({ params }: { params: { id: string } }) {
  const mention = await prisma.mention.findUnique({
    where: { id: params.id },
    include: { analysis: true, source: true },
  });
  if (!mention) notFound();
  const a = mention.analysis;

  let rawPretty = mention.rawPayload;
  try {
    rawPretty = JSON.stringify(JSON.parse(mention.rawPayload), null, 2);
  } catch { /* biarkan apa adanya */ }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/mentions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke All Mentions
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <PlatformBadge platform={mention.sourcePlatform} />
        <OriginBadge origin={mention.origin} />
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium capitalize">{mention.sourceType}</span>
        {mention.mediaTier && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium uppercase">{mention.mediaTier}</span>
        )}
        <span className="font-mono text-xs text-muted-foreground">{formatDateTime(mention.publishedAt)}</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{mention.title || `${mention.authorName} di ${mention.sourcePlatform}`}</CardTitle>
          <CardDescription>
            {mention.authorName} {mention.authorHandle && `(${mention.authorHandle})`} · bahasa: {mention.language}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-base leading-relaxed">{mention.content}</p>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>Likes: <strong className="font-mono">{formatNumber(mention.likeCount)}</strong></span>
            <span>Comments: <strong className="font-mono">{formatNumber(mention.commentCount)}</strong></span>
            <span>Shares: <strong className="font-mono">{formatNumber(mention.shareCount)}</strong></span>
            <span>Views: <strong className="font-mono">{formatNumber(mention.viewCount)}</strong></span>
          </div>
          {mention.url && (
            <div className="space-y-1">
              <a
                href={mention.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Buka sumber asli <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              {mention.origin === "mock" && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Ini data lama dari konfigurasi sebelumnya — tautan sumber bisa jadi sudah tidak tersedia.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {a ? (
        <Card>
          <CardHeader>
            <CardTitle>Hasil Analisis AI</CardTitle>
            <CardDescription>Dianalisis {formatDateTime(a.analyzedAt)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <SentimentBadge sentiment={a.sentiment} />
              <RiskBadge impact={a.reputationalImpact} score={a.riskScore} />
              <span className="rounded-full border bg-muted px-2 py-0.5 text-xs font-medium capitalize">intent: {a.intent || "-"}</span>
              <span className="rounded-full border bg-muted px-2 py-0.5 text-xs font-medium capitalize">emosi: {a.emotion || "-"}</span>
              <span className="rounded-full border bg-muted px-2 py-0.5 text-xs font-medium capitalize">isu: {a.issueCategory || "-"}</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${a.isRelevant ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600"}`}>
                {a.isRelevant ? "relevan" : "tidak relevan"}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Relevance", value: a.relevanceScore },
                { label: "Sentiment score", value: Math.abs(a.sentimentScore), raw: a.sentimentScore },
                { label: "Confidence", value: a.confidenceScore },
                { label: "Risk", value: a.riskScore },
              ].map((s) => (
                <div key={s.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="font-mono font-semibold">{"raw" in s ? s.raw : s.value}</span>
                  </div>
                  <Progress value={s.value} />
                </div>
              ))}
            </div>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-semibold">Ringkasan</dt>
                <dd className="text-muted-foreground">{a.summary}</dd>
              </div>
              <div>
                <dt className="font-semibold">Reasoning</dt>
                <dd className="text-muted-foreground">{a.reasoning}</dd>
              </div>
              <div>
                <dt className="font-semibold">Suggested action</dt>
                <dd className="text-muted-foreground">{a.suggestedAction}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Mention ini belum dianalisis. Jalankan POST /api/analyze atau Reload now.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Raw Payload</CardTitle>
          <CardDescription>Data mentah dari connector — untuk verifikasi insight ke sumbernya.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-72 overflow-auto rounded-md bg-muted p-4 font-mono text-xs leading-relaxed">
            {rawPretty}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
