import type { RawMention, SourcePlatform } from "../types";

export interface FetchParams {
  /** Query/keyword pencarian (nama brand, alias, hashtag). */
  query: string;
  /** Incremental fetching: ambil data setelah timestamp ini (lastFetchedAt). */
  since?: Date;
  /** Batas jumlah item per fetch (hormati rate limit). */
  limit?: number;
  /** Pagination token/cursor dari fetch sebelumnya bila platform mendukung. */
  cursor?: string;
}

export type FetchScope = "owned_account" | "public_keyword" | "public_hashtag";

/**
 * Parameter terstruktur untuk setiap tugas fetch.
 * Dibangun oleh pipeline refresh dari SourceAccount / SearchProfile.
 */
export interface FetchTarget extends FetchParams {
  /** Platform target fetch: facebook | instagram | x | threads | tiktok | ... */
  platform: SourcePlatform | string;
  scope: FetchScope;
  // Opsional, untuk scope: 'owned_account'
  handle?: string;
  // Opsional, ID dari baris SourceAccount / SearchProfile
  targetId?: string;
}

export interface AccountConfig {
  platform: SourcePlatform | string;
  handle: string;
  externalId?: string;
}

export interface ContentConfig {
  platform: SourcePlatform | string;
  externalId: string;
  url?: string;
}

/** Snapshot metrik akun (dipetakan ke tabel AccountMetric). */
export interface EngagementSnapshot {
  followerCount?: number;
  subscriberCount?: number;
  postCount?: number;
  totalLikes?: number;
  totalComments?: number;
  totalShares?: number;
  totalViews?: number;
  totalSaves?: number;
  rawMetrics?: Record<string, unknown>;
}

export type ConnectorHealth = "active" | "paused" | "error" | "rate_limited" | "pending_auth";

export interface ConnectorStatusInfo {
  status: ConnectorHealth;
  detail?: string;
}

export interface RateLimitStatus {
  limited: boolean;
  remaining?: number;
  resetAt?: Date;
  note?: string;
}

export interface ConnectorMeta {
  platform: SourcePlatform;
  label: string;
  /** official_api | rss | manual_import | public_api */
  method: string;
  /** Deskripsi scope & keterbatasan akses — wajib jujur soal compliance. */
  scopeNotes: string;
  /** Env key yang dibutuhkan agar connector aktif (untuk halaman Sources). */
  requiredEnvKeys?: string[];
}

/**
 * Kontrak adapter untuk semua sumber data.
 *
 * Prinsip compliance (berlaku untuk semua implementasi):
 *  - Tidak bypass login/captcha/paywall; tidak scraping agresif.
 *  - Hormati rate limit dan robots.txt; hanya data publik/berizin.
 *  - Jangan simpan data personal yang tidak perlu; selalu simpan source URL.
 */
export interface SourceConnector {
  readonly meta: ConnectorMeta;
  /** Ambil mention baru dari sumber (incremental via params.since/cursor). */
  fetchMentions(params: FetchTarget): Promise<RawMention[]>;
  /** Ambil metrik engagement sebuah akun (null bila tidak didukung/terkonfigurasi). */
  fetchEngagement(account: AccountConfig): Promise<EngagementSnapshot | null>;
  /** Ambil komentar sebuah konten (kosong bila tidak didukung). */
  fetchComments(content: ContentConfig, params?: FetchParams): Promise<RawMention[]>;
  /** Status kesehatan connector: active|paused|error|rate_limited|pending_auth. */
  getConnectorStatus(): Promise<ConnectorStatusInfo>;
  /** Status rate limit terakhir yang diketahui. */
  getRateLimitStatus(): Promise<RateLimitStatus>;
  /** Normalisasi payload mentah platform → RawMention (null bila tak valid). */
  normalizePayload(rawPayload: Record<string, unknown>): RawMention | null;
  /** Klasifikasikan error → status connector (dipakai scheduler/CrawlRun). */
  handleError(error: unknown): ConnectorStatusInfo;
}

/**
 * BaseConnector — implementasi default agar setiap connector cukup fokus pada
 * fetchMentions + normalizePayload; method lain bisa dioverride bila platform
 * mendukung (mis. YouTube mendukung fetchEngagement channel).
 */
export abstract class BaseConnector implements SourceConnector {
  abstract readonly meta: ConnectorMeta;
  abstract fetchMentions(params: FetchTarget): Promise<RawMention[]>;

  protected lastRateLimit: RateLimitStatus = { limited: false };

  async fetchEngagement(_account: AccountConfig): Promise<EngagementSnapshot | null> {
    return null;
  }

  async fetchComments(_content: ContentConfig, _params?: FetchParams): Promise<RawMention[]> {
    return [];
  }

  async getConnectorStatus(): Promise<ConnectorStatusInfo> {
    return { status: "active" };
  }

  async getRateLimitStatus(): Promise<RateLimitStatus> {
    return this.lastRateLimit;
  }

  normalizePayload(_rawPayload: Record<string, unknown>): RawMention | null {
    return null;
  }

  handleError(error: unknown): ConnectorStatusInfo {
    const msg = error instanceof Error ? error.message : String(error);
    if (/429|rate.?limit|too many/i.test(msg)) {
      this.lastRateLimit = { limited: true, note: msg.slice(0, 200) };
      return { status: "rate_limited", detail: msg.slice(0, 300) };
    }
    if (/401|403|unauthorized|forbidden|token|credential/i.test(msg)) {
      return { status: "pending_auth", detail: msg.slice(0, 300) };
    }
    return { status: "error", detail: msg.slice(0, 300) };
  }
}
