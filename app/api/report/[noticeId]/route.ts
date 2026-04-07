import { readNoticeReport } from "@/lib/store/repository";
import { fail, ok } from "@/lib/utils/http";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ noticeId: string }> }) {
  const { noticeId } = await context.params;
  const report = await readNoticeReport(noticeId);
  if (!report) {
    return fail("Report not found", 404);
  }
  return ok(report);
}
