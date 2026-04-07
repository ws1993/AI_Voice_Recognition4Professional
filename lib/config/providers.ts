import type { AppSettings, ProviderApiStyle, ProviderKind, ProviderProfile } from "@/types/contracts";

export type ProviderProfileInput = Omit<ProviderProfile, "apiStyle"> & {
  apiStyle?: ProviderApiStyle | null;
};

export function defaultProviderApiStyle(kind: ProviderKind): ProviderApiStyle {
  switch (kind) {
    case "asr":
      return "audio_transcription";
    case "llm":
      return "chat_completions";
    case "embedding":
      return "embeddings";
    default:
      return "chat_completions";
  }
}

export function normalizeProviderProfile(profile: ProviderProfileInput): ProviderProfile {
  return {
    ...profile,
    apiStyle: profile.apiStyle ?? defaultProviderApiStyle(profile.kind)
  };
}

export function normalizeAppSettings(
  settings: Omit<AppSettings, "providers"> & {
    providers: ProviderProfileInput[];
  }
): AppSettings {
  return {
    ...settings,
    providers: settings.providers.map(normalizeProviderProfile)
  };
}
