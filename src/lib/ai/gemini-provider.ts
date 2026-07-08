import { LLMJsonProvider } from "./llm-json-provider";

/**
 * Provider AI via Google Gemini (Generative Language API).
 * Aktif jika AI_PROVIDER=gemini dan GEMINI_API_KEY terisi.
 *
 * Hemat token: "thinking" dimatikan (thinkingBudget: 0) sehingga tidak ada
 * token penalaran yang terbuang — jauh lebih cepat & murah dari model reasoning.
 * responseMimeType JSON tidak dipaksa agar summarizeReport (teks biasa) tetap jalan;
 * extractJson di base class sudah menyaring JSON dari teks untuk method lain.
 */
export class GeminiProvider extends LLMJsonProvider {
  readonly name = "gemini";

  protected async complete(system: string, user: string, operation: string): Promise<string> {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const key = process.env.GEMINI_API_KEY ?? "";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4000,
          thinkingConfig: { thinkingBudget: 0 }, // hemat token: tanpa penalaran
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    if (data.error) throw new Error(`Gemini API: ${JSON.stringify(data.error).slice(0, 300)}`);

    const usage = data.usageMetadata ?? {};
    await this.recordUsage({
      operation,
      model,
      promptTokens: usage.promptTokenCount ?? 0,
      completionTokens: usage.candidatesTokenCount ?? 0,
    });

    return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  }
}
