import type { RawMention, SourcePlatform } from "../types";
import {
  BaseConnector,
  type AccountConfig,
  type ConnectorMeta,
  type EngagementSnapshot,
  type FetchParams,
} from "./types";
import { MOCK_ACCOUNT_METRICS, MOCK_POOLS, type MockTemplate } from "./mock-data";

const PLATFORM_URL: Record<string, (id: string, handle: string) => string> = {
  facebook: (id) => `https://facebook.com/bankjakarta/posts/${id}`,
  instagram: (id) => `https://instagram.com/p/${id}`,
  x: (id, h) => `https://x.com/${h.replace("@", "")}/status/${id}`,
  threads: (id, h) => `https://threads.net/${h}/post/${id}`,
  tiktok: (id, h) => `https://tiktok.com/${h}/video/${id}`,
  youtube: (id) => `https://youtube.com/watch?v=${id}`,
  news: (id, h) => `https://${h}/read/${id}`,
  blog: (id, h) => `https://${h}/${id}`,
  forum: (id) => `https://www.reddit.com/r/indonesia/comments/${id}`,
};

export function templateToMention(
  t: MockTemplate,
  platform: SourcePlatform,
  externalId: string,
  publishedAt: Date
): RawMention {
  const [likes, comments, shares, views] = t.engagement;
  return {
    origin: "mock",
    sourcePlatform: platform,
    sourceType: t.sourceType,
    externalId,
    url: (PLATFORM_URL[platform] ?? PLATFORM_URL.news)(externalId, t.authorHandle),
    authorName: t.authorName,
    authorHandle: t.authorHandle,
    title: t.title ?? "",
    content: t.content,
    publishedAt,
    engagementCount: likes + comments + shares,
    likeCount: likes,
    commentCount: comments,
    shareCount: shares,
    viewCount: views,
    language: "id",
    mediaTier: t.mediaTier ?? "",
    rawPayload: { mock: true, template: t.authorHandle, generatedAt: new Date().toISOString() },
  };
}

/**
 * MockConnector — mensimulasikan API resmi tiap platform untuk demo/dev.
 * Aktif ketika env MOCK_CONNECTORS="true". Mengembalikan sampel realistis
 * dengan externalId unik per fetch (agar refresh berikutnya terlihat sebagai
 * data baru sampai jenuh), plus metrik engagement akun mock.
 */
export class MockConnector extends BaseConnector {
  readonly meta: ConnectorMeta;
  private pool: MockTemplate[];

  constructor(platform: Exclude<SourcePlatform, "manual">, meta: Partial<ConnectorMeta> = {}) {
    super();
    this.pool = MOCK_POOLS[platform] ?? [];
    this.meta = {
      platform,
      label: meta.label ?? `${platform} (mock)`,
      method: "mock",
      scopeNotes:
        meta.scopeNotes ??
        "Mock connector (data simulasi). Set MOCK_CONNECTORS=false + isi API key untuk data live.",
    };
  }

  async getConnectorStatus() {
    return { status: "active" as const, detail: "mock data" };
  }

  async fetchMentions(params: FetchParams): Promise<RawMention[]> {
    if (this.pool.length === 0) return [];
    const limit = Math.min(params.limit ?? 4, this.pool.length);
    const shuffled = [...this.pool].sort(() => Math.random() - 0.5).slice(0, limit);
    const now = Date.now();
    return shuffled.map((t, i) =>
      templateToMention(
        t,
        this.meta.platform,
        `${this.meta.platform}-${now}-${i}`,
        new Date(now - Math.floor(Math.random() * 3 * 60 * 60 * 1000))
      )
    );
  }

  async fetchEngagement(account: AccountConfig): Promise<EngagementSnapshot | null> {
    const key = `${account.platform}:${account.handle}`;
    const m = MOCK_ACCOUNT_METRICS[key];
    if (!m) return null;
    // Beri sedikit variasi harian agar tren terlihat hidup.
    const jitter = () => 0.97 + Math.random() * 0.06;
    return {
      followerCount: account.platform === "youtube" ? 0 : Math.round(m.followers * jitter()),
      subscriberCount: account.platform === "youtube" ? Math.round(m.followers * jitter()) : 0,
      postCount: m.posts,
      totalLikes: Math.round(m.likes * jitter()),
      totalComments: Math.round(m.comments * jitter()),
      totalShares: Math.round(m.shares * jitter()),
      totalViews: Math.round(m.views * jitter()),
      rawMetrics: { mock: true },
    };
  }
}

/** Registry mock: satu MockConnector per platform yang bisa di-fetch. */
export function getMockConnectors(): MockConnector[] {
  return [
    new MockConnector("facebook", { label: "Facebook (mock)" }),
    new MockConnector("instagram", { label: "Instagram (mock)" }),
    new MockConnector("x", { label: "X / Twitter (mock)" }),
    new MockConnector("threads", { label: "Threads (mock)" }),
    new MockConnector("tiktok", { label: "TikTok (mock)" }),
    new MockConnector("youtube", { label: "YouTube (mock)" }),
    new MockConnector("news", { label: "Online News (mock)" }),
    new MockConnector("blog", { label: "Blog (mock)" }),
    new MockConnector("forum", { label: "Forum (mock)" }),
  ];
}
