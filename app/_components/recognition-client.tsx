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
  editedText: string;
  error?: string;
};

type NoticeState = {
  noticeId: string;
  items: NoticeItem[];
  pdfUrl: string;
} | null;

const SILENCE_MS = 900;
const MAX_SEGMENT_MS = 90_000;
const MIN_SEGMENT_MS = 1_500;

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const monitorTimerRef = useRef<number | null>(null);
  const segmentStartRef = useRef<number>(0);
  const lastVoiceRef = useRef<number>(0);
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
          const text = await response.text();
          throw new Error(text || "识别失败");
        }

        const data = (await response.json()) as {
          rawText: string;
          correctedText: string;
          polishedText: string;
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
                  editedText: data.polishedText
                }
              : item
          )
        );
        setMessage(`第 ${currentIndex + 1} 段识别完成`);
      } catch (error) {
        console.error(error);
        setSegments((prev) =>
          prev.map((item) =>
            item.key === key
              ? {
                  ...item,
                  status: "error",
                  error: "识别失败，请重试"
                }
              : item
          )
        );
        setMessage(`第 ${currentIndex + 1} 段识别失败`);
      }
    },
    [createSession]
  );

  const stopMonitor = useCallback(() => {
    if (monitorTimerRef.current) {
      window.clearInterval(monitorTimerRef.current);
      monitorTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }

    try {
      if (recorder.state === "recording") {
        recorder.requestData();
        recorder.stop();
      }
    } catch (error) {
      console.error("stop recording failed", error);
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    stopMonitor();
    setIsRecording(false);
    setMessage("录音已停止");
  }, [stopMonitor]);

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

      recorder.ondataavailable = async (event) => {
        if (!event.data || event.data.size < 1024) {
          return;
        }
        await uploadSegment(event.data);
        segmentStartRef.current = Date.now();
        lastVoiceRef.current = Date.now();
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error", event);
        setMessage("录音异常，请重新开始");
        stopRecording();
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setMessage("录音中：自动静音分段识别");

      const context = new AudioContext();
      audioContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      segmentStartRef.current = Date.now();
      lastVoiceRef.current = Date.now();

      const data = new Uint8Array(analyser.fftSize);
      monitorTimerRef.current = window.setInterval(() => {
        const a = analyserRef.current;
        const r = recorderRef.current;
        if (!a || !r || r.state !== "recording") {
          return;
        }

        a.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) {
          const delta = (v - 128) / 128;
          sum += delta * delta;
        }
        const rms = Math.sqrt(sum / data.length);

        const now = Date.now();
        if (rms > 0.02) {
          lastVoiceRef.current = now;
        }

        const segmentAge = now - segmentStartRef.current;
        const silenceAge = now - lastVoiceRef.current;

        if (segmentAge > MIN_SEGMENT_MS && silenceAge > SILENCE_MS) {
          r.requestData();
        } else if (segmentAge > MAX_SEGMENT_MS) {
          r.requestData();
        }
      }, 240);
    } catch (error) {
      console.error(error);
      setMessage("无法开始录音，请检查麦克风权限");
      stopRecording();
    }
  }, [createSession, isRecording, stopRecording, uploadSegment]);

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
        <p>移动端实时分段识别，自动生成《企业安全检查整改通知单》PDF</p>
        {isRecording ? <div className="wave" /> : null}
      </section>

      <section className="panel">
        <div className="row">
          {!isRecording ? (
            <button className="btn-primary" onClick={() => void startRecording()}>
              开始录音
            </button>
          ) : (
            <button className="btn-danger" onClick={stopRecording}>
              停止录音
            </button>
          )}
          <label className="btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
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
        <h3 style={{ marginTop: 0 }}>分段识别结果</h3>
        <p className="meta">
          已完成 {doneCount} 段 / 共 {segments.length} 段
        </p>
        {segments.length === 0 ? <p className="meta">暂无分段结果</p> : null}
        {segments
          .slice()
          .sort((a, b) => a.segmentIndex - b.segmentIndex)
          .map((segment) => (
            <div className="segment-item" key={segment.key}>
              <div className="segment-head">
                <strong>第 {segment.segmentIndex + 1} 段</strong>
                <span className="status-chip">
                  {segment.status === "recognizing" && "识别中"}
                  {segment.status === "done" && "已完成"}
                  {segment.status === "error" && "失败"}
                </span>
              </div>
              {segment.rawText ? <p className="meta">原始：{segment.rawText}</p> : null}
              {segment.correctedText ? <p className="meta">术语：{segment.correctedText}</p> : null}
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
          <div style={{ flex: 1, minWidth: 200 }}>
            <label>企业名称</label>
            <input value={enterpriseName} onChange={(e) => setEnterpriseName(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label>检查人（可选）</label>
            <input value={inspector} onChange={(e) => setInspector(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label>检查日期（可选）</label>
            <input value={inspectedAt} onChange={(e) => setInspectedAt(e.target.value)} placeholder="2026-04-03" />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn-primary" disabled={busy} onClick={() => void submitReport()}>
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
            <a className="btn-primary" href={notice.pdfUrl} target="_blank" rel="noreferrer">
              下载 PDF
            </a>
            <a className="btn-secondary" href={`/report/${notice.noticeId}`}>
              查看详情页
            </a>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>后台入口</h3>
        <div className="row">
          <a className="btn-secondary" href="/admin/settings">
            配置管理
          </a>
          <a className="btn-secondary" href="/admin/terms">
            术语库管理
          </a>
          <a className="btn-secondary" href="/admin/clauses">
            标准条目库管理
          </a>
        </div>
      </section>
    </div>
  );
}
