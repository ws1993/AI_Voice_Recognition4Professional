import { NextRequest } from "next/server";

import { assertAdminRequest } from "@/lib/auth/admin";
import { readTerms, writeTerm } from "@/lib/store/repository";
import { fail, ok } from "@/lib/utils/http";
import { glossaryTermSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = assertAdminRequest(request);
  if (!auth.ok) {
    return fail(auth.message, 401);
  }

  const terms = await readTerms();
  return ok({ terms });
}

export async function POST(request: NextRequest) {
  const auth = assertAdminRequest(request);
  if (!auth.ok) {
    return fail(auth.message, 401);
  }

  try {
    const body = await request.json();
    const parsed = glossaryTermSchema.parse(body);
    const saved = await writeTerm({
      canonical: parsed.canonical,
      aliases: parsed.aliases,
      priority: parsed.priority,
      enabled: parsed.enabled
    });
    return ok(saved, 201);
  } catch (error) {
    return fail("Invalid term payload", 400, error);
  }
}
