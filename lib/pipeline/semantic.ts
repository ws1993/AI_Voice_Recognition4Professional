import { openAiLikeChat, openAiLikeEmbedding } from "@/lib/openai/client";
import { noticeItemsSchema } from "@/lib/validators";
import type { AppSettings, NoticeItem, SafetyClause } from "@/types/contracts";

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    sum += a[index] * b[index];
  }
  return sum;
}

function norm(values: number[]): number {
  return Math.sqrt(dot(values, values));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const denominator = norm(a) * norm(b);
  if (!denominator) {
    return 0;
  }
  return dot(a, b) / denominator;
}

function scoreByKeywords(text: string, clause: SafetyClause): number {
  const corpus = `${clause.title}\n${clause.content}\n${clause.keywords.join(" ")}`;
  const words = text
    .split(/[\s,.;\u3001\uFF0C\u3002\uFF1B]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!words.length) {
    return 0;
  }

  let hit = 0;
  for (const word of words) {
    if (corpus.includes(word)) {
      hit += 1;
    }
  }
  return hit / words.length;
}

export async function rankClauses(
  inputText: string,
  clauses: SafetyClause[],
  settings: AppSettings,
  topK = 8
): Promise<SafetyClause[]> {
  const provider = settings.providers.find((item) => item.kind === "embedding" && item.enabled);
  if (provider) {
    try {
      const queryEmbedding = await openAiLikeEmbedding(provider, inputText);
      if (queryEmbedding) {
        return [...clauses]
          .map((clause) => ({
            clause,
            score: clause.embedding ? cosineSimilarity(queryEmbedding, clause.embedding) : 0
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, topK)
          .map((item) => item.clause);
      }
    } catch (error) {
      console.error("Embedding retrieval failed:", error);
    }
  }

  return [...clauses]
    .map((clause) => ({
      clause,
      score: scoreByKeywords(inputText, clause)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => item.clause);
}

function makeRuleFallback(segments: string[], candidates: SafetyClause[]): NoticeItem[] {
  const firstClause = candidates[0];
  if (!firstClause) {
    return segments.map((text) => ({
      problemDescription: text,
      violatedClauseCode: "N/A",
      violatedClauseText: "\u672a\u5339\u914d\u5230\u6761\u6b3e",
      rectificationSuggestion: "\u8bf7\u8865\u5145\u6807\u51c6\u6761\u76ee\u5e93\u540e\u91cd\u65b0\u751f\u6210\u901a\u77e5\u5355\u3002",
      standardBasis: "\u6807\u51c6\u6761\u76ee\u5e93\u4e3a\u7a7a",
      confidence: 0.2
    }));
  }

  return segments.map((text) => ({
    problemDescription: text,
    violatedClauseCode: firstClause.clauseCode,
    violatedClauseText: firstClause.content,
    rectificationSuggestion: "\u8bf7\u6839\u636e\u73b0\u573a\u60c5\u51b5\u5236\u5b9a\u6574\u6539\u63aa\u65bd\u5e76\u590d\u67e5\u3002",
    standardBasis: `${firstClause.clauseCode} ${firstClause.title}`,
    confidence: 0.5
  }));
}

export async function classifyNoticeItems(params: {
  segments: string[];
  candidateClauses: SafetyClause[];
  settings: AppSettings;
}): Promise<NoticeItem[]> {
  const { segments, candidateClauses, settings } = params;
  const provider = settings.providers.find((item) => item.kind === "llm" && item.enabled);
  if (!provider) {
    return makeRuleFallback(segments, candidateClauses);
  }

  const candidateText = candidateClauses
    .map((item) => `${item.clauseCode} | ${item.title} | ${item.content}`)
    .join("\n");

  const userPrompt = [
    "\u8bf7\u57fa\u4e8e\u68c0\u67e5\u6587\u672c\u548c\u5019\u9009\u6761\u6b3e\uff0c\u8f93\u51fa\u6574\u6539\u901a\u77e5\u5355\u95ee\u9898\u9879\u7684 json\u3002",
    '{"instruction":"Return valid json only","format":{"items":[{"problemDescription":"string","violatedClauseCode":"string","violatedClauseText":"string","rectificationSuggestion":"string","standardBasis":"string","confidence":0.0}]}}',
    "confidence \u4e3a 0 \u5230 1 \u7684\u5c0f\u6570\u3002",
    "",
    "\u68c0\u67e5\u6587\u672c\uff1a",
    segments.join("\n"),
    "",
    "\u5019\u9009\u6761\u6b3e\uff1a",
    candidateText
  ].join("\n");

  try {
    const raw = await openAiLikeChat(
      provider,
      [
        { role: "system", content: settings.prompts.noticeGenerate },
        { role: "user", content: userPrompt }
      ],
      true
    );
    if (!raw) {
      return makeRuleFallback(segments, candidateClauses);
    }

    const parsed = JSON.parse(raw) as { items?: unknown };
    return noticeItemsSchema.parse(parsed.items);
  } catch (error) {
    console.error("Notice classification failed:", error);
    return makeRuleFallback(segments, candidateClauses);
  }
}
