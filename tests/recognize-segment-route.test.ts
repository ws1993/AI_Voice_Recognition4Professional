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
import { ensureSessionExists, readSettings, readTerms, saveSegmentRecord } from "@/lib/store/repository";

const mockedTranscribeAudio = vi.mocked(transcribeAudio);
const mockedEnsureSessionExists = vi.mocked(ensureSessionExists);
const mockedReadSettings = vi.mocked(readSettings);
const mockedReadTerms = vi.mocked(readTerms);
const mockedSaveSegmentRecord = vi.mocked(saveSegmentRecord);

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
    mockedSaveSegmentRecord.mockResolvedValue({
      segmentId: "seg-1",
      sessionId: "sess-1",
      segmentIndex: 0,
      rawText: "",
      correctedText: "",
      polishedText: "",
      timingMs: 0,
      createdAt: new Date().toISOString()
    });
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
