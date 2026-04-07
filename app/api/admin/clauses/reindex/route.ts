import { NextRequest } from "next/server";

import { assertAdminRequest } from "@/lib/auth/admin";
import { openAiLikeEmbedding } from "@/lib/openai/client";
import { readClauses, readSettings, writeClauses } from "@/lib/store/repository";
import { fail, ok } from "@/lib/utils/http";
import { nowIso } from "@/lib/utils/ids";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = assertAdminRequest(request);
  if (!auth.ok) {
    return fail(auth.message, 401);
  }

  const settings = await readSettings();
  const provider = settings.providers.find((item) => item.kind === "embedding" && item.enabled);
  if (!provider) {
    return fail("No enabled embedding provider", 400);
  }

  const clauses = await readClauses();
  let count = 0;
  const updated = await Promise.all(
    clauses.map(async (clause) => {
      const text = `${clause.clauseCode}\n${clause.title}\n${clause.content}`;
      try {
        const embedding = await openAiLikeEmbedding(provider, text);
        if (embedding) {
          count += 1;
          return { ...clause, embedding, updatedAt: nowIso() };
        }
      } catch (error) {
        console.error("Clause embedding failed:", clause.id, error);
      }
      return clause;
    })
  );

  await writeClauses(updated);
  return ok({ indexed: count, total: clauses.length });
}
