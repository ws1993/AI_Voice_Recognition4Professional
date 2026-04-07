import { openAiLikeTranscribe } from "@/lib/openai/client";
import type { AppSettings } from "@/types/contracts";

export class AsrConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsrConfigError";
  }
}

export class AsrProviderError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AsrProviderError";
    this.cause = cause;
  }
}

export async function transcribeAudio(file: File, language: string, settings: AppSettings): Promise<string> {
  const provider = settings.providers.find((item) => item.kind === "asr" && item.enabled);
  if (!provider) {
    throw new AsrConfigError("未启用可用的 ASR 提供商，请检查后台模型配置。");
  }

  if (!provider.apiKey || provider.apiKey.trim().length === 0) {
    throw new AsrConfigError(
      `未配置 ASR API Key；请在管理设置页面配置 provider.apiKey。`
    );
  }

  try {
    const result = await openAiLikeTranscribe(provider, file, language);
    if (!result || result.trim().length === 0) {
      throw new AsrProviderError("ASR 服务返回空结果。");
    }

    return result.trim();
  } catch (error) {
    if (error instanceof AsrConfigError || error instanceof AsrProviderError) {
      throw error;
    }

    console.error("ASR provider call failed:", error);
    const message = error instanceof Error && error.message ? error.message : "未知错误";
    throw new AsrProviderError(`ASR 调用失败：${message}`, error);
  }
}
