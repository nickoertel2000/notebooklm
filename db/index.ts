import { env } from "cloudflare:workers"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

// Ein Client pro Request: Workers dürfen keine Sockets über Requests hinweg teilen,
// das Pooling übernimmt Hyperdrive. fetch_types: false spart einen Roundtrip pro Verbindung.
export function getDb() {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false })
  return drizzle(client, { schema })
}

export type Db = ReturnType<typeof getDb>
