/**
 * Migrasi data upgrade (idempotent, TANPA menghapus data lama):
 * - tambah Source untuk platform baru (YouTube, Blog, Forum)
 * - daftarkan ConnectorCredential (env key yang dibutuhkan per platform)
 * - tambah saved view baru
 * - tambah contoh SourceAccount (own + competitor) untuk Account Engagement
 * Jalankan: npx tsx prisma/upgrade-sources.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const brand = await prisma.brand.findFirst({ orderBy: { createdAt: "asc" } });
  if (!brand) throw new Error("Brand tidak ditemukan — jalankan npm run db:seed dulu.");

  // --- Source baru ---
  const newSources = [
    { platform: "youtube", name: "YouTube (Data API v3)", method: "official_api", status: "pending_auth", notes: "Isi YOUTUBE_API_KEY di .env (gratis dari Google Cloud Console). Scope: video publik berdasarkan keyword + statistik channel." },
    { platform: "blog", name: "Blog (RSS feeds)", method: "rss", status: "pending_auth", notes: "Isi BLOG_RSS_FEEDS di .env (URL feed dipisah koma). Hanya feed publik." },
    { platform: "forum", name: "Forum (Reddit public search)", method: "public_api", status: "active", notes: "LIVE tanpa key: Reddit public JSON search. Forum lain menyusul via API resmi/provider." },
  ];
  for (const s of newSources) {
    const exists = await prisma.source.findFirst({ where: { brandId: brand.id, platform: s.platform } });
    if (!exists) await prisma.source.create({ data: { ...s, brandId: brand.id } });
  }

  // --- ConnectorCredential registry (hanya nama env key, BUKAN nilai rahasia) ---
  const creds = [
    { platform: "x", requiredKeys: ["X_BEARER_TOKEN"] },
    { platform: "facebook", requiredKeys: ["FB_PAGE_ID", "FB_ACCESS_TOKEN"] },
    { platform: "instagram", requiredKeys: ["IG_USER_ID", "IG_ACCESS_TOKEN"] },
    { platform: "threads", requiredKeys: ["THREADS_USER_ID", "THREADS_ACCESS_TOKEN"] },
    { platform: "tiktok", requiredKeys: ["TIKTOK_ACCESS_TOKEN"] },
    { platform: "youtube", requiredKeys: ["YOUTUBE_API_KEY"] },
    { platform: "blog", requiredKeys: ["BLOG_RSS_FEEDS"] },
    { platform: "news", requiredKeys: [] },
    { platform: "forum", requiredKeys: [] },
  ];
  for (const c of creds) {
    const isConfigured = c.requiredKeys.length === 0 || c.requiredKeys.every((k) => Boolean(process.env[k]));
    await prisma.connectorCredential.upsert({
      where: { brandId_platform: { brandId: brand.id, platform: c.platform } },
      create: { brandId: brand.id, platform: c.platform, requiredKeys: JSON.stringify(c.requiredKeys), isConfigured },
      update: { requiredKeys: JSON.stringify(c.requiredKeys), isConfigured, lastCheckedAt: new Date() },
    });
  }

  // --- Saved views baru ---
  const newViews = [
    { name: "Daily Buzz Geo", description: "Volume & lokasi percakapan 24 jam terakhir.", query: "range=24h" },
    { name: "Negative Geo Spike", description: "Percakapan negatif berisiko dengan konteks lokasi.", query: "range=24h&sentiment=negative,mixed&minRisk=40&geoConfidence=50" },
    { name: "Viral Slang Watch", description: "Mention ber-slang dengan engagement tinggi.", query: "range=7d&minEngagement=100" },
    { name: "Sociograph Keyword Map", description: "Semua mention relevan 7 hari untuk peta keyword.", query: "range=7d&minRelevance=50" },
    { name: "Account Engagement Monitor", description: "Post/video dari akun sosial (own & competitor).", query: "range=30d&platform=facebook,instagram,x,threads,tiktok,youtube&sourceType=post,video,caption" },
    { name: "YouTube & TikTok Video Watch", description: "Video tentang brand di YouTube & TikTok.", query: "range=30d&platform=youtube,tiktok&sourceType=video" },
    { name: "Blog & Forum Watch", description: "Percakapan blog & forum tentang brand.", query: "range=30d&platform=blog,forum" },
  ];
  for (const v of newViews) {
    const exists = await prisma.savedFilter.findFirst({ where: { brandId: brand.id, name: v.name } });
    if (!exists) await prisma.savedFilter.create({ data: { ...v, brandId: brand.id } });
  }

  // --- Contoh SourceAccount (own + competitor) ---
  const accounts = [
    { platform: "instagram", handle: "@bankjakarta", displayName: "Bank Jakarta (IG)", accountType: "own", url: "https://instagram.com/bankjakarta" },
    { platform: "x", handle: "@bankjakarta", displayName: "Bank Jakarta (X)", accountType: "own", url: "https://x.com/bankjakarta" },
    { platform: "youtube", handle: "@bankjakarta", displayName: "Bank Jakarta (YouTube)", accountType: "own", url: "https://youtube.com/@bankjakarta" },
    { platform: "tiktok", handle: "@bankjakarta", displayName: "Bank Jakarta (TikTok)", accountType: "own", url: "https://tiktok.com/@bankjakarta" },
    { platform: "instagram", handle: "@livinbymandiri", displayName: "Livin (kompetitor)", accountType: "competitor", url: "https://instagram.com/livinbymandiri" },
    { platform: "instagram", handle: "@jago", displayName: "Jago (kompetitor)", accountType: "competitor", url: "https://instagram.com/jago" },
  ];
  for (const a of accounts) {
    await prisma.sourceAccount.upsert({
      where: { brandId_platform_handle: { brandId: brand.id, platform: a.platform, handle: a.handle } },
      create: { ...a, brandId: brand.id },
      update: {},
    });
  }

  console.log("Upgrade sources selesai: source baru, credential registry, saved views, sample accounts.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
