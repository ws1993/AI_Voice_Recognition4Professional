export type ProviderKind = "asr" | "llm" | "embedding";

export type ProviderApiStyle = "audio_transcription" | "chat_audio" | "chat_completions" | "embeddings";

export type ProviderProfile = {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  apiStyle: ProviderApiStyle;
  enabled: boolean;
};

export type SegmentResult = {
  segmentId: string;
  sessionId: string;
  segmentIndex: number;
  rawText: string;
  correctedText: string;
  polishedText: string;
  timingMs: number;
  createdAt: string;
};

export type NoticeItem = {
  problemDescription: string;
  violatedClauseCode: string;
  violatedClauseText: string;
  rectificationSuggestion: string;
  standardBasis: string;
  confidence: number;
};

export type NoticeReport = {
  noticeId: string;
  sessionId: string;
  enterpriseName: string;
  inspector?: string;
  inspectedAt?: string;
  items: NoticeItem[];
  pdfUrl: string;
  createdAt: string;
};

export type EnterpriseInfo = {
  enterpriseName: string;
  inspector?: string;
  inspectedAt?: string;
};

export type PromptTemplates = {
  textOptimize: string;
  noticeGenerate: string;
};

export type RecognitionRuntimeConfig = {
  language: string;
  silenceMs: number;
  maxSegmentSeconds: number;
  asrRetries: number;
  llmRetries: number;
};

export type AppSettings = {
  providers: ProviderProfile[];
  prompts: PromptTemplates;
  recognition: RecognitionRuntimeConfig;
};

export type GlossaryTerm = {
  id: string;
  canonical: string;
  aliases: string[];
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SafetyClause = {
  id: string;
  clauseCode: string;
  title: string;
  content: string;
  category: string;
  keywords: string[];
  embedding: number[] | null;
  createdAt: string;
  updatedAt: string;
};
