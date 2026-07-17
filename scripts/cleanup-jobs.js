// Temporary script to clean up job history for a clean test run.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Menghapus semua CrawlRun...");
  const deletedRuns = await prisma.crawlRun.deleteMany({});
  console.log(`Berhasil menghapus ${deletedRuns.count} CrawlRun.`);

  console.log("Menghapus semua RefreshJob...");
  const deletedJobs = await prisma.refreshJob.deleteMany({});
  console.log(`Berhasil menghapus ${deletedJobs.count} RefreshJob.`);

  console.log("\nDatabase job history sudah bersih.");
}

main()
  .catch(async (e) => {
    console.error("Gagal membersihkan database:", e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
