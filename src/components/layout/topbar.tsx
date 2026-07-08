import { prisma } from "@/lib/prisma";
import { RefreshControl } from "./refresh-control";

export async function Topbar() {
  // Baca nama brand dari database agar perubahan di Settings langsung terlihat.
  const brand = await prisma.brand.findFirst({
    orderBy: { createdAt: "asc" },
    select: { name: true },
  });

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b bg-card/95 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">
        <span className="hidden text-sm font-medium text-muted-foreground sm:inline">Brand:</span>
        <span className="rounded-md bg-accent px-2.5 py-1 text-sm font-semibold text-accent-foreground">
          {brand?.name ?? "Belum ada brand"}
        </span>
      </div>
      <RefreshControl />
    </header>
  );
}
