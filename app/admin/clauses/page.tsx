"use client";

import { useEffect, useState } from "react";

import { useAdminKey } from "@/app/admin/_components/use-admin-key";
import {
  getClauses,
  putClausesBatch,
  clearClauses,
  isIndexedDBAvailable,
  deleteDatabase
} from "@/lib/db/indexeddb";
import type { SafetyClauseDB } from "@/lib/db/indexeddb";

type Clause = {
  id: string;
  clauseCode: string;
  title: string;
  content: string;
  category: string;
  keywords: string[];
};

export default function AdminClausesPage() {
  const { adminKey, save } = useAdminKey();
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [message, setMessage] = useState("IndexedDB 模式：数据存储在浏览器本地");
  const [busy, setBusy] = useState(false);
  const [storageMode, setStorageMode] = useState<"indexeddb" | "server">("indexeddb");

  // 检查 IndexedDB 可用性
  useEffect(() => {
    const available = isIndexedDBAvailable();
    if (!available) {
      setMessage("当前浏览器不支持 IndexedDB，已切换到服务器模式");
      setStorageMode("server");
    }
  }, []);

  // 从 IndexedDB 加载条目
  async function loadClausesFromIndexedDB() {
    try {
      const dbClauses = await getClauses();
      setClauses(dbClauses as Clause[]);
      setMessage(`IndexedDB 条目数：${dbClauses.length}`);
    } catch (error) {
      console.error("Failed to load clauses from IndexedDB", error);
      setMessage("IndexedDB 加载失败");
    }
  }

  // 从服务器加载条目（备用模式）
  async function loadClausesFromServer() {
    if (!adminKey) {
      setMessage("请先输入管理密钥");
      return;
    }
    try {
      const response = await fetch("/api/admin/clauses", {
        headers: {
          "x-admin-key": adminKey
        }
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { clauses: Clause[] };
      setClauses(data.clauses);
      setMessage(`服务器条目数：${data.clauses.length}`);
    } catch (error) {
      console.error(error);
      setMessage("条目列表加载失败");
    }
  }

  async function loadClauses() {
    setBusy(true);
    try {
      if (storageMode === "indexeddb") {
        await loadClausesFromIndexedDB();
      } else {
        await loadClausesFromServer();
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (storageMode === "indexeddb") {
      void loadClausesFromIndexedDB();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageMode]);

  // 保存到 IndexedDB
  async function saveClausesToIndexedDB(newClauses: Clause[]) {
    setBusy(true);
    try {
      await clearClauses();
      await putClausesBatch(newClauses as SafetyClauseDB[]);
      setMessage(`保存成功：${newClauses.length} 条（IndexedDB）`);
      await loadClausesFromIndexedDB();
    } catch (error) {
      console.error("Failed to save clauses to IndexedDB", error);
      setMessage("保存到 IndexedDB 失败");
    } finally {
      setBusy(false);
    }
  }

  // 从文件导入到 IndexedDB
  async function importClausesToIndexedDB(file: File | null) {
    if (!file) {
      setMessage("请先选择文件");
      return;
    }

    setBusy(true);
    try {
      // 使用 FileReader 读取文件
      const text = await file.text();

      // 解析 CSV 或 JSON
      let importedClauses: Clause[] = [];

      if (file.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            importedClauses = parsed.map((item, idx) => ({
              id: item.id || `clause_${Date.now()}_${idx}`,
              clauseCode: item.clauseCode || item.code || item.code || "",
              title: item.title || item.name || "",
              content: item.content || item.description || "",
              category: item.category || "通用",
              keywords: item.keywords || []
            })).filter(item => item.clauseCode || item.title);
          }
        } catch {
          throw new Error("JSON 解析失败");
        }
      } else {
        // CSV 解析 - 简单健壮的实现
        const lines = text.split(/\r?\n/).filter((line) => line.trim());
        if (lines.length < 2) {
          setMessage("CSV 文件内容不足");
          setBusy(false);
          return;
        }

        // 解析表头
        const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());

        // 找到字段索引
        const getFieldIdx = (names: string[]) => {
          for (const name of names) {
            const idx = headers.findIndex(h => h.includes(name));
            if (idx !== -1) return idx;
          }
          return -1;
        };

        const codeIdx = getFieldIdx(["code", "clausecode", "cod"]);
        const titleIdx = getFieldIdx(["title", "name", "标题"]);
        const contentIdx = getFieldIdx(["content", "description", "description", "内容", "desc"]);
        const categoryIdx = getFieldIdx(["category", "cat", "分类"]);
        const keywordsIdx = getFieldIdx(["keywords", "keyword", "tags", "标签"]);

        // 解析数据行
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          if (values.length === 0 || values.every(v => !v.trim())) continue;

          const clauseCode = codeIdx !== -1 ? values[codeIdx] : values[0] || "";
          const title = titleIdx !== -1 ? values[titleIdx] : values[1] || "";
          const content = contentIdx !== -1 ? values[contentIdx] : values[2] || "";
          const category = categoryIdx !== -1 ? values[categoryIdx] : "通用";
          const keywordsStr = keywordsIdx !== -1 ? values[keywordsIdx] : "";

          if (!clauseCode && !title) continue;

          const keywords = keywordsStr
            ? keywordsStr.split(/[,;|]/).map(k => k.trim()).filter(Boolean)
            : [];

          importedClauses.push({
            id: `clause_${Date.now()}_${i}`,
            clauseCode: clauseCode.trim(),
            title: title.trim(),
            content: content.trim(),
            category: category.trim() || "通用",
            keywords
          });
        }
      }

      if (importedClauses.length === 0) {
        setMessage("未找到可导入的数据，请检查文件格式");
        setBusy(false);
        return;
      }

      // 保存到 IndexedDB
      await saveClausesToIndexedDB(importedClauses);
      setMessage(`导入成功：${importedClauses.length} 条（IndexedDB）`);
    } catch (error) {
      console.error("Import failed", error);
      setMessage(`导入失败：${error instanceof Error ? error.message : "请检查文件格式"}`);
    } finally {
      setBusy(false);
    }
  }

  // 解析 CSV 单行（处理引号）
  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          current += '"';
          i++; // 跳过下一个引号
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ",") {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  async function importClauses(file: File | null) {
    if (!file) {
      return;
    }

    if (storageMode === "indexeddb") {
      await importClausesToIndexedDB(file);
      return;
    }

    // 服务器模式
    if (!adminKey) {
      setMessage("请先输入管理密钥");
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/clauses/import", {
        method: "POST",
        headers: {
          "x-admin-key": adminKey
        },
        body: form
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { imported: number };
      setMessage(`导入成功：${data.imported} 条`);
      await loadClauses();
    } catch (error) {
      console.error(error);
      setMessage("导入失败，请检查表头字段");
    } finally {
      setBusy(false);
    }
  }

  async function reindex() {
    if (storageMode === "indexeddb") {
      setMessage("IndexedDB 模式：暂不支持向量重建");
      return;
    }

    if (!adminKey) {
      setMessage("请先输入管理密钥");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/clauses/reindex", {
        method: "POST",
        headers: {
          "x-admin-key": adminKey
        }
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { indexed: number; total: number };
      setMessage(`向量重建完成：${data.indexed}/${data.total}`);
      await loadClauses();
    } catch (error) {
      console.error(error);
      setMessage("向量重建失败，请检查 Embedding 配置");
    } finally {
      setBusy(false);
    }
  }

  // 清空 IndexedDB 数据
  async function handleReset() {
    if (!confirm("确定要清空 IndexedDB 中的所有数据吗？此操作不可恢复。")) {
      return;
    }

    setBusy(true);
    try {
      await deleteDatabase();
      setMessage("IndexedDB 已清空");
      setClauses([]);
    } catch (error) {
      console.error("Reset failed", error);
      setMessage("重置失败");
    } finally {
      setBusy(false);
    }
  }

  // 切换存储模式
  function toggleStorageMode() {
    const newMode = storageMode === "indexeddb" ? "server" : "indexeddb";
    setStorageMode(newMode);
    setMessage(`已切换到${newMode === "indexeddb" ? "IndexedDB" : "服务器"}模式`);
  }

  return (
    <section className="panel">
      <h3 style={{ marginTop: 0 }}>标准条目库管理</h3>

      <div className="row" style={{ marginBottom: 10 }}>
        <span className="meta">
          存储模式：{storageMode === "indexeddb" ? "IndexedDB（浏览器本地）" : "服务器数据库"}
        </span>
        <button className="btn-secondary" onClick={toggleStorageMode} disabled={busy}>
          切换到{storageMode === "indexeddb" ? "服务器" : "IndexedDB"}模式
        </button>
      </div>

      {storageMode === "server" && (
        <>
          <label>管理密钥（X-Admin-Key）</label>
          <input value={adminKey} onChange={(e) => save(e.target.value)} />
        </>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn-secondary" onClick={() => void loadClauses()} disabled={busy}>
          刷新列表
        </button>
        <button className="btn-primary" onClick={() => void reindex()} disabled={busy || storageMode === "indexeddb"}>
          重建向量索引
        </button>
        <button className="btn-danger" onClick={() => void handleReset()} disabled={busy || storageMode !== "indexeddb"}>
          清空 IndexedDB
        </button>
      </div>

      <label style={{ marginTop: 10, display: "block" }}>导入 CSV/JSON（暂不支持 XLSX）</label>
      <input
        type="file"
        accept=".csv,.json"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void importClauses(file);
          event.currentTarget.value = "";
        }}
      />

      <p className="meta">{message}</p>

      {clauses.slice(0, 100).map((item) => (
        <div className="segment-item" key={item.id}>
          <strong>
            {item.clauseCode} - {item.title}
          </strong>
          <p className="meta">分类：{item.category}</p>
          <p className="meta">内容：{item.content}</p>
          <p className="meta">关键词：{item.keywords.join(" / ") || "无"}</p>
        </div>
      ))}
    </section>
  );
}
