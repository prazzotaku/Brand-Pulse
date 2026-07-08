import type { RawMention } from "../types";
import { BaseConnector, type ConnectorMeta, type ConnectorStatusInfo, type FetchParams } from "./types";
import { decodeXml, extractAttr, extractTag, hashString, splitRssItems, stripHtml } from "./rss-utils";

/**
 * Connector RSS Google News — DATA NYATA, bukan mock.
 * Feed RSS publik untuk keyword brand; link artikel adalah URL redirect resmi
 * Google News yang mengarah ke media aslinya. Compliance: feed publik, tanpa
 * login/captcha/scraping halaman.
 */
export class GoogleNewsRssConnector extends BaseConnector {
  readonly meta: ConnectorMeta = {
    platform: "news",
    label: "Online News (Google News RSS - live)",
    method: "rss",
    scopeNotes:
      "Live: RSS publik Google News untuk keyword brand. Artikel & link nyata; hormati rate limit dengan interval refresh wajar.",
  };

  async getConnectorStatus(): Promise<ConnectorStatusInfo> {
    try {
      const res = await fetch("https://news.google.com/rss?hl=id&gl=ID&ceid=ID:id", {
        method: "HEAD",
        cache: "no-store",
      });
      return res.ok ? { status: "active" } : { status: "error", detail: `HTTP ${res.status}` };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async fetchMentions(params: FetchParams): Promise<RawMention[]> {
    // Frasa tanda kutip → Google News mencocokkan nama brand persis (bukan
    // sekadar terkait/mirip), supaya tidak menarik berita umum tentang
    // wilayah/topik yang kebetulan mirip tapi tidak menyebut brand sama sekali.
    const phrase = `"${params.query}"`;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(phrase)}&hl=id&gl=ID&ceid=ID:id`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": "BrandPulseOS/0.1 (brand monitoring; RSS reader)" },
    });
    if (!res.ok) throw new Error(`Google News RSS ${res.status}`);
    const xml = await res.text();

    // Dedup di pipeline yang mencegah duplikat — tidak memfilter publishedAt.
    const mentions: RawMention[] = [];
    for (const item of splitRssItems(xml).slice(0, params.limit ?? 10)) {
      const normalized = this.normalizePayload({ item });
      if (!normalized) continue;
      mentions.push(normalized);
    }
    return mentions;
  }

  normalizePayload(rawPayload: Record<string, unknown>): RawMention | null {
    const item = String(rawPayload.item ?? "");
    const title = decodeXml(extractTag(item, "title"));
    const link = decodeXml(extractTag(item, "link"));
    if (!title || !link) return null;
    const guid = decodeXml(extractTag(item, "guid")) || link;
    const pubDate = extractTag(item, "pubDate");
    const sourceName = decodeXml(extractTag(item, "source"));
    const sourceUrl = extractAttr(item, "source", "url");
    const description = stripHtml(decodeXml(extractTag(item, "description")));

    return {
      origin: "rss",
      sourcePlatform: "news",
      sourceType: "article",
      externalId: `gnews-${hashString(guid)}`,
      url: link,
      authorName: sourceName || "Google News",
      authorHandle: sourceUrl ? safeHostname(sourceUrl) : "news.google.com",
      title,
      content: description || title,
      publishedAt: pubDate ? new Date(pubDate) : new Date(),
      engagementCount: 0,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
      language: "id",
      mediaTier: "",
      rawPayload: { origin: "google-news-rss", guid, sourceName, sourceUrl, pubDate },
    };
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
