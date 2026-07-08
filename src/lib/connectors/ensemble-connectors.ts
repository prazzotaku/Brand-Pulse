import type { RawMention } from "../types";
import { type ConnectorMeta, type FetchParams } from "./types";
import { EnvGatedConnector } from "./social-api-connectors";

/**
 * Connector Ensembledata (https://ensembledata.com) — LIVE, data pihak ketiga.
 * Aktif ketika ENSEMBLEDATA_TOKEN diisi di .env. Bayar per panggilan, jadi tiap
 * fetch dibatasi jumlahnya. Dipakai untuk TikTok & Instagram yang sulit diakses
 * via API resmi. Compliance: memakai layanan data berbayar pihak ketiga; status
 * kepatuhan mengikuti ToS Ensembledata (keputusan bisnis pengguna).
 */

const BASE = "https://ensembledata.com/apis";

async function ensembleGet(path: string): Promise<Record<string, unknown>> {
  const token = process.env.ENSEMBLEDATA_TOKEN ?? "";
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}token=${encodeURIComponent(token)}`, { cache: "no-store" });
  // 429 & 495 (Ensembledata: kuota/limit harian) → perlakukan sebagai rate limit.
  if (res.status === 429 || res.status === 495) {
    throw new Error(`rate limit Ensembledata (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  if (res.status === 401 || res.status === 403) throw new Error(`${res.status} token Ensembledata ditolak`);
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    // Body kadang menyebut limit meski status non-standar.
    if (/limit reached|quota|too many/i.test(body)) throw new Error(`rate limit Ensembledata: ${body}`);
    throw new Error(`Ensembledata ${res.status}: ${body}`);
  }
  return res.json();
}

function toHashtag(query: string): string {
  return query.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** TikTok via Ensembledata keyword search. */
export class EnsembleTikTokConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "tiktok",
    label: "TikTok (Ensembledata - live)",
    method: "public_api",
    scopeNotes: "Live via Ensembledata (berbayar per call). Isi ENSEMBLEDATA_TOKEN di .env. Data video publik berdasarkan keyword.",
    requiredEnvKeys: ["ENSEMBLEDATA_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.ENSEMBLEDATA_TOKEN);
  }

  protected async fetchLive(params: FetchParams): Promise<RawMention[]> {
    const data = await ensembleGet(
      `/tt/keyword/search?name=${encodeURIComponent(params.query)}&period=180`
    );
    const items = ((data.data as Record<string, unknown>)?.data as Array<Record<string, unknown>>) ?? [];
    return items
      .slice(0, params.limit ?? 15)
      .map((it) => this.normalizePayload(it))
      .filter((m): m is RawMention => m !== null);
  }

  normalizePayload(raw: Record<string, unknown>): RawMention | null {
    const a = (raw.aweme_info as Record<string, unknown>) ?? raw;
    if (!a.aweme_id) return null;
    const stats = (a.statistics as Record<string, number>) ?? {};
    const author = (a.author as Record<string, string>) ?? {};
    const createTime = Number(a.create_time ?? 0);
    return {
      origin: "api",
      sourcePlatform: "tiktok",
      sourceType: "video",
      externalId: `tt-${a.aweme_id}`,
      url: String(a.share_url ?? `https://www.tiktok.com/@${author.unique_id}/video/${a.aweme_id}`),
      authorName: author.nickname ?? "",
      authorHandle: author.unique_id ? `@${author.unique_id}` : "",
      title: "",
      content: String(a.desc ?? ""),
      publishedAt: createTime ? new Date(createTime * 1000) : new Date(),
      engagementCount: (stats.digg_count ?? 0) + (stats.comment_count ?? 0) + (stats.share_count ?? 0),
      likeCount: stats.digg_count ?? 0,
      commentCount: stats.comment_count ?? 0,
      shareCount: stats.share_count ?? 0,
      viewCount: stats.play_count ?? 0,
      language: "id",
      mediaTier: "",
      rawPayload: { source: "ensembledata", aweme_id: a.aweme_id, statistics: stats },
    };
  }
}

/** Instagram via Ensembledata hashtag posts. */
export class EnsembleInstagramConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "instagram",
    label: "Instagram (Ensembledata - live)",
    method: "public_api",
    scopeNotes: "Live via Ensembledata (berbayar per call). Isi ENSEMBLEDATA_TOKEN di .env. Post publik dari hashtag keyword brand.",
    requiredEnvKeys: ["ENSEMBLEDATA_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.ENSEMBLEDATA_TOKEN);
  }

  protected async fetchLive(params: FetchParams): Promise<RawMention[]> {
    const data = await ensembleGet(`/instagram/hashtag/posts?name=${encodeURIComponent(toHashtag(params.query))}`);
    const d = (data.data as Record<string, unknown>) ?? {};
    const nodes = [
      ...(((d.top_posts as Array<Record<string, unknown>>) ?? [])),
      ...(((d.posts as Array<Record<string, unknown>>) ?? [])),
    ];
    return nodes
      .slice(0, params.limit ?? 15)
      .map((n) => this.normalizePayload(n))
      .filter((m): m is RawMention => m !== null);
  }

  normalizePayload(raw: Record<string, unknown>): RawMention | null {
    const node = (raw.node as Record<string, unknown>) ?? raw;
    if (!node.shortcode && !node.id) return null;
    const caption =
      (((node.edge_media_to_caption as Record<string, unknown>)?.edges as Array<Record<string, unknown>>) ?? [])[0];
    const captionText = String(((caption?.node as Record<string, string>)?.text) ?? "");
    const likes =
      ((node.edge_liked_by as Record<string, number>)?.count) ??
      ((node.edge_media_preview_like as Record<string, number>)?.count) ?? 0;
    const comments = (node.edge_media_to_comment as Record<string, number>)?.count ?? 0;
    const owner = (node.owner as Record<string, string>) ?? {};
    const ts = Number(node.taken_at_timestamp ?? 0);
    const shortcode = String(node.shortcode ?? node.id);
    return {
      origin: "api",
      sourcePlatform: "instagram",
      sourceType: node.is_video ? "video" : "post",
      externalId: `ig-${node.id ?? shortcode}`,
      url: `https://www.instagram.com/p/${shortcode}/`,
      authorName: owner.full_name ?? owner.username ?? "",
      authorHandle: owner.username ? `@${owner.username}` : "",
      title: "",
      content: captionText,
      publishedAt: ts ? new Date(ts * 1000) : new Date(),
      engagementCount: likes + comments,
      likeCount: likes,
      commentCount: comments,
      shareCount: 0,
      viewCount: Number(node.play_count ?? node.video_view_count ?? 0),
      language: "id",
      mediaTier: "",
      rawPayload: { source: "ensembledata", shortcode, typename: node.__typename },
    };
  }
}
