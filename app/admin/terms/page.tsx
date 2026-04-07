"use client";

import { useEffect, useState } from "react";

import { useAdminKey } from "@/app/admin/_components/use-admin-key";

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
  const [message, setMessage] = useState("");
  const [canonical, setCanonical] = useState("");
  const [aliases, setAliases] = useState("");
  const [priority, setPriority] = useState(100);
  const [enabled, setEnabled] = useState(true);

  async function loadTerms() {
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
      setMessage(`已加载 ${data.terms.length} 条术语`);
    } catch (error) {
      console.error(error);
      setMessage("加载术语失败");
    }
  }

  useEffect(() => {
    if (adminKey) {
      void loadTerms();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addTerm() {
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

  async function toggleTerm(item: Term) {
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

  async function remove(id: string) {
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

  return (
    <section className="panel">
      <h3 style={{ marginTop: 0 }}>术语库管理</h3>
      <label>管理密钥（X-Admin-Key）</label>
      <input value={adminKey} onChange={(e) => save(e.target.value)} />

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
