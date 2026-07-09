import { NextRequest, NextResponse } from "next/server";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Rate limiter in-memory per proses. Cukup untuk MVP single-instance;
 * TIDAK dibagi antar instance jika suatu saat di-deploy multi-instance/serverless
 * (tiap instance punya counter sendiri). Upgrade ke Redis kalau sudah scale-out.
 */
const buckets = new Map<string, Bucket>();

// Bersihkan bucket kedaluwarsa secara berkala supaya Map tidak bocor memori.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return ip;
}

/**
 * Batasi jumlah request per IP dalam jendela waktu tertentu — dipakai pada
 * endpoint yang memanggil AI berbayar (Gemini/DeepSeek) agar tidak bisa
 * dihabisi lewat spam, karena endpoint ini tidak wajib login secara default.
 */
export function rateLimit(
  req: NextRequest,
  opts: { limit: number; windowMs: number; scope: string }
): NextResponse | null {
  const key = `${opts.scope}:${clientKey(req)}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return null;
  }

  if (bucket.count >= opts.limit) {
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak permintaan, coba lagi beberapa saat lagi." },
      { status: 429, headers: { "retry-after": String(retryAfterSec) } }
    );
  }

  bucket.count += 1;
  return null;
}
