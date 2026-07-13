import type { FetchScope, SourceConnector } from "./types";
import { GoogleNewsRssConnector } from "./google-news-connector";
import {
  FacebookGraphConnector,
  InstagramGraphConnector,
  ThreadsApiConnector,
  TikTokResearchConnector,
  XApiConnector,
} from "./social-api-connectors";
import {
  BlogRssConnector,
  ManualImportConnector,
  YouTubeConnector,
} from "./extra-connectors";
import { EnsembleInstagramConnector, EnsembleTikTokConnector } from "./ensemble-connectors";
import {
  ApifyFacebookConnector,
  ApifyInstagramConnector,
  ApifyThreadsConnector,
  ApifyTikTokConnector,
  ApifyXConnector,
} from "./apify-connector";
import { NewsDataConnector } from "./newsdata-connector";
import { getMockConnectors } from "./mock-connector";

/**
 * Registry connector aktif (pola adapter).
 *
 * MODE dikendalikan env MOCK_CONNECTORS:
 *  - "true"  → semua platform pakai MockConnector (data simulasi, badge MOCK).
 *              Cocok untuk demo/dev tanpa API key. INI DEFAULT saat ini.
 *  - "false" → connector live: Google News RSS (aktif tanpa key), sisanya API
 *              resmi/Apify yang aktif saat kredensial diisi di .env. Reddit
 *              dinonaktifkan sementara (error), lihat getConnectors().
 */
export function isMockMode(): boolean {
  return (process.env.MOCK_CONNECTORS ?? "true").toLowerCase() !== "false";
}

export interface ConnectorDirectoryEntry {
  platform: string;
  label: string;
  method: string;
  scopeNotes: string;
  requiredEnvKeys: string[];
  /** Terkonfigurasi tanpa panggilan jaringan: mock, atau semua env key ada. */
  configured: boolean;
  mock: boolean;
}

/**
 * Direktori connector untuk halaman Sources — label & status akurat dari
 * registry (bukan nama statis DB). Murni cek env, TANPA panggilan jaringan
 * (agar membuka halaman Sources tidak memakai kuota API berbayar).
 */
export function getConnectorDirectory(): ConnectorDirectoryEntry[] {
  const mock = isMockMode();
  return getConnectors().map((c) => {
    const keys = c.meta.requiredEnvKeys ?? [];
    const configured = mock || c.meta.method === "manual_import" || keys.every((k) => Boolean(process.env[k]));
    return {
      platform: c.meta.platform,
      label: c.meta.label,
      method: c.meta.method,
      scopeNotes: c.meta.scopeNotes,
      requiredEnvKeys: keys,
      configured,
      mock: mock || c.meta.method === "mock",
    };
  });
}

/**
 * Daftar connector "representatif" satu per platform — dipakai untuk
 * direktori status (halaman Sources) dan fetch engagement akun
 * (/api/accounts). Untuk pemilihan connector per target fetch (owned account
 * vs pencarian publik) saat refresh, lihat resolveConnector().
 */
export function getConnectors(): SourceConnector[] {
  if (isMockMode()) {
    return [...getMockConnectors(), new ManualImportConnector()];
  }
  const hasApify = Boolean(process.env.APIFY_TOKEN);
  const hasEnsemble = Boolean(process.env.ENSEMBLEDATA_TOKEN);
  const instagramConnector = hasApify
    ? new ApifyInstagramConnector()
    : hasEnsemble
      ? new EnsembleInstagramConnector()
      : new InstagramGraphConnector();
  const facebookConnector = hasApify ? new ApifyFacebookConnector() : new FacebookGraphConnector();
  const xConnector = hasApify ? new ApifyXConnector() : new XApiConnector();
  const threadsConnector = hasApify ? new ApifyThreadsConnector() : new ThreadsApiConnector();
  const tiktokConnector = hasApify
    ? new ApifyTikTokConnector()
    : hasEnsemble
      ? new EnsembleTikTokConnector()
      : new TikTokResearchConnector();
  const connectors: SourceConnector[] = [
    facebookConnector,
    instagramConnector,
    xConnector,
    threadsConnector,
    tiktokConnector,
    new YouTubeConnector(),
  ];
  if (process.env.NEWSDATA_API_KEY) connectors.push(new NewsDataConnector());
  connectors.push(
    new GoogleNewsRssConnector(),
    new BlogRssConnector(),
    // new ForumRedditConnector(), // Dinonaktifkan sementara karena error
    new ManualImportConnector()
  );
  return connectors;
}

/**
 * Resolusi connector per target fetch (platform + scope) — dipakai oleh
 * pipeline refresh yang membangun fetch target dari SourceAccount (scope
 * owned_account) dan SearchProfile (scope public_keyword/public_hashtag).
 *
 * Prioritas provider: Apify (bila APIFY_TOKEN ada) → Ensembledata (bila
 * relevan & token ada) → API resmi (bila kredensial ada & scope cocok).
 * Beberapa platform hanya punya provider untuk scope tertentu:
 *  - Facebook: hanya owned_account (pencarian publik belum didukung).
 *  - Threads: hanya public_keyword (ThreadsApiConnector resmi berbasis akun
 *    terhubung, bukan pencarian publik, jadi tidak dipakai sebagai fallback).
 *
 * Return null bila kombinasi platform+scope tidak punya connector yang
 * relevan — pemanggil (refresh route) harus melewati target tsb.
 */
export function resolveConnector(platform: string, scope: FetchScope): SourceConnector | null {
  if (isMockMode()) {
    return getMockConnectors().find((c) => c.meta.platform === platform) ?? null;
  }

  const hasApify = Boolean(process.env.APIFY_TOKEN);
  const hasEnsemble = Boolean(process.env.ENSEMBLEDATA_TOKEN);

  switch (platform) {
    case "instagram":
      if (scope === "owned_account") {
        if (hasApify) return new ApifyInstagramConnector();
        return new InstagramGraphConnector();
      }
      if (scope === "public_hashtag") {
        if (hasApify) return new ApifyInstagramConnector();
        if (hasEnsemble) return new EnsembleInstagramConnector();
        return null;
      }
      return null;

    case "facebook":
      if (scope === "owned_account") {
        if (hasApify) return new ApifyFacebookConnector();
        return new FacebookGraphConnector();
      }
      return null; // public_keyword belum didukung untuk Facebook

    case "x":
      if (scope === "public_keyword") {
        return hasApify ? new ApifyXConnector() : new XApiConnector();
      }
      return null;

    case "threads":
      if (scope === "public_keyword") {
        return hasApify ? new ApifyThreadsConnector() : null;
      }
      return null;

    case "tiktok":
      if (scope === "public_keyword") {
        if (hasApify) return new ApifyTikTokConnector();
        if (hasEnsemble) return new EnsembleTikTokConnector();
        return new TikTokResearchConnector();
      }
      return null;

    default:
      return null;
  }
}
