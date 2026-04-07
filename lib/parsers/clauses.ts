import * as XLSX from "xlsx";

import { makeId, nowIso } from "@/lib/utils/ids";
import type { SafetyClause } from "@/types/contracts";

function readKeywordCell(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[;,，；]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalize(row: Record<string, unknown>): SafetyClause {
  const clauseCode = String(row.clauseCode ?? row["条款编号"] ?? row.code ?? "").trim();
  const title = String(row.title ?? row["条款标题"] ?? "").trim();
  const content = String(row.content ?? row["条款内容"] ?? row["内容"] ?? "").trim();
  const category = String(row.category ?? row["分类"] ?? "未分类").trim();
  const keywords = readKeywordCell(row.keywords ?? row["关键词"] ?? "");

  if (!clauseCode || !title || !content) {
    throw new Error("Missing required clause fields: clauseCode/title/content");
  }

  return {
    id: makeId("clause"),
    clauseCode,
    title,
    content,
    category,
    keywords,
    embedding: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

export async function parseClauseUpload(file: File): Promise<SafetyClause[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (ext === "csv") {
    const text = Buffer.from(buffer).toString("utf-8");
    const workbook = XLSX.read(text, { type: "string" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    return rows.map(normalize);
  }

  if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    return rows.map(normalize);
  }

  throw new Error("Unsupported file type. Use .csv or .xlsx");
}
