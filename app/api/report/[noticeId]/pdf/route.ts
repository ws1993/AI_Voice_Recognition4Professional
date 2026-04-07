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

  if (report.pdfUrl.startsWith("http://") || report.pdfUrl.startsWith("https://")) {
    return NextResponse.redirect(report.pdfUrl);
  }

  const buffer = await renderNoticePdfBuffer({
    noticeId: report.noticeId,
    enterpriseName: report.enterpriseName,
    createdAt: report.createdAt,
    items: report.items
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${report.noticeId}.pdf"`
    }
  });
}
