import { NextRequest } from "next/server";

import { assertAdminRequest } from "@/lib/auth/admin";
import { readSettings, writeSettings } from "@/lib/store/repository";
import { fail, ok } from "@/lib/utils/http";
import { appSettingsSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = assertAdminRequest(request);
  if (!auth.ok) {
    return fail(auth.message, 401);
  }

  const settings = await readSettings();
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
    const saved = await writeSettings(parsed);
    return ok(saved);
  } catch (error) {
    return fail("Invalid settings payload", 400, error);
  }
}
