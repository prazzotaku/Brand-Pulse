import { LLMJsonProvider } from "./llm-json-provider";

const API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Provider AI via Anthropic Messages API.
 * Aktif jika AI_PROVIDER=anthropic dan ANTHROPIC_API_KEY terisi.
 * Semua prompt/parsing/fallback dibagi di LLMJsonProvider.
 */
export class AnthropicProvider extends LLMJsonProvider {
  readonly name = "anthropic";

  protected async complete(system: string, user: string, operation: string): Promise<string> {
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = await res.json();

    const usage = data.usage ?? {};
    await this.recordUsage({
      operation,
      model,
      promptTokens: usage.input_tokens ?? 0,
      completionTokens: usage.output_tokens ?? 0,
    });

    return data.content?.[0]?.text ?? "";
  }
}
