import { NextRequest } from "next/server";
import { ZodError } from "zod";

import { AsrConfigError, AsrProviderError, transcribeAudio } from "@/lib/pipeline/asr";
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

    const asrStarted = Date.now();
    const rawText = await transcribeAudio(audioFile, parsed.language, settings);
    const asrMs = Date.now() - asrStarted;

    const glossaryStarted = Date.now();
    const correctedText = await correctByGlossary(rawText, terms, settings);
    const glossaryMs = Date.now() - glossaryStarted;

    const optimizeStarted = Date.now();
    const polishedText = await optimizeText(correctedText, settings);
    const optimizeMs = Date.now() - optimizeStarted;

    const totalMs = Date.now() - started;

    const record = await saveSegmentRecord({
      sessionId: parsed.sessionId,
      segmentIndex: parsed.segmentIndex,
      rawText,
      correctedText,
      polishedText,
      timingMs: totalMs
    });

    return ok({
      segmentId: record.segmentId,
      sessionId: record.sessionId,
      segmentIndex: record.segmentIndex,
      rawText: record.rawText,
      correctedText: record.correctedText,
      polishedText: record.polishedText,
      asrMs,
      glossaryMs,
      optimizeMs,
      timing: record.timingMs
    });
  } catch (error) {
    if (error instanceof AsrConfigError) {
      return fail(error.message, 503);
    }

    if (error instanceof AsrProviderError) {
      return fail(error.message, 502);
    }

    if (error instanceof ZodError) {
      return fail("Invalid segment request", 400, error);
    }

    return fail("Failed to recognize segment", 500, error);
  }
}
