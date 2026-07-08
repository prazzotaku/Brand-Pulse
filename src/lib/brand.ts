import { prisma } from "./prisma";
import { parseJsonArray, type BrandContext } from "./types";

/** Ambil brand aktif (MVP: single brand pertama di workspace). */
export async function getActiveBrand() {
  const brand = await prisma.brand.findFirst({
    include: { keywords: true },
    orderBy: { createdAt: "asc" },
  });
  if (!brand) throw new Error("Belum ada brand. Jalankan `npm run db:seed` terlebih dahulu.");
  return brand;
}

export function toBrandContext(brand: {
  name: string;
  aliases: string;
  competitors: string;
  products: string;
  brandVoice: string;
  prohibitedClaims: string;
  targetAudience: string;
  keywords: { keyword: string; type: string }[];
}): BrandContext {
  return {
    name: brand.name,
    aliases: parseJsonArray(brand.aliases),
    competitors: parseJsonArray(brand.competitors),
    products: parseJsonArray(brand.products),
    brandVoice: brand.brandVoice,
    prohibitedClaims: parseJsonArray(brand.prohibitedClaims),
    targetAudience: brand.targetAudience,
    includeKeywords: brand.keywords.filter((k) => k.type === "include").map((k) => k.keyword),
    excludeKeywords: brand.keywords.filter((k) => k.type === "exclude").map((k) => k.keyword),
    issueKeywords: brand.keywords.filter((k) => k.type === "issue").map((k) => k.keyword),
  };
}
