import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlatformBadge } from "@/components/shared/badges";
import { AddAccountForm, FetchMetricsButton } from "@/components/accounts/account-forms";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { formatNumber, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Account Engagement Analytics — performa akun media sosial brand & kompetitor.
 * Metrik dari API resmi (via "Tarik metrik") + fallback agregasi konten akun
 * tersebut yang sudah terekam sebagai mention.
 */
export default async function AccountsPage() {
  const brand = await getActiveBrand();
  const accounts = await prisma.sourceAccount.findMany({
    where: { brandId: brand.id, isActive: true },
    include: {
      metrics: { orderBy: { date: "desc" }, take: 1 },
      contents: { orderBy: { engagementRate: "desc" }, take: 3 },
    },
    orderBy: [{ accountType: "asc" }, { platform: "asc" }],
  });

  // Fallback: agregasi mention yang ditulis oleh handle akun (konten akun sendiri).
  const accountsWithStats = await Promise.all(
    accounts.map(async (acc) => {
      const handleNoAt = acc.handle.replace(/^@/, "");
      const agg = await prisma.mention.aggregate({
        where: {
          brandId: brand.id,
          sourcePlatform: acc.platform,
          OR: [{ authorHandle: { contains: handleNoAt } }, { authorName: { contains: handleNoAt } }],
        },
        _count: { _all: true },
        _sum: { likeCount: true, commentCount: true, shareCount: true, viewCount: true },
      });
      return { acc, agg };
    })
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Account Engagement</h1>
          <p className="text-sm text-muted-foreground">
            Performa akun media sosial {brand.name} dan kompetitor — {accounts.length} akun terdaftar.
          </p>
        </div>
        <FetchMetricsButton />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Tambah Akun</CardTitle>
          <CardDescription>
            Daftarkan akun brand sendiri atau kompetitor. Metrik terisi via API resmi
            (butuh key platform ybs.) atau dari konten akun yang terekam sebagai mention.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddAccountForm />
        </CardContent>
      </Card>

      {accountsWithStats.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Belum ada akun. Tambahkan akun pertama di atas.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {accountsWithStats.map(({ acc, agg }) => {
            const m = acc.metrics[0];
            const followers = m ? m.followerCount || m.subscriberCount : 0;
            const mentionEngagement =
              (agg._sum.likeCount ?? 0) + (agg._sum.commentCount ?? 0) + (agg._sum.shareCount ?? 0);
            return (
              <Card key={acc.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{acc.displayName || acc.handle}</CardTitle>
                      <CardDescription className="font-mono">{acc.handle}</CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <PlatformBadge platform={acc.platform} />
                      <Badge variant={acc.accountType === "own" ? "default" : "secondary"}>
                        {acc.accountType === "own" ? "Own" : "Kompetitor"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {m ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                      <Stat label="Followers/Subs" value={formatNumber(followers)} />
                      <Stat label="Posts" value={formatNumber(m.postCount)} />
                      <Stat label="Views" value={formatNumber(m.totalViews)} />
                      <Stat label="ER by followers" value={`${m.engagementRateByFollowers}%`} />
                      <Stat label="ER by views" value={`${m.engagementRateByViews}%`} />
                      <Stat label="Avg eng/post" value={formatNumber(Math.round(m.averageEngagementPerPost))} />
                      <p className="col-span-full text-xs text-muted-foreground">
                        Snapshot API: {formatDateTime(m.date)}
                      </p>
                    </div>
                  ) : (
                    <p className="rounded-md bg-muted p-2.5 text-xs text-muted-foreground">
                      Belum ada snapshot metrik API — klik &ldquo;Tarik metrik dari API&rdquo; (butuh
                      API key platform ini di .env).
                    </p>
                  )}

                  <div className="border-t pt-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Dari mention yang terekam
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                      <Stat label="Konten" value={String(agg._count._all)} />
                      <Stat label="Likes" value={formatNumber(agg._sum.likeCount ?? 0)} />
                      <Stat label="Comments" value={formatNumber(agg._sum.commentCount ?? 0)} />
                      <Stat label="Total eng." value={formatNumber(mentionEngagement)} />
                    </div>
                  </div>

                  {acc.contents.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Top content
                      </p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Judul</TableHead>
                            <TableHead className="text-right">ER</TableHead>
                            <TableHead className="text-right">Views</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {acc.contents.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="max-w-[220px] truncate text-xs">
                                {c.url ? (
                                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    {c.title || c.caption || c.externalId}
                                  </a>
                                ) : (
                                  c.title || c.caption || c.externalId
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">{c.engagementRate}%</TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatNumber(c.viewCount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Engagement rate: by followers = total engagement ÷ followers; by views = total engagement ÷ views;
        avg per post = total engagement ÷ jumlah post. Metrik penuh butuh API key platform (lihat Sources).
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono font-semibold">{value}</p>
    </div>
  );
}
