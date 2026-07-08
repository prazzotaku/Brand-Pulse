import type { SourceConnector } from "./types";
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
  ForumRedditConnector,
  ManualImportConnector,
  YouTubeConnector,
} from "./extra-connectors";
import { EnsembleInstagramConnector, EnsembleTikTokConnector } from "./ensemble-connectors";
import { NewsDataConnector } from "./newsdata-connector";
import { getMockConnectors } from "./mock-connector";

/**
 * Registry connector aktif (pola adapter).
 *
 * MODE dikendalikan env MOCK_CONNECTORS:
 *  - "true"  → semua platform pakai MockConnector (data simulasi, badge MOCK).
 *              Cocok untuk demo/dev tanpa API key. INI DEFAULT saat ini.
 *  - "false" → connector live: Google News RSS + Reddit (aktif tanpa key),
 *              sisanya API resmi yang aktif saat kredensial diisi di .env.
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

export function getConnectors(): SourceConnector[] {
  if (isMockMode()) {
    return [...getMockConnectors(), new ManualImportConnector()];
  }
  // Live mode: Instagram & TikTok via Ensembledata bila ENSEMBLEDATA_TOKEN ada,
  // selain itu fallback ke connector API resmi (Meta/TikTok Research).
  // Berita: NewsData.io (bila key ada) + Google News RSS untuk cakupan lebih luas.
  const hasEnsemble = Boolean(process.env.ENSEMBLEDATA_TOKEN);
  const connectors: SourceConnector[] = [
    new FacebookGraphConnector(),
    hasEnsemble ? new EnsembleInstagramConnector() : new InstagramGraphConnector(),
    new XApiConnector(),
    new ThreadsApiConnector(),
    hasEnsemble ? new EnsembleTikTokConnector() : new TikTokResearchConnector(),
    new YouTubeConnector(),
  ];
  if (process.env.NEWSDATA_API_KEY) connectors.push(new NewsDataConnector());
  connectors.push(
    new GoogleNewsRssConnector(),
    new BlogRssConnector(),
    new ForumRedditConnector(),
    new ManualImportConnector()
  );
  return connectors;
}
