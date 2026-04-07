import { put } from "@vercel/blob";

import { renderNoticePdfBuffer } from "@/lib/pdf/notice-pdf";
import { classifyNoticeItems, rankClauses } from "@/lib/pipeline/semantic";
import { readClauses, writeNoticeReport } from "@/lib/store/repository";
import { makeId, nowIso } from "@/lib/utils/ids";
import type { AppSettings, NoticeItem } from "@/types/contracts";

export async function buildNoticeReport(params: {
  sessionId: string;
  enterpriseName: string;
  inspector?: string;
  inspectedAt?: string;
  segments: string[];
  settings: AppSettings;
}): Promise<{
  noticeId: string;
  items: NoticeItem[];
  pdfUrl: string;
}> {
  const { sessionId, enterpriseName, inspector, inspectedAt, segments, settings } = params;

  const clauses = await readClauses();
  const mergedText = segments.join("\n");
  const topClauses = await rankClauses(mergedText, clauses, settings, 8);
  const items = await classifyNoticeItems({
    segments,
    candidateClauses: topClauses,
    settings
  });

  const noticeId = makeId("notice");
  const createdAt = nowIso();

  const pdfBuffer = await renderNoticePdfBuffer({
    noticeId,
    enterpriseName,
    createdAt,
    inspector,
    inspectedAt,
    items
  });

  let pdfUrl = `/api/report/${noticeId}/pdf`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const uploaded = await put(`notices/${noticeId}.pdf`, pdfBuffer, {
        access: "public",
        addRandomSuffix: false
      });
      pdfUrl = uploaded.url;
    } catch (error) {
      console.error("Blob upload failed:", error);
    }
  }

  const final = await writeNoticeReport({
    noticeId,
    createdAt,
    sessionId,
    enterpriseName,
    items,
    pdfUrl
  });

  return {
    noticeId: final.noticeId,
    items: final.items,
    pdfUrl: final.pdfUrl
  };
}
