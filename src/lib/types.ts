// Union types terpusat — DB menyimpan String agar portable SQLite/PostgreSQL,
// validasi dilakukan di layer aplikasi lewat tipe-tipe ini.

export type SourcePlatform =
  | "facebook"
  | "instagram"
  | "x"
  | "threads"
  | "tiktok"
  | "youtube"
  | "news"
  | "rss"
  | "blog"
  | "forum"
  | "manual";

export type SourceType = "post" | "comment" | "article" | "video" | "caption" | "reply" | "thread";

export type Sentiment = "positive" | "negative" | "neutral" | "mixed";

export type ReputationalImpact = "low" | "medium" | "high" | "critical";

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export type RefreshInterval = "manual" | "5m" | "30m" | "1h";

export type MediaTier = "tier1" | "tier2" | "local" | "blog" | "aggregator";

export type IssueCategory =
  | "customer service"
  | "app issue"
  | "pricing"
  | "promo"
  | "product"
  | "regulation"
  | "crisis"
  | "fraud/scam"
  | "competitor"
  | "event"
  | "csr"
  | "public figure"
  | "career"
  | "irrelevant";

export type Intent =
  | "praise"
  | "complaint"
  | "question"
  | "objection"
  | "desire"
  | "fear"
  | "confusion"
  | "feature request"
  | "price concern"
  | "competitor mention"
  | "viral signal"
  | "crisis signal"
  | "information";

export interface DetectedLocation {
  name: string;
  type: "country" | "province" | "city" | "district";
  confidence: number; // 0-100
  source: "explicit" | "profile" | "text" | "media_domain" | "inference";
}

export interface DetectedSlang {
  term: string;
  meaningSuggestion: string;
  confidence: number; // 0-100
}

/** Output AI analysis per mention — kontrak JSON sesuai PRD (upgraded). */
export interface AIAnalysisResult {
  isRelevant: boolean;
  relevanceScore: number; // 0-100
  sentiment: Sentiment;
  sentimentScore: number; // -100..100
  confidenceScore: number; // 0-100
  reputationalImpact: ReputationalImpact;
  riskScore: number; // 0-100
  issueCategory: string;
  emotion: string;
  intent: string;
  summary: string;
  reasoning: string;
  suggestedAction: string;
  detectedLocations: DetectedLocation[];
  detectedSlang: DetectedSlang[];
  relatedKeywords: string[];
  relatedHashtags: string[];
  relatedCompetitors: string[];
  contentOpportunity: string;
}

/** Output Hook Review Engine — kontrak JSON sesuai PRD. */
export interface HookReviewResult {
  totalScore: number; // 0-10
  scoreBreakdown: {
    hookStrength: number;
    curiosityGap: number;
    conflictContrast: number;
    promiseClarity: number;
    audienceRelevance: number;
    brandFit: number;
    ctaStrength: number;
    retentionPotential: number;
    riskLevel: number; // 10 = paling aman
  };
  detectedHookType: string;
  mainWeakness: string;
  whyItMatters: string;
  recommendedHookType: string;
  rewrittenOptions: string[];
  /** Caption siap pakai hasil perbaikan (hook terbaik + isi + CTA). */
  suggestedCaption: string;
  finalRecommendation: string;
}

/** Output generator hook/caption — AI membuatkan dari topik. */
export interface HookGenerationResult {
  hooks: { text: string; type: string }[];
  /** Format konten yang di-generate: video | image | text. */
  contentType: string;
  /** Isi konten menyesuaikan format: adegan script (video), slide (carousel/gambar), atau bagian teks/thread. */
  contentBody: { label: string; text: string }[];
  caption: string;
  cta: string;
  notes: string;
}

export interface ContentIdeaResult {
  idea: string;
  sourceInsight: string;
  audiencePain: string;
  hookSuggestion: string;
  angle: string;
  format: string;
  cta: string;
  priorityScore: number;
  whyNow: string;
}

/** Konteks brand yang dikirim ke AI layer agar output tidak generik. */
export interface BrandContext {
  name: string;
  aliases: string[];
  competitors: string[];
  products: string[];
  brandVoice: string;
  prohibitedClaims: string[];
  targetAudience: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  issueKeywords: string[];
}

/** Asal data mention: pembeda data legacy vs data nyata. */
export type MentionOrigin = "mock" | "rss" | "api" | "import";

/** Input mention mentah dari connector, sebelum masuk DB. */
export interface RawMention {
  /** mock (legacy lama) | rss (feed publik nyata) | api (API resmi) | import (upload user). */
  origin?: MentionOrigin;
  /**
   * Lewati prefilter "harus menyebut brand secara eksplisit".
   * Dipakai untuk konten dari akun milik brand sendiri (post + komentarnya):
   * komentar "🔥🔥🔥" di post brand jelas relevan walau tak menyebut nama brand.
   * AI analysis tetap berjalan normal.
   */
  assumeRelevant?: boolean;
  sourcePlatform: SourcePlatform;
  sourceType: SourceType;
  externalId: string;
  url: string;
  authorName: string;
  authorHandle: string;
  title: string;
  content: string;
  publishedAt: Date;
  engagementCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  language: string;
  mediaTier?: MediaTier | "";
  rawPayload: Record<string, unknown>;
}

export function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
