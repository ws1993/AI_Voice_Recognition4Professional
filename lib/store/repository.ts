import { and, asc, eq } from "drizzle-orm";

import { normalizeAppSettings } from "@/lib/config/providers";
import { getDefaultAppSettings } from "@/lib/config/runtime";
import { getDb } from "@/lib/db/client";
import {
  appSettings as appSettingsTable,
  glossaryTerms as glossaryTermsTable,
  noticeReports as noticeReportsTable,
  recognitionSegments as recognitionSegmentsTable,
  recognitionSessions as recognitionSessionsTable,
  safetyClauses as safetyClausesTable
} from "@/lib/db/schema";
import {
  createReport,
  createSession,
  getReport,
  getSession,
  getSettings,
  listClauses,
  listSegments,
  replaceClauses,
  saveSegment,
  saveSettings
} from "@/lib/store/memory";
import { readLocalTerms, removeLocalTerm, writeLocalTerm } from "@/lib/store/local-terms";
import { makeId, nowIso } from "@/lib/utils/ids";
import type { AppSettings, GlossaryTerm, NoticeItem, SafetyClause, SegmentResult } from "@/types/contracts";

const SETTINGS_ID = "default";

function dateToIso(value: Date | string | null | undefined): string {
  if (!value) {
    return nowIso();
  }
  return typeof value === "string" ? value : value.toISOString();
}

export async function createSessionRecord(source: "realtime" | "upload", deviceMeta: Record<string, unknown>) {
  const db = getDb();
  if (!db) {
    return createSession(source, deviceMeta);
  }

  const id = makeId("sess");
  const [row] = await db
    .insert(recognitionSessionsTable)
    .values({
      id,
      source,
      deviceMeta
    })
    .returning();

  return {
    id: row.id,
    source: row.source as "realtime" | "upload",
    deviceMeta: row.deviceMeta as Record<string, unknown>,
    createdAt: dateToIso(row.createdAt)
  };
}

export async function ensureSessionExists(sessionId: string): Promise<boolean> {
  const db = getDb();
  if (!db) {
    return Boolean(getSession(sessionId));
  }
  const row = await db
    .select({ id: recognitionSessionsTable.id })
    .from(recognitionSessionsTable)
    .where(eq(recognitionSessionsTable.id, sessionId))
    .limit(1);
  return row.length > 0;
}

export async function saveSegmentRecord(input: Omit<SegmentResult, "segmentId" | "createdAt">): Promise<SegmentResult> {
  const db = getDb();
  if (!db) {
    return saveSegment(input);
  }

  const existing = await db
    .select()
    .from(recognitionSegmentsTable)
    .where(
      and(
        eq(recognitionSegmentsTable.sessionId, input.sessionId),
        eq(recognitionSegmentsTable.segmentIndex, input.segmentIndex)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(recognitionSegmentsTable)
      .set({
        rawText: input.rawText,
        correctedText: input.correctedText,
        polishedText: input.polishedText,
        timingMs: input.timingMs
      })
      .where(eq(recognitionSegmentsTable.id, existing[0].id))
      .returning();
    return {
      segmentId: updated.id,
      sessionId: updated.sessionId,
      segmentIndex: updated.segmentIndex,
      rawText: updated.rawText,
      correctedText: updated.correctedText,
      polishedText: updated.polishedText,
      timingMs: updated.timingMs,
      createdAt: dateToIso(updated.createdAt)
    };
  }

  const id = makeId("seg");
  const [created] = await db
    .insert(recognitionSegmentsTable)
    .values({
      id,
      sessionId: input.sessionId,
      segmentIndex: input.segmentIndex,
      rawText: input.rawText,
      correctedText: input.correctedText,
      polishedText: input.polishedText,
      timingMs: input.timingMs
    })
    .returning();
  return {
    segmentId: created.id,
    sessionId: created.sessionId,
    segmentIndex: created.segmentIndex,
    rawText: created.rawText,
    correctedText: created.correctedText,
    polishedText: created.polishedText,
    timingMs: created.timingMs,
    createdAt: dateToIso(created.createdAt)
  };
}

export async function listSessionSegments(sessionId: string) {
  const db = getDb();
  if (!db) {
    return listSegments(sessionId);
  }
  const rows = await db
    .select()
    .from(recognitionSegmentsTable)
    .where(eq(recognitionSegmentsTable.sessionId, sessionId))
    .orderBy(asc(recognitionSegmentsTable.segmentIndex));
  return rows.map((row) => ({
    segmentId: row.id,
    sessionId: row.sessionId,
    segmentIndex: row.segmentIndex,
    rawText: row.rawText,
    correctedText: row.correctedText,
    polishedText: row.polishedText,
    timingMs: row.timingMs,
    createdAt: dateToIso(row.createdAt)
  }));
}

export async function readSettings(): Promise<AppSettings> {
  const db = getDb();
  if (!db) {
    return getSettings();
  }

  const row = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, SETTINGS_ID)).limit(1);
  if (row.length === 0) {
    const defaults = getDefaultAppSettings();
    await db.insert(appSettingsTable).values({
      id: SETTINGS_ID,
      payload: defaults
    });
    return defaults;
  }
  return normalizeAppSettings(row[0].payload as AppSettings);
}

export async function writeSettings(input: AppSettings): Promise<AppSettings> {
  const db = getDb();
  const normalized = normalizeAppSettings(input);
  if (!db) {
    return saveSettings(normalized);
  }
  await db
    .insert(appSettingsTable)
    .values({
      id: SETTINGS_ID,
      payload: normalized
    })
    .onConflictDoUpdate({
      target: appSettingsTable.id,
      set: {
        payload: normalized,
        updatedAt: new Date()
      }
    });
  return normalized;
}

export async function readTerms(): Promise<GlossaryTerm[]> {
  const db = getDb();
  if (!db) {
    return readLocalTerms();
  }
  const rows = await db.select().from(glossaryTermsTable).orderBy(asc(glossaryTermsTable.priority));
  return rows.map((row) => ({
    id: row.id,
    canonical: row.canonical,
    aliases: row.aliases as string[],
    priority: row.priority,
    enabled: row.enabled,
    createdAt: dateToIso(row.createdAt),
    updatedAt: dateToIso(row.updatedAt)
  }));
}

export async function writeTerm(input: {
  id?: string;
  canonical: string;
  aliases: string[];
  priority: number;
  enabled: boolean;
}): Promise<GlossaryTerm> {
  const db = getDb();
  if (!db) {
    return writeLocalTerm(input);
  }

  const id = input.id ?? makeId("term");
  const now = new Date();
  await db
    .insert(glossaryTermsTable)
    .values({
      id,
      canonical: input.canonical,
      aliases: input.aliases,
      priority: input.priority,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: glossaryTermsTable.id,
      set: {
        canonical: input.canonical,
        aliases: input.aliases,
        priority: input.priority,
        enabled: input.enabled,
        updatedAt: now
      }
    });

  const row = await db.select().from(glossaryTermsTable).where(eq(glossaryTermsTable.id, id)).limit(1);
  const found = row[0];
  return {
    id: found.id,
    canonical: found.canonical,
    aliases: found.aliases as string[],
    priority: found.priority,
    enabled: found.enabled,
    createdAt: dateToIso(found.createdAt),
    updatedAt: dateToIso(found.updatedAt)
  };
}

export async function removeTerm(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) {
    return removeLocalTerm(id);
  }
  const result = await db.delete(glossaryTermsTable).where(eq(glossaryTermsTable.id, id)).returning();
  return result.length > 0;
}

export async function readClauses(): Promise<SafetyClause[]> {
  const db = getDb();
  if (!db) {
    return listClauses();
  }
  const rows = await db.select().from(safetyClausesTable);
  return rows.map((row) => ({
    id: row.id,
    clauseCode: row.clauseCode,
    title: row.title,
    content: row.content,
    category: row.category,
    keywords: row.keywords as string[],
    embedding: row.embedding,
    createdAt: dateToIso(row.createdAt),
    updatedAt: dateToIso(row.updatedAt)
  }));
}

export async function writeClauses(input: SafetyClause[]): Promise<{ count: number }> {
  const db = getDb();
  if (!db) {
    return replaceClauses(input);
  }

  await db.transaction(async (tx) => {
    await tx.delete(safetyClausesTable);
    if (input.length > 0) {
      await tx.insert(safetyClausesTable).values(
        input.map((item) => ({
          id: item.id,
          clauseCode: item.clauseCode,
          title: item.title,
          content: item.content,
          category: item.category,
          keywords: item.keywords,
          embedding: item.embedding,
          createdAt: new Date(item.createdAt),
          updatedAt: new Date(item.updatedAt)
        }))
      );
    }
  });
  return { count: input.length };
}

export async function writeNoticeReport(input: {
  noticeId?: string;
  createdAt?: string;
  sessionId: string;
  enterpriseName: string;
  inspector?: string;
  inspectedAt?: string;
  items: NoticeItem[];
  pdfUrl: string;
}) {
  const db = getDb();
  if (!db) {
    return createReport(input);
  }

  const id = input.noticeId ?? makeId("notice");
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();

  await db
    .insert(noticeReportsTable)
    .values({
      id,
      sessionId: input.sessionId,
      enterpriseName: input.enterpriseName,
      inspector: input.inspector,
      inspectedAt: input.inspectedAt,
      items: input.items,
      pdfUrl: input.pdfUrl,
      createdAt
    })
    .onConflictDoUpdate({
      target: noticeReportsTable.id,
      set: {
        sessionId: input.sessionId,
        enterpriseName: input.enterpriseName,
        inspector: input.inspector,
        inspectedAt: input.inspectedAt,
        items: input.items,
        pdfUrl: input.pdfUrl,
        createdAt
      }
    });

  const row = await db.select().from(noticeReportsTable).where(eq(noticeReportsTable.id, id)).limit(1);
  const found = row[0];
  return {
    noticeId: found.id,
    sessionId: found.sessionId,
    enterpriseName: found.enterpriseName,
    inspector: found.inspector ?? undefined,
    inspectedAt: found.inspectedAt ?? undefined,
    items: found.items as NoticeItem[],
    pdfUrl: found.pdfUrl,
    createdAt: dateToIso(found.createdAt)
  };
}

export async function readNoticeReport(noticeId: string) {
  const db = getDb();
  if (!db) {
    return getReport(noticeId);
  }
  const row = await db.select().from(noticeReportsTable).where(eq(noticeReportsTable.id, noticeId)).limit(1);
  if (row.length === 0) {
    return null;
  }
  const found = row[0];
  return {
    noticeId: found.id,
    sessionId: found.sessionId,
    enterpriseName: found.enterpriseName,
    inspector: found.inspector ?? undefined,
    inspectedAt: found.inspectedAt ?? undefined,
    items: found.items as NoticeItem[],
    pdfUrl: found.pdfUrl,
    createdAt: dateToIso(found.createdAt)
  };
}
