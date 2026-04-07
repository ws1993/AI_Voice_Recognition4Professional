import type { ProviderProfile } from "@/types/contracts";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
};

const EMBEDDING_DIMENSIONS = 1536;

function getApiKey(profile: ProviderProfile): string | undefined {
  return process.env[profile.apiKeyEnvName];
}

function withPath(baseUrl: string, endpoint: string): string {
  const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalized}${endpoint}`;
}

function isTextEmbeddingV4(model: string): boolean {
  return model === "text-embedding-v4" || model.startsWith("text-embedding-v4-");
}

function inferAudioFormat(file: File): string {
  const mimeType = file.type.toLowerCase();
  if (mimeType.includes("webm")) {
    return "webm";
  }
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "mp3";
  }
  if (mimeType.includes("wav")) {
    return "wav";
  }
  if (mimeType.includes("m4a") || mimeType.includes("mp4") || mimeType.includes("aac")) {
    return "m4a";
  }
  if (mimeType.includes("ogg")) {
    return "ogg";
  }
  if (mimeType.includes("opus")) {
    return "opus";
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && ["webm", "mp3", "wav", "m4a", "ogg", "opus"].includes(extension)) {
    return extension;
  }

  return "webm";
}

function inferAudioMimeType(file: File): string {
  const mimeType = file.type.toLowerCase().split(";")[0];
  if (mimeType) {
    return mimeType;
  }

  switch (inferAudioFormat(file)) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    case "ogg":
    case "opus":
      return "audio/ogg";
    case "webm":
    default:
      return "audio/webm";
  }
}

function normalizeAsrLanguage(language: string): string | undefined {
  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (["zh", "zh-cn", "zh-hans", "zh-sg", "zh-hk", "zh-tw", "zh-hant"].includes(normalized)) {
    return "zh";
  }
  return normalized.split(/[-_]/)[0] || undefined;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString("base64");
}

async function fileToDataUrl(file: File): Promise<string> {
  const base64 = await fileToBase64(file);
  return `data:${inferAudioMimeType(file)};base64,${base64}`;
}

function extractChatContent(data: ChatCompletionResponse): string | null {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return null;
  }

  const text = content
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || null;
}

async function multipartAudioTranscribe(profile: ProviderProfile, file: File, language: string): Promise<string | null> {
  const apiKey = getApiKey(profile);
  if (!apiKey || !profile.enabled) {
    return null;
  }

  const body = new FormData();
  body.append("file", file);
  body.append("model", profile.model);
  body.append("language", language);
  body.append("response_format", "json");

  const response = await fetch(withPath(profile.baseUrl, "/audio/transcriptions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ASR request failed: ${response.status} ${text}`);
  }
  const data = (await response.json()) as { text?: string };
  return data.text ?? null;
}

async function chatAudioTranscribe(profile: ProviderProfile, file: File, language: string): Promise<string | null> {
  const apiKey = getApiKey(profile);
  if (!apiKey || !profile.enabled) {
    return null;
  }

  const normalizedLanguage = normalizeAsrLanguage(language);
  const audioDataUrl = await fileToDataUrl(file);
  const payload: Record<string, unknown> = {
    model: profile.model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            input_audio: {
              data: audioDataUrl
            }
          }
        ]
      }
    ]
  };

  if (normalizedLanguage) {
    payload.asr_options = {
      language: normalizedLanguage
    };
  }

  const response = await fetch(withPath(profile.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ASR request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return extractChatContent(data);
}

export async function openAiLikeTranscribe(
  profile: ProviderProfile,
  file: File,
  language: string
): Promise<string | null> {
  const apiKey = getApiKey(profile);
  if (!apiKey || !profile.enabled) {
    return null;
  }

  if (profile.apiStyle === "chat_audio") {
    return chatAudioTranscribe(profile, file, language);
  }

  return multipartAudioTranscribe(profile, file, language);
}

export async function openAiLikeChat(
  profile: ProviderProfile,
  messages: ChatMessage[],
  jsonOutput = false
): Promise<string | null> {
  const apiKey = getApiKey(profile);
  if (!apiKey || !profile.enabled) {
    return null;
  }

  const payload: Record<string, unknown> = {
    model: profile.model,
    messages
  };
  if (jsonOutput) {
    payload.response_format = { type: "json_object" };
  }

  const response = await fetch(withPath(profile.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${text}`);
  }
  const data = (await response.json()) as ChatCompletionResponse;
  return extractChatContent(data);
}

export async function openAiLikeEmbedding(profile: ProviderProfile, input: string): Promise<number[] | null> {
  const apiKey = getApiKey(profile);
  if (!apiKey || !profile.enabled) {
    return null;
  }

  const payload: Record<string, unknown> = {
    model: profile.model,
    input
  };
  if (isTextEmbeddingV4(profile.model)) {
    payload.dimensions = EMBEDDING_DIMENSIONS;
  }

  const response = await fetch(withPath(profile.baseUrl, "/embeddings"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Embedding request failed: ${response.status} ${text}`);
  }
  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  return data.data?.[0]?.embedding ?? null;
}
