/**
 * Seed Brand Pulse OS — setup awal TANPA data mock:
 * brand contoh, keyword, sumber data live (API resmi + Google News RSS),
 * dan saved view default. Data mention diisi oleh refresh (connector live)
 * atau manual import — bukan data palsu.
 *
 * Jalankan: npm run db:seed  (atau npm run db:reset untuk mulai bersih)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Brand Pulse OS (live-only, tanpa mock)...");

  // Bersihkan data lama (idempotent seed).
  await prisma.mentionAnalysis.deleteMany();
  await prisma.mention.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.savedFilter.deleteMany();
  await prisma.contentIdea.deleteMany();
  await prisma.contentReview.deleteMany();
  await prisma.report.deleteMany();
  await prisma.refreshJob.deleteMany();
  await prisma.source.deleteMany();
  await prisma.brandKeyword.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { email: "admin@brandpulse.local", name: "Admin Brand Pulse", role: "admin" },
  });
  const workspace = await prisma.workspace.create({
    data: { name: "Brand Pulse Workspace", ownerId: user.id },
  });

  const brand = await prisma.brand.create({
    data: {
      workspaceId: workspace.id,
      name: "Bank Jakarta",
      aliases: JSON.stringify(["Bank DKI", "JakOne", "JakCard"]),
      competitors: JSON.stringify(["BCA", "Livin", "Jago"]),
      products: JSON.stringify(["JakOne Mobile", "JakCard", "QRIS", "Tabungan", "kartu"]),
      brandVoice: "Profesional, hangat, solutif",
      prohibitedClaims: JSON.stringify(["nomor 1", "pasti untung", "paling murah"]),
      targetAudience: "Warga Jakarta usia 18-45, pelaku UMKM, pengguna transportasi publik",
    },
  });

  const keywords = [
    ...["Bank Jakarta", "Bank DKI", "JakOne", "JakCard"].map((k) => ({ keyword: k, type: "include" })),
    ...["lowongan", "loker"].map((k) => ({ keyword: k, type: "exclude" })),
    ...["error", "gagal login", "lambat", "kecewa", "penipuan"].map((k) => ({ keyword: k, type: "issue" })),
    ...["mobile banking", "QRIS", "kartu", "ATM"].map((k) => ({ keyword: k, type: "product" })),
  ];
  await prisma.brandKeyword.createMany({
    data: keywords.map((k) => ({ ...k, brandId: brand.id })),
  });

  // Sumber data LIVE — social media aktif setelah kredensial diisi di .env.
  const sourceDefs = [
    { platform: "facebook", name: "Facebook Pages (Meta Graph API)", method: "official_api", status: "pending", notes: "Isi FB_PAGE_ID + FB_ACCESS_TOKEN di .env untuk mengaktifkan. Scope: posts page milik sendiri." },
    { platform: "instagram", name: "Instagram (Graph API)", method: "official_api", status: "pending", notes: "Isi IG_USER_ID + IG_ACCESS_TOKEN di .env. Scope: media akun profesional sendiri." },
    { platform: "x", name: "X (API v2 Recent Search)", method: "official_api", status: "pending", notes: "Isi X_BEARER_TOKEN di .env. Scope: public posts berbasis keyword, 7 hari terakhir." },
    { platform: "threads", name: "Threads (Threads API)", method: "official_api", status: "pending", notes: "Isi THREADS_USER_ID + THREADS_ACCESS_TOKEN di .env. Scope: post akun terhubung." },
    { platform: "tiktok", name: "TikTok (Research API)", method: "official_api", status: "pending", notes: "Isi TIKTOK_ACCESS_TOKEN di .env (butuh approval riset TikTok). Fallback: import CSV." },
    { platform: "news", name: "Online News (Google News RSS)", method: "rss", status: "connected", notes: "LIVE: RSS publik Google News untuk keyword brand — artikel & link nyata. Tekan Reload now untuk menarik berita." },
    { platform: "manual", name: "Manual Import (CSV/JSON)", method: "manual_import", status: "connected", notes: "Upload data nyata dari platform mana pun lewat halaman Sources." },
  ];
  for (const s of sourceDefs) {
    await prisma.source.create({ data: { ...s, brandId: brand.id } });
  }

  // Saved views default
  const savedViews = [
    { name: "All Brand Mentions", description: "Semua sumber, semua sentiment, 24 jam terakhir.", query: "range=24h", isDefault: true },
    { name: "Negative Watch", description: "Negatif + mixed, risk menengah ke atas, 24 jam terakhir.", query: "range=24h&sentiment=negative,mixed&minRisk=25" },
    { name: "Media Tone", description: "Berita saja, tier 1-2, relevance > 70, 7 hari terakhir.", query: "range=7d&platform=news,rss&mediaTier=tier1,tier2&minRelevance=70" },
    { name: "Social Audience Voice", description: "Sosial media saja: komentar, reply, dan post audiens.", query: "range=7d&platform=facebook,instagram,x,threads,tiktok&sourceType=comment,reply,post" },
    { name: "Competitor Comparison", description: "Mention yang menyinggung kompetitor.", query: "range=30d&issue=competitor" },
    { name: "Campaign Monitor", description: "Monitoring keyword campaign (contoh: QRIS).", query: "range=30d&q=QRIS" },
  ];
  for (const v of savedViews) {
    await prisma.savedFilter.create({ data: { ...v, brandId: brand.id } });
  }


  console.log("Seed selesai (tanpa data mock).");
  console.log("Langkah berikutnya: ganti nama brand di Settings sesuai brand Anda,");
  console.log("lalu tekan Reload now — Google News akan menarik berita asli.");
  console.log("Social media aktif setelah API key diisi di .env (lihat .env.example).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
