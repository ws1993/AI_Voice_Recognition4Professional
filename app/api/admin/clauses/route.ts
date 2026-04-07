import { NextRequest } from "next/server";

import { assertAdminRequest } from "@/lib/auth/admin";
import { readClauses } from "@/lib/store/repository";
import { fail, ok } from "@/lib/utils/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = assertAdminRequest(request);
  if (!auth.ok) {
    return fail(auth.message, 401);
  }
  const clauses = await readClauses();
  return ok({ clauses });
}
