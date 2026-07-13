import type { RawMention } from "../types";
import {
  BaseConnector,
  type ConnectorMeta,
  type ConnectorStatusInfo,
  type FetchTarget,
} from "./types";

/**
 * Connector API RESMI untuk social media — LIVE, tanpa mock.
 *
 * Setiap connector aktif otomatis ketika kredensialnya diisi di .env;
 * tanpa kredensial, statusnya "pending" dan fetch mengembalikan kosong
 * (tidak pernah membuat data palsu). Semua request memakai endpoint resmi
 * platform — tanpa bypass login/captcha, tanpa scraping.
 *
 * Kredensial yang dibutuhkan (lihat .env.example):
 *  - X_BEARER_TOKEN                     → X API v2 recent search
 *  - FB_PAGE_ID + FB_ACCESS_TOKEN       → Meta Graph API (posts page milik sendiri)
 *  - IG_USER_ID + IG_ACCESS_TOKEN       → Instagram Graph API (media akun profesional)
 *  - THREADS_USER_ID + THREADS_ACCESS_TOKEN → Threads API (post akun terhubung)
 *  - TIKTOK_ACCESS_TOKEN                → TikTok Research API (butuh approval riset)
 */

async function getJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  return res.json();
}

export abstract class EnvGatedConnector extends BaseConnector {
  protected abstract isConfigured(): boolean;
  protected abstract fetchLive(params: FetchTarget): Promise<RawMention[]>;

  async getConnectorStatus(): Promise<ConnectorStatusInfo> {
    return this.isConfigured()
      ? { status: "active" }
      : { status: "pending_auth", detail: `Butuh env: ${(this.meta.requiredEnvKeys ?? []).join(", ")}` };
  }

  async fetchMentions(params: FetchTarget): Promise<RawMention[]> {
    if (!this.isConfigured()) return []; // belum ada API key → tidak ada data (bukan mock)
    return this.fetchLive(params);
  }
}

/** X (Twitter) — API v2 recent search berbasis keyword brand. */
export class XApiConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "x",
    label: "X (API v2 Recent Search - live)",
    method: "official_api",
    scopeNotes: "Live via X API v2. Isi X_BEARER_TOKEN di .env untuk mengaktifkan. Scope: public posts 7 hari terakhir sesuai tier akses.",
    requiredEnvKeys: ["X_BEARER_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.X_BEARER_TOKEN);
  }

  protected async fetchLive(params: FetchTarget): Promise<RawMention[]> {
    const query = encodeURIComponent(`"${params.query}" -is:retweet`);
    const max = Math.min(Math.max(params.limit ?? 10, 10), 100);
    const url =
      `https://api.x.com/2/tweets/search/recent?query=${query}&max_results=${max}` +
      `&tweet.fields=created_at,public_metrics,lang&expansions=author_id&user.fields=username,name`;
    const data = await getJson(url, {
      headers: { authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
    });

    const users = new Map<string, { username: string; name: string }>();
    for (const u of ((data.includes as Record<string, unknown>)?.users as Array<Record<string, string>>) ?? []) {
      users.set(u.id, { username: u.username, name: u.name });
    }

    return (((data.data as Array<Record<string, unknown>>) ?? []).map((t) => {
      const user = users.get(String(t.author_id)) ?? { username: "unknown", name: "Unknown" };
      const m = (t.public_metrics as Record<string, number>) ?? {};
      return {
        origin: "api",
        sourcePlatform: "x",
        sourceType: "post",
        externalId: `x-${t.id}`,
        url: `https://x.com/${user.username}/status/${t.id}`,
        authorName: user.name,
        authorHandle: `@${user.username}`,
        title: "",
        content: String(t.text ?? ""),
        publishedAt: t.created_at ? new Date(String(t.created_at)) : new Date(),
        engagementCount: (m.like_count ?? 0) + (m.reply_count ?? 0) + (m.retweet_count ?? 0) + (m.quote_count ?? 0),
        likeCount: m.like_count ?? 0,
        commentCount: m.reply_count ?? 0,
        shareCount: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
        viewCount: m.impression_count ?? 0,
        language: String(t.lang ?? "id"),
        mediaTier: "",
        rawPayload: t as Record<string, unknown>,
      } satisfies RawMention;
    }));
  }
}

/** Facebook — Meta Graph API: posts dari page milik sendiri (owned asset). */
export class FacebookGraphConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "facebook",
    label: "Facebook Pages (Meta Graph API - live)",
    method: "official_api",
    scopeNotes: "Live via Meta Graph API. Isi FB_PAGE_ID + FB_ACCESS_TOKEN di .env. Scope: posts + engagement page milik sendiri.",
    requiredEnvKeys: ["FB_PAGE_ID", "FB_ACCESS_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.FB_PAGE_ID && process.env.FB_ACCESS_TOKEN);
  }

  protected async fetchLive(params: FetchTarget): Promise<RawMention[]> {
    const url =
      `https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/posts` +
      `?fields=message,created_time,permalink_url,shares,reactions.summary(true),comments.summary(true)` +
      `&limit=${params.limit ?? 10}&access_token=${process.env.FB_ACCESS_TOKEN}`;
    const data = await getJson(url);

    return (((data.data as Array<Record<string, unknown>>) ?? [])
      .filter((p) => p.message)
      .map((p) => {
        const reactions = ((p.reactions as Record<string, unknown>)?.summary as Record<string, number>)?.total_count ?? 0;
        const comments = ((p.comments as Record<string, unknown>)?.summary as Record<string, number>)?.total_count ?? 0;
        const shares = ((p.shares as Record<string, number>)?.count) ?? 0;
        return {
          origin: "api",
          sourcePlatform: "facebook",
          sourceType: "post",
          externalId: `fb-${p.id}`,
          url: String(p.permalink_url ?? ""),
          authorName: "Page (owned)",
          authorHandle: String(process.env.FB_PAGE_ID),
          title: "",
          content: String(p.message),
          publishedAt: p.created_time ? new Date(String(p.created_time)) : new Date(),
          engagementCount: reactions + comments + shares,
          likeCount: reactions,
          commentCount: comments,
          shareCount: shares,
          viewCount: 0,
          language: "id",
          mediaTier: "",
          rawPayload: p as Record<string, unknown>,
        } satisfies RawMention;
      }));
  }
}

/** Instagram — Graph API: media + engagement akun profesional milik sendiri. */
export class InstagramGraphConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "instagram",
    label: "Instagram (Graph API - live)",
    method: "official_api",
    scopeNotes: "Live via Instagram Graph API. Isi IG_USER_ID + IG_ACCESS_TOKEN di .env. Scope: media & komentar akun profesional sendiri.",
    requiredEnvKeys: ["IG_USER_ID", "IG_ACCESS_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN);
  }

  protected async fetchLive(params: FetchTarget): Promise<RawMention[]> {
    const url =
      `https://graph.facebook.com/v19.0/${process.env.IG_USER_ID}/media` +
      `?fields=caption,timestamp,permalink,like_count,comments_count,username` +
      `&limit=${params.limit ?? 10}&access_token=${process.env.IG_ACCESS_TOKEN}`;
    const data = await getJson(url);

    return (((data.data as Array<Record<string, unknown>>) ?? [])
      .filter((m) => m.caption)
      .map((m) => ({
        origin: "api",
        sourcePlatform: "instagram",
        sourceType: "caption",
        externalId: `ig-${m.id}`,
        url: String(m.permalink ?? ""),
        authorName: String(m.username ?? "Akun brand"),
        authorHandle: `@${m.username ?? ""}`,
        title: "",
        content: String(m.caption),
        publishedAt: m.timestamp ? new Date(String(m.timestamp)) : new Date(),
        engagementCount: Number(m.like_count ?? 0) + Number(m.comments_count ?? 0),
        likeCount: Number(m.like_count ?? 0),
        commentCount: Number(m.comments_count ?? 0),
        shareCount: 0,
        viewCount: 0,
        language: "id",
        mediaTier: "",
        rawPayload: m as Record<string, unknown>,
      }) satisfies RawMention));
  }
}

/** Threads — Threads API: post akun yang terhubung. */
export class ThreadsApiConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "threads",
    label: "Threads (Threads API - live)",
    method: "official_api",
    scopeNotes: "Live via Threads API. Isi THREADS_USER_ID + THREADS_ACCESS_TOKEN di .env. Scope: post akun terhubung sesuai izin API.",
    requiredEnvKeys: ["THREADS_USER_ID", "THREADS_ACCESS_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.THREADS_USER_ID && process.env.THREADS_ACCESS_TOKEN);
  }

  protected async fetchLive(params: FetchTarget): Promise<RawMention[]> {
    const url =
      `https://graph.threads.net/v1.0/${process.env.THREADS_USER_ID}/threads` +
      `?fields=id,text,timestamp,permalink,username` +
      `&limit=${params.limit ?? 10}&access_token=${process.env.THREADS_ACCESS_TOKEN}`;
    const data = await getJson(url);

    return (((data.data as Array<Record<string, unknown>>) ?? [])
      .filter((t) => t.text)
      .map((t) => ({
        origin: "api",
        sourcePlatform: "threads",
        sourceType: "post",
        externalId: `th-${t.id}`,
        url: String(t.permalink ?? ""),
        authorName: String(t.username ?? "Akun brand"),
        authorHandle: `@${t.username ?? ""}`,
        title: "",
        content: String(t.text),
        publishedAt: t.timestamp ? new Date(String(t.timestamp)) : new Date(),
        engagementCount: 0,
        likeCount: 0,
        commentCount: 0,
        shareCount: 0,
        viewCount: 0,
        language: "id",
        mediaTier: "",
        rawPayload: t as Record<string, unknown>,
      }) satisfies RawMention));
  }
}

/** TikTok — Research API (butuh approval program riset TikTok). */
export class TikTokResearchConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "tiktok",
    label: "TikTok (Research API - live)",
    method: "official_api",
    scopeNotes: "Live via TikTok Research API. Isi TIKTOK_ACCESS_TOKEN di .env (butuh approval riset TikTok). Fallback: import CSV.",
    requiredEnvKeys: ["TIKTOK_ACCESS_TOKEN"],
  };

  protected isConfigured() {
    return Boolean(process.env.TIKTOK_ACCESS_TOKEN);
  }

  protected async fetchLive(params: FetchTarget): Promise<RawMention[]> {
    const data = await getJson(
      "https://open.tiktokapis.com/v2/research/video/query/?fields=id,video_description,create_time,like_count,comment_count,share_count,view_count,username",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query: { and: [{ operation: "IN", field_name: "keyword", field_values: [params.query] }] },
          max_count: Math.min(params.limit ?? 10, 100),
        }),
      }
    );

    const videos = ((data.data as Record<string, unknown>)?.videos as Array<Record<string, unknown>>) ?? [];
    return videos.map((v) => ({
      origin: "api",
      sourcePlatform: "tiktok",
      sourceType: "video",
      externalId: `tt-${v.id}`,
      url: `https://www.tiktok.com/@${v.username}/video/${v.id}`,
      authorName: String(v.username ?? ""),
      authorHandle: `@${v.username ?? ""}`,
      title: "",
      content: String(v.video_description ?? ""),
      publishedAt: v.create_time ? new Date(Number(v.create_time) * 1000) : new Date(),
      engagementCount: Number(v.like_count ?? 0) + Number(v.comment_count ?? 0) + Number(v.share_count ?? 0),
      likeCount: Number(v.like_count ?? 0),
      commentCount: Number(v.comment_count ?? 0),
      shareCount: Number(v.share_count ?? 0),
      viewCount: Number(v.view_count ?? 0),
      language: "id",
      mediaTier: "",
      rawPayload: v as Record<string, unknown>,
    }) satisfies RawMention);
  }
}
