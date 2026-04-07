import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { makeId, nowIso } from "@/lib/utils/ids";
import { glossaryTermSchema } from "@/lib/validators";
import type { GlossaryTerm } from "@/types/contracts";

const persistedGlossaryTermSchema = glossaryTermSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

const persistedGlossaryTermsSchema = z.array(persistedGlossaryTermSchema);

function getTermsFilePath() {
  return process.env.LOCAL_GLOSSARY_TERMS_FILE?.trim() || path.join(process.cwd(), "data", "glossary-terms.local.json");
}

function readTermsFile(): GlossaryTerm[] {
  const filePath = getTermsFilePath();

  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const result = persistedGlossaryTermsSchema.safeParse(parsed);

    if (!result.success) {
      console.error("Invalid local glossary terms store", result.error.flatten());
      return [];
    }

    return result.data;
  } catch (error) {
    console.error("Failed to read local glossary terms store", error);
    return [];
  }
}

function writeTermsFile(terms: GlossaryTerm[]) {
  const filePath = getTermsFilePath();

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(terms, null, 2)}\n`, "utf-8");
  fs.renameSync(tempPath, filePath);
}

export function readLocalTerms(): GlossaryTerm[] {
  return readTermsFile().sort((left, right) => left.priority - right.priority);
}

export function writeLocalTerm(input: {
  id?: string;
  canonical: string;
  aliases: string[];
  priority: number;
  enabled: boolean;
}): GlossaryTerm {
  const all = readTermsFile();
  const timestamp = nowIso();

  const existing = input.id ? all.find((item) => item.id === input.id) : undefined;

  if (existing) {
    existing.canonical = input.canonical;
    existing.aliases = input.aliases;
    existing.priority = input.priority;
    existing.enabled = input.enabled;
    existing.updatedAt = timestamp;
    writeTermsFile(all);
    return existing;
  }

  const created: GlossaryTerm = {
    id: input.id ?? makeId("term"),
    canonical: input.canonical,
    aliases: input.aliases,
    priority: input.priority,
    enabled: input.enabled,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  all.push(created);
  writeTermsFile(all);
  return created;
}

export function removeLocalTerm(id: string): boolean {
  const all = readTermsFile();
  const next = all.filter((item) => item.id !== id);

  if (next.length === all.length) {
    return false;
  }

  writeTermsFile(next);
  return true;
}
