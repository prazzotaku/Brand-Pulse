import { NextRequest, NextResponse } from "next/server";
import { getAI } from "@/lib/ai";
import { getActiveBrand, toBrandContext } from "@/lib/brand";
import { rateLimit } from "@/lib/rate-limit";

// Panggilan AI live bisa lebih lambat dari default 10s Vercel.
// 60s adalah maksimum yang diizinkan Hobby plan.
export const maxDuration = 60;

const MAX_TOPIC_LEN = 500;

/** POST /api/hook-generate — AI membuatkan hook & caption dari topik konten. */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { scope: "hook-generate", limit: 15, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const topic = String(body.topic ?? "").trim();
  if (!topic) {
    return NextResponse.json({ ok: false, error: "Field 'topic' wajib diisi." }, { status: 400 });
  }
  if (topic.length > MAX_TOPIC_LEN) {
    return NextResponse.json(
      { ok: false, error: `Topik terlalu panjang (maks ${MAX_TOPIC_LEN} karakter).` },
      { status: 400 }
    );
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
