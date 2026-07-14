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
  ApifyFacebookConnector,
  ApifyInstagramConnector,
  ApifyThreadsConnector,
  ApifyTikTokConnector,
  ApifyXConnector,
} from "./apify-connector";
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
 * App sekarang live-only: tidak ada mock connector lagi.
 */
export function getConnectors(): SourceConnector[] {
  const hasApify = Boolean(process.env.APIFY_TOKEN);

  const connectors: SourceConnector[] = [
    hasApify ? new ApifyFacebookConnector() : new FacebookGraphConnector(),
    hasApify ? new ApifyInstagramConnector() : new InstagramGraphConnector(),
    hasApify ? new ApifyXConnector() : new XApiConnector(),
    hasApify ? new ApifyThreadsConnector() : new ThreadsApiConnector(),
    hasApify ? new ApifyTikTokConnector() : new TikTokResearchConnector(),
    new YouTubeConnector(),
  ];

  if (process.env.NEWSDATA_API_KEY) connectors.push(new NewsDataConnector());
  connectors.push(new GoogleNewsRssConnector(), new BlogRssConnector(), new ManualImportConnector());
  return connectors;
}
