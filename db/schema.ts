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

export const session = pgTable(
  "session",
  {
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
  },
  (table) => [index("session_user_idx").on(table.userId)]
)

export const account = pgTable(
  "account",
  {
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
  },
  (table) => [index("account_user_idx").on(table.userId)]
)

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at")
})

// ── Notebooks ─────────────────────────────────────────────────────────────────

export const notebooks = pgTable(
  "notebooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Unbenanntes Notebook"),
    emoji: text("emoji").notNull().default("📔"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => [index("notebooks_user_idx").on(table.userId)]
)

// ── Quellen (Ingestion) ───────────────────────────────────────────────────────

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    // 'pdf' | 'url' | 'text'
    type: text("type").notNull(),
    title: text("title").notNull(),
    storageKey: text("storage_key"),
    sourceUrl: text("source_url"),
    // 'processing' | 'ready' | 'failed'
    status: text("status").notNull().default("processing"),
    error: text("error"),
    charCount: integer("char_count"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => [index("sources_notebook_idx").on(table.notebookId)]
)

// ── Chunks + Embeddings ───────────────────────────────────────────────────────
// notebookId bewusst denormalisiert: Die Similarity-Suche filtert ohne Join über sources.
// Kein HNSW-Index: pgvector filtert bei HNSW erst nach der Kandidatensuche über alle Notebooks,
// bei vielen Demo-Kopien mit identischen Embeddings blieben so kaum Treffer im eigenen Notebook.
// Pro Notebook sind es wenige tausend Chunks, die exakte Suche über den Notebook-Index ist schnell genug.

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
  (table) => [index("source_chunks_notebook_idx").on(table.notebookId), index("source_chunks_source_idx").on(table.sourceId)]
)

// ── Chat-Nachrichten ──────────────────────────────────────────────────────────

export type MessageCitation = {
  marker: number
  sourceId: string
  chunkId: string
  snippet: string
  page: number | null
  charStart: number | null
  charEnd: number | null
}

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    // 'user' | 'assistant'
    role: text("role").notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<MessageCitation[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [index("messages_notebook_idx").on(table.notebookId, table.createdAt)]
)

// ── Studio-Berichte ───────────────────────────────────────────────────────────

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    // 'briefing' | 'study-guide' | 'blogpost' | 'custom' (lib/reports.ts): content ist Markdown
    // 'flashcards' | 'quiz' | 'table' | 'mindmap' (lib/studio.ts): content ist JSON
    type: text("type").notNull(),
    title: text("title").notNull().default("Bericht"),
    content: text("content"),
    sourceCount: integer("source_count").notNull().default(0),
    // 'processing' | 'ready' | 'failed'
    status: text("status").notNull().default("processing"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [index("reports_notebook_idx").on(table.notebookId, table.createdAt)]
)

// ── Studio-Audio ──────────────────────────────────────────────────────────────

export const audioOverviews = pgTable(
  "audio_overviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    // 'brief' | 'deep-dive' | 'critique' | 'debate' (lib/audio.ts)
    format: text("format").notNull(),
    title: text("title").notNull().default("Audio-Übersicht"),
    storageKey: text("storage_key"),
    durationSeconds: integer("duration_seconds"),
    // 'kurz' | 'standard'
    length: text("length").notNull().default("standard"),
    language: text("language").notNull().default("de"),
    focus: text("focus"),
    sourceCount: integer("source_count").notNull().default(0),
    // 'processing' | 'ready' | 'failed'
    status: text("status").notNull().default("processing"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [index("audio_overviews_notebook_idx").on(table.notebookId, table.createdAt)]
)

// ── Studio-Video ──────────────────────────────────────────────────────────────

export const videoOverviews = pgTable(
  "video_overviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    // 'explainer' | 'summary' (lib/video.ts)
    format: text("format").notNull(),
    title: text("title").notNull().default("Video-Übersicht"),
    // 'auto' | 'custom' | 'classic' | 'whiteboard' | 'kawaii' (lib/video.ts)
    visualStyle: text("visual_style").notNull().default("auto"),
    customStyle: text("custom_style"),
    storageKey: text("storage_key"),
    durationSeconds: integer("duration_seconds"),
    language: text("language").notNull().default("de"),
    focus: text("focus"),
    sourceCount: integer("source_count").notNull().default(0),
    // 'processing' | 'ready' | 'failed'
    status: text("status").notNull().default("processing"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [index("video_overviews_notebook_idx").on(table.notebookId, table.createdAt)]
)

// ── Nutzungskontingente ───────────────────────────────────────────────────────

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // 'chat' | 'discover' | 'studio' | 'source' (lib/quota.ts)
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => [index("usage_events_user_kind_idx").on(table.userId, table.kind, table.createdAt)]
)
