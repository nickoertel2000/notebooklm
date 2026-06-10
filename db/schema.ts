import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core"

// ── Better Auth Tabellen ──────────────────────────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull()
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull()
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at")
})

// ── Notebooks ─────────────────────────────────────────────────────────────────
// Jedes Notebook ist fest an einen better-auth-User geknüpft. Wird der User
// gelöscht, verschwinden seine Notebooks (und über die FK-Kaskaden auch deren
// Quellen, Chunks und Nachrichten).

export const notebooks = pgTable("notebooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Unbenanntes Notebook"),
  emoji: text("emoji").notNull().default("📔"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
})

// ── Quellen (Ingestion) ───────────────────────────────────────────────────────

export const sources = pgTable("sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  notebookId: uuid("notebook_id")
    .notNull()
    .references(() => notebooks.id, { onDelete: "cascade" }),
  // 'pdf' | 'url' | 'text'
  type: text("type").notNull(),
  title: text("title").notNull(),
  // S3-Key des hochgeladenen Originals bzw. der extrahierten .txt-Datei
  s3Key: text("s3_key"),
  // Ursprungs-URL bei type = 'url'
  sourceUrl: text("source_url"),
  // 'processing' | 'ready' | 'failed'
  status: text("status").notNull().default("processing"),
  error: text("error"),
  charCount: integer("char_count"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
})

// ── Chunks + Embeddings ───────────────────────────────────────────────────────
// notebookId ist denormalisiert mitgeführt, damit die Similarity-Suche direkt
// auf das Notebook gefiltert werden kann, ohne über sources zu joinen.

export const sourceChunks = pgTable(
  "source_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }),
    page: integer("page"),
    charStart: integer("char_start"),
    charEnd: integer("char_end"),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [
    index("source_chunks_notebook_idx").on(table.notebookId),
    index("source_chunks_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops"))
  ]
)

// ── Chat-Nachrichten ──────────────────────────────────────────────────────────

export type MessageCitation = {
  sourceId: string
  chunkId: string
  snippet: string
  page: number | null
  charStart: number | null
  charEnd: number | null
}

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  notebookId: uuid("notebook_id")
    .notNull()
    .references(() => notebooks.id, { onDelete: "cascade" }),
  // 'user' | 'assistant'
  role: text("role").notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations").$type<MessageCitation[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull()
})
