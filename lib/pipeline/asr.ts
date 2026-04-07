import { openAiLikeTranscribe } from "@/lib/openai/client";
import type { AppSettings } from "@/types/contracts";

export async function transcribeAudio(file: File, language: string, settings: AppSettings): Promise<string> {
  const provider = settings.providers.find((item) => item.kind === "asr" && item.enabled);
  if (!provider) {
    return "未配置 ASR 提供商。";
  }

  try {
    const result = await openAiLikeTranscribe(provider, file, language);
    if (result && result.trim().length > 0) {
      return result.trim();
    }
  } catch (error) {
    console.error("ASR provider call failed:", error);
  }

  return `【模拟识别】${file.name} 已上传，但当前未配置可用 ASR Key。`;
}
