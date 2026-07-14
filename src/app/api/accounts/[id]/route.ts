import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";

/** DELETE /api/accounts/[id] — hapus source account (own/competitor). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const brand = await getActiveBrand();
  const account = await prisma.sourceAccount.findUnique({ where: { id: params.id } });
  if (!account || account.brandId !== brand.id) {
    return NextResponse.json({ ok: false, error: "Akun tidak ditemukan." }, { status: 404 });
  }
  await prisma.sourceAccount.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
