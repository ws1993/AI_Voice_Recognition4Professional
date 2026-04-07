import { NextRequest } from "next/server";

import { assertAdminRequest } from "@/lib/auth/admin";
import { loadSettingsFromIndexedDb, saveSettingsToIndexedDb } from "@/lib/store/memory";
import { fail, ok } from "@/lib/utils/http";
import { appSettingsSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = assertAdminRequest(request);
  if (!auth.ok) {
    return fail(auth.message, 401);
  }

  const settings = await loadSettingsFromIndexedDb();
  return ok(settings);
}

export async function PUT(request: NextRequest) {
  const auth = assertAdminRequest(request);
  if (!auth.ok) {
    return fail(auth.message, 401);
  }

  try {
    const body = await request.json();
    const parsed = appSettingsSchema.parse(body);
    const saved = await saveSettingsToIndexedDb(parsed);
    return ok(saved);
  } catch (error) {
    console.error('Settings PUT error:', error);
    if (error instanceof Error && 'errors' in error) {
      return fail(`Invalid settings payload: ${(error as any).errors.map((e: any) => e.path.join('.') + ': ' + e.message).join(', ')}`, 400, error);
    }
    return fail("Invalid settings payload", 400, error);
  }
}
