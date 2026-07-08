import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PeriodFilter } from "@/components/shared/period-filter";
import { QuickFilterBar } from "@/components/shared/quick-filter-bar";
import { SociographView, type SgEdge, type SgNode } from "@/components/sociograph/sociograph-view";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { buildMentionWhere, type MentionFilters } from "@/lib/filters";
import { resolvePeriod, periodWhere, type PeriodSearchParams } from "@/lib/period";
import { parseJsonArray } from "@/lib/types";

export const dynamic = "force-dynamic";

type SgParams = MentionFilters & PeriodSearchParams;

/**
 * Sociograph — network hubungan keyword/hashtag/kompetitor/slang/lokasi/isu
 * dengan brand. Node = frekuensi kemunculan; edge = co-occurrence dalam
 * mention yang sama; warna = sentimen dominan.
 */
export default async function SociographPage({ searchParams }: { searchParams: SgParams }) {
  const brand = await getActiveBrand();
  const period = resolvePeriod(searchParams);
  const where = buildMentionWhere(brand.id, searchParams);
  where.publishedAt = periodWhere(period);

  const mentions = await prisma.mention.findMany({
    where,
    include: { analysis: true },
    take: 1500,
  });

  // --- Bangun graph dari data analisis (co-occurrence per mention) ---
  interface NodeAgg { type: string; weight: number; sentimentSum: number }
  const nodeMap = new Map<string, NodeAgg>();
  const edgeMap = new Map<string, number>(); // "a|b" → count

  const addNode = (label: string, type: string, sentimentScore: number) => {
    const key = label.toLowerCase();
    const agg = nodeMap.get(key) ?? { type, weight: 0, sentimentSum: 0 };
    agg.weight++;
    agg.sentimentSum += sentimentScore;
    nodeMap.set(key, agg);
  };
  const addEdge = (a: string, b: string) => {
    const [x, y] = [a.toLowerCase(), b.toLowerCase()].sort();
    if (x === y) return;
    const key = `${x}|${y}`;
    edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
  };

  const brandKey = brand.name.toLowerCase();
  for (const m of mentions) {
    const a = m.analysis;
    if (!a) continue;
    const s = a.sentimentScore;
    const terms: { label: string; type: string }[] = [
      ...parseJsonArray(a.relatedKeywords).slice(0, 4).map((k) => ({ label: k, type: "keyword" })),
      ...parseJsonArray(a.relatedHashtags).slice(0, 3).map((h) => ({ label: h, type: "hashtag" })),
      ...parseJsonArray(a.relatedCompetitors).map((c) => ({ label: c, type: "competitor" })),
      ...((JSON.parse(a.detectedSlang || "[]") as { term: string }[]) ?? []).slice(0, 3).map((x) => ({ label: x.term, type: "slang" })),
      ...((JSON.parse(a.detectedLocations || "[]") as { name: string }[]) ?? []).slice(0, 2).map((x) => ({ label: x.name, type: "location" })),
      ...(a.issueCategory && a.issueCategory !== "irrelevant" ? [{ label: a.issueCategory, type: "issue" }] : []),
    ];

    for (const t of terms) {
      addNode(t.label, t.type, s);
      addEdge(brandKey, t.label);
    }
    // Pairwise antar term dalam mention yang sama (dibatasi agar tidak meledak).
    for (let i = 0; i < Math.min(terms.length, 5); i++) {
      for (let j = i + 1; j < Math.min(terms.length, 5); j++) {
        addEdge(terms[i].label, terms[j].label);
      }
    }
  }

  // Ambil top-N node berdasarkan frekuensi.
  const topNodes = [...nodeMap.entries()]
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, 34);
  const keep = new Set(topNodes.map(([label]) => label));
  keep.add(brandKey);

  const nodes: SgNode[] = [
    { label: brand.name, type: "brand", weight: mentions.length, sentimentScore: 0 },
    ...topNodes.map(([label, agg]) => ({
      label,
      type: agg.type,
      weight: agg.weight,
      sentimentScore: Math.round(agg.sentimentSum / agg.weight),
    })),
  ];

  const maxCount = Math.max(...[...edgeMap.values()], 1);
  const edges: SgEdge[] = [...edgeMap.entries()]
    .filter(([key]) => {
      const [a, b] = key.split("|");
      return keep.has(a) && keep.has(b);
    })
    .map(([key, count]) => {
      const [a, b] = key.split("|");
      const source = a === brandKey ? brand.name : a;
      const target = b === brandKey ? brand.name : b;
      return { source, target, count, strength: count / maxCount };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 120);

  // --- Insight otomatis ---
  const byType = (t: string) => topNodes.filter(([, agg]) => agg.type === t);
  const negKeywords = topNodes
    .filter(([, agg]) => agg.sentimentSum / agg.weight < -15 && ["keyword", "slang"].includes(agg.type))
    .slice(0, 3)
    .map(([l]) => l);
  const insights = [
    byType("keyword").length && `Keyword paling kuat terkait brand: ${byType("keyword").slice(0, 3).map(([l]) => l).join(", ")}.`,
    negKeywords.length && `Keyword bernada negatif yang perlu diwaspadai: ${negKeywords.join(", ")}.`,
    byType("hashtag").length && `Hashtag yang paling sering menyertai brand: ${byType("hashtag").slice(0, 3).map(([l]) => l).join(", ")}.`,
    byType("competitor").length && `Kompetitor yang paling sering dibandingkan: ${byType("competitor").slice(0, 2).map(([l]) => l).join(", ")}.`,
    byType("slang").length && `Slang yang mulai melekat pada percakapan: ${byType("slang").slice(0, 3).map(([l]) => l).join(", ")}.`,
    byType("issue").length && `Cluster isu yang berkembang: ${byType("issue").slice(0, 3).map(([l]) => l).join(", ")}.`,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sociograph</h1>
        <p className="text-sm text-muted-foreground">
          Peta hubungan keyword, hashtag, kompetitor, slang, lokasi, dan isu di sekitar {brand.name} —{" "}
          {period.label.toLowerCase()}, {mentions.length} mention. Klik node untuk drill-down.
        </p>
      </div>

      <PeriodFilter />
      <QuickFilterBar />

      <Card>
        <CardContent className="pt-5">
          <SociographView nodes={nodes} edges={edges} periodLabel={period.label} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Insight Otomatis</CardTitle>
          <CardDescription>Dihasilkan dari graph yang sama (evidence: klik node → lihat mention terkait).</CardDescription>
        </CardHeader>
        <CardContent>
          {insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum cukup data untuk insight.</p>
          ) : (
            <ul className="list-inside list-disc space-y-1.5 text-sm">
              {insights.map((ins, i) => (
                <li key={i}>{ins}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
