import type { RawMention } from "../types";
import { type ConnectorMeta, type FetchParams } from "./types";
import { EnvGatedConnector } from "./social-api-connectors";

const BASE = "https://ensembledata.com/apis";

async function ensembleGet(path: string): Promise<any> {
  const token = process.env.ENSEMBLEDATA_TOKEN ?? "";
  if (!token) throw new Error("ENSEMBLEDATA_TOKEN is not set.");
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}token=${encodeURIComponent(token)}`, { cache: "no-store" });
  if (res.status === 429 || res.status === 495) {
    throw new Error(`rate limit Ensembledata (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  if (res.status === 401 || res.status === 403) throw new Error(`${res.status} token Ensembledata ditolak`);
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    if (/limit reached|quota|too many/i.test(body)) throw new Error(`rate limit Ensembledata: ${body}`);
    throw new Error(`Ensembledata ${res.status}: ${body}`);
  }
  return res.json();
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
    const data = await ensembleGet(`/tt/keyword/search?name=${encodeURIComponent(params.query)}&period=180`);
    const items = ((data.data as Record<string, unknown>)?.data as Array<Record<string, unknown>>) ?? [];
    return items
      .slice(0, params.limit ?? 15)
      .map((it) => this.normalizePayload(it))
      .filter((m): m is RawMention => m !== null);
  }

  normalizePayload(raw: any): RawMention | null {
    const a = raw.aweme_info ?? raw;
    if (!a.aweme_id) return null;
    const stats = a.statistics ?? {};
    const author = a.author ?? {};
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
      rawPayload: { source: "ensembledata-tiktok", ...raw },
    };
  }
}

/**
 * Helper to get an Instagram numeric user_id from a username.
 * Caches the result to avoid repeated lookups.
 */
const igUsernameToIdCache = new Map<string, string>();
async function getInstagramUserId(username: string): Promise<string | null> {
  if (igUsernameToIdCache.has(username)) {
    return igUsernameToIdCache.get(username)!;
  }
  try {
    const data = await ensembleGet(`/instagram/user/info?username=${encodeURIComponent(username)}`);
    const userId = data?.data?.pk;
    if (userId) {
      igUsernameToIdCache.set(username, userId);
      return userId;
    }
  } catch (e) {
    console.error(`[Ensemble/getInstagramUserId] Failed for ${username}:`, e);
  }
  return null;
}

/** Instagram via Ensembledata */
export class EnsembleInstagramConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "instagram",
    label: "Instagram (Ensembledata - live)",
    method: "public_api",
    scopeNotes: "Live via Ensembledata (berbayar per call).",
    requiredEnvKeys: ["ENSEMBLEDATA_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.ENSEMBLEDATA_TOKEN);
  }

  protected async fetchLive(params: FetchParams): Promise<RawMention[]> {
    if (params.scope === "public_hashtag" || params.scope === "public_keyword") {
        const data = await ensembleGet(`/instagram/search?text=${encodeURIComponent(params.query)}`);
        const users = data?.data?.users ?? [];
        return users.map((u: any) => this.normalizeUserSearch(u)).filter(Boolean);
    }

    // owned_account flow
    const userId = await getInstagramUserId(params.query);
    if (!userId) return [];

    const postData = await ensembleGet(`/instagram/user/posts?user_id=${userId}&depth=1&chunk_size=${params.limit ?? 20}`);
    const posts = (postData?.data?.posts ?? []).map((p: any) => this.normalizePost(p)).filter(Boolean) as RawMention[];

    // Fetch comments for each post
    for (const post of posts) {
      if (post.externalId) {
        const mediaId = post.externalId.replace('ig-', '');
        try {
            const commentsData = await ensembleGet(`/instagram/post/comments?media_id=${mediaId}&cursor=&sorting=RECENT`);
            const comments = (commentsData?.data?.comments ?? []).map((c: any) => this.normalizeComment(c, post.url)).filter(Boolean);
            posts.push(...comments);
        } catch(e) {
            console.error(`[EnsembleInstagramConnector] Failed to fetch comments for media ${mediaId}`, e);
        }
      }
    }
    return posts;
  }

  normalizeUserSearch(raw: any): RawMention | null {
    const user = raw?.user;
    if (!user?.pk) return null;
    return {
        origin: "api",
        sourcePlatform: "instagram",
        sourceType: "post", // Representing a user profile as a post-like object
        externalId: `ig-user-${user.pk}`,
        url: `https://www.instagram.com/${user.username}/`,
        authorName: user.full_name || user.username,
        authorHandle: `@${user.username}`,
        title: `User: ${user.full_name}`,
        content: user.biography || '',
        publishedAt: new Date(),
        engagementCount: user.follower_count ?? 0,
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        viewCount: user.follower_count ?? 0,
        language: "id",
        mediaTier: "",
        rawPayload: { source: "ensembledata-user-search", ...raw },
    }
  }

  normalizePost(raw: any): RawMention | null {
    const node = raw.node;
    if (!node || !node.id) return null;
    const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text ?? "";
    return {
      origin: "api",
      sourcePlatform: "instagram",
      sourceType: node.is_video ? "video" : "post",
      externalId: `ig-${node.id}`,
      url: `https://www.instagram.com/p/${node.shortcode}/`,
      authorName: node.owner?.full_name || node.owner?.username || "",
      authorHandle: node.owner?.username ? `@${node.owner.username}` : "",
      title: "",
      content: caption,
      publishedAt: new Date(node.taken_at_timestamp * 1000),
      engagementCount: (node.edge_media_preview_like?.count ?? 0) + (node.edge_media_to_comment?.count ?? 0),
      likeCount: node.edge_media_preview_like?.count ?? 0,
      commentCount: node.edge_media_to_comment?.count ?? 0,
      shareCount: 0,
      viewCount: node.video_view_count ?? 0,
      language: "id",
      mediaTier: "",
      rawPayload: { source: "ensembledata-post", ...raw },
    };
  }

  normalizeComment(raw: any, postUrl: string): RawMention | null {
      const node = raw.node;
      if (!node || !node.text) return null;
      return {
        origin: "api",
        sourcePlatform: "instagram",
        sourceType: "comment",
        externalId: `ig-comment-${node.pk}`,
        url: postUrl,
        authorName: node.user?.username || "",
        authorHandle: node.user?.username ? `@${node.user.username}` : "",
        title: "",
        content: node.text,
        publishedAt: new Date(node.created_at * 1000),
        engagementCount: node.comment_like_count ?? 0,
        likeCount: node.comment_like_count ?? 0,
        commentCount: 0,
        shareCount: 0,
        viewCount: 0,
        language: "id",
        mediaTier: "",
        rawPayload: { source: "ensembledata-comment", ...raw },
      };
  }
}

/** Helper to get a Twitter numeric user_id from a username. */
const twitterUsernameToIdCache = new Map<string, string>();
async function getTwitterUserId(username: string): Promise<string | null> {
    if (twitterUsernameToIdCache.has(username)) {
        return twitterUsernameToIdCache.get(username)!;
    }
    try {
        const data = await ensembleGet(`/twitter/user/info?name=${encodeURIComponent(username)}`);
        const userId = data?.data?.rest_id;
        if (userId) {
            twitterUsernameToIdCache.set(username, userId);
            return userId;
        }
    } catch (e) {
        console.error(`[Ensemble/getTwitterUserId] Failed for ${username}:`, e);
    }
    return null;
}

/** X (Twitter) via Ensembledata. */
export class EnsembleXConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = { platform: "x", label: "X (EnsembleData - live)", method: "public_api", scopeNotes: "Live via Ensembledata.", requiredEnvKeys: ["ENSEMBLEDATA_TOKEN"] };
  protected isConfigured() { return Boolean(process.env.ENSEMBLEDATA_TOKEN); }

  protected async fetchLive(params: FetchParams): Promise<RawMention[]> {
    const userId = await getTwitterUserId(params.query);
    if (!userId) return [];
    const data = await ensembleGet(`/twitter/user/tweets?id=${userId}`);
    const items = data?.data ?? [];
    return items.map((item: any) => this.normalizePayload(item)).filter(Boolean);
  }

  normalizePayload(raw: any): RawMention | null {
    const result = raw?.content?.itemContent?.tweet_results?.result;
    if (!result?.rest_id) return null;
    const legacy = result.legacy ?? {};
    const user = result.core?.user_results?.result?.legacy ?? {};
    const handle = user.screen_name ?? "";
    return {
      origin: "api",
      sourcePlatform: "x",
      sourceType: "post",
      externalId: `x-${result.rest_id}`,
      url: `https://x.com/${handle}/status/${result.rest_id}`,
      authorName: user.name ?? handle,
      authorHandle: handle ? `@${handle}` : "",
      title: "",
      content: legacy.full_text ?? "",
      publishedAt: new Date(legacy.created_at),
      engagementCount: (legacy.favorite_count ?? 0) + (legacy.reply_count ?? 0) + (legacy.retweet_count ?? 0) + (legacy.quote_count ?? 0),
      likeCount: legacy.favorite_count ?? 0,
      commentCount: legacy.reply_count ?? 0,
      shareCount: (legacy.retweet_count ?? 0) + (legacy.quote_count ?? 0),
      viewCount: result.views?.count ?? 0,
      language: legacy.lang ?? "id",
      mediaTier: "",
      rawPayload: { source: "ensembledata-x", ...raw },
    };
  }
}

/** Threads via Ensembledata. */
export class EnsembleThreadsConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = { platform: "threads", label: "Threads (EnsembleData - live)", method: "public_api", scopeNotes: "Live via Ensembledata.", requiredEnvKeys: ["ENSEMBLEDATA_TOKEN"] };
  protected isConfigured() { return Boolean(process.env.ENSEMBLEDATA_TOKEN); }

  protected async fetchLive(params: FetchParams): Promise<RawMention[]> {
    const data = await ensembleGet(`/threads/keyword/search?name=${encodeURIComponent(params.query)}&sorting=1`);
    const items = data?.data ?? [];
    return items.map((item: any) => this.normalizePayload(item.node)).filter(Boolean);
  }

  normalizePayload(raw: any): RawMention | null {
    const post = raw?.thread?.thread_items?.[0]?.post;
    if (!post?.pk) return null;
    const user = post.user ?? {};
    return {
      origin: "api",
      sourcePlatform: "threads",
      sourceType: "post",
      externalId: `th-${post.pk}`,
      url: `https://www.threads.net/t/${post.code}`,
      authorName: user.username ?? "",
      authorHandle: user.username ? `@${user.username}` : "",
      title: "",
      content: post.caption?.text ?? "",
      publishedAt: new Date(post.taken_at * 1000),
      engagementCount: (post.like_count ?? 0) + (post.text_post_app_info?.direct_reply_count ?? 0),
      likeCount: post.like_count ?? 0,
      commentCount: post.text_post_app_info?.direct_reply_count ?? 0,
      shareCount: post.text_post_app_info?.repost_count ?? 0,
      viewCount: 0,
      language: "id",
      mediaTier: "",
      rawPayload: { source: "ensembledata-threads", ...raw },
    };
  }
}

/** YouTube via Ensembledata. */
export class EnsembleYouTubeConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = { platform: "youtube", label: "YouTube (EnsembleData - live)", method: "public_api", scopeNotes: "Live via Ensembledata.", requiredEnvKeys: ["ENSEMBLEDATA_TOKEN"] };
  protected isConfigured() { return Boolean(process.env.ENSEMBLEDATA_TOKEN); }

  protected async fetchLive(params: FetchParams): Promise<RawMention[]> {
    const data = await ensembleGet(`/youtube/search?keyword=${encodeURIComponent(params.query)}&depth=1&get_additional_info=true`);
    const items = data?.data?.posts ?? [];
    return items.map((item: any) => this.normalizePayload(item)).filter(Boolean);
  }

  normalizePayload(raw: any): RawMention | null {
    const video = raw.videoRenderer;
    if (!video?.videoId) return null;
    return {
      origin: "api",
      sourcePlatform: "youtube",
      sourceType: "video",
      externalId: `yt-${video.videoId}`,
      url: `https://www.youtube.com/watch?v=${video.videoId}`,
      authorName: video.longBylineText?.runs?.[0]?.text ?? "",
      authorHandle: video.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId ?? "",
      title: video.title?.runs?.[0]?.text ?? "",
      content: video.descriptionSnippet?.runs?.[0]?.text ?? "",
      publishedAt: new Date(), // `publishedTimeText` is relative, so we can't easily parse it
      engagementCount: (video.viewCount ?? 0), // Not all info is available without extra call
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: parseInt(video.viewCountText?.simpleText?.replace(/,/g, '').split(' ')[0] || "0"),
      language: "id",
      mediaTier: "",
      rawPayload: { source: "ensembledata-youtube", ...raw },
    };
  }
}
