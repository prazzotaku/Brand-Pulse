import { NextRequest, NextResponse } from "next/server";
import { getAI } from "@/lib/ai";
import { getActiveBrand, toBrandContext } from "@/lib/brand";

/** POST /api/hook-generate — AI membuatkan hook & caption dari topik konten. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const topic = String(body.topic ?? "").trim();
  if (!topic) {
    return NextResponse.json({ ok: false, error: "Field 'topic' wajib diisi." }, { status: 400 });
  }

  const brand = await getActiveBrand();
  const result = await getAI().generateHooks(
    {
      topic,
      platform: body.platform ?? "",
      goal: body.goal ?? "edukasi",
      contentType: body.contentType ?? "",
    },
    toBrandContext(brand)
  );

  return NextResponse.json({ ok: true, result });
}
