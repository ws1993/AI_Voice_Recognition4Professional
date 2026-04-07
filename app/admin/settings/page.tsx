"use client";

import { useState, useEffect } from "react";

import { useAdminKey } from "@/app/admin/_components/use-admin-key";
import { getClientStore } from "@/lib/store/client-repo";
import type { AppSettings } from "@/types/contracts";

export default function AdminSettingsPage() {
  const { adminKey, save } = useAdminKey();
  const [jsonText, setJsonText] = useState("");
  const [message, setMessage] = useState("加载配置中...");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // 页面加载时自动加载配置
    void loadSettings();
  }, []);

  async function loadSettings() {
    setBusy(true);
    try {
      const store = getClientStore();
      const settings = await store.loadSettings();
      setJsonText(JSON.stringify(settings, null, 2));
      setMessage("配置已加载（本地存储）");
    } catch (error) {
      console.error(error);
      setMessage("加载失败，请查看控制台日志");
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
      const payload = JSON.parse(jsonText) as AppSettings;

      // 验证必要字段
      if (!payload.providers || !Array.isArray(payload.providers) || payload.providers.length === 0) {
        throw new Error("providers 字段必须是非空数组");
      }
      if (!payload.prompts) {
        throw new Error("prompts 字段缺失");
      }
      if (!payload.recognition) {
        throw new Error("recognition 字段缺失");
      }

      const store = getClientStore();
      await store.saveSettings(payload);
      setMessage("配置已保存到本地存储");
    } catch (error) {
      console.error(error);
      const errorMsg = error instanceof Error ? error.message : "保存失败";
      setMessage(`保存失败：${errorMsg}`);
    } finally {
      setBusy(false);
    }
  }

  function loadDefaultSettings() {
    const store = getClientStore();
    const defaults = store.getSettings();
    setJsonText(JSON.stringify(defaults, null, 2));
    setMessage("已加载默认配置，可编辑后保存");
  }

  return (
    <section className="panel">
      <h3 style={{ marginTop: 0 }}>系统设置</h3>

      <div className="card" style={{ marginBottom: 16, padding: 16, background: "#fffbe6", border: "1px solid #ffe58f" }}>
        <strong>⚠️ API Key 配置说明</strong>
        <p style={{ margin: "8px 0 0", fontSize: 13 }}>
          请将 API Key 直接配置在下方 JSON 的 <code>providers[].apiKey</code> 字段中。<br />
          配置保存在浏览器本地存储（IndexedDB），不会上传到服务器。
        </p>
      </div>

      <label>管理密钥（X-Admin-Key，用于验证管理员身份）</label>
      <input value={adminKey} onChange={(e) => save(e.target.value)} placeholder="输入 ADMIN_KEY" />

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn-secondary" onClick={() => void loadSettings()} disabled={busy}>
          加载配置
        </button>
        <button className="btn-secondary" onClick={() => loadDefaultSettings()} disabled={busy}>
          重置为默认
        </button>
        <button className="btn-primary" onClick={() => void saveSettings()} disabled={busy}>
          保存配置
        </button>
      </div>

      <textarea
        style={{ marginTop: 12, minHeight: 400, fontFamily: "monospace", fontSize: 12 }}
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        placeholder="点击加载后编辑配置 JSON"
      />

      <p className="meta">{message}</p>

      <div className="card" style={{ marginTop: 16, padding: 12, background: "#f5f5f5" }}>
        <strong>配置说明：</strong>
        <ul style={{ margin: "8px 0 0 20px", fontSize: 13 }}>
          <li><code>providers</code>：AI 服务提供商配置，包含 ASR、LLM、Embedding</li>
          <li><code>providers[].apiKey</code>：API 密钥（必填，如：sk-xxxxx）</li>
          <li><code>prompts</code>：AI 提示词模板</li>
          <li><code>recognition</code>：语音识别运行时配置</li>
        </ul>
      </div>
    </section>
  );
}
