import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";
import type { FetchScope } from "@/lib/connectors/types";
import type { SourcePlatform } from "@/lib/types";

/** POST /api/search-profiles — tambah search profile baru. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const platform = String(body.platform ?? "").trim() as SourcePlatform;
  const scope = String(body.scope ?? "").trim() as FetchScope;
  const name = String(body.name ?? "").trim();
  const query = String(body.query ?? "").trim();

  if (!platform || !scope || !name || !query) {
    return NextResponse.json({ ok: false, error: "Butuh 'platform', 'scope', 'name', dan 'query'." }, { status: 400 });
  }

  const brand = await getActiveBrand();
  const searchProfile = await prisma.searchProfile.create({
    data: { brandId: brand.id, platform, scope, name, query },
  });
  return NextResponse.json({ ok: true, searchProfile });
}
