import { NextRequest, NextResponse } from "next/server";
import { processNextPendingRun } from "@/lib/refresh-jobs";

export const maxDuration = 55;

/**
 * Vercel Cron Job handler — Sequential Time-Aware Loop.
 *
 * Algoritma:
 * - Catat waktu mulai.
 * - Loop: ambil satu job pending, proses, ulangi.
 * - Berhenti jika: (a) antrian kosong, atau (b) waktu tersisa < TIME_BUFFER_MS.
 *
 * Dengan cara ini, satu kali cron jalan bisa menyelesaikan SEMUA job yang ada
 * selama total waktu tidak melebihi batas Vercel (55 detik). Jika ada sisa,
 * cron menit berikutnya akan melanjutkan secara otomatis.
 *
 * Matematika jaminan aman:
 *   T_eksekusi_total = sum(T_job_i) untuk setiap job yang diproses
 *   T_eksekusi_total < MAX_RUN_MS (50 detik) — dijamin oleh penjaga waktu
 *   T_eksekusi_total < maxDuration (55 detik) — dijamin oleh Vercel
 */

// Penjaga waktu: berhenti memproses job baru jika waktu tersisa < 5 detik
const MAX_RUN_MS = 50_000;
// Buffer minimum sebelum batas Vercel
const TIME_BUFFER_MS = 5_000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const startTime = Date.now();
  const results = [];
  let processed = 0;
  let skipped = 0;

  try {
    // Loop sekuensial dengan penjaga waktu
    while (true) {
      const elapsed = Date.now() - startTime;
      const remaining = MAX_RUN_MS - elapsed;

      // Berhenti jika waktu tersisa tidak cukup untuk satu job lagi
      if (remaining < TIME_BUFFER_MS) {
        console.log(`[CRON] Batas waktu mendekati (elapsed=${elapsed}ms), berhenti. Processed=${processed}`);
        break;
      }

      // Ambil dan proses satu job dari antrian secara sekuensial (await)
      const result = await processNextPendingRun();

      // Jika tidak ada job lagi, antrian kosong
      if (!result) {
        console.log(`[CRON] Antrian kosong setelah ${processed} job. Total elapsed=${Date.now() - startTime}ms`);
        break;
      }

      processed++;
      results.push({
        runId: result.runId,
        status: result.status,
        inserted: result.inserted,
        fetched: result.fetched,
      });

      // Jika job gagal karena rate limit, berhenti lebih awal
      // untuk menghindari membuang sisa waktu pada job yang akan gagal juga
      if (result.status === "rate_limited") {
        console.log(`[CRON] Rate limited pada job ${result.runId}, berhenti lebih awal.`);
        skipped++;
        break;
      }
    }

    const totalElapsed = Date.now() - startTime;
    console.log(`[CRON] Selesai. Processed=${processed}, Skipped=${skipped}, TotalElapsed=${totalElapsed}ms`);

    return NextResponse.json({
      ok: true,
      processed,
      skipped,
      totalElapsedMs: totalElapsed,
      results,
    });
  } catch (err) {
    const totalElapsed = Date.now() - startTime;
    console.error("[CRON_PROCESS_QUEUE] Unhandled error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to process queue.",
        detail: String(err),
        processed,
        totalElapsedMs: totalElapsed,
      },
      { status: 500 }
    );
  }
}
