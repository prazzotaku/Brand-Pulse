// Cleanup script for social mentions ingested during local testing.
// This is intentionally broad: it removes all mention-related data so the next
// local refresh starts from a clean slate with the corrected rules.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Menghapus data turunan mention (GeoMention, SlangMention, MentionAnalysis)...');
  await prisma.geoMention.deleteMany({});
  await prisma.slangMention.deleteMany({});
  await prisma.mentionAnalysis.deleteMany({});

  console.log('Menghapus Mention...');
  const deletedMentions = await prisma.mention.deleteMany({});
  console.log(`Berhasil menghapus ${deletedMentions.count} mention.`);

  console.log('Menghapus SlangTerm yang mungkin dibuat dari test...');
  await prisma.slangTerm.deleteMany({});

  console.log('Menghapus Alert hasil deteksi spike yang mungkin terbentuk dari test...');
  await prisma.alert.deleteMany({});

  console.log('Selesai. Database mention kembali bersih untuk test ulang.');
}

main()
  .catch(async (e) => {
    console.error('Gagal cleanup mention:', e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
