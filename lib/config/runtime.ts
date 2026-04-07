import fs from "node:fs";
import path from "node:path";

import { normalizeAppSettings, normalizeProviderProfile } from "@/lib/config/providers";
import type {
  AppSettings,
  PromptTemplates,
  ProviderApiStyle,
  ProviderProfile,
  RecognitionRuntimeConfig
} from "@/types/contracts";

type RuntimeProviderConfig = Omit<ProviderProfile, "id" | "kind" | "apiStyle"> & {
  apiStyle?: ProviderApiStyle;
};

type RuntimeConfigFile = {
  admin?: {
    headerName?: string;
  };
  recognition: RecognitionRuntimeConfig;
  providers: {
    asr: RuntimeProviderConfig;
    llm: RuntimeProviderConfig;
    embedding: RuntimeProviderConfig;
  };
  prompts: PromptTemplates;
};

type RuntimeConfigOverride = Partial<Omit<RuntimeConfigFile, "providers">> & {
  providers?: Partial<RuntimeConfigFile["providers"]>;
};

const defaultsPath = path.join(process.cwd(), "config", "runtime", "defaults.example.json");
const localPath = path.join(process.cwd(), "config", "runtime", "local.json");

function parseJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function toProviders(raw: RuntimeConfigFile["providers"]): ProviderProfile[] {
  return [
    normalizeProviderProfile({
      id: "provider-asr-default",
      kind: "asr",
      ...raw.asr
    }),
    normalizeProviderProfile({
      id: "provider-llm-default",
      kind: "llm",
      ...raw.llm
    }),
    normalizeProviderProfile({
      id: "provider-embedding-default",
      kind: "embedding",
      ...raw.embedding
    })
  ];
}

export function getDefaultAppSettings(): AppSettings {
  const defaults = parseJsonFile<RuntimeConfigFile>(defaultsPath);
  if (!defaults) {
    throw new Error("Missing config/runtime/defaults.example.json");
  }
  const local = parseJsonFile<RuntimeConfigOverride>(localPath);

  const merged: RuntimeConfigFile = {
    ...defaults,
    ...local,
    recognition: {
      ...defaults.recognition,
      ...(local?.recognition ?? {})
    },
    prompts: {
      ...defaults.prompts,
      ...(local?.prompts ?? {})
    },
    providers: {
      asr: {
        ...defaults.providers.asr,
        ...(local?.providers?.asr ?? {})
      },
      llm: {
        ...defaults.providers.llm,
        ...(local?.providers?.llm ?? {})
      },
      embedding: {
        ...defaults.providers.embedding,
        ...(local?.providers?.embedding ?? {})
      }
    }
  };

  return normalizeAppSettings({
    providers: toProviders(merged.providers),
    prompts: merged.prompts,
    recognition: merged.recognition
  });
}

export function getAdminHeaderName(): string {
  const defaults = parseJsonFile<RuntimeConfigFile>(defaultsPath);
  const local = parseJsonFile<RuntimeConfigOverride>(localPath);
  return local?.admin?.headerName ?? defaults?.admin?.headerName ?? "x-admin-key";
}
