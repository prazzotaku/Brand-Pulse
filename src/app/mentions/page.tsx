import Link from "next/link";
import { Bookmark } from "lucide-react";
import { FilterBar } from "@/components/mentions/filter-bar";
import { MentionTable } from "@/components/mentions/mention-table";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import { buildMentionWhere, type MentionFilters } from "@/lib/filters";
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function MentionsPage({
  searchParams,
}: {
  searchParams: MentionFilters & { page?: string; pageSize?: string };
}) {
  const brand = await getActiveBrand();

  const page = Math.max(1, Number(searchParams.page) || 1);
  const pageSize = PAGE_SIZE_OPTIONS.includes(Number(searchParams.pageSize))
    ? Number(searchParams.pageSize)
    : DEFAULT_PAGE_SIZE;

  const where = buildMentionWhere(brand.id, searchParams);

  const [mentions, total, savedViews] = await Promise.all([
    prisma.mention.findMany({
      where,
      include: { analysis: true },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
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
            {total} mention cocok dengan filter aktif.
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
      <PaginationControls page={page} pageSize={pageSize} total={total} itemLabel="mention" />
    </div>
  );
}
