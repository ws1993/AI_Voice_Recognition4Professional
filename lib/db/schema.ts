import { boolean, customType, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const vector = customType<{ data: number[] | null; driverData: string | null }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value) {
    if (!value || value.length === 0) {
      return null;
    }
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    if (!value) {
      return null;
    }
    const normalized = value.replace(/^\[|\]$/g, "");
    if (!normalized) {
      return [];
    }
    return normalized.split(",").map((item) => Number(item.trim()));
  }
});

export const providerProfiles = pgTable("provider_profiles", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  apiKeyEnvName: text("api_key_env_name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const promptTemplates = pgTable("prompt_templates", {
  id: text("id").primaryKey(),
  textOptimize: text("text_optimize").notNull(),
  noticeGenerate: text("notice_generate").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey(),
  payload: jsonb("payload")
    .$type<{
      providers: Array<{
        id: string;
        kind: string;
        name: string;
        baseUrl: string;
        model: string;
        apiKeyEnvName: string;
        apiStyle: string;
        enabled: boolean;
      }>;
      prompts: {
        textOptimize: string;
        noticeGenerate: string;
      };
      recognition: {
        language: string;
        silenceMs: number;
        maxSegmentSeconds: number;
        asrRetries: number;
        llmRetries: number;
      };
    }>()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const glossaryTerms = pgTable("glossary_terms", {
  id: text("id").primaryKey(),
  canonical: text("canonical").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  priority: integer("priority").notNull().default(100),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const safetyClauses = pgTable("safety_clauses", {
  id: text("id").primaryKey(),
  clauseCode: text("clause_code").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull(),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  embedding: vector("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const recognitionSessions = pgTable("recognition_sessions", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  deviceMeta: jsonb("device_meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const recognitionSegments = pgTable("recognition_segments", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  segmentIndex: integer("segment_index").notNull(),
  rawText: text("raw_text").notNull(),
  correctedText: text("corrected_text").notNull(),
  polishedText: text("polished_text").notNull(),
  timingMs: integer("timing_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const noticeReports = pgTable("notice_reports", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  enterpriseName: text("enterprise_name").notNull(),
  inspector: text("inspector"),
  inspectedAt: text("inspected_at"),
  items: jsonb("items").$type<
    Array<{
      problemDescription: string;
      violatedClauseCode: string;
      violatedClauseText: string;
      rectificationSuggestion: string;
      standardBasis: string;
      confidence: number;
    }>
  >()
    .notNull()
    .default([]),
  pdfUrl: text("pdf_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
