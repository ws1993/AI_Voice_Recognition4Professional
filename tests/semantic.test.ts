import { describe, expect, it } from "vitest";

import { classifyNoticeItems, rankClauses } from "@/lib/pipeline/semantic";

const settings = {
  providers: [
    {
      id: "p1",
      kind: "llm" as const,
      name: "llm",
      baseUrl: "https://api.example.com/v1",
      model: "mock",
      apiKeyEnvName: "NO_KEY",
      apiStyle: "chat_completions" as const,
      enabled: false
    },
    {
      id: "p2",
      kind: "embedding" as const,
      name: "emb",
      baseUrl: "https://api.example.com/v1",
      model: "mock",
      apiKeyEnvName: "NO_KEY",
      apiStyle: "embeddings" as const,
      enabled: false
    }
  ],
  prompts: {
    textOptimize: "",
    noticeGenerate: ""
  },
  recognition: {
    language: "zh-CN",
    silenceMs: 900,
    maxSegmentSeconds: 90,
    asrRetries: 1,
    llmRetries: 1
  }
};

describe("semantic fallback", () => {
  it("ranks clauses by keyword when embedding is unavailable", async () => {
    const clauses = [
      {
        id: "a",
        clauseCode: "A-1",
        title: "distribution box",
        content: "distribution box should stay locked",
        category: "electrical",
        keywords: ["distribution", "locked"],
        embedding: null,
        createdAt: "",
        updatedAt: ""
      },
      {
        id: "b",
        clauseCode: "B-1",
        title: "fire extinguisher",
        content: "fire extinguisher should be checked regularly",
        category: "fire",
        keywords: ["fire", "checked"],
        embedding: null,
        createdAt: "",
        updatedAt: ""
      }
    ];

    const ranked = await rankClauses("distribution box is not locked", clauses, settings, 1);
    expect(ranked[0].clauseCode).toBe("A-1");
  });

  it("returns rule fallback notice items without llm", async () => {
    const items = await classifyNoticeItems({
      segments: ["fire extinguisher pressure is low"],
      candidateClauses: [
        {
          id: "b",
          clauseCode: "B-1",
          title: "fire extinguisher",
          content: "fire extinguisher should be checked regularly",
          category: "fire",
          keywords: [],
          embedding: null,
          createdAt: "",
          updatedAt: ""
        }
      ],
      settings
    });

    expect(items).toHaveLength(1);
    expect(items[0].violatedClauseCode).toBe("B-1");
  });
});
