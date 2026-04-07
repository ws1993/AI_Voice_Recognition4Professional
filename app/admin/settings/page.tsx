"use client";

import { useState } from "react";

import { useAdminKey } from "@/app/admin/_components/use-admin-key";

export default function AdminSettingsPage() {
  const { adminKey, save } = useAdminKey();
  const [jsonText, setJsonText] = useState("");
  const [message, setMessage] = useState("请输入管理密钥后加载配置");
  const [busy, setBusy] = useState(false);

  async function loadSettings() {
    if (!adminKey) {
      setMessage("请先输入管理密钥");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/settings", {
        headers: {
          "x-admin-key": adminKey
        }
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      setJsonText(JSON.stringify(data, null, 2));
      setMessage("配置已加载");
    } catch (error) {
      console.error(error);
      setMessage("加载失败，请检查密钥或服务日志");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    if (!adminKey) {
      setMessage("请先输入管理密钥");
      return;
    }
    setBusy(true);
    try {
      const payload = JSON.parse(jsonText);
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setMessage("配置已保存");
    } catch (error) {
      console.error(error);
      setMessage("保存失败，确认 JSON 格式和字段合法");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h3 style={{ marginTop: 0 }}>系统设置</h3>
      <p className="meta">配置优先级：DB 动态配置 &gt; 环境变量/本地配置 &gt; defaults.example.json</p>
      <label>管理密钥（X-Admin-Key）</label>
      <input value={adminKey} onChange={(e) => save(e.target.value)} placeholder="输入 ADMIN_KEY" />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn-secondary" onClick={() => void loadSettings()} disabled={busy}>
          加载配置
        </button>
        <button className="btn-primary" onClick={() => void saveSettings()} disabled={busy}>
          保存配置
        </button>
      </div>
      <textarea
        style={{ marginTop: 12, minHeight: 360 }}
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        placeholder="点击加载后编辑配置 JSON"
      />
      <p className="meta">{message}</p>
    </section>
  );
}
