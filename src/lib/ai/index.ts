import type { AIProvider } from "./provider";
import { MockAIProvider } from "./mock-provider";
import { AnthropicProvider } from "./anthropic-provider";
import { DeepSeekProvider } from "./deepseek-provider";
import { GeminiProvider } from "./gemini-provider";

let cached: AIProvider | null = null;

/**
 * Factory AI provider. Ganti model/vendor cukup lewat env AI_PROVIDER:
 *   mock       → rule-based, tanpa API key (default)
 *   anthropic  → Claude via Anthropic API (butuh ANTHROPIC_API_KEY)
 *   deepseek   → DeepSeek (butuh DEEPSEEK_API_KEY), model via DEEPSEEK_MODEL
 *   gemini     → Google Gemini (butuh GEMINI_API_KEY), model via GEMINI_MODEL — hemat token
 * Provider baru tinggal extend LLMJsonProvider + daftar di sini.
 */
export function getAI(): AIProvider {
  if (cached) return cached;
  const provider = process.env.AI_PROVIDER ?? "mock";
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    cached = new AnthropicProvider();
  } else if (provider === "deepseek" && process.env.DEEPSEEK_API_KEY) {
    cached = new DeepSeekProvider();
  } else if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    cached = new GeminiProvider();
  } else {
    cached = new MockAIProvider();
  }
  return cached;
}

export type { AIProvider };
