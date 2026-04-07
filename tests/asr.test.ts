import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSettings } from "@/types/contracts";

vi.mock("@/lib/openai/client", () => ({
  openAiLikeTranscribe: vi.fn()
}));

import { openAiLikeTranscribe } from "@/lib/openai/client";
import { AsrConfigError, AsrProviderError, transcribeAudio } from "@/lib/pipeline/asr";

const mockedOpenAiLikeTranscribe = vi.mocked(openAiLikeTranscribe);
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

function makeSettings(kind: "asr" | "llm" = "asr"): AppSettings {
  return {
    providers: [
      {
        id: `provider-${kind}`,
        kind,
        name: `default-${kind}`,
        baseUrl: "https://example.com/v1",
        model: `${kind}-model`,
        apiKey: "test-api-key",
        apiStyle: kind === "asr" ? "audio_transcription" : "chat_completions",
        enabled: true
      }
    ],
    prompts: {
      textOptimize: "optimize",
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

function makeFile() {
  return new File(["hello"], "sample.webm", { type: "audio/webm" });
}

describe("transcribeAudio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("throws config error when no ASR provider is enabled", async () => {
    await expect(transcribeAudio(makeFile(), "zh-CN", makeSettings("llm"))).rejects.toBeInstanceOf(AsrConfigError);
  });

  it("throws config error when api key is missing", async () => {
    const settingsWithoutKey = makeSettings();
    settingsWithoutKey.providers[0].apiKey = "";
    await expect(transcribeAudio(makeFile(), "zh-CN", settingsWithoutKey)).rejects.toThrow("未配置 ASR API Key");
  });

  it("returns transcript text from provider", async () => {
    mockedOpenAiLikeTranscribe.mockResolvedValueOnce("  识别成功  ");

    await expect(transcribeAudio(makeFile(), "zh-CN", makeSettings())).resolves.toBe("识别成功");
  });

  it("throws provider error when provider returns empty content", async () => {
    mockedOpenAiLikeTranscribe.mockResolvedValueOnce("   ");

    await expect(transcribeAudio(makeFile(), "zh-CN", makeSettings())).rejects.toBeInstanceOf(AsrProviderError);
  });

  it("throws provider error when upstream request fails", async () => {
    mockedOpenAiLikeTranscribe.mockRejectedValueOnce(new Error("401 unauthorized"));

    await expect(transcribeAudio(makeFile(), "zh-CN", makeSettings())).rejects.toThrow("401 unauthorized");
  });
});
