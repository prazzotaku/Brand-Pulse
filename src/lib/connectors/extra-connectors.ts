import type { RawMention } from "../types";
import {
  BaseConnector,
  type AccountConfig,
  type ConnectorMeta,
  type EngagementSnapshot,
  type FetchParams,
} from "./types";
import { EnvGatedConnector } from "./social-api-connectors";
import { decodeXml, extractTag, hashString, splitRssItems, stripHtml } from "./rss-utils";

async function getJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  return res.json();
}

/**
 * YouTube — Data API v3 (live dengan YOUTUBE_API_KEY, kuota gratis tersedia).
 * fetchMentions: search video berdasarkan keyword brand + statistik.
 * fetchEngagement: statistik channel (subscribers, views, video count).
 */
export class YouTubeConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "youtube",
    label: "YouTube (Data API v3 - live)",
    method: "official_api",
    scopeNotes: "Live via YouTube Data API v3. Isi YOUTUBE_API_KEY di .env (gratis dari Google Cloud Console).",
    requiredEnvKeys: ["YOUTUBE_API_KEY"],
  };

  protected isConfigured() {
    return Boolean(process.env.YOUTUBE_API_KEY);
  }

  protected async fetchLive(params: FetchParams): Promise<RawMention[]> {
    const key = process.env.YOUTUBE_API_KEY;
    const search = await getJson(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=${Math.min(params.limit ?? 10, 25)}&q=${encodeURIComponent(params.query)}&key=${key}`
    );
    const items = (search.items as Array<Record<string, unknown>>) ?? [];
    const ids = items
      .map((i) => ((i.id as Record<string, string>)?.videoId ?? ""))
      .filter(Boolean);
    if (ids.length === 0) return [];

    const stats = await getJson(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.join(",")}&key=${key}`
    );
    const statsMap = new Map<string, Record<string, string>>();
    for (const v of (stats.items as Array<Record<string, unknown>>) ?? []) {
      statsMap.set(String(v.id), (v.statistics as Record<string, string>) ?? {});
    }

    return items
      .map((i): RawMention | null => {
        const videoId = (i.id as Record<string, string>)?.videoId;
        const sn = (i.snippet as Record<string, string>) ?? {};
        if (!videoId || !sn.title) return null;
        const st = statsMap.get(videoId) ?? {};
        const likes = Number(st.likeCount ?? 0);
        const comments = Number(st.commentCount ?? 0);
        const publishedAt = sn.publishedAt ? new Date(sn.publishedAt) : new Date();
        return {
          origin: "api",
          sourcePlatform: "youtube",
          sourceType: "video",
          externalId: `yt-${videoId}`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          authorName: sn.channelTitle ?? "",
          authorHandle: sn.channelId ?? "",
          title: decodeXml(sn.title),
          content: decodeXml(sn.description || sn.title),
          publishedAt,
          engagementCount: likes + comments,
          likeCount: likes,
          commentCount: comments,
          shareCount: 0,
          viewCount: Number(st.viewCount ?? 0),
          language: "id",
          mediaTier: "",
          rawPayload: { snippet: sn, statistics: st },
        } satisfies RawMention;
      })
      .filter((m): m is RawMention => m !== null);
  }

  async fetchEngagement(account: AccountConfig): Promise<EngagementSnapshot | null> {
    if (!this.isConfigured()) return null;
    const key = process.env.YOUTUBE_API_KEY;
    const handle = account.handle.startsWith("@") ? account.handle : `@${account.handle}`;
    const data = await getJson(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&forHandle=${encodeURIComponent(handle)}&key=${key}`
    );
    const ch = ((data.items as Array<Record<string, unknown>>) ?? [])[0];
    if (!ch) return null;
    const st = (ch.statistics as Record<string, string>) ?? {};
    return {
      subscriberCount: Number(st.subscriberCount ?? 0),
      totalViews: Number(st.viewCount ?? 0),
      postCount: Number(st.videoCount ?? 0),
      rawMetrics: st,
    };
  }
}

/**
 * Blog — RSS feed publik yang dikonfigurasi user (BLOG_RSS_FEEDS, dipisah koma).
 * Live: membaca feed asli; hanya item yang menyebut keyword brand yang diambil.
 */
export class BlogRssConnector extends EnvGatedConnector {
  readonly meta: ConnectorMeta = {
    platform: "blog",
    label: "Blog (RSS feeds - live)",
    method: "rss",
    scopeNotes: "Live: daftar RSS blog publik di env BLOG_RSS_FEEDS (pisahkan koma). Hanya feed publik; patuh robots.txt.",
    requiredEnvKeys: ["BLOG_RSS_FEEDS"],
  };

  protected isConfigured() {
    return Boolean(process.env.BLOG_RSS_FEEDS);
  }

  protected async fetchLive(params: FetchParams): Promise<RawMention[]> {
    const feeds = (process.env.BLOG_RSS_FEEDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const query = params.query.toLowerCase();
    const mentions: RawMention[] = [];

    for (const feedUrl of feeds.slice(0, 5)) {
      try {
        const res = await fetch(feedUrl, {
          cache: "no-store",
          headers: { "user-agent": "BrandPulseOS/0.1 (RSS reader)" },
        });
        if (!res.ok) continue;
        const xml = await res.text();
        const feedHost = safeHostname(feedUrl);
        for (const item of splitRssItems(xml).slice(0, params.limit ?? 10)) {
          const title = decodeXml(extractTag(item, "title"));
          const link = decodeXml(extractTag(item, "link"));
          const description = stripHtml(decodeXml(extractTag(item, "description")));
          if (!title || !link) continue;
          if (!`${title} ${description}`.toLowerCase().includes(query)) continue;
          const pubDate = extractTag(item, "pubDate");
          const publishedAt = pubDate ? new Date(pubDate) : new Date();
          mentions.push({
            origin: "rss",
            sourcePlatform: "blog",
            sourceType: "article",
            externalId: `blog-${hashString(link)}`,
            url: link,
            authorName: decodeXml(extractTag(item, "author")) || feedHost,
            authorHandle: feedHost,
            title,
            content: description || title,
            publishedAt,
            engagementCount: 0,
            likeCount: 0,
            commentCount: 0,
            shareCount: 0,
            viewCount: 0,
            language: "id",
            mediaTier: "blog",
            rawPayload: { feedUrl, pubDate },
          });
        }
      } catch {
        // feed rusak → lewati feed ini, jangan gagalkan connector
      }
    }
    return mentions;
  }
}

/**
 * Forum — Reddit public JSON search (live tanpa API key; endpoint publik resmi).
 * Cocok sebagai forum connector pertama; forum lain (Kaskus dsb.) menyusul
 * lewat API/provider resmi dengan interface yang sama.
 */
export class ForumRedditConnector extends BaseConnector {
  readonly meta: ConnectorMeta = {
    platform: "forum",
    label: "Forum (Reddit public search - live)",
    method: "public_api",
    scopeNotes: "Live: Reddit public JSON search (tanpa key, rate limit ketat). Hanya post publik; hormati rate limit.",
  };

  async fetchMentions(params: FetchParams): Promise<RawMention[]> {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(params.query)}&sort=new&limit=${Math.min(params.limit ?? 10, 25)}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": "BrandPulseOS/0.1 (brand monitoring)" },
    });
    if (!res.ok) throw new Error(`Reddit search ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    const children = ((data.data as Record<string, unknown>)?.children as Array<Record<string, unknown>>) ?? [];

    return children
      .map((c) => this.normalizePayload(c))
      .filter((m): m is RawMention => m !== null);
  }

  normalizePayload(rawPayload: Record<string, unknown>): RawMention | null {
    const d = (rawPayload.data as Record<string, unknown>) ?? rawPayload;
    if (!d.id || (!d.title && !d.selftext)) return null;
    const publishedAt = d.created_utc ? new Date(Number(d.created_utc) * 1000) : new Date();
    return {
      origin: "api",
      sourcePlatform: "forum",
      sourceType: "thread",
      externalId: `rd-${d.id}`,
      url: `https://www.reddit.com${d.permalink ?? ""}`,
      authorName: String(d.author ?? ""),
      authorHandle: `u/${d.author ?? ""}`,
      title: String(d.title ?? ""),
      content: String(d.selftext || d.title || ""),
      publishedAt,
      engagementCount: Number(d.score ?? 0) + Number(d.num_comments ?? 0),
      likeCount: Number(d.score ?? 0),
      commentCount: Number(d.num_comments ?? 0),
      shareCount: 0,
      viewCount: 0,
      language: "id",
      mediaTier: "",
      rawPayload: { subreddit: d.subreddit, id: d.id, score: d.score, num_comments: d.num_comments },
    };
  }
}

/** Manual Import — merepresentasikan jalur upload CSV/JSON (bukan fetch otomatis). */
export class ManualImportConnector extends BaseConnector {
  readonly meta: ConnectorMeta = {
    platform: "manual",
    label: "Manual Import (CSV/JSON)",
    method: "manual_import",
    scopeNotes: "Upload data nyata dari platform mana pun lewat halaman Sources; masuk pipeline dedup + AI yang sama.",
  };

  async fetchMentions(_params: FetchParams): Promise<RawMention[]> {
    return []; // data masuk lewat POST /api/import, bukan polling
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
