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
      return;
    }

    setBusy(true);
    try {
      // 使用 FileReader 读取文件
      const text = await file.text();

      // 解析 CSV 或 JSON
      let importedClauses: Clause[] = [];

      if (file.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          importedClauses = parsed as Clause[];
        }
      } else {
        // CSV 解析（简单实现，假设第一行是表头）
        const lines = text.split(/\r?\n/).filter((line) => line.trim());
        if (lines.length > 1) {
          // 假设表头：clauseCode,title,content,category,keywords
          for (let i = 1; i < lines.length; i++) {
            const match = lines[i].match(/("([^"]*)"|([^",]*))(,|$)/g);
            if (match && match.length >= 4) {
              const extract = (val: string) => val.replace(/^"|"$/g, "").trim();
              importedClauses.push({
                id: `clause_${Date.now()}_${i}`,
                clauseCode: extract(match[0]?.replace(/,$/, "") || ""),
                title: extract(match[1]?.replace(/,$/, "") || ""),
                content: extract(match[2]?.replace(/,$/, "") || ""),
                category: extract(match[3]?.replace(/,$/, "") || "通用"),
                keywords: []
              });
            }
          }
        }
      }

      if (importedClauses.length === 0) {
        setMessage("未找到可导入的数据");
        return;
      }

      // 保存到 IndexedDB
      await saveClausesToIndexedDB(importedClauses);
      setMessage(`导入成功：${importedClauses.length} 条（IndexedDB）`);
    } catch (error) {
      console.error("Import failed", error);
      setMessage("导入失败，请检查文件格式");
    } finally {
      setBusy(false);
    }
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

      <label style={{ marginTop: 10, display: "block" }}>导入 CSV/XLSX/JSON</label>
      <input
        type="file"
        accept=".csv,.xlsx,.xls,.json"
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
