import type { RawMention } from "../types";
import { type ConnectorMeta, type FetchParams } from "./types";
import { EnvGatedConnector } from "./social-api-connectors";
import { createHash } from "crypto";

function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

const API_BASE = "https://api.apify.com/v2";

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

/** Instagram via Apify profile/post scraper. */
export class ApifyInstagramConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "instagram",
    label: "Instagram (Apify - live)",
    method: "public_api",
    scopeNotes: "Scrape post + caption dari 1 akun Instagram (via handle di Settings), plus komentar tiap post.",
    requiredEnvKeys: ["APIFY_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.APIFY_TOKEN);
  }

  protected async fetchLive(params: FetchParams): Promise<RawMention[]> {
    const actorId = process.env.APIFY_INSTAGRAM_ACTOR_ID ?? "apify/instagram-scraper";
    const target = params.query.trim();
    if (!target) return [];

    // --- Tahap 1: Ambil post dari profil ---
    const postItems = await apifyRun(actorId, {
      directUrls: [target.startsWith("https://") ? target : `https://www.instagram.com/${target}/`],
      resultsType: "posts",
      resultsLimit: params.limit ?? 15,
    });
    const posts = postItems.map((it) => this.normalizePost(it, actorId)).filter((p): p is RawMention => p !== null);

    // --- Tahap 2: Ambil komentar dari post-post yang didapat ---
    const postUrls = postItems.map((p) => String(p.url)).filter(Boolean);
    if (postUrls.length === 0) return posts;

    let comments: RawMention[] = [];
    try {
      const commentsLimit = Number(process.env.APIFY_INSTAGRAM_COMMENTS_LIMIT) || 10;
      const commentItems = await apifyRun(actorId, {
        directUrls: postUrls,
        resultsType: "comments",
        resultsLimit: commentsLimit,
      });
      comments = commentItems.map((it) => this.normalizeComment(it, actorId)).filter((c): c is RawMention => c !== null);
    } catch (err) {
      console.error("ApifyInstagramConnector: Gagal mengambil komentar, melanjutkan dengan post saja.", err);
    }

    return [...posts, ...comments];
  }

  private normalizePost(raw: Record<string, unknown>, actorId: string): RawMention | null {
    if (!raw.id && !raw.shortCode) return null;
    const id = String(raw.id ?? raw.shortCode);
    const shortCode = String(raw.shortCode ?? raw.id);
    const likes = Number(raw.likesCount ?? 0);
    const comments = Number(raw.commentsCount ?? 0);
    const author = (raw.owner as Record<string, string>) ?? (raw as Record<string, string>) ?? {};

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
      shareCount: 0,
      viewCount: Number(raw.videoViewCount ?? 0),
      language: "id",
      mediaTier: "",
      rawPayload: {
        source: "apify",
        actorId,
        id,
        shortcode: shortCode,
        commentsPreview: (raw.latestComments as any[])?.map((c: any) => ({
          text: c.text,
          owner: c.ownerUsername,
          likes: c.likesCount,
        })),
      },
    };
  }

  private normalizeComment(raw: Record<string, unknown>, actorId: string): RawMention | null {
    const text = String(raw.text ?? "");
    if (!text) return null;

    const postUrl = String(raw.postUrl ?? raw.url ?? "");
    // ID komentar Apify tidak selalu ada/unik, jadi buat fallback hash.
    const id = String(raw.id ?? hashString([postUrl, text, String(raw.ownerUsername ?? "")].join("|")));
    const likes = Number(raw.likesCount ?? 0);
    const author = (raw.owner as Record<string, string>) ?? (raw as Record<string, string>) ?? {};

    return {
      origin: "api",
      sourcePlatform: "instagram",
      sourceType: "comment",
      externalId: `ig-comment-${id}`,
      url: postUrl,
      authorName: author.fullName ?? author.username ?? "",
      authorHandle: author.username ? `@${author.username}` : "",
      title: "",
      content: text,
      publishedAt: raw.timestamp ? new Date(String(raw.timestamp)) : new Date(),
      engagementCount: likes,
      likeCount: likes,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
      language: "id",
      mediaTier: "",
      rawPayload: { source: "apify", actorId, id: raw.id, owner: raw.ownerUsername, text },
    };
  }
}
