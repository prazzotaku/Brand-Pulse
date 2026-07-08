import Link from "next/link";
import { Bookmark } from "lucide-react";
import { FilterBar } from "@/components/mentions/filter-bar";
import { MentionTable } from "@/components/mentions/mention-table";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { buildMentionWhere, type MentionFilters } from "@/lib/filters";

export const dynamic = "force-dynamic";

export default async function MentionsPage({
  searchParams,
}: {
  searchParams: MentionFilters;
}) {
  const brand = await getActiveBrand();
  const where = buildMentionWhere(brand.id, searchParams);

  const [mentions, total, savedViews] = await Promise.all([
    prisma.mention.findMany({
      where,
      include: { analysis: true },
      orderBy: { publishedAt: "desc" },
      take: 100,
    }),
    prisma.mention.count({ where }),
    prisma.savedFilter.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">All Mentions</h1>
          <p className="text-sm text-muted-foreground">
            {total} mention cocok dengan filter aktif (maks. 100 ditampilkan).
          </p>
        </div>
      </div>

      {/* Saved views */}
      <div className="flex flex-wrap items-center gap-2" aria-label="Saved views">
        <Bookmark className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {savedViews.map((v) => (
          <Link
            key={v.id}
            href={`/mentions?${v.query}`}
            title={v.description}
            className="rounded-full border bg-card px-3 py-1 text-xs font-medium transition-colors hover:border-primary hover:text-primary"
          >
            {v.name}
          </Link>
        ))}
      </div>

      <FilterBar />
      <MentionTable mentions={mentions} />
    </div>
  );
}
