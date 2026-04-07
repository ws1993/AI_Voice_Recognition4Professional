import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";

declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof drizzle> | undefined;
}

export function getDb() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!global.__db) {
    const client = postgres(process.env.DATABASE_URL, {
      prepare: false
    });
    global.__db = drizzle(client, { schema });
  }
  return global.__db;
}
