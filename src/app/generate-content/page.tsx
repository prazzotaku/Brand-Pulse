import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { HookReviewForm } from "@/components/content/hook-review-form";
import { HookGeneratorForm } from "@/components/content/hook-generator-form";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GenerateContentPage() {
  const brand = await getActiveBrand();
  const history = await prisma.contentReview.findMany({
    where: { brandId: brand.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Generate Content</h1>
        <p className="text-sm text-muted-foreground">
          Minta AI membuatkan hook, isi konten, dan caption dari nol — atau tempel caption yang
          sudah ada untuk direview sebelum publish.
        </p>
      </div>

      <HookGeneratorForm />

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Review Hook &amp; Caption</h2>
        <p className="text-sm text-muted-foreground">
          Sudah punya draft? Tempel caption lengkapnya — AI menilai hook, struktur isi, dan CTA-nya.
        </p>
      </div>
      <HookReviewForm />

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Riwayat Review</CardTitle>
            <CardDescription>10 review terakhir.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm italic">&ldquo;{r.inputHook}&rdquo;</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.platform || "platform tidak diisi"} · {formatDateTime(r.createdAt)} · tipe: {r.detectedHookType}
                  </p>
                </div>
                <span className={`shrink-0 font-mono text-lg font-bold ${r.totalScore >= 7.5 ? "text-emerald-600" : r.totalScore >= 5 ? "text-amber-600" : "text-red-600"}`}>
                  {r.totalScore.toFixed(1)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
