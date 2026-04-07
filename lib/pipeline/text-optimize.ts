import { openAiLikeChat } from "@/lib/openai/client";
import type { AppSettings } from "@/types/contracts";

export const MIN_OPTIMIZE_TEXT_LENGTH = 20;
export const OPTIMIZE_TIMEOUT_MS = 5000;

export type TextOptimizeResult = {
  text: string;
  optimizeSkipped: boolean;
  optimizeTimedOut: boolean;
};

export async function optimizeText(inputText: string, settings: AppSettings): Promise<TextOptimizeResult> {
  const normalizedText = inputText.trim();
  if (normalizedText.length < MIN_OPTIMIZE_TEXT_LENGTH) {
    return {
      text: inputText,
      optimizeSkipped: true,
      optimizeTimedOut: false
    };
  }

  const provider = settings.providers.find((item) => item.kind === "llm" && item.enabled);
  if (!provider) {
    return {
      text: inputText,
      optimizeSkipped: true,
      optimizeTimedOut: false
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPTIMIZE_TIMEOUT_MS);

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
      false,
      {
        disableThinking: true,
        signal: controller.signal
      }
    );
    if (result && result.trim().length > 0) {
      return {
        text: result.trim(),
        optimizeSkipped: false,
        optimizeTimedOut: false
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`Text optimization timed out after ${OPTIMIZE_TIMEOUT_MS}ms`);
      return {
        text: inputText,
        optimizeSkipped: false,
        optimizeTimedOut: true
      };
    } else {
      console.error("Text optimization failed:", error);
    }
  } finally {
    clearTimeout(timeoutId);
  }
  return {
    text: inputText,
    optimizeSkipped: false,
    optimizeTimedOut: false
  };
}
