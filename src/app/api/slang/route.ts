import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";

/** PATCH /api/slang — approve/reject arti slang, atau koreksi arti. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ ok: false, error: "Butuh 'id'." }, { status: 400 });

  const data: Record<string, string> = {};
  if (["suggested", "approved", "rejected"].includes(body.status)) data.status = body.status;
  if (typeof body.normalizedMeaning === "string" && body.normalizedMeaning.trim()) {
    data.normalizedMeaning = body.normalizedMeaning.trim();
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: "Tidak ada perubahan valid." }, { status: 400 });
  }

  const term = await prisma.slangTerm.update({ where: { id }, data });
  return NextResponse.json({ ok: true, term });
}

/** POST /api/slang — jadikan slang sebagai keyword monitoring baru. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (body.action !== "add_keyword" || !id) {
    return NextResponse.json({ ok: false, error: "Butuh action=add_keyword dan id." }, { status: 400 });
  }

  const brand = await getActiveBrand();
  const term = await prisma.slangTerm.findUnique({ where: { id } });
  if (!term) return NextResponse.json({ ok: false, error: "Slang tidak ditemukan." }, { status: 404 });

  const exists = await prisma.brandKeyword.findFirst({
    where: { brandId: brand.id, keyword: term.slangTerm, type: "issue" },
  });
  if (!exists) {
    await prisma.brandKeyword.create({
      data: { brandId: brand.id, keyword: term.slangTerm, type: "issue" },
    });
  }
  return NextResponse.json({ ok: true, added: !exists });
}
