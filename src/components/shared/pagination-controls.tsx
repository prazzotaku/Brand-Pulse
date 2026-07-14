"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS } from "@/lib/constants";

interface PaginationControlsProps {
  page: number;
  pageSize: number;
  total: number;
  itemLabel?: string;
}

export function PaginationControls({
  page,
  pageSize,
  total,
  itemLabel = "item",
}: PaginationControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showFrom = total ? (page - 1) * pageSize + 1 : 0;
  const showTo = total ? Math.min(page * pageSize, total) : 0;

  function updateParams(key: string, value: string | number) {
    const newParams = new URLSearchParams(searchParams);
    newParams.set(key, String(value));
    if (key === "pageSize") newParams.delete("page"); // reset ke halaman 1
    router.push(`${pathname}?${newParams.toString()}`);
  }

  if (total <= pageSize && page === 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card px-4 py-2.5">
      <p className="text-sm text-muted-foreground">
        Menampilkan {showFrom}–{showTo} dari {total} {itemLabel}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm">
          <label htmlFor="pageSize">Item per halaman:</label>
          <Select
            id="pageSize"
            value={String(pageSize)}
            onChange={(e) => updateParams("pageSize", e.target.value)}
            className="h-8 py-0 pl-2 pr-7 text-xs"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2.5"
            disabled={page <= 1}
            onClick={() => updateParams("page", page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Halaman sebelumnya</span>
          </Button>
          <span className="text-sm">
            Halaman {page} dari {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2.5"
            disabled={page >= totalPages}
            onClick={() => updateParams("page", page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Halaman berikutnya</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
