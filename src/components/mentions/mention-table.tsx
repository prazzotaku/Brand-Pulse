import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SentimentBadge, RiskBadge, PlatformBadge, OriginBadge } from "@/components/shared/badges";
import { formatDateTime, formatNumber, truncate } from "@/lib/utils";
import type { Mention, MentionAnalysis } from "@prisma/client";

type MentionWithAnalysis = Mention & { analysis: MentionAnalysis | null };

export function MentionTable({ mentions }: { mentions: MentionWithAnalysis[] }) {
  if (mentions.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-10 text-center">
        <p className="font-medium">Tidak ada mention yang cocok dengan filter.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Longgarkan filter, jalankan Reload now, atau import data dari halaman Sources.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Account / Media</TableHead>
            <TableHead className="min-w-[280px]">Content</TableHead>
            <TableHead>Tone</TableHead>
            <TableHead>Issue</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead className="text-right">Engagement</TableHead>
            <TableHead>Link</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mentions.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                {formatDateTime(m.publishedAt)}
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <PlatformBadge platform={m.sourcePlatform} />
                  <OriginBadge origin={m.origin} />
                </div>
              </TableCell>
              <TableCell className="max-w-[140px]">
                <p className="truncate font-medium">{m.authorName || "-"}</p>
                <p className="truncate text-xs text-muted-foreground">{m.authorHandle}</p>
              </TableCell>
              <TableCell className="max-w-[360px]">
                <Link href={`/mentions/${m.id}`} className="group block">
                  {m.title && <p className="font-medium group-hover:text-primary">{truncate(m.title, 80)}</p>}
                  <p className="text-sm text-muted-foreground group-hover:text-foreground">
                    {truncate(m.content, 110)}
                  </p>
                </Link>
              </TableCell>
              <TableCell>
                {m.analysis ? <SentimentBadge sentiment={m.analysis.sentiment} /> : <span className="text-xs text-muted-foreground">belum dianalisis</span>}
              </TableCell>
              <TableCell className="capitalize text-sm">{m.analysis?.issueCategory || "-"}</TableCell>
              <TableCell>
                {m.analysis && <RiskBadge impact={m.analysis.reputationalImpact} score={m.analysis.riskScore} />}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">{formatNumber(m.engagementCount)}</TableCell>
              <TableCell>
                {m.url ? (
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Buka sumber asli mention dari ${m.authorName || m.sourcePlatform}`}
                    title={m.origin === "mock" ? "URL simulasi (mock) — halaman aslinya tidak ada, akan 404" : "Buka sumber asli"}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
