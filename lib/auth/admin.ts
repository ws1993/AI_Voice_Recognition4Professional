import type { NextRequest } from "next/server";

import { getAdminHeaderName } from "@/lib/config/runtime";

export function assertAdminRequest(request: NextRequest): { ok: true } | { ok: false; message: string } {
  const key = process.env.ADMIN_KEY;
  if (!key) {
    return { ok: false, message: "ADMIN_KEY is not configured." };
  }

  const headerName = getAdminHeaderName();
  const value = request.headers.get(headerName);
  if (!value || value !== key) {
    return { ok: false, message: "Unauthorized admin request." };
  }
  return { ok: true };
}
