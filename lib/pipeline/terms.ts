import { openAiLikeChat } from "@/lib/openai/client";
import type { AppSettings, GlossaryTerm } from "@/types/contracts";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyDictionary(text: string, terms: GlossaryTerm[]): { text: string; hitCount: number } {
  let output = text;
  let hitCount = 0;
  const sorted = [...terms]
    .filter((item) => item.enabled)
    .sort((a, b) => a.priority - b.priority || b.canonical.length - a.canonical.length);

  for (const term of sorted) {
    const candidates = [term.canonical, ...term.aliases].filter(Boolean);
    for (const alias of candidates) {
      const regex = new RegExp(escapeRegExp(alias), "g");
      if (regex.test(output)) {
        output = output.replace(regex, term.canonical);
        hitCount += 1;
      }
    }
  }

  return { text: output, hitCount };
}

export async function correctByGlossary(
  inputText: string,
  terms: GlossaryTerm[],
  settings: AppSettings
): Promise<string> {
  const dictionaryResult = applyDictionary(inputText, terms);
  const llmProvider = settings.providers.find((item) => item.kind === "llm" && item.enabled);

  if (!llmProvider || terms.length === 0) {
    return dictionaryResult.text;
  }

  const sampleTerms = terms
    .filter((item) => item.enabled)
    .slice(0, 50)
    .map((item) => `${item.canonical} <- ${item.aliases.join("/")}`)
    .join("\n");

  const prompt = [
    "请只做专业名词纠错，不要改写句子结构。",
    "如果句子已正确则原样返回。",
    "可参考术语映射：",
    sampleTerms,
    "",
    "文本：",
    dictionaryResult.text
  ].join("\n");

  try {
    const result = await openAiLikeChat(
      llmProvider,
      [
        { role: "system", content: "你是工业安全检查文本术语纠错助手。" },
        { role: "user", content: prompt }
      ],
      false,
      { disableThinking: true }
    );
    if (result && result.trim().length > 0) {
      return result.trim();
    }
  } catch (error) {
    console.error("LLM term correction failed:", error);
  }

  return dictionaryResult.text;
}
