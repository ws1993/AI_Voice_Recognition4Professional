import { NextRequest } from "next/server";

import { transcribeAudio } from "@/lib/pipeline/asr";
import { optimizeText } from "@/lib/pipeline/text-optimize";
import { correctByGlossary } from "@/lib/pipeline/terms";
import { ensureSessionExists, readSettings, readTerms, saveSegmentRecord } from "@/lib/store/repository";
import { fail, ok } from "@/lib/utils/http";
import { segmentFormSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const form = await request.formData();
    const sessionId = form.get("sessionId");
    const segmentIndex = form.get("segmentIndex");
    const language = form.get("language") ?? "zh-CN";
    const audioFile = form.get("audioFile");

    const parsed = segmentFormSchema.parse({
      sessionId,
      segmentIndex,
      language
    });

    if (!(audioFile instanceof File)) {
      return fail("audioFile is required", 400);
    }

    const sessionExists = await ensureSessionExists(parsed.sessionId);
    if (!sessionExists) {
      return fail("Session not found", 404);
    }

    const settings = await readSettings();
    const terms = await readTerms();

    const rawText = await transcribeAudio(audioFile, parsed.language, settings);
    const correctedText = await correctByGlossary(rawText, terms, settings);
    const polishedText = await optimizeText(correctedText, settings);

    const record = await saveSegmentRecord({
      sessionId: parsed.sessionId,
      segmentIndex: parsed.segmentIndex,
      rawText,
      correctedText,
      polishedText,
      timingMs: Date.now() - started
    });

    return ok({
      segmentId: record.segmentId,
      sessionId: record.sessionId,
      segmentIndex: record.segmentIndex,
      rawText: record.rawText,
      correctedText: record.correctedText,
      polishedText: record.polishedText,
      timing: record.timingMs
    });
  } catch (error) {
    return fail("Failed to recognize segment", 400, error);
  }
}
