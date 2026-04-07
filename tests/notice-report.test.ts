import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readNoticeReport, writeNoticeReport } from "@/lib/store/repository";

const originalDatabaseUrl = process.env.DATABASE_URL;

type MemStoreGlobal = typeof globalThis & {
  __memStore?: unknown;
};

function resetMemoryStore() {
  (globalThis as MemStoreGlobal).__memStore = undefined;
}

describe("notice report persistence", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetMemoryStore();
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    resetMemoryStore();
  });

  it("preserves inspector metadata for regenerated pdfs", async () => {
    const created = await writeNoticeReport({
      noticeId: "notice_test_meta",
      sessionId: "sess_test_meta",
      enterpriseName: "测试企业",
      inspector: "张三",
      inspectedAt: "2026-04-07",
      items: [],
      pdfUrl: "https://example.com/notices/notice_test_meta.pdf"
    });

    const report = await readNoticeReport(created.noticeId);

    expect(report).not.toBeNull();
    expect(report?.inspector).toBe("张三");
    expect(report?.inspectedAt).toBe("2026-04-07");
  });
});
