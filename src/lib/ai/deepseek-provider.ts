import { LLMJsonProvider } from "./llm-json-provider";

const API_URL = "https://api.deepseek.com/chat/completions";

/**
 * Provider AI via DeepSeek (API kompatibel-OpenAI).
 * Aktif jika AI_PROVIDER=deepseek dan DEEPSEEK_API_KEY terisi.
 *
 * Catatan: deepseek-v4-flash adalah model *reasoning* — token dipakai untuk
 * proses berpikir (reasoning_content) lebih dulu sebelum jawaban (content),
 * jadi max_tokens dibuat besar agar jawaban tidak terpotong.
 */
export class DeepSeekProvider extends LLMJsonProvider {
  readonly name = "deepseek";

  protected async complete(system: string, user: string, operation: string): Promise<string> {
    const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.DEEPSEEK_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000, // ruang cukup untuk reasoning + jawaban JSON
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`DeepSeek API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();

    const usage = data.usage ?? {};
    await this.recordUsage({
      operation,
      model,
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
    });

    return data.choices?.[0]?.message?.content ?? "";
  }
}
