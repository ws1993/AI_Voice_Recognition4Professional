"use client";

import { useEffect, useState } from "react";

import { useAdminKey } from "@/app/admin/_components/use-admin-key";

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
  const [message, setMessage] = useState("导入 CSV/XLSX 后再执行向量重建");
  const [busy, setBusy] = useState(false);

  async function loadClauses() {
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
      setMessage(`当前条目数：${data.clauses.length}`);
    } catch (error) {
      console.error(error);
      setMessage("条目列表加载失败");
    }
  }

  useEffect(() => {
    if (adminKey) {
      void loadClauses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importClauses(file: File | null) {
    if (!file) {
      return;
    }
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

  return (
    <section className="panel">
      <h3 style={{ marginTop: 0 }}>标准条目库管理</h3>

      <label>管理密钥（X-Admin-Key）</label>
      <input value={adminKey} onChange={(e) => save(e.target.value)} />

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn-secondary" onClick={() => void loadClauses()} disabled={busy}>
          刷新列表
        </button>
        <button className="btn-primary" onClick={() => void reindex()} disabled={busy}>
          重建向量索引
        </button>
      </div>

      <label style={{ marginTop: 10, display: "block" }}>导入 CSV/XLSX</label>
      <input
        type="file"
        accept=".csv,.xlsx,.xls"
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
