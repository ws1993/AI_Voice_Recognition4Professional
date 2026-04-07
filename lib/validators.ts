import { z } from "zod";

import { normalizeAppSettings, normalizeProviderProfile } from "@/lib/config/providers";

export const sessionCreateSchema = z.object({
  source: z.enum(["realtime", "upload"]),
  deviceMeta: z.record(z.string(), z.unknown()).optional()
});

export const providerApiStyleSchema = z.enum(["audio_transcription", "chat_audio", "chat_completions", "embeddings"]);

export const segmentFormSchema = z.object({
  sessionId: z.string().min(1),
  segmentIndex: z.coerce.number().int().nonnegative(),
  language: z.string().default("zh-CN")
});

export const enterpriseInfoSchema = z.object({
  enterpriseName: z.string().min(1),
  inspector: z.string().optional(),
  inspectedAt: z.string().optional()
});

export const editedSegmentSchema = z.object({
  segmentId: z.string().optional(),
  segmentIndex: z.number().int().nonnegative(),
  text: z.string().min(1)
});

export const submitReportSchema = z.object({
  sessionId: z.string().min(1),
  enterpriseInfo: enterpriseInfoSchema,
  editedSegments: z.array(editedSegmentSchema).min(1)
});

export const providerProfileSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["asr", "llm", "embedding"]),
    name: z.string().min(1),
    baseUrl: z.string().url(),
    model: z.string().min(1),
    apiKey: z.string(),
    apiStyle: providerApiStyleSchema.optional(),
    enabled: z.boolean().optional()
  })
  .transform((value) => ({
    ...value,
    enabled: value.enabled ?? true,
    apiStyle: value.apiStyle
  }));

export const promptTemplatesSchema = z.object({
  textOptimize: z.string().min(1),
  noticeGenerate: z.string().min(1)
});

export const recognitionConfigSchema = z.object({
  language: z.string().default("zh-CN"),
  silenceMs: z.number().int().positive(),
  maxSegmentSeconds: z.number().int().positive(),
  asrRetries: z.number().int().min(0).max(3),
  llmRetries: z.number().int().min(0).max(3)
});

export const appSettingsSchema = z
  .object({
    providers: z.array(providerProfileSchema).min(1),
    prompts: promptTemplatesSchema,
    recognition: recognitionConfigSchema
  })
  .transform((value) => normalizeAppSettings(value));

export const glossaryTermSchema = z.object({
  id: z.string().optional(),
  canonical: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  priority: z.number().int().default(100),
  enabled: z.boolean().default(true)
});

export const noticeItemSchema = z.object({
  problemDescription: z.string().min(1),
  violatedClauseCode: z.string().min(1),
  violatedClauseText: z.string().min(1),
  rectificationSuggestion: z.string().min(1),
  standardBasis: z.string().min(1),
  confidence: z.number().min(0).max(1)
});

export const noticeItemsSchema = z.array(noticeItemSchema).min(1);
