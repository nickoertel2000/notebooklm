import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const notebooks = pgTable("notebooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull().default("Unbenanntes Notebook"),
  emoji: text("emoji").notNull().default("📔"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
