import { NextRequest } from "next/server";

import { assertAdminRequest } from "@/lib/auth/admin";
import { removeTerm, writeTerm } from "@/lib/store/repository";
import { fail, ok } from "@/lib/utils/http";
import { glossaryTermSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = assertAdminRequest(request);
  if (!auth.ok) {
    return fail(auth.message, 401);
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = glossaryTermSchema.parse(body);
    const saved = await writeTerm({
      id,
      canonical: parsed.canonical,
      aliases: parsed.aliases,
      priority: parsed.priority,
      enabled: parsed.enabled
    });
    return ok(saved);
  } catch (error) {
    return fail("Invalid term payload", 400, error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = assertAdminRequest(request);
  if (!auth.ok) {
    return fail(auth.message, 401);
  }
  const { id } = await context.params;
  const removed = await removeTerm(id);
  if (!removed) {
    return fail("Term not found", 404);
  }
  return ok({ ok: true });
}
