/**
 * Bersihkan semua data mock dari database TANPA menghapus data live/import:
 * - hapus mention origin="mock" (analysis ikut ter-cascade)
 * - hapus alert/idea/report demo (semuanya diturunkan dari data mock)
 * - perbarui baris Source ke connector live (API resmi / Google News)
 * ContentReview (riwayat hook review user) dipertahankan.
 *
 * Jalankan: npx tsx prisma/purge-mock.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const mentions = await prisma.mention.deleteMany({ where: { origin: "mock" } });
  const alerts = await prisma.alert.deleteMany();
  const ideas = await prisma.contentIdea.deleteMany();
  const reports = await prisma.report.deleteMany();

  const sourceDefs = [
    { platform: "facebook", name: "Facebook Pages (Meta Graph API)", method: "official_api", status: "pending", notes: "Isi FB_PAGE_ID + FB_ACCESS_TOKEN di .env untuk mengaktifkan. Scope: posts page milik sendiri." },
    { platform: "instagram", name: "Instagram (Graph API)", method: "official_api", status: "pending", notes: "Isi IG_USER_ID + IG_ACCESS_TOKEN di .env. Scope: media akun profesional sendiri." },
    { platform: "x", name: "X (API v2 Recent Search)", method: "official_api", status: "pending", notes: "Isi X_BEARER_TOKEN di .env. Scope: public posts berbasis keyword, 7 hari terakhir." },
    { platform: "threads", name: "Threads (Threads API)", method: "official_api", status: "pending", notes: "Isi THREADS_USER_ID + THREADS_ACCESS_TOKEN di .env. Scope: post akun terhubung." },
    { platform: "tiktok", name: "TikTok (Research API)", method: "official_api", status: "pending", notes: "Isi TIKTOK_ACCESS_TOKEN di .env (butuh approval riset TikTok). Fallback: import CSV." },
    { platform: "news", name: "Online News (Google News RSS)", method: "rss", status: "connected", notes: "LIVE: RSS publik Google News untuk keyword brand — artikel & link nyata." },
    { platform: "manual", name: "Manual Import (CSV/JSON)", method: "manual_import", status: "connected", notes: "Upload data nyata dari platform mana pun lewat halaman Sources." },
  ];
  for (const s of sourceDefs) {
    await prisma.source.updateMany({
      where: { platform: s.platform },
      data: { name: s.name, method: s.method, status: s.status, notes: s.notes },
    });
  }
  // Connector blog/RSS sample sudah dihapus — buang source-nya bila tak lagi direferensikan.
  const rssRefs = await prisma.mention.count({ where: { sourcePlatform: "rss" } });
  if (rssRefs === 0) {
    await prisma.source.deleteMany({ where: { platform: "rss" } });
  }

  const remaining = await prisma.mention.groupBy({ by: ["origin"], _count: { _all: true } });
  console.log(`Mock dihapus: ${mentions.count} mention, ${alerts.count} alert, ${ideas.count} idea, ${reports.count} report.`);
  console.log("Sisa mention per origin:", remaining.map((r) => `${r.origin}=${r._count._all}`).join(", ") || "(kosong)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
