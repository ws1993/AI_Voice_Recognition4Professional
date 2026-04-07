import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/store/repository", () => ({
  ensureSessionExists: vi.fn(),
  readSettings: vi.fn(),
  readTerms: vi.fn(),
  saveSegmentRecord: vi.fn()
}));

vi.mock("@/lib/pipeline/terms", () => ({
  correctByGlossary: vi.fn()
}));

vi.mock("@/lib/pipeline/text-optimize", () => ({
  optimizeText: vi.fn()
}));

vi.mock("@/lib/pipeline/asr", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pipeline/asr")>("@/lib/pipeline/asr");
  return {
    ...actual,
    transcribeAudio: vi.fn()
  };
});

import { POST } from "@/app/api/recognize/segment/route";
import { AsrConfigError, AsrProviderError, transcribeAudio } from "@/lib/pipeline/asr";
import { optimizeText } from "@/lib/pipeline/text-optimize";
import { correctByGlossary } from "@/lib/pipeline/terms";
import { ensureSessionExists, readSettings, readTerms, saveSegmentRecord } from "@/lib/store/repository";

const mockedTranscribeAudio = vi.mocked(transcribeAudio);
const mockedEnsureSessionExists = vi.mocked(ensureSessionExists);
const mockedReadSettings = vi.mocked(readSettings);
const mockedReadTerms = vi.mocked(readTerms);
const mockedSaveSegmentRecord = vi.mocked(saveSegmentRecord);
const mockedCorrectByGlossary = vi.mocked(correctByGlossary);
const mockedOptimizeText = vi.mocked(optimizeText);

function makeRequest() {
  const form = new FormData();
  form.append("sessionId", "sess-1");
  form.append("segmentIndex", "0");
  form.append("language", "zh-CN");
  form.append("audioFile", new File(["audio"], "sample.webm", { type: "audio/webm" }));

  return new NextRequest("http://localhost/api/recognize/segment", {
    method: "POST",
    body: form
  });
}

describe("POST /api/recognize/segment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedEnsureSessionExists.mockResolvedValue(true);
    mockedReadSettings.mockResolvedValue({
      providers: [],
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
    });
    mockedReadTerms.mockResolvedValue([]);
    mockedCorrectByGlossary.mockResolvedValue("");
    mockedOptimizeText.mockResolvedValue({
      text: "",
      optimizeSkipped: false,
      optimizeTimedOut: false
    });
    mockedSaveSegmentRecord.mockImplementation(async (input) => ({
      segmentId: "seg-1",
      sessionId: input.sessionId,
      segmentIndex: input.segmentIndex,
      rawText: input.rawText,
      correctedText: input.correctedText,
      polishedText: input.polishedText,
      timingMs: input.timingMs,
      createdAt: new Date().toISOString()
    }));
  });

  it("returns segmented timing fields on success", async () => {
    mockedTranscribeAudio.mockResolvedValueOnce("原始文本");
    mockedCorrectByGlossary.mockResolvedValueOnce("术语文本");
    mockedOptimizeText.mockResolvedValueOnce({
      text: "优化文本",
      optimizeSkipped: false,
      optimizeTimedOut: false
    });

    const nowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(40)
      .mockReturnValueOnce(50)
      .mockReturnValueOnce(80)
      .mockReturnValueOnce(90)
      .mockReturnValueOnce(120)
      .mockReturnValueOnce(140);

    const response = await POST(makeRequest());
    const data = (await response.json()) as {
      rawText: string;
      correctedText: string;
      polishedText: string;
      asrMs: number;
      glossaryMs: number;
      optimizeMs: number;
      optimizeSkipped: boolean;
      optimizeTimedOut: boolean;
      timing: number;
    };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      rawText: "原始文本",
      correctedText: "术语文本",
      polishedText: "优化文本",
      asrMs: 30,
      glossaryMs: 30,
      optimizeMs: 30,
      optimizeSkipped: false,
      optimizeTimedOut: false,
      timing: 140
    });

    nowSpy.mockRestore();
  });

  it("returns 503 when ASR config is invalid", async () => {
    mockedTranscribeAudio.mockRejectedValueOnce(new AsrConfigError("未配置 ASR 环境变量 TEST_ASR_KEY"));

    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "未配置 ASR 环境变量 TEST_ASR_KEY"
    });
  });

  it("returns 502 when ASR provider request fails", async () => {
    mockedTranscribeAudio.mockRejectedValueOnce(new AsrProviderError("ASR 调用失败：401 unauthorized"));

    const response = await POST(makeRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: "ASR 调用失败：401 unauthorized"
    });
  });
});
