import { NextRequest } from "next/server";

import { assertAdminRequest } from "@/lib/auth/admin";
import { parseClauseUpload } from "@/lib/parsers/clauses";
import { writeClauses } from "@/lib/store/repository";
import { fail, ok } from "@/lib/utils/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = assertAdminRequest(request);
  if (!auth.ok) {
    return fail(auth.message, 401);
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return fail("file is required", 400);
    }
    const clauses = await parseClauseUpload(file);
    const result = await writeClauses(clauses);
    return ok({ imported: result.count });
  } catch (error) {
    return fail("Failed to import clauses", 400, error);
  }
}
