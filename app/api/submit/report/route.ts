import { NextRequest } from "next/server";

import { buildNoticeReport } from "@/lib/pipeline/report";
import { ensureSessionExists, readSettings } from "@/lib/store/repository";
import { fail, ok } from "@/lib/utils/http";
import { submitReportSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = submitReportSchema.parse(body);

    const exists = await ensureSessionExists(parsed.sessionId);
    if (!exists) {
      return fail("Session not found", 404);
    }

    const settings = await readSettings();
    const segments = parsed.editedSegments
      .sort((a, b) => a.segmentIndex - b.segmentIndex)
      .map((item) => item.text.trim())
      .filter(Boolean);

    if (!segments.length) {
      return fail("No segment text to submit", 400);
    }

    const report = await buildNoticeReport({
      sessionId: parsed.sessionId,
      enterpriseName: parsed.enterpriseInfo.enterpriseName,
      inspector: parsed.enterpriseInfo.inspector,
      inspectedAt: parsed.enterpriseInfo.inspectedAt,
      segments,
      settings
    });

    return ok(report, 201);
  } catch (error) {
    return fail("Failed to submit report", 400, error);
  }
}
