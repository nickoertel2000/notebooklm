import { env } from "cloudflare:workers"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { cacheForRequest } from "vinext/cache"
import * as schema from "./schema"

// Ein Client pro Request, geteilt von allen Aufrufen darin: Workers dürfen keine Sockets über
// Requests hinweg teilen, das Pooling übernimmt Hyperdrive. Außerhalb eines Requests (Workflows,
// Tests) entsteht bei jedem Aufruf ein neuer Client. fetch_types: false spart einen Roundtrip pro Verbindung.
export const getDb = cacheForRequest(() => {
  const client = postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false })
  return drizzle(client, { schema })
})

export type Db = ReturnType<typeof getDb>
