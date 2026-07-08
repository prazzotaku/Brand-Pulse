import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBrand } from "@/lib/brand";

/** POST /api/sociograph — simpan snapshot graph (nodes + edges) untuk arsip/perbandingan. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  const edges = Array.isArray(body.edges) ? body.edges : [];
  if (nodes.length === 0) {
    return NextResponse.json({ ok: false, error: "Tidak ada node untuk disimpan." }, { status: 400 });
  }

  const brand = await getActiveBrand();
  const snapshot = await prisma.sociographSnapshot.create({
    data: {
      brandId: brand.id,
      periodStart: new Date(Date.now() - 7 * 86400000),
      periodEnd: new Date(),
      filters: JSON.stringify({ periodLabel: body.periodLabel ?? "" }),
      nodes: {
        create: nodes.slice(0, 100).map((n: Record<string, unknown>) => ({
          type: String(n.type ?? "keyword"),
          label: String(n.label ?? ""),
          weight: Number(n.weight ?? 1),
          sentimentScore: Number(n.sentimentScore ?? 0),
        })),
      },
      edges: {
        create: edges.slice(0, 300).map((e: Record<string, unknown>) => ({
          sourceLabel: String(e.source ?? ""),
          targetLabel: String(e.target ?? ""),
          coOccurrenceCount: Number(e.count ?? 1),
          strength: Number(e.strength ?? 0),
        })),
      },
    },
    include: { _count: { select: { nodes: true, edges: true } } },
  });

  return NextResponse.json({
    ok: true,
    snapshotId: snapshot.id,
    nodeCount: snapshot._count.nodes,
    edgeCount: snapshot._count.edges,
  });
}
