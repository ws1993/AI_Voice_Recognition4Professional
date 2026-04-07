import { NextRequest } from "next/server";

import { ensureSessionExists, saveSegmentRecord } from "@/lib/store/repository";
import { fail, ok } from "@/lib/utils/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const sessionId = form.get("sessionId") as string;
    const segmentIndex = form.get("segmentIndex") as string;
    const rawText = form.get("rawText") as string;
    const correctedText = form.get("correctedText") as string;
    const polishedText = form.get("polishedText") as string;
    const timingMs = form.get("timingMs") as string;

    if (!sessionId || !segmentIndex || !rawText) {
      return fail("Missing required fields", 400);
    }

    const sessionExists = await ensureSessionExists(sessionId);
    if (!sessionExists) {
      return fail("Session not found", 404);
    }

    const record = await saveSegmentRecord({
      sessionId,
      segmentIndex: parseInt(segmentIndex, 10),
      rawText,
      correctedText: correctedText || rawText,
      polishedText: polishedText || rawText,
      timingMs: timingMs ? parseInt(timingMs, 10) : 0
    });

    return ok({
      segmentId: record.segmentId,
      sessionId: record.sessionId,
      segmentIndex: record.segmentIndex,
      rawText: record.rawText,
      correctedText: record.correctedText,
      polishedText: record.polishedText,
      timingMs: record.timingMs
    });
  } catch (error) {
    console.error("Failed to save segment", error);
    return fail("Failed to save segment", 500, error);
  }
}
