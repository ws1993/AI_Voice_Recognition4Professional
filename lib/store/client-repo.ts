/**
 * 客户端存储仓库 - 用于浏览器端存储和访问标准条目库、术语库
 *
 * 使用场景：
 * - 无数据库模式：所有数据存储在 IndexedDB
 * - 客户端术语匹配：在浏览器端进行术语替换
 * - 客户端条目匹配：在浏览器端进行语义匹配（需要 Embedding.js）
 */

"use client";

import {
  getClauses,
  getTerms,
  putBatch,
  clear,
  STORES,
  put as idbPut
} from "@/lib/db/indexeddb";
import type { AppSettings, GlossaryTerm, SafetyClause } from "@/types/contracts";
import type { SafetyClauseDB, GlossaryTermDB } from "@/lib/db/indexeddb";

/**
 * 默认应用设置（客户端硬编码，避免导入 node:fs）
 */
function getDefaultAppSettings(): AppSettings {
  return {
    providers: [
      {
        id: "provider-asr-default",
        kind: "asr",
        name: "ASR Provider",
        baseUrl: "",
        model: "whisper-large-v3",
        apiKeyEnvName: "ASR_API_KEY",
        apiStyle: "audio_transcription",
        enabled: true
      },
      {
        id: "provider-llm-default",
        kind: "llm",
        name: "LLM Provider",
        baseUrl: "",
        model: "qwen-plus",
        apiKeyEnvName: "LLM_API_KEY",
        apiStyle: "chat_completions",
        enabled: true
      },
      {
        id: "provider-embedding-default",
        kind: "embedding",
        name: "Embedding Provider",
        baseUrl: "",
        model: "text-embedding-v3",
        apiKeyEnvName: "EMBEDDING_API_KEY",
        apiStyle: "embeddings",
        enabled: true
      }
    ],
    prompts: {
      textOptimize: "请优化以下文本，使其更加规范和专业",
      noticeGenerate: "请根据以下识别结果生成安监整改通知单"
    },
    recognition: {
      language: "zh-CN",
      silenceMs: 3000,
      maxSegmentSeconds: 30,
      asrRetries: 1,
      llmRetries: 1
    }
  };
}

function normalizeAppSettings(settings: AppSettings): AppSettings {
  return settings;
}

/**
 * 客户端术语匹配 - 在浏览器端进行术语替换
 */
export function applyGlossaryToText(text: string, terms: GlossaryTerm[]): string {
  let result = text;

  // 按优先级排序，优先处理高优先级术语
  const sortedTerms = [...terms].sort((a, b) => b.priority - a.priority);

  for (const term of sortedTerms) {
    if (!term.enabled) continue;

    // 替换标准名称
    const aliases = [term.canonical, ...(term.aliases || [])];
    for (const alias of aliases) {
      if (!alias) continue;

      // 使用正则表达式进行全词匹配（避免部分匹配）
      const regex = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "gi");
      result = result.replace(regex, term.canonical);
    }
  }

  return result;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 客户端存储类 - 统一管理浏览器端数据访问
 */
export class ClientStore {
  private clauseCache: SafetyClause[] = [];
  private termCache: GlossaryTerm[] = [];
  private settingsCache: AppSettings | null = null;
  private lastLoadTime: number = 0;
  private cacheTtlMs: number = 60000; // 1 分钟缓存

  /**
   * 从 IndexedDB 加载标准条目库
   */
  async loadClauses(forceRefresh = false): Promise<SafetyClause[]> {
    const now = Date.now();
    if (!forceRefresh && this.clauseCache.length > 0 && now - this.lastLoadTime < this.cacheTtlMs) {
      return this.clauseCache;
    }

    try {
      const clauses = await getClauses();
      this.clauseCache = clauses.map((c) => ({
        ...c,
        keywords: c.keywords || [],
        embedding: c.embedding || []
      }));
      this.lastLoadTime = now;
      return this.clauseCache;
    } catch (error) {
      console.error("Failed to load clauses from IndexedDB", error);
      return [];
    }
  }

  /**
   * 从 IndexedDB 加载术语库
   */
  async loadTerms(forceRefresh = false): Promise<GlossaryTerm[]> {
    const now = Date.now();
    if (!forceRefresh && this.termCache.length > 0 && now - this.lastLoadTime < this.cacheTtlMs) {
      return this.termCache;
    }

    try {
      const terms = await getTerms();
      this.termCache = terms.map((t) => ({
        ...t,
        aliases: t.aliases || [],
        enabled: t.enabled ?? true
      }));
      this.lastLoadTime = now;
      return this.termCache;
    } catch (error) {
      console.error("Failed to load terms from IndexedDB", error);
      return [];
    }
  }

  /**
   * 获取应用设置（默认值）
   */
  getSettings(): AppSettings {
    if (!this.settingsCache) {
      this.settingsCache = getDefaultAppSettings();
    }
    return normalizeAppSettings(this.settingsCache);
  }

  /**
   * 保存设置到 IndexedDB
   */
  async saveSettings(settings: AppSettings): Promise<void> {
    this.settingsCache = normalizeAppSettings(settings);
    await idbPut(STORES.SETTINGS, {
      id: "default",
      payload: settings,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * 批量导入标准条目
   */
  async importClauses(clauses: SafetyClause[]): Promise<number> {
    const dbClauses: SafetyClauseDB[] = clauses.map((c) => ({
      id: c.id,
      clauseCode: c.clauseCode,
      title: c.title,
      content: c.content,
      category: c.category,
      keywords: c.keywords,
      embedding: c.embedding ?? undefined,
      createdAt: c.createdAt || new Date().toISOString(),
      updatedAt: c.updatedAt || new Date().toISOString()
    }));

    await clear(STORES.CLAUSES);
    await putBatch(STORES.CLAUSES, dbClauses);

    // 清空缓存
    this.clauseCache = [];
    await this.loadClauses(true);

    return clauses.length;
  }

  /**
   * 批量导入术语
   */
  async importTerms(terms: GlossaryTerm[]): Promise<number> {
    const dbTerms: GlossaryTermDB[] = terms.map((t) => ({
      id: t.id,
      canonical: t.canonical,
      aliases: t.aliases,
      priority: t.priority,
      enabled: t.enabled,
      createdAt: t.createdAt || new Date().toISOString(),
      updatedAt: t.updatedAt || new Date().toISOString()
    }));

    await clear(STORES.TERMS);
    await putBatch(STORES.TERMS, dbTerms);

    // 清空缓存
    this.termCache = [];
    await this.loadTerms(true);

    return terms.length;
  }

  /**
   * 清空所有数据
   */
  async clearAll(): Promise<void> {
    this.clauseCache = [];
    this.termCache = [];
    this.settingsCache = null;
    this.lastLoadTime = 0;

    for (const storeName of Object.values(STORES)) {
      try {
        await clear(storeName);
      } catch (error) {
        console.error(`Failed to clear store ${storeName}`, error);
      }
    }
  }

  /**
   * 导出数据
   */
  async exportData(): Promise<Record<string, unknown>> {
    const clauses = await this.loadClauses(true);
    const terms = await this.loadTerms(true);

    return {
      clauses,
      terms,
      settings: this.getSettings(),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * 在客户端进行文本术语匹配
   */
  async applyTerminology(text: string): Promise<string> {
    const terms = await this.loadTerms();
    return applyGlossaryToText(text, terms);
  }

  /**
   * 获取缓存的标准条目数量
   */
  getClausesCount(): number {
    return this.clauseCache.length;
  }

  /**
   * 获取缓存的术语数量
   */
  getTermsCount(): number {
    return this.termCache.length;
  }
}

// 单例模式
let clientStoreInstance: ClientStore | null = null;

export function getClientStore(): ClientStore {
  if (!clientStoreInstance) {
    clientStoreInstance = new ClientStore();
  }
  return clientStoreInstance;
}

/**
 * 检查是否支持客户端存储模式
 */
export function isClientStorageAvailable(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return typeof indexedDB !== "undefined";
}
