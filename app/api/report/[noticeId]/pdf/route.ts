import { NextResponse } from "next/server";

import { renderNoticePdfBuffer } from "@/lib/pdf/notice-pdf";
import { readNoticeReport } from "@/lib/store/repository";
import { fail } from "@/lib/utils/http";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ noticeId: string }> }) {
  const { noticeId } = await context.params;
  const report = await readNoticeReport(noticeId);
  if (!report) {
    return fail("Report not found", 404);
  }

  const buffer = await renderNoticePdfBuffer({
    noticeId: report.noticeId,
    enterpriseName: report.enterpriseName,
    createdAt: report.createdAt,
    inspector: report.inspector,
    inspectedAt: report.inspectedAt,
    items: report.items
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${report.noticeId}.pdf"`,
      "Cache-Control": "no-store"
    }
  });
}
