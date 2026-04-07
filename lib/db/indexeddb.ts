/**
 * IndexedDB 工具库 - 用于浏览器端存储标准条目库和术语库
 *
 * 使用方式：
 * - 无数据库模式：数据存储在 IndexedDB，适合本地开发和无服务器部署
 * - 数据持久化：关闭浏览器后数据依然存在
 * - 客户端操作：所有 CRUD 操作都在浏览器端完成
 */

const DB_NAME = "voice-recognition-db";
const DB_VERSION = 1;

// Store 名称
export const STORES = {
  CLAUSES: "safety_clauses",
  TERMS: "glossary_terms",
  SETTINGS: "app_settings",
  SESSIONS: "recognition_sessions",
  SEGMENTS: "recognition_segments",
  REPORTS: "notice_reports"
} as const;

// 类型定义
export type SafetyClauseDB = {
  id: string;
  clauseCode: string;
  title: string;
  content: string;
  category: string;
  keywords: string[];
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
};

export type GlossaryTermDB = {
  id: string;
  canonical: string;
  aliases: string[];
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppSettingsDB = {
  id: string;
  payload: {
    providers: Array<{
      id: string;
      kind: string;
      name: string;
      baseUrl: string;
      model: string;
      apiKey: string;
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
  };
  updatedAt: string;
};

// 数据库实例缓存
let dbInstance: IDBDatabase | null = null;

/**
 * 打开数据库连接
 */
export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Failed to open IndexedDB", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建标准条目库 store
      if (!db.objectStoreNames.contains(STORES.CLAUSES)) {
        const clauseStore = db.createObjectStore(STORES.CLAUSES, { keyPath: "id" });
        clauseStore.createIndex("clauseCode", "clauseCode", { unique: true });
        clauseStore.createIndex("category", "category", { unique: false });
      }

      // 创建术语库 store
      if (!db.objectStoreNames.contains(STORES.TERMS)) {
        const termStore = db.createObjectStore(STORES.TERMS, { keyPath: "id" });
        termStore.createIndex("canonical", "canonical", { unique: true });
        termStore.createIndex("priority", "priority", { unique: false });
      }

      // 创建应用设置 store
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: "id" });
      }

      // 创建会话 store
      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        const sessionStore = db.createObjectStore(STORES.SESSIONS, { keyPath: "id" });
        sessionStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // 创建识别片段 store
      if (!db.objectStoreNames.contains(STORES.SEGMENTS)) {
        const segmentStore = db.createObjectStore(STORES.SEGMENTS, { keyPath: "id" });
        segmentStore.createIndex("sessionId", "sessionId", { unique: false });
        segmentStore.createIndex("segmentIndex", "segmentIndex", { unique: false });
      }

      // 创建通知单 store
      if (!db.objectStoreNames.contains(STORES.REPORTS)) {
        const reportStore = db.createObjectStore(STORES.REPORTS, { keyPath: "noticeId" });
        reportStore.createIndex("sessionId", "sessionId", { unique: false });
      }
    };
  });
}

/**
 * 通用 CRUD 操作
 */

// 读取所有记录
export async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

// 读取单条记录
export async function get<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result as T | null);
    request.onerror = () => reject(request.error);
  });
}

// 保存记录（新增或更新）
export async function put<T>(storeName: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(value);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// 删除记录
export async function remove(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// 清空 store
export async function clear(storeName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// 批量保存
export async function putBatch<T>(storeName: string, values: T[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    for (const value of values) {
      store.put(value);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 标准条目库专用操作
 */
export async function getClauses(): Promise<SafetyClauseDB[]> {
  return getAll<SafetyClauseDB>(STORES.CLAUSES);
}

export async function putClause(clause: SafetyClauseDB): Promise<void> {
  return put<SafetyClauseDB>(STORES.CLAUSES, clause);
}

export async function putClausesBatch(clauses: SafetyClauseDB[]): Promise<void> {
  return putBatch<SafetyClauseDB>(STORES.CLAUSES, clauses);
}

export async function deleteClause(id: string): Promise<void> {
  return remove(STORES.CLAUSES, id);
}

export async function clearClauses(): Promise<void> {
  return clear(STORES.CLAUSES);
}

/**
 * 术语库专用操作
 */
export async function getTerms(): Promise<GlossaryTermDB[]> {
  return getAll<GlossaryTermDB>(STORES.TERMS);
}

export async function putTerm(term: GlossaryTermDB): Promise<void> {
  return put<GlossaryTermDB>(STORES.TERMS, term);
}

export async function deleteTerm(id: string): Promise<void> {
  return remove(STORES.TERMS, id);
}

/**
 * 应用设置专用操作
 */
export async function getSettings(): Promise<AppSettingsDB | null> {
  return get<AppSettingsDB>(STORES.SETTINGS, "default");
}

export async function putSettings(settings: AppSettingsDB): Promise<void> {
  return put<AppSettingsDB>(STORES.SETTINGS, settings);
}

/**
 * 工具函数：从 IDB 导入/导出数据
 */
export async function exportDatabase(): Promise<Record<string, unknown>> {
  const db = await openDB();
  const stores = Array.from(db.objectStoreNames);
  const result: Record<string, unknown> = {};

  for (const storeName of stores) {
    result[storeName] = await getAll(storeName);
  }

  return result;
}

export async function importDatabase(
  data: Record<string, unknown>,
  options?: { clearExisting?: boolean }
): Promise<void> {
  const db = await openDB();
  const { clearExisting = true } = options ?? {};

  if (clearExisting) {
    const tx = db.transaction(Array.from(db.objectStoreNames), "readwrite");
    for (const storeName of db.objectStoreNames) {
      tx.objectStore(storeName).clear();
    }
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
  }

  for (const [storeName, values] of Object.entries(data)) {
    if (db.objectStoreNames.contains(storeName) && Array.isArray(values)) {
      await putBatch(storeName, values);
    }
  }
}

/**
 * 检查 IndexedDB 是否可用
 */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

/**
 * 删除整个数据库（用于重置）
 */
export async function deleteDatabase(): Promise<void> {
  dbInstance = null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
