import { openAiLikeChat } from "@/lib/openai/client";
import type { AppSettings } from "@/types/contracts";

export async function optimizeText(inputText: string, settings: AppSettings): Promise<string> {
  const provider = settings.providers.find((item) => item.kind === "llm" && item.enabled);
  if (!provider) {
    return inputText;
  }

  try {
    const result = await openAiLikeChat(
      provider,
      [
        { role: "system", content: settings.prompts.textOptimize },
        {
          role: "user",
          content: `请优化以下安全检查文本，仅输出优化后的中文文本：\n${inputText}`
        }
      ],
      false
    );
    if (result && result.trim().length > 0) {
      return result.trim();
    }
  } catch (error) {
    console.error("Text optimization failed:", error);
  }
  return inputText;
}
