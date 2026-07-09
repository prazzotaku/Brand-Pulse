import type { AIProvider } from "./provider";
import { MockAIProvider } from "./mock-provider";
import { AnthropicProvider } from "./anthropic-provider";
import { DeepSeekProvider } from "./deepseek-provider";
import { GeminiProvider } from "./gemini-provider";

/**
 * Factory AI provider dengan pemisahan role:
 *
 *   "intelligence" — analisis mention (sentiment, geo, slang, keyword).
 *     Dikontrol env INTELLIGENCE_AI_PROVIDER (fallback: AI_PROVIDER, default: gemini).
 *
 *   "content"      — fitur Content (ide konten, hook-generate, hook-review, reports).
 *     Dikontrol env CONTENT_AI_PROVIDER (fallback: AI_PROVIDER, default: deepseek).
 *
 * Provider yang tersedia (untuk kedua role):
 *   mock       → rule-based, tanpa API key
 *   anthropic  → Claude via Anthropic API (butuh ANTHROPIC_API_KEY)
 *   deepseek   → DeepSeek (butuh DEEPSEEK_API_KEY), model via DEEPSEEK_MODEL
 *   gemini     → Google Gemini (butuh GEMINI_API_KEY), model via GEMINI_MODEL
 */

let cachedIntelligence: AIProvider | null = null;
let cachedContent: AIProvider | null = null;

function buildProvider(name: string): AIProvider {
  if (name === "anthropic" && process.env.ANTHROPIC_API_KEY) return new AnthropicProvider();
  if (name === "deepseek" && process.env.DEEPSEEK_API_KEY) return new DeepSeekProvider();
  if (name === "gemini" && process.env.GEMINI_API_KEY) return new GeminiProvider();
  return new MockAIProvider();
}

export function getAI(role: "intelligence" | "content" = "intelligence"): AIProvider {
  if (role === "content") {
    if (!cachedContent) {
      const name = process.env.CONTENT_AI_PROVIDER ?? process.env.AI_PROVIDER ?? "deepseek";
      cachedContent = buildProvider(name);
    }
    return cachedContent;
  }
  // role === "intelligence" (default)
  if (!cachedIntelligence) {
    const name = process.env.INTELLIGENCE_AI_PROVIDER ?? process.env.AI_PROVIDER ?? "gemini";
    cachedIntelligence = buildProvider(name);
  }
  return cachedIntelligence;
}

export type { AIProvider };
