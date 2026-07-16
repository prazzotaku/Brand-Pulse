import type { SourceConnector } from "./types";
import { GoogleNewsRssConnector } from "./google-news-connector";
import {
  FacebookGraphConnector,
  InstagramGraphConnector,
  ThreadsApiConnector,
  TikTokResearchConnector,
  XApiConnector,
} from "./social-api-connectors";
import { BlogRssConnector, ManualImportConnector, YouTubeConnector } from "./extra-connectors";
import {
  EnsembleFacebookConnector,
  EnsembleInstagramConnector,
  EnsembleThreadsConnector,
  EnsembleTikTokConnector,
  EnsembleXConnector,
  EnsembleYouTubeConnector,
} from "./ensemble-connectors";
import { NewsDataConnector } from "./newsdata-connector";

export interface ConnectorDirectoryEntry {
  platform: string;
  label: string;
  method: string;
  scopeNotes: string;
  requiredEnvKeys: string[];
  configured: boolean;
}

export function getConnectorDirectory(): ConnectorDirectoryEntry[] {
  return getConnectors().map((c) => {
    const keys = c.meta.requiredEnvKeys ?? [];
    const configured = c.meta.method === "manual_import" || keys.every((k) => Boolean(process.env[k]));
    return {
      platform: c.meta.platform,
      label: c.meta.label,
      method: c.meta.method,
      scopeNotes: c.meta.scopeNotes,
      requiredEnvKeys: keys,
      configured,
    };
  });
}

/**
 * Daftar connector "representatif" satu per platform.
 * EnsembleData adalah provider default untuk semua platform sosial ketika
 * ENSEMBLEDATA_TOKEN diisi; jika tidak, fallback ke API resmi platform.
 *
 * PENTING: Facebook tidak didukung oleh EnsembleData berdasarkan OpenAPI spec
 * yang ada, jadi akan selalu memakai FacebookGraphConnector (API resmi).
 */
export function getConnectors(): SourceConnector[] {
  const hasEnsemble = Boolean(process.env.ENSEMBLEDATA_TOKEN);

  const connectors: SourceConnector[] = [
    // Facebook always uses Graph API as Ensemble does not support it.
    new FacebookGraphConnector(),
    hasEnsemble ? new EnsembleInstagramConnector() : new InstagramGraphConnector(),
    hasEnsemble ? new EnsembleXConnector() : new XApiConnector(),
    hasEnsemble ? new EnsembleThreadsConnector() : new ThreadsApiConnector(),
    hasEnsemble ? new EnsembleTikTokConnector() : new TikTokResearchConnector(),
    hasEnsemble ? new EnsembleYouTubeConnector() : new YouTubeConnector(),
  ];

  if (process.env.NEWSDATA_API_KEY) connectors.push(new NewsDataConnector());
  connectors.push(new GoogleNewsRssConnector(), new BlogRssConnector(), new ManualImportConnector());
  return connectors;
}
