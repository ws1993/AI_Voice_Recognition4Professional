import { NextRequest } from "next/server";

import { createSessionRecord } from "@/lib/store/repository";
import { ok, fail } from "@/lib/utils/http";
import { sessionCreateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = sessionCreateSchema.parse(body);
    const session = await createSessionRecord(parsed.source, parsed.deviceMeta ?? {});
    return ok({ sessionId: session.id }, 201);
  } catch (error) {
    return fail("Invalid session request", 400, error);
  }
}
