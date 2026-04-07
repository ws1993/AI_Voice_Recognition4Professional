"use client";

import { useEffect, useState } from "react";

import { useAdminKey } from "@/app/admin/_components/use-admin-key";
import {
  getTerms,
  putTerm,
  deleteTerm,
  isIndexedDBAvailable
} from "@/lib/db/indexeddb";
import type { GlossaryTermDB } from "@/lib/db/indexeddb";

type Term = {
  id: string;
  canonical: string;
  aliases: string[];
  priority: number;
  enabled: boolean;
};

export default function AdminTermsPage() {
  const { adminKey, save } = useAdminKey();
  const [terms, setTerms] = useState<Term[]>([]);
  const [message, setMessage] = useState("IndexedDB 模式：数据存储在浏览器本地");
  const [canonical, setCanonical] = useState("");
  const [aliases, setAliases] = useState("");
  const [priority, setPriority] = useState(100);
  const [enabled, setEnabled] = useState(true);
  const [storageMode, setStorageMode] = useState<"indexeddb" | "server">("indexeddb");

  // 检查 IndexedDB 可用性
  useEffect(() => {
    const available = isIndexedDBAvailable();
    if (!available) {
      setMessage("当前浏览器不支持 IndexedDB，已切换到服务器模式");
      setStorageMode("server");
    }
  }, []);

  // 从 IndexedDB 加载术语
  async function loadTermsFromIndexedDB() {
    try {
      const dbTerms = await getTerms();
      setTerms(dbTerms as Term[]);
      setMessage(`IndexedDB 术语数：${dbTerms.length}`);
    } catch (error) {
      console.error("Failed to load terms from IndexedDB", error);
      setMessage("IndexedDB 加载失败");
    }
  }

  // 从服务器加载术语（备用模式）
  async function loadTermsFromServer() {
    if (!adminKey) {
      setMessage("请先输入管理密钥");
      return;
    }
    try {
      const response = await fetch("/api/admin/terms", {
        headers: {
          "x-admin-key": adminKey
        }
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { terms: Term[] };
      setTerms(data.terms);
      setMessage(`服务器术语数：${data.terms.length}`);
    } catch (error) {
      console.error(error);
      setMessage("加载术语失败");
    }
  }

  async function loadTerms() {
    if (storageMode === "indexeddb") {
      await loadTermsFromIndexedDB();
    } else {
      await loadTermsFromServer();
    }
  }

  useEffect(() => {
    if (storageMode === "indexeddb") {
      void loadTermsFromIndexedDB();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageMode]);

  // 添加术语到 IndexedDB
  async function addTermToIndexedDB() {
    if (!canonical.trim()) {
      setMessage("请输入标准术语");
      return;
    }

    try {
      const newTerm: GlossaryTermDB = {
        id: `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        canonical: canonical.trim(),
        aliases: aliases
          .split(/[,，;；]/)
          .map((item) => item.trim())
          .filter(Boolean),
        priority,
        enabled,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await putTerm(newTerm);
      setCanonical("");
      setAliases("");
      setPriority(100);
      setEnabled(true);
      await loadTermsFromIndexedDB();
    } catch (error) {
      console.error("Failed to add term to IndexedDB", error);
      setMessage("新增术语失败");
    }
  }

  async function addTerm() {
    if (storageMode === "indexeddb") {
      await addTermToIndexedDB();
      return;
    }

    // 服务器模式
    if (!canonical.trim()) {
      setMessage("请输入标准术语");
      return;
    }
    try {
      const response = await fetch("/api/admin/terms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey
        },
        body: JSON.stringify({
          canonical: canonical.trim(),
          aliases: aliases
            .split(/[,，;；]/)
            .map((item) => item.trim())
            .filter(Boolean),
          priority,
          enabled
        })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setCanonical("");
      setAliases("");
      setPriority(100);
      setEnabled(true);
      await loadTerms();
    } catch (error) {
      console.error(error);
      setMessage("新增术语失败");
    }
  }

  async function toggleTermToIndexedDB(item: Term) {
    try {
      const updatedTerm: GlossaryTermDB = {
        ...item,
        enabled: !item.enabled,
        updatedAt: new Date().toISOString()
      } as GlossaryTermDB;

      await putTerm(updatedTerm);
      await loadTermsFromIndexedDB();
    } catch (error) {
      console.error("Failed to update term in IndexedDB", error);
      setMessage("更新术语失败");
    }
  }

  async function toggleTerm(item: Term) {
    if (storageMode === "indexeddb") {
      await toggleTermToIndexedDB(item);
      return;
    }

    // 服务器模式
    try {
      const response = await fetch(`/api/admin/terms/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey
        },
        body: JSON.stringify({
          canonical: item.canonical,
          aliases: item.aliases,
          priority: item.priority,
          enabled: !item.enabled
        })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await loadTerms();
    } catch (error) {
      console.error(error);
      setMessage("更新术语失败");
    }
  }

  async function removeTermFromIndexedDB(id: string) {
    try {
      await deleteTerm(id);
      await loadTermsFromIndexedDB();
    } catch (error) {
      console.error("Failed to delete term from IndexedDB", error);
      setMessage("删除术语失败");
    }
  }

  async function remove(id: string) {
    if (storageMode === "indexeddb") {
      await removeTermFromIndexedDB(id);
      return;
    }

    // 服务器模式
    try {
      const response = await fetch(`/api/admin/terms/${id}`, {
        method: "DELETE",
        headers: {
          "x-admin-key": adminKey
        }
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await loadTerms();
    } catch (error) {
      console.error(error);
      setMessage("删除术语失败");
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
      <h3 style={{ marginTop: 0 }}>术语库管理</h3>

      <div className="row" style={{ marginBottom: 10 }}>
        <span className="meta">
          存储模式：{storageMode === "indexeddb" ? "IndexedDB（浏览器本地）" : "服务器数据库"}
        </span>
        <button className="btn-secondary" onClick={toggleStorageMode}>
          切换到{storageMode === "indexeddb" ? "服务器" : "IndexedDB"}模式
        </button>
      </div>

      {storageMode === "server" && (
        <label>管理密钥（X-Admin-Key）</label>
      )}
      {storageMode === "server" && (
        <input value={adminKey} onChange={(e) => save(e.target.value)} />
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn-secondary" onClick={() => void loadTerms()}>
          刷新术语列表
        </button>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <h4 style={{ marginTop: 0 }}>新增术语</h4>
        <label>标准术语</label>
        <input value={canonical} onChange={(e) => setCanonical(e.target.value)} />
        <label style={{ marginTop: 8, display: "block" }}>别名（逗号分隔）</label>
        <input value={aliases} onChange={(e) => setAliases(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label>优先级</label>
            <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label>状态</label>
            <select value={enabled ? "enabled" : "disabled"} onChange={(e) => setEnabled(e.target.value === "enabled")}>
              <option value="enabled">启用</option>
              <option value="disabled">禁用</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn-primary" onClick={() => void addTerm()}>
            新增
          </button>
        </div>
      </div>

      <p className="meta">{message}</p>

      {terms.map((item) => (
        <div className="segment-item" key={item.id}>
          <strong>{item.canonical}</strong>
          <p className="meta">别名：{item.aliases.join(" / ") || "无"}</p>
          <p className="meta">优先级：{item.priority}</p>
          <p className="meta">状态：{item.enabled ? "启用" : "禁用"}</p>
          <div className="row">
            <button className="btn-secondary" onClick={() => void toggleTerm(item)}>
              {item.enabled ? "禁用" : "启用"}
            </button>
            <button className="btn-danger" onClick={() => void remove(item.id)}>
              删除
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
