import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SentimentBadge, PlatformBadge } from "@/components/shared/badges";
import { SlangActions } from "@/components/slang/slang-actions";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { formatDateTime, truncate } from "@/lib/utils";
import { PLATFORM_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function parseDist(json: string): [string, number][] {
  try {
    return Object.entries(JSON.parse(json) as Record<string, number>).sort((a, b) => b[1] - a[1]);
  } catch {
    return [];
  }
}

/**
 * Slang Intelligence — kamus slang/bahasa gaul yang audiens pakai saat
 * membicarakan brand. Terisi otomatis dari AI analysis; user meng-approve
 * arti, menolak, atau menjadikannya keyword monitoring baru.
 */
export default async function SlangPage() {
  const brand = await getActiveBrand();
  const terms = await prisma.slangTerm.findMany({
    where: { brandId: brand.id },
    include: {
      mentions: {
        take: 2,
        orderBy: { createdAt: "desc" },
        include: { mention: { select: { id: true, content: true, sourcePlatform: true } } },
      },
    },
    orderBy: [{ frequency: "desc" }, { lastSeenAt: "desc" }],
    take: 100,
  });

  const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    suggested: "secondary",
    approved: "default",
    rejected: "outline",
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Slang Intelligence</h1>
        <p className="text-sm text-muted-foreground">
          {terms.length} istilah informal terdeteksi dari percakapan audiens tentang {brand.name}.
          Approve artinya, atau jadikan keyword monitoring baru.
        </p>
      </div>

      {terms.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Belum ada slang terdeteksi.</p>
            <p className="mt-1">
              Slang terisi otomatis saat data sosial/forum masuk (refresh atau import). Data berita
              formal jarang mengandung slang — coba import komentar audiens dari halaman{" "}
              <Link href="/sources" className="text-primary underline-offset-2 hover:underline">Sources</Link>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {terms.map((t) => {
            const sentiments = parseDist(t.sentimentDistribution);
            const platforms = parseDist(t.platformDistribution);
            const dominant = sentiments[0]?.[0] ?? "neutral";
            return (
              <Card key={t.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="font-mono text-lg">&ldquo;{t.slangTerm}&rdquo;</CardTitle>
                      <CardDescription>
                        Arti: <strong className="text-foreground">{t.normalizedMeaning || "(belum ada saran arti)"}</strong>
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-mono text-xl font-bold">{t.frequency}×</span>
                      <Badge variant={statusVariant[t.status] ?? "secondary"} className="capitalize">{t.status}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <SentimentBadge sentiment={dominant} />
                    <span className="text-xs text-muted-foreground">
                      distribusi: {sentiments.map(([s, n]) => `${s} ${n}`).join(", ") || "-"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Platform: {platforms.map(([p, n]) => `${PLATFORM_LABELS[p] ?? p} (${n})`).join(", ") || "-"} ·
                    pertama {formatDateTime(t.firstSeenAt)} · terakhir {formatDateTime(t.lastSeenAt)} ·
                    confidence {t.confidenceScore}
                  </p>
                  {t.mentions.length > 0 && (
                    <div className="space-y-1.5">
                      {t.mentions.map((sm) => (
                        <Link
                          key={sm.id}
                          href={`/mentions/${sm.mention.id}`}
                          className="block rounded-md bg-muted p-2 text-xs italic hover:bg-accent"
                        >
                          <PlatformBadge platform={sm.mention.sourcePlatform} />{" "}
                          &ldquo;{truncate(sm.mention.content, 110)}&rdquo;
                        </Link>
                      ))}
                    </div>
                  )}
                  <SlangActions id={t.id} status={t.status} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
