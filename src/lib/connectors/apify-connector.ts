import type { RawMention } from "../types";
import { type ConnectorMeta, type FetchTarget } from "./types";
import { EnvGatedConnector } from "./social-api-connectors";
import { createHash } from "crypto";

function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function normalizeHandleOrUrl(input: string): string {
  return input.trim().replace(/^https?:\/\/(www\.)?[^/]+\//i, "").replace(/^@+/, "").replace(/\/+$/, "");
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

/**
 * Instagram via Apify — mendukung 2 scope:
 *  - "owned_account"  → post + caption dari 1 akun sendiri (via handle di Settings),
 *                       plus komentar tiap post (perilaku asli, tidak berubah).
 *  - "public_hashtag" → pencarian publik berbasis hashtag (bukan owned account),
 *                       hanya post (tanpa komentar).
 */
export class ApifyInstagramConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "instagram",
    label: "Instagram (Apify - live)",
    method: "public_api",
    scopeNotes:
      "Scrape post + caption + komentar dari akun Instagram sendiri (owned account), " +
      "plus pencarian publik berbasis hashtag untuk mention di luar akun sendiri.",
    requiredEnvKeys: ["APIFY_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.APIFY_TOKEN);
  }

  protected async fetchLive(params: FetchTarget): Promise<RawMention[]> {
    if (params.scope === "public_hashtag") return this.fetchPublicHashtag(params);
    return this.fetchOwnedAccount(params);
  }

  /** Scope owned_account: post + komentar dari 1 profil sendiri (perilaku asli). */
  private async fetchOwnedAccount(params: FetchTarget): Promise<RawMention[]> {
    // Format actorId untuk API Apify pakai tilde (~), bukan slash (/):
    // "apify/instagram-scraper" (nama di Store) -> "apify~instagram-scraper" (actorId API).
    const actorId = process.env.APIFY_INSTAGRAM_ACTOR_ID ?? "apify~instagram-scraper";
    const rawTarget = (params.handle ?? params.query).trim();
    const target = rawTarget.startsWith("https://") ? rawTarget : normalizeHandleOrUrl(rawTarget);
    console.log(`[ApifyInstagramConnector] owned_account target="${target}" actorId="${actorId}"`);
    if (!target) return [];

    // --- Tahap 1: Ambil post dari profil ---
    const directUrl = rawTarget.startsWith("https://") ? rawTarget : `https://www.instagram.com/${target}/`;
    console.log(`[ApifyInstagramConnector] Tahap 1: fetching posts dari ${directUrl}`);
    const postItems = await apifyRun(actorId, {
      directUrls: [directUrl],
      resultsType: "posts",
      resultsLimit: params.limit ?? 15,
    });
    console.log(`[ApifyInstagramConnector] Tahap 1: dapat ${postItems.length} item mentah`);
    const posts = postItems.map((it) => this.normalizePost(it, actorId)).filter((p): p is RawMention => p !== null);
    console.log(`[ApifyInstagramConnector] Tahap 1: berhasil normalize ${posts.length} post`);

    // --- Tahap 2: Ambil komentar dari post-post yang didapat ---
    const postUrls = postItems.map((p) => String(p.url)).filter(Boolean);
    if (postUrls.length === 0) return posts;

    let comments: RawMention[] = [];
    try {
      const commentsLimit = Number(process.env.APIFY_INSTAGRAM_COMMENTS_LIMIT) || 10;
      console.log(
        `[ApifyInstagramConnector] Tahap 2: fetching comments untuk ${postUrls.length} post, limit=${commentsLimit}`
      );
      const commentItems = await apifyRun(actorId, {
        directUrls: postUrls,
        resultsType: "comments",
        resultsLimit: commentsLimit,
      });
      console.log(`[ApifyInstagramConnector] Tahap 2: dapat ${commentItems.length} komentar mentah`);
      comments = commentItems.map((it) => this.normalizeComment(it, actorId)).filter((c): c is RawMention => c !== null);
      console.log(`[ApifyInstagramConnector] Tahap 2: berhasil normalize ${comments.length} komentar`);
    } catch (err) {
      console.error("ApifyInstagramConnector: Gagal mengambil komentar, melanjutkan dengan post saja.", err);
    }

    return [...posts, ...comments];
  }

  /**
   * Scope public_hashtag: cari post publik dari akun mana pun berdasarkan hashtag.
   * Input `search` + `searchType: "hashtag"` didukung resmi oleh aktor
   * apify/instagram-scraper (lihat dokumentasi input schema aktor).
   */
  private async fetchPublicHashtag(params: FetchTarget): Promise<RawMention[]> {
    const actorId = process.env.APIFY_INSTAGRAM_ACTOR_ID ?? "apify~instagram-scraper";
    // Hashtag search butuh 1 kata tanpa spasi/simbol — normalisasi dari query bebas,
    // mis. "bank jakarta" -> "bankjakarta".
    const hashtag = params.query.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    console.log(`[ApifyInstagramConnector] public_hashtag hashtag="#${hashtag}" actorId="${actorId}"`);
    if (!hashtag) return [];

    const postItems = await apifyRun(actorId, {
      search: hashtag,
      searchType: "hashtag",
      searchLimit: 1,
      resultsType: "posts",
      resultsLimit: params.limit ?? 15,
    });
    console.log(`[ApifyInstagramConnector] public_hashtag: dapat ${postItems.length} item mentah`);
    return postItems.map((it) => this.normalizePost(it, actorId, "public_hashtag")).filter((p): p is RawMention => p !== null);
  }

  private normalizePost(raw: Record<string, unknown>, actorId: string, discovery: "owned_account" | "public_hashtag" = "owned_account"): RawMention | null {
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
        discovery,
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

/**
 * Facebook via Apify — hanya scope "owned_account": post + TEKS LENGKAP tiap
 * komentar dari 1 Page milik sendiri (untuk analisis sentimen per komentar).
 * Pencarian publik (public_keyword) BELUM didukung di fase ini — lihat catatan
 * di rencana implementasi soal keterbatasan verifikasi aktor pencarian publik FB.
 *
 * CATATAN: actorId default di bawah adalah placeholder aktor Apify Store yang
 * umum dipakai untuk Facebook (posts scraper + comments scraper terpisah).
 * Verifikasi & sesuaikan APIFY_FACEBOOK_ACTOR_ID / APIFY_FACEBOOK_COMMENTS_ACTOR_ID
 * dengan aktor pilihan Anda di Apify Store sebelum dipakai produksi — nama field
 * input/output bisa berbeda antar aktor, sesuaikan normalizePost/normalizeComment
 * bila perlu.
 */
export class ApifyFacebookConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "facebook",
    label: "Facebook (Apify - live)",
    method: "public_api",
    scopeNotes:
      "Scrape post + teks lengkap komentar dari 1 Page Facebook sendiri (owned account, via handle/URL di Settings). " +
      "Pencarian publik belum didukung di fase ini.",
    requiredEnvKeys: ["APIFY_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.APIFY_TOKEN);
  }

  protected async fetchLive(params: FetchTarget): Promise<RawMention[]> {
    if (params.scope !== "owned_account") {
      console.warn(`[ApifyFacebookConnector] scope "${params.scope}" belum didukung, lewati.`);
      return [];
    }

    const postsActorId = process.env.APIFY_FACEBOOK_ACTOR_ID ?? "apify~facebook-posts-scraper";
    const commentsActorId = process.env.APIFY_FACEBOOK_COMMENTS_ACTOR_ID ?? "apify~facebook-comments-scraper";
    const rawTarget = (params.handle ?? params.query).trim();
    const target = rawTarget.startsWith("https://") ? rawTarget : normalizeHandleOrUrl(rawTarget);
    console.log(`[ApifyFacebookConnector] owned_account target="${target}" actorId="${postsActorId}"`);
    if (!target) return [];

    // --- Tahap 1: Ambil post dari Page ---
    const directUrl = rawTarget.startsWith("https://") ? rawTarget : `https://www.facebook.com/${target}`;
    console.log(`[ApifyFacebookConnector] Tahap 1: fetching posts dari ${directUrl}`);
    const postItems = await apifyRun(postsActorId, {
      startUrls: [{ url: directUrl }],
      resultsLimit: params.limit ?? 15,
    });
    console.log(`[ApifyFacebookConnector] Tahap 1: dapat ${postItems.length} item mentah`);
    const posts = postItems.map((it) => this.normalizePost(it, postsActorId)).filter((p): p is RawMention => p !== null);
    console.log(`[ApifyFacebookConnector] Tahap 1: berhasil normalize ${posts.length} post`);

    // --- Tahap 2: Ambil TEKS LENGKAP komentar dari post-post yang didapat ---
    const postUrls = posts.map((p) => p.url).filter(Boolean);
    if (postUrls.length === 0) return posts;

    let comments: RawMention[] = [];
    try {
      const commentsLimit = Number(process.env.APIFY_FACEBOOK_COMMENTS_LIMIT) || 20;
      console.log(
        `[ApifyFacebookConnector] Tahap 2: fetching comments untuk ${postUrls.length} post, limit=${commentsLimit}`
      );
      const commentItems = await apifyRun(commentsActorId, {
        startUrls: postUrls.map((url) => ({ url })),
        resultsLimit: commentsLimit,
      });
      console.log(`[ApifyFacebookConnector] Tahap 2: dapat ${commentItems.length} komentar mentah`);
      comments = commentItems.map((it) => this.normalizeComment(it, commentsActorId)).filter((c): c is RawMention => c !== null);
      console.log(`[ApifyFacebookConnector] Tahap 2: berhasil normalize ${comments.length} komentar`);
    } catch (err) {
      console.error("ApifyFacebookConnector: Gagal mengambil komentar, melanjutkan dengan post saja.", err);
    }

    return [...posts, ...comments];
  }

  private normalizePost(raw: Record<string, unknown>, actorId: string): RawMention | null {
    const id = raw.postId ?? raw.legacyId ?? raw.id;
    if (!id) return null;
    const text = String(raw.text ?? raw.message ?? "");
    const url = String(raw.url ?? raw.topLevelUrl ?? raw.postUrl ?? "");
    const author = (raw.user as Record<string, string>) ?? (raw.pageAdLibrary as Record<string, string>) ?? {};
    const likes = Number(raw.likes ?? raw.reactionCount ?? raw.likesCount ?? 0);
    const comments = Number(raw.comments ?? raw.commentsCount ?? 0);
    const shares = Number(raw.shares ?? raw.sharesCount ?? 0);

    return {
      origin: "api",
      sourcePlatform: "facebook",
      sourceType: "post",
      externalId: `fb-${id}`,
      url,
      authorName: String(author.name ?? "Page (owned)"),
      authorHandle: String(author.id ?? ""),
      title: "",
      content: text,
      publishedAt: raw.time ? new Date(String(raw.time)) : raw.timestamp ? new Date(String(raw.timestamp)) : new Date(),
      engagementCount: likes + comments + shares,
      likeCount: likes,
      commentCount: comments,
      shareCount: shares,
      viewCount: Number(raw.videoViewCount ?? 0),
      language: "id",
      mediaTier: "",
      rawPayload: { source: "apify", actorId, id, ...raw },
    };
  }

  private normalizeComment(raw: Record<string, unknown>, actorId: string): RawMention | null {
    const text = String(raw.text ?? raw.message ?? "");
    if (!text) return null; // butuh teks lengkap — komentar tanpa teks (mis. hanya reaction/sticker) dilewati

    const postUrl = String(raw.facebookUrl ?? raw.postUrl ?? raw.url ?? "");
    const id = String(raw.id ?? hashString([postUrl, text, String(raw.profileName ?? raw.name ?? "")].join("|")));
    const likes = Number(raw.likesCount ?? raw.likes ?? 0);
    const authorName = String(raw.profileName ?? raw.name ?? "");

    return {
      origin: "api",
      sourcePlatform: "facebook",
      sourceType: "comment",
      externalId: `fb-comment-${id}`,
      url: postUrl,
      authorName,
      authorHandle: String(raw.profileId ?? ""),
      title: "",
      content: text,
      publishedAt: raw.date ? new Date(String(raw.date)) : new Date(),
      engagementCount: likes,
      likeCount: likes,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
      language: "id",
      mediaTier: "",
      rawPayload: { source: "apify", actorId, id, authorName, text },
    };
  }
}

/**
 * X (Twitter) via Apify — hanya scope "public_keyword": cari post publik yang
 * mengandung frasa/keyword brand (mis. "bank jakarta"). Komentar/reply tidak
 * diambil di fase ini.
 *
 * CATATAN: actorId default adalah placeholder aktor Apify Store populer untuk
 * pencarian tweet berbasis keyword. Verifikasi/sesuaikan APIFY_X_ACTOR_ID
 * dengan aktor pilihan Anda; nama field output bisa berbeda antar aktor.
 */
export class ApifyXConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "x",
    label: "X (Apify - live)",
    method: "public_api",
    scopeNotes: "Pencarian publik post X/Twitter berdasarkan keyword/frasa brand (mis. \"bank jakarta\"). Tanpa reply/komentar.",
    requiredEnvKeys: ["APIFY_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.APIFY_TOKEN);
  }

  protected async fetchLive(params: FetchTarget): Promise<RawMention[]> {
    if (params.scope !== "public_keyword") {
      console.warn(`[ApifyXConnector] scope "${params.scope}" belum didukung, lewati.`);
      return [];
    }

    const actorId = process.env.APIFY_X_ACTOR_ID ?? "apidojo~tweet-scraper";
    const query = params.query.trim();
    console.log(`[ApifyXConnector] public_keyword query="${query}" actorId="${actorId}"`);
    if (!query) return [];

    const items = await apifyRun(actorId, {
      searchTerms: [query],
      maxItems: params.limit ?? 20,
    });
    console.log(`[ApifyXConnector] dapat ${items.length} item mentah`);
    return items.map((it) => this.normalizePost(it, actorId)).filter((p): p is RawMention => p !== null);
  }

  private normalizePost(raw: Record<string, unknown>, actorId: string): RawMention | null {
    const id = raw.id ?? raw.tweetId ?? raw.conversationId;
    if (!id) return null;
    const author = (raw.author as Record<string, string>) ?? (raw as Record<string, string>) ?? {};
    const handle = String(author.userName ?? author.username ?? raw.authorHandle ?? "");
    const likes = Number(raw.likeCount ?? raw.favoriteCount ?? 0);
    const replies = Number(raw.replyCount ?? 0);
    const retweets = Number(raw.retweetCount ?? 0);
    const quotes = Number(raw.quoteCount ?? 0);

    return {
      origin: "api",
      sourcePlatform: "x",
      sourceType: "post",
      externalId: `x-${id}`,
      url: String(raw.url ?? raw.twitterUrl ?? (handle ? `https://x.com/${handle}/status/${id}` : "")),
      authorName: String(author.name ?? handle),
      authorHandle: handle ? `@${handle}` : "",
      title: "",
      content: String(raw.fullText ?? raw.text ?? ""),
      publishedAt: raw.createdAt ? new Date(String(raw.createdAt)) : new Date(),
      engagementCount: likes + replies + retweets + quotes,
      likeCount: likes,
      commentCount: replies,
      shareCount: retweets + quotes,
      viewCount: Number(raw.viewCount ?? 0),
      language: String(raw.lang ?? "id"),
      mediaTier: "",
      rawPayload: { source: "apify", actorId, id, discovery: "public_keyword" },
    };
  }
}

/**
 * Threads via Apify — hanya scope "public_keyword": cari post publik yang
 * mengandung frasa/keyword brand. Komentar/reply tidak diambil di fase ini.
 *
 * CATATAN: belum ada aktor resmi Apify untuk Threads; actorId default adalah
 * placeholder aktor komunitas populer. Verifikasi/sesuaikan APIFY_THREADS_ACTOR_ID
 * dengan aktor pilihan Anda; nama field input/output bisa berbeda.
 */
export class ApifyThreadsConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "threads",
    label: "Threads (Apify - live)",
    method: "public_api",
    scopeNotes: "Pencarian publik post Threads berdasarkan keyword/frasa brand (mis. \"bank jakarta\"). Tanpa reply/komentar.",
    requiredEnvKeys: ["APIFY_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.APIFY_TOKEN);
  }

  protected async fetchLive(params: FetchTarget): Promise<RawMention[]> {
    if (params.scope !== "public_keyword") {
      console.warn(`[ApifyThreadsConnector] scope "${params.scope}" belum didukung, lewati.`);
      return [];
    }

    const actorId = process.env.APIFY_THREADS_ACTOR_ID ?? "curious_coder~threads-scraper";
    const query = params.query.trim();
    console.log(`[ApifyThreadsConnector] public_keyword query="${query}" actorId="${actorId}"`);
    if (!query) return [];

    const items = await apifyRun(actorId, {
      search: query,
      searchType: "keyword",
      resultsLimit: params.limit ?? 20,
    });
    console.log(`[ApifyThreadsConnector] dapat ${items.length} item mentah`);
    if (items.length > 0) {
      console.log(`[ApifyThreadsConnector] Sampel raw data Threads: ${JSON.stringify(items[0], null, 2).slice(0, 1000)}`);
    } else {
      console.log(`[ApifyThreadsConnector] Tidak ada hasil untuk query ${query}`);
    }
    return items.map((it) => this.normalizePost(it, actorId)).filter((p): p is RawMention => p !== null);
  }

  private normalizePost(raw: Record<string, unknown>, actorId: string): RawMention | null {
    const id = raw.id ?? raw.postId ?? raw.pk;
    if (!id) return null;
    const author = (raw.user as Record<string, string>) ?? (raw.owner as Record<string, string>) ?? (raw as Record<string, string>) ?? {};
    const handle = String(author.username ?? "");

    return {
      origin: "api",
      sourcePlatform: "threads",
      sourceType: "post",
      externalId: `th-${id}`,
      url: String(raw.url ?? raw.permalink ?? (handle ? `https://www.threads.net/@${handle}/post/${id}` : "")),
      authorName: String(author.fullName ?? handle),
      authorHandle: handle ? `@${handle}` : "",
      title: "",
      content: String(raw.text ?? raw.caption ?? ""),
      publishedAt: raw.timestamp ? new Date(String(raw.timestamp)) : raw.takenAt ? new Date(Number(raw.takenAt) * 1000) : new Date(),
      engagementCount: Number(raw.likeCount ?? raw.like_count ?? 0) + Number(raw.replyCount ?? raw.reply_count ?? 0),
      likeCount: Number(raw.likeCount ?? raw.like_count ?? 0),
      commentCount: Number(raw.replyCount ?? raw.reply_count ?? 0),
      shareCount: Number(raw.repostCount ?? raw.repost_count ?? 0),
      viewCount: 0,
      language: "id",
      mediaTier: "",
      rawPayload: { source: "apify", actorId, id, discovery: "public_keyword" },
    };
  }
}

/**
 * TikTok via Apify — hanya scope "public_keyword": cari video publik yang
 * mengandung frasa/keyword brand. Komentar akan ditambahkan di fase berikutnya
 * (belum diimplementasikan) sesuai kesepakatan.
 *
 * CATATAN: actorId default adalah placeholder aktor Apify Store populer
 * (clockworks/tiktok-scraper). Verifikasi/sesuaikan APIFY_TIKTOK_ACTOR_ID
 * dengan aktor pilihan Anda; nama field output bisa berbeda antar aktor.
 */
export class ApifyTikTokConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "tiktok",
    label: "TikTok (Apify - live)",
    method: "public_api",
    scopeNotes:
      "Pencarian publik video TikTok berdasarkan keyword/frasa brand (mis. \"bank jakarta\"). " +
      "Komentar belum didukung — direncanakan fase berikutnya.",
    requiredEnvKeys: ["APIFY_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.APIFY_TOKEN);
  }

  protected async fetchLive(params: FetchTarget): Promise<RawMention[]> {
    if (params.scope !== "public_keyword") {
      console.warn(`[ApifyTikTokConnector] scope "${params.scope}" belum didukung, lewati.`);
      return [];
    }

    const actorId = process.env.APIFY_TIKTOK_ACTOR_ID ?? "clockworks~tiktok-scraper";
    const query = params.query.trim();
    console.log(`[ApifyTikTokConnector] public_keyword query="${query}" actorId="${actorId}"`);
    if (!query) return [];

    const items = await apifyRun(actorId, {
      searchQueries: [query],
      searchSection: "/video",
      resultsPerPage: params.limit ?? 20,
    });
    console.log(`[ApifyTikTokConnector] dapat ${items.length} item mentah`);
    if (items.length > 0) {
      console.log(`[ApifyTikTokConnector] Sampel raw data TikTok: ${JSON.stringify(items[0], null, 2).slice(0, 1000)}`);
    }
    return items.map((it) => this.normalizeVideo(it, actorId)).filter((v): v is RawMention => v !== null);
  }

  private normalizeVideo(raw: Record<string, unknown>, actorId: string): RawMention | null {
    const id = raw.id;
    if (!id) return null;
    const author = (raw.authorMeta as Record<string, string>) ?? {};
    const handle = String(author.name ?? author.nickName ?? "");

    return {
      origin: "api",
      sourcePlatform: "tiktok",
      sourceType: "video",
      externalId: `tt-${id}`,
      url: String(raw.webVideoUrl ?? (handle ? `https://www.tiktok.com/@${handle}/video/${id}` : "")),
      authorName: String(author.nickName ?? handle),
      authorHandle: handle ? `@${handle}` : "",
      title: "",
      content: String(raw.text ?? raw.desc ?? ""),
      publishedAt: raw.createTimeISO
        ? new Date(String(raw.createTimeISO))
        : raw.createTime
          ? new Date(Number(raw.createTime) * 1000)
          : new Date(),
      engagementCount: Number(raw.diggCount ?? 0) + Number(raw.commentCount ?? 0) + Number(raw.shareCount ?? 0),
      likeCount: Number(raw.diggCount ?? 0),
      commentCount: Number(raw.commentCount ?? 0),
      shareCount: Number(raw.shareCount ?? 0),
      viewCount: Number(raw.playCount ?? 0),
      language: "id",
      mediaTier: "",
      rawPayload: { source: "apify", actorId, id, discovery: "public_keyword" },
    };
  }
}
