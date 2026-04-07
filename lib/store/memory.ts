import { normalizeAppSettings } from "@/lib/config/providers";
import { getDefaultAppSettings } from "@/lib/config/runtime";
import {
  getSettings as getIdbSettings,
  putSettings as putIdbSettings
} from "@/lib/db/indexeddb";
import { makeId, nowIso } from "@/lib/utils/ids";
import type {
  AppSettings,
  GlossaryTerm,
  NoticeReport,
  ProviderProfile,
  SafetyClause,
  SegmentResult
} from "@/types/contracts";

type SessionRecord = {
  id: string;
  source: "realtime" | "upload";
  deviceMeta: Record<string, unknown>;
  createdAt: string;
};

type DataStore = {
  settings: AppSettings;
  sessions: SessionRecord[];
  segments: SegmentResult[];
  reports: NoticeReport[];
  terms: GlossaryTerm[];
  clauses: SafetyClause[];
};

declare global {
  var __memStore: DataStore | undefined;
}

function initStore(): DataStore {
  const defaults = getDefaultAppSettings();
  return {
    settings: defaults,
    sessions: [],
    segments: [],
    reports: [],
    terms: [],
    clauses: []
  };
}

function store(): DataStore {
  if (!global.__memStore) {
    global.__memStore = initStore();
  }
  return global.__memStore;
}

export function getSettings(): AppSettings {
  return normalizeAppSettings(store().settings);
}

export async function loadSettingsFromIndexedDb(): Promise<AppSettings> {
  const idbSettings = await getIdbSettings();
  if (idbSettings?.payload) {
    const payload = idbSettings.payload as AppSettings;
    // 检查数据完整性，缺少字段则使用默认值
    if (!payload.prompts || !payload.recognition || !payload.providers) {
      return getDefaultAppSettings();
    }
    return normalizeAppSettings(payload);
  }
  return getDefaultAppSettings();
}

export async function saveSettingsToIndexedDb(next: AppSettings): Promise<AppSettings> {
  const normalized = normalizeAppSettings(next);
  store().settings = normalized;
  await putIdbSettings({
    id: "default",
    payload: normalized,
    updatedAt: nowIso()
  });
  return normalized;
}

export function saveSettings(next: AppSettings): AppSettings {
  const normalized = normalizeAppSettings(next);
  store().settings = normalized;
  return normalized;
}

export function createSession(source: "realtime" | "upload", deviceMeta: Record<string, unknown> = {}) {
  const session = {
    id: makeId("sess"),
    source,
    deviceMeta,
    createdAt: nowIso()
  };
  store().sessions.push(session);
  return session;
}

export function getSession(sessionId: string): SessionRecord | undefined {
  return store().sessions.find((item) => item.id === sessionId);
}

export function saveSegment(input: Omit<SegmentResult, "segmentId" | "createdAt">): SegmentResult {
  const segment: SegmentResult = {
    segmentId: makeId("seg"),
    createdAt: nowIso(),
    ...input
  };

  const all = store().segments;
  const exists = all.find(
    (item) => item.sessionId === segment.sessionId && item.segmentIndex === segment.segmentIndex
  );
  if (exists) {
    Object.assign(exists, segment);
    return exists;
  }

  all.push(segment);
  return segment;
}

export function listSegments(sessionId: string): SegmentResult[] {
  return store()
    .segments.filter((item) => item.sessionId === sessionId)
    .sort((a, b) => a.segmentIndex - b.segmentIndex);
}

export function createReport(
  input: Omit<NoticeReport, "noticeId" | "createdAt"> & { noticeId?: string; createdAt?: string }
): NoticeReport {
  const reportId = input.noticeId ?? makeId("notice");
  const createdAt = input.createdAt ?? nowIso();
  const report: NoticeReport = {
    noticeId: reportId,
    createdAt,
    ...input
  };

  const reports = store().reports;
  const index = reports.findIndex((item) => item.noticeId === reportId);
  if (index >= 0) {
    reports[index] = report;
  } else {
    reports.push(report);
  }
  return report;
}

export function getReport(noticeId: string): NoticeReport | undefined {
  return store().reports.find((item) => item.noticeId === noticeId);
}

export function listTerms(): GlossaryTerm[] {
  return [...store().terms].sort((a, b) => a.priority - b.priority);
}

export function upsertTerm(
  input: Pick<GlossaryTerm, "canonical" | "aliases" | "priority" | "enabled"> & { id?: string }
): GlossaryTerm {
  const all = store().terms;
  if (input.id) {
    const found = all.find((item) => item.id === input.id);
    if (found) {
      found.canonical = input.canonical;
      found.aliases = input.aliases;
      found.priority = input.priority;
      found.enabled = input.enabled;
      found.updatedAt = nowIso();
      return found;
    }
  }
  const created: GlossaryTerm = {
    id: makeId("term"),
    canonical: input.canonical,
    aliases: input.aliases,
    priority: input.priority,
    enabled: input.enabled,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  all.push(created);
  return created;
}

export function deleteTerm(id: string): boolean {
  const all = store().terms;
  const index = all.findIndex((item) => item.id === id);
  if (index < 0) {
    return false;
  }
  all.splice(index, 1);
  return true;
}

export function listClauses(): SafetyClause[] {
  return [...store().clauses];
}

export function replaceClauses(input: SafetyClause[]): { count: number } {
  store().clauses = input;
  return { count: input.length };
}

export function upsertProviderProfiles(input: ProviderProfile[]): AppSettings {
  const current = getSettings();
  const next = {
    ...current,
    providers: input
  };
  return saveSettings(next);
}
