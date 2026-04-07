import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openai/client", () => ({
  openAiLikeChat: vi.fn()
}));

import { openAiLikeChat } from "@/lib/openai/client";
import { MIN_OPTIMIZE_TEXT_LENGTH, OPTIMIZE_TIMEOUT_MS, optimizeText } from "@/lib/pipeline/text-optimize";
import type { AppSettings } from "@/types/contracts";

const mockedOpenAiLikeChat = vi.mocked(openAiLikeChat);

function makeSettings(): AppSettings {
  return {
    providers: [
      {
        id: "provider-llm",
        kind: "llm",
        name: "default-llm",
        baseUrl: "https://example.com/v1",
        model: "qwen3.5-flash",
        apiKeyEnvName: "TEST_KEY",
        apiStyle: "chat_completions",
        enabled: true
      }
    ],
    prompts: {
      textOptimize: "你是专业安全检查记录助手。",
      noticeGenerate: "generate"
    },
    recognition: {
      language: "zh-CN",
      silenceMs: 900,
      maxSegmentSeconds: 90,
      asrRetries: 1,
      llmRetries: 1
    }
  };
}

describe("optimizeText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("skips optimization for short text", async () => {
    const shortText = "安".repeat(MIN_OPTIMIZE_TEXT_LENGTH - 1);

    await expect(optimizeText(shortText, makeSettings())).resolves.toMatchObject({
      text: shortText,
      optimizeSkipped: true,
      optimizeTimedOut: false
    });
    expect(mockedOpenAiLikeChat).not.toHaveBeenCalled();
  });

  it("returns optimized text when provider responds quickly", async () => {
    mockedOpenAiLikeChat.mockResolvedValueOnce("优化后的文本");
    const input = "这是一个足够长的安全检查文本，用于触发优化逻辑。";

    await expect(optimizeText(input, makeSettings())).resolves.toMatchObject({
      text: "优化后的文本",
      optimizeSkipped: false,
      optimizeTimedOut: false
    });
  });

  it("falls back to original text when optimization times out", async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const input = "这是一个足够长的安全检查文本，用于验证超时回退逻辑。";

    mockedOpenAiLikeChat.mockImplementationOnce(
      (_profile, _messages, _jsonOutput, options) =>
        new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        })
    );

    const promise = optimizeText(input, makeSettings());
    await vi.advanceTimersByTimeAsync(OPTIMIZE_TIMEOUT_MS);

    await expect(promise).resolves.toMatchObject({
      text: input,
      optimizeSkipped: false,
      optimizeTimedOut: true
    });
    expect(warnSpy).toHaveBeenCalledWith(`Text optimization timed out after ${OPTIMIZE_TIMEOUT_MS}ms`);
  });
});
