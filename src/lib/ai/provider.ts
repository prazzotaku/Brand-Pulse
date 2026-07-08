import type {
  AIAnalysisResult,
  BrandContext,
  ContentIdeaResult,
  HookGenerationResult,
  HookReviewResult,
  RawMention,
} from "../types";

export interface MentionForAnalysis {
  sourcePlatform: string;
  sourceType: string;
  title: string;
  content: string;
  authorName: string;
  authorHandle?: string;
  engagementCount: number;
  mediaTier?: string;
}

export interface HookReviewInput {
  hook: string;
  caption?: string;
  platform?: string;
  contentSummary?: string;
}

export interface HookGenerationInput {
  /** Topik/isi konten yang mau dibuatkan hook & caption. */
  topic: string;
  platform?: string;
  /** Tujuan konten: edukasi | promosi | trust | awareness. */
  goal?: string;
  /** Format konten: video | image | text — menentukan bentuk isi konten yang di-generate. */
  contentType?: string;
}

export interface MentionInsightSnapshot {
  content: string;
  sentiment: string;
  intent: string;
  issueCategory: string;
  sourcePlatform: string;
}

/**
 * Abstraksi AI layer. Semua fitur AI (sentiment, ide konten, hook review,
 * report summary) lewat interface ini sehingga model/provider bisa
 * diganti-ganti (mock, Anthropic, dst) tanpa menyentuh kode aplikasi.
 */
export interface AIProvider {
  readonly name: string;
  analyzeMention(mention: MentionForAnalysis, brand: BrandContext): Promise<AIAnalysisResult>;
  /**
   * Varian analyzeMention TANPA fallback otomatis ke mock — melempar error
   * asli. Opsional: hanya provider LLM (bukan MockAIProvider) yang punya ini.
   * Dipakai script batch/backfill yang ingin retry sendiri.
   */
  analyzeMentionStrict?(mention: MentionForAnalysis, brand: BrandContext): Promise<AIAnalysisResult>;
  generateContentIdeas(
    insights: MentionInsightSnapshot[],
    brand: BrandContext,
    count?: number
  ): Promise<ContentIdeaResult[]>;
  reviewHook(input: HookReviewInput, brand: BrandContext): Promise<HookReviewResult>;
  generateHooks(input: HookGenerationInput, brand: BrandContext): Promise<HookGenerationResult>;
  summarizeReport(
    stats: Record<string, unknown>,
    insights: MentionInsightSnapshot[],
    brand: BrandContext
  ): Promise<string>;
}

export type { RawMention };
