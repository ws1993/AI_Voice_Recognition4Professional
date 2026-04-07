"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type { NoticeItem } from "@/types/contracts";

type SegmentStatus = "recognizing" | "done" | "error";

type SegmentUI = {
  key: string;
  segmentIndex: number;
  status: SegmentStatus;
  rawText?: string;
  correctedText?: string;
  polishedText?: string;
  asrMs?: number;
  glossaryMs?: number;
  optimizeMs?: number;
  totalMs?: number;
  editedText: string;
  error?: string;
};

type NoticeState = {
  noticeId: string;
  items: NoticeItem[];
  pdfUrl: string;
} | null;

const MIN_RECORDING_BYTES = 1024;

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "识别失败，请重试";
}

async function getResponseErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) {
    return `识别失败（${response.status}）`;
  }

  try {
    const data = JSON.parse(text) as { error?: string };
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error.trim();
    }
  } catch {
    return text;
  }

  return text;
}

export function RecognitionClient() {
  const [sessionId, setSessionId] = useState<string>("");
  const [segments, setSegments] = useState<SegmentUI[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [message, setMessage] = useState("待命");
  const [enterpriseName, setEnterpriseName] = useState("");
  const [inspector, setInspector] = useState("");
  const [inspectedAt, setInspectedAt] = useState("");
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);
  const sessionIdRef = useRef<string>("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const nextSegmentIndexRef = useRef<number>(0);
  const sourceRef = useRef<"realtime" | "upload">("realtime");

  const doneCount = useMemo(() => segments.filter((item) => item.status === "done").length, [segments]);

  const createSession = useCallback(async (source: "realtime" | "upload") => {
    if (sessionIdRef.current) {
      return sessionIdRef.current;
    }
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source,
        deviceMeta: {
          userAgent: navigator.userAgent
        }
      })
    });
    if (!response.ok) {
      throw new Error("创建会话失败");
    }
    const data = (await response.json()) as { sessionId: string };
    sessionIdRef.current = data.sessionId;
    setSessionId(data.sessionId);
    return data.sessionId;
  }, []);

  const uploadSegment = useCallback(
    async (blob: Blob, fileName?: string) => {
      const currentIndex = nextSegmentIndexRef.current;
      nextSegmentIndexRef.current += 1;

      const key = uid();
      setSegments((prev) => [
        ...prev,
        {
          key,
          segmentIndex: currentIndex,
          status: "recognizing",
          editedText: ""
        }
      ]);

      try {
        const sid = await createSession(sourceRef.current);
        const audioFile =
          blob instanceof File
            ? blob
            : new File([blob], fileName ?? `segment-${currentIndex}.webm`, { type: blob.type || "audio/webm" });

        const form = new FormData();
        form.append("sessionId", sid);
        form.append("segmentIndex", String(currentIndex));
        form.append("language", "zh-CN");
        form.append("audioFile", audioFile);

        const response = await fetch("/api/recognize/segment", {
          method: "POST",
          body: form
        });

        if (!response.ok) {
          throw new Error(await getResponseErrorMessage(response));
        }

        const data = (await response.json()) as {
          rawText: string;
          correctedText: string;
          polishedText: string;
          asrMs: number;
          glossaryMs: number;
          optimizeMs: number;
          timing: number;
        };

        setSegments((prev) =>
          prev.map((item) =>
            item.key === key
              ? {
                  ...item,
                  status: "done",
                  rawText: data.rawText,
                  correctedText: data.correctedText,
                  polishedText: data.polishedText,
                  asrMs: data.asrMs,
                  glossaryMs: data.glossaryMs,
                  optimizeMs: data.optimizeMs,
                  totalMs: data.timing,
                  editedText: data.polishedText
                }
              : item
          )
        );
        setMessage(`第 ${currentIndex + 1} 段识别完成`);
      } catch (error) {
        console.error(error);
        const errorMessage = getErrorMessage(error);
        setSegments((prev) =>
          prev.map((item) =>
            item.key === key
              ? {
                  ...item,
                  status: "error",
                  error: errorMessage
                }
              : item
          )
        );
        setMessage(`识别失败：${errorMessage}`);
      }
    },
    [createSession]
  );

  const releaseRecordingResources = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }

    try {
      if (recorder.state !== "inactive") {
        setMessage("录音结束，正在识别...");
        recorder.requestData();
        recorder.stop();
      }
    } catch (error) {
      console.error("stop recording failed", error);
    }

    releaseRecordingResources();
  }, [releaseRecordingResources]);

  const startRecording = useCallback(async () => {
    if (isRecording) {
      return;
    }
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      setMessage("当前浏览器不支持录音，请改用音频上传");
      return;
    }

    try {
      sourceRef.current = "realtime";
      await createSession("realtime");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) {
          return;
        }
        chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const audioChunks = [...chunksRef.current];
        chunksRef.current = [];

        const blob = new Blob(audioChunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (blob.size < MIN_RECORDING_BYTES) {
          setMessage("录音内容过短，请重试");
          return;
        }

        void uploadSegment(blob, `segment-${nextSegmentIndexRef.current}.webm`);
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error", event);
        chunksRef.current = [];
        setMessage("录音异常，请重新开始");
        releaseRecordingResources();
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setMessage("录音中，点击停止后识别");
    } catch (error) {
      console.error(error);
      setMessage("无法开始录音，请检查麦克风权限");
      chunksRef.current = [];
      releaseRecordingResources();
    }
  }, [createSession, isRecording, releaseRecordingResources, uploadSegment]);

  const onUploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) {
        return;
      }
      sourceRef.current = "upload";
      await createSession("upload");
      setMessage(`开始上传 ${files.length} 段音频`);
      for (const file of Array.from(files)) {
        await uploadSegment(file, file.name);
      }
      setMessage(`上传完成，共 ${files.length} 段`);
    },
    [createSession, uploadSegment]
  );

  const submitReport = useCallback(async () => {
    if (!sessionId) {
      setMessage("请先录音或上传音频");
      return;
    }
    const editedSegments = segments
      .filter((item) => item.editedText.trim().length > 0)
      .sort((a, b) => a.segmentIndex - b.segmentIndex)
      .map((item) => ({
        segmentIndex: item.segmentIndex,
        text: item.editedText.trim()
      }));

    if (editedSegments.length === 0) {
      setMessage("没有可提交的识别文本");
      return;
    }
    if (!enterpriseName.trim()) {
      setMessage("请填写企业名称");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/submit/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId,
          enterpriseInfo: {
            enterpriseName,
            inspector: inspector || undefined,
            inspectedAt: inspectedAt || undefined
          },
          editedSegments
        })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        noticeId: string;
        items: NoticeItem[];
        pdfUrl: string;
      };
      setNotice(data);
      setMessage(`通知单生成成功：${data.noticeId}`);
    } catch (error) {
      console.error(error);
      setMessage("提交失败，请检查模型和条目库配置");
    } finally {
      setBusy(false);
    }
  }, [enterpriseName, inspectedAt, inspector, segments, sessionId]);

  return (
    <div className="container">
      <section className="hero">
        <h1>安监语音识别整改系统</h1>
        <p>移动端实时录音识别，停止后整段生成《企业安全检查整改通知单》PDF</p>
        {isRecording ? <div className="wave" /> : null}
      </section>

      <section className="panel">
        <div className="row">
          {!isRecording ? (
            <button className="btn-primary" onClick={() => void startRecording()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              开始录音
            </button>
          ) : (
            <button className="btn-danger" onClick={stopRecording}>
              <span className="recording-blob" />
              停止录音
            </button>
          )}
          <label className="btn-secondary btn" style={{ cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
            上传多段音频
            <input
              type="file"
              accept="audio/*"
              multiple
              style={{ display: "none" }}
              onChange={(event) => void onUploadFiles(event.target.files)}
            />
          </label>
        </div>
        <p className="meta">会话 ID：{sessionId || "未创建"} | 状态：{message}</p>
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>识别结果</h3>
        <p className="meta">
          已完成 {doneCount} 段 / 共 {segments.length} 段
        </p>
        {segments.length === 0 ? <p className="meta">暂无识别结果</p> : null}
        {segments
          .slice()
          .sort((a, b) => a.segmentIndex - b.segmentIndex)
          .map((segment) => (
            <div className="segment-item" key={segment.key}>
              <div className="segment-head">
                <strong>第 {segment.segmentIndex + 1} 段</strong>
                <span className={`status-chip ${segment.status}`}>
                  {segment.status === "recognizing" && "识别中..."}
                  {segment.status === "done" && "已完成"}
                  {segment.status === "error" && "失败"}
                </span>
              </div>
              {segment.rawText ? <p className="meta">原始：{segment.rawText}</p> : null}
              {segment.correctedText ? <p className="meta">术语：{segment.correctedText}</p> : null}
              {typeof segment.totalMs === "number" ? (
                <p className="meta">
                  耗时：总计 {segment.totalMs} ms | ASR {segment.asrMs ?? 0} ms | 术语 {segment.glossaryMs ?? 0} ms | 优化{" "}
                  {segment.optimizeMs ?? 0} ms
                </p>
              ) : null}
              {segment.error ? <p className="meta" style={{ color: "#c0392b" }}>{segment.error}</p> : null}
              <textarea
                value={segment.editedText}
                onChange={(event) =>
                  setSegments((prev) =>
                    prev.map((item) =>
                      item.key === segment.key
                        ? {
                            ...item,
                            editedText: event.target.value
                          }
                        : item
                    )
                  )
                }
                placeholder="可在此人工微调最终文本"
              />
            </div>
          ))}
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>通知单信息</h3>
        <div className="row">
          <div className="input-group">
            <label>企业名称</label>
            <input value={enterpriseName} onChange={(e) => setEnterpriseName(e.target.value)} />
          </div>
          <div className="input-group">
            <label>检查人（可选）</label>
            <input value={inspector} onChange={(e) => setInspector(e.target.value)} />
          </div>
          <div className="input-group">
            <label>检查日期（可选）</label>
            <input value={inspectedAt} onChange={(e) => setInspectedAt(e.target.value)} placeholder="2026-04-03" />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn-primary" disabled={busy} onClick={() => void submitReport()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            {busy ? "生成中..." : "提交并生成通知单"}
          </button>
        </div>
      </section>

      {notice ? (
        <section className="panel">
          <h3 style={{ marginTop: 0 }}>生成结果</h3>
          <p className="meta">通知单编号：{notice.noticeId}</p>
          {notice.items.map((item, idx) => (
            <div className="segment-item" key={`${item.violatedClauseCode}_${idx}`}>
              <strong>
                {idx + 1}. {item.problemDescription}
              </strong>
              <p className="meta">违反条款：{item.violatedClauseCode}</p>
              <p className="meta">整改建议：{item.rectificationSuggestion}</p>
              <p className="meta">依据标准：{item.standardBasis}</p>
            </div>
          ))}
          <div className="row">
            <a className="btn-primary btn" href={notice.pdfUrl} target="_blank" rel="noreferrer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              下载 PDF
            </a>
            <a className="btn-secondary btn" href={`/report/${notice.noticeId}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
              查看详情页
            </a>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>后台入口</h3>
        <div className="row">
          <a className="btn-secondary btn" href="/admin/settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            配置管理
          </a>
          <a className="btn-secondary btn" href="/admin/terms">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            术语库管理
          </a>
          <a className="btn-secondary btn" href="/admin/clauses">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            标准条目库管理
          </a>
        </div>
      </section>
    </div>
  );
}
