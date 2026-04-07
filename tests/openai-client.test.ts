import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openAiLikeTranscribe } from "@/lib/openai/client";
import type { ProviderProfile } from "@/types/contracts";

const originalEnv = { ...process.env };

function makeProfile(): ProviderProfile {
  return {
    id: "provider-asr-default",
    kind: "asr",
    name: "default-asr",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3-asr-flash",
    apiKeyEnvName: "TEST_DASHSCOPE_KEY",
    apiStyle: "chat_audio",
    enabled: true
  };
}

describe("openAiLikeTranscribe chat_audio payload", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, TEST_DASHSCOPE_KEY: "secret" };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("sends DashScope-compatible input_audio payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "识别文本"
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );

    const file = new File(["hello world"], "segment-0.webm", { type: "audio/webm;codecs=opus" });
    const result = await openAiLikeTranscribe(makeProfile(), file, "zh-CN");

    expect(result).toBe("识别文本");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [, init] = fetchSpy.mock.calls[0];
    const payload = JSON.parse(String(init?.body)) as {
      model: string;
      messages: Array<{
        role: string;
        content: Array<{
          type: string;
          input_audio?: {
            data: string;
          };
          text?: string;
        }>;
      }>;
      asr_options?: {
        language?: string;
      };
    };

    expect(payload.model).toBe("qwen3-asr-flash");
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].role).toBe("user");
    expect(payload.messages[0].content).toHaveLength(1);
    expect(payload.messages[0].content[0].type).toBe("input_audio");
    expect(payload.messages[0].content[0].text).toBeUndefined();
    expect(payload.messages[0].content[0].input_audio?.data.startsWith("data:audio/webm;base64,")).toBe(true);
    expect(payload.asr_options?.language).toBe("zh");
  });
});
