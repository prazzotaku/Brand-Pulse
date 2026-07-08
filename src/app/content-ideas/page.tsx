import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenerateIdeasButton, IdeaStatusButtons } from "@/components/content/idea-actions";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "Baru", saved: "Disimpan", used: "Dipakai", archived: "Arsip",
};

/** Content Idea Engine — ide konten yang lahir dari data mention, bukan layar kosong. */
export default async function ContentIdeasPage() {
  const brand = await getActiveBrand();
  const ideas = await prisma.contentIdea.findMany({
    where: { brandId: brand.id, status: { not: "archived" } },
    orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content Ideas</h1>
          <p className="text-sm text-muted-foreground">
            Ide konten dihasilkan dari komentar, pemberitaan, dan tren yang terekam — {ideas.length} ide aktif.
          </p>
        </div>
        <GenerateIdeasButton />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {ideas.map((idea) => (
          <Card key={idea.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base leading-snug">{idea.idea}</CardTitle>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`font-mono text-xl font-bold ${idea.priorityScore >= 80 ? "text-red-600" : idea.priorityScore >= 60 ? "text-amber-600" : "text-emerald-600"}`}>
                    {idea.priorityScore}
                  </span>
                  <span className="text-xs text-muted-foreground">priority</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="capitalize">{idea.format || "format bebas"}</Badge>
                <Badge variant="outline">{STATUS_LABEL[idea.status] ?? idea.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <p><strong>Source insight:</strong> <span className="text-muted-foreground">{idea.sourceInsight}</span></p>
              <p><strong>Audience pain:</strong> <span className="text-muted-foreground">{idea.audiencePain}</span></p>
              <p className="rounded-md bg-accent p-2.5">
                <strong>Hook:</strong> <span className="italic">&ldquo;{idea.hookSuggestion}&rdquo;</span>
              </p>
              <p><strong>Angle:</strong> <span className="text-muted-foreground">{idea.angle}</span></p>
              <p><strong>CTA:</strong> <span className="text-muted-foreground">{idea.cta}</span></p>
              <p><strong>Why now:</strong> <span className="text-muted-foreground">{idea.whyNow}</span></p>
              <div className="pt-2">
                <IdeaStatusButtons id={idea.id} status={idea.status} />
              </div>
            </CardContent>
          </Card>
        ))}
        {ideas.length === 0 && (
          <Card className="lg:col-span-2">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Belum ada ide. Klik &ldquo;Generate ide baru&rdquo; untuk menganalisis insight terbaru.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
