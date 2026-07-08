import { createHash } from "crypto";

/** Normalisasi konten untuk deduplication: lowercase, buang URL & tanda baca. */
export function normalizeContent(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Identity hash sebuah mention untuk dedup lintas refresh.
 * Kombinasi: platform + author handle + konten ternormalisasi + tanggal publish.
 * Konten sama yang di-fetch ulang pada hari yang sama = duplikat (bukan mention baru);
 * konten sama yang diposting ulang di hari berbeda = repost (mention terpisah).
 */
export function mentionContentHash(m: {
  sourcePlatform: string;
  authorHandle: string;
  content: string;
  publishedAt: Date;
}): string {
  const day = m.publishedAt.toISOString().slice(0, 10);
  return createHash("sha256")
    .update([m.sourcePlatform, m.authorHandle.toLowerCase(), normalizeContent(m.content), day].join("|"))
    .digest("hex")
    .slice(0, 32);
}
