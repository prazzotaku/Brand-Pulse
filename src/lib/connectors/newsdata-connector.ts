import type { RawMention } from "../types";
import { type ConnectorMeta, type FetchParams } from "./types";
import { EnvGatedConnector } from "./social-api-connectors";
import { hashString } from "./rss-utils";

/**
 * NewsData.io connector — LIVE berita online via News API.
 * Aktif ketika NEWSDATA_API_KEY diisi di .env. Paket gratis: field `content`
 * tidak tersedia (pakai `description`), ada batas kredit harian. Hasil difilter
 * agar hanya artikel yang benar-benar menyebut keyword brand yang diambil.
 */
export class NewsDataConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "news",
    label: "Online News (NewsData.io - live)",
    method: "news_api",
    scopeNotes: "Live via NewsData.io. Isi NEWSDATA_API_KEY di .env. Berita publik berbahasa Indonesia; paket gratis punya batas kredit harian.",
    requiredEnvKeys: ["NEWSDATA_API_KEY"],
  };

  protected isConfigured() {
    return Boolean(process.env.NEWSDATA_API_KEY);
  }

  protected async fetchLive(params: FetchParams): Promise<RawMention[]> {
    const key = process.env.NEWSDATA_API_KEY ?? "";
    // Frasa tanda kutip → NewsData mencocokkan nama brand di ISI artikel
    // (server-side), jauh lebih relevan daripada q longgar. Relevansi akhir
    // tetap disaring AI (relevanceScore) di pipeline, jadi tak perlu filter
    // token di sisi klien (yang salah membuang artikel karena free-tier hanya
    // mengembalikan title+description, bukan konten penuh).
    const phrase = `"${params.query}"`;
    const url =
      `https://newsdata.io/api/1/latest?apikey=${key}` +
      `&q=${encodeURIComponent(phrase)}&language=id`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 429) throw new Error("rate limit NewsData.io (429)");
    if (res.status === 401 || res.status === 403) throw new Error(`${res.status} NEWSDATA_API_KEY ditolak`);
    if (!res.ok) throw new Error(`NewsData.io ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as Record<string, unknown>;

    // Dedup (externalId/contentHash) di pipeline yang mencegah duplikat —
    // tidak memfilter publishedAt agar artikel baru-bagi-kita tetap masuk
    // meski terbit sebelum sinkronisasi terakhir.
    const results = (data.results as Array<Record<string, unknown>>) ?? [];
    return results
      .map((a) => this.normalizePayload(a))
      .filter((m): m is RawMention => m !== null)
      .slice(0, params.limit ?? 15);
  }

  normalizePayload(a: Record<string, unknown>): RawMention | null {
    const link = String(a.link ?? "");
    const title = String(a.title ?? "");
    if (!link || !title) return null;
    const description = String(a.description ?? "");
    const content = description && description !== "ONLY AVAILABLE IN PAID PLANS" ? description : title;
    const creators = Array.isArray(a.creator) ? (a.creator as string[]) : [];
    const sourceName = String(a.source_name ?? a.source_id ?? safeHostname(link));
    const pub = a.pubDate ? new Date(String(a.pubDate).replace(" ", "T") + "Z") : new Date();

    return {
      origin: "api",
      sourcePlatform: "news",
      sourceType: "article",
      externalId: `newsdata-${a.article_id ?? hashString(link)}`,
      url: link,
      authorName: sourceName,
      authorHandle: creators[0] ?? safeHostname(link),
      title,
      content,
      publishedAt: pub,
      engagementCount: 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
      language: "id",
      mediaTier: "",
      rawPayload: {
        source: "newsdata.io",
        article_id: a.article_id,
        source_name: a.source_name,
        category: a.category,
        keywords: a.keywords,
      },
    };
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
