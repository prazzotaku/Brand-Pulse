import type { RawMention } from "../types";
import { type ConnectorMeta, type FetchParams } from "./types";
import { EnvGatedConnector } from "./social-api-connectors";

/**
 * Connector Apify (https://apify.com) — LIVE, data pihak ketiga.
 * Aktif ketika APIFY_TOKEN diisi di .env. Bayar per panggilan, jadi tiap
 * fetch dibatasi jumlahnya. Dipakai sebagai alternatif provider scraping
 * untuk berbagai platform. Compliance: memakai layanan data berbayar pihak ketiga;
 * status kepatuhan mengikuti ToS Apify (keputusan bisnis pengguna).
 */

const API_BASE = "https://api.apify.com/v2";

/**
 * Panggil Apify Actor secara sinkron dan langsung dapatkan dataset item-nya.
 * @param actorId - ID atau nama Actor (mis. "apify/instagram-hashtag-scraper").
 * @param input - Objek input untuk Actor.
 * @returns Array dari item dataset.
 */
async function apifyRun(actorId: string, input: Record<string, unknown>): Promise<any[]> {
  const token = process.env.APIFY_TOKEN ?? "";
  if (!token) throw new Error("APIFY_TOKEN is not set.");

  const runUrl = `${API_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
  const res = await fetch(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  if (res.status === 429) {
    throw new Error(`rate limit Apify (429): ${(await res.text()).slice(0, 200)}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${res.status} token Apify ditolak`);
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    if (/limit|quota|too many/i.test(body)) throw new Error(`rate limit Apify: ${body}`);
    throw new Error(`Apify error ${res.status}: ${body}`);
  }
  return res.json();
}

function toHashtag(query: string): string {
  return query.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Instagram via Apify hashtag posts. */
export class ApifyInstagramConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "instagram",
    label: "Instagram (Apify - live)",
    method: "public_api",
    scopeNotes: "Live via Apify (berbayar per call). Isi APIFY_TOKEN di .env. Mengambil post publik dari hashtag.",
    requiredEnvKeys: ["APIFY_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.APIFY_TOKEN);
  }

  protected async fetchLive(params: FetchParams): Promise<RawMention[]> {
    // Gunakan placeholder Actor ID; ini perlu disesuaikan dengan Actor yang sebenarnya
    // Anda pilih di Apify Store untuk scraping hashtag Instagram.
    const actorId = process.env.APIFY_INSTAGRAM_ACTOR_ID ?? "apify/instagram-hashtag-scraper";

    const input = {
      hashtags: [toHashtag(params.query)],
      resultsLimit: params.limit ?? 15,
    };

    const items = await apifyRun(actorId, input);

    return items
      .map((it) => this.normalizePayload(it))
      .filter((m): m is RawMention => m !== null);
  }

  normalizePayload(raw: Record<string, unknown>): RawMention | null {
    if (!raw.id && !raw.shortCode) return null;

    const id = String(raw.id ?? raw.shortCode);
    const shortCode = String(raw.shortCode ?? raw.id);
    const likes = Number(raw.likesCount ?? 0);
    const comments = Number(raw.commentsCount ?? 0);
    const author = (raw.owner as Record<string, string>) ?? {};

    return {
      origin: "api",
      sourcePlatform: "instagram",
      sourceType: raw.isVideo ? "video" : "post",
      externalId: `ig-${id}`,
      url: `https://www.instagram.com/p/${shortCode}/`,
      authorName: author.fullName ?? author.username ?? "",
      authorHandle: author.username ? `@${author.username}` : "",
      title: "",
      content: String(raw.caption ?? ""),
      publishedAt: raw.timestamp ? new Date(String(raw.timestamp)) : new Date(),
      engagementCount: likes + comments,
      likeCount: likes,
      commentCount: comments,
      shareCount: 0, // Apify Actor untuk hashtag umumnya tidak menyediakan share count
      viewCount: Number(raw.videoViewCount ?? 0),
      language: "id",
      mediaTier: "",
      rawPayload: { source: "apify", id, shortcode: shortCode },
    };
  }
}
