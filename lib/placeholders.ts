// Ein Poll kann die neue Zeile schon geliefert haben, während der Platzhalter noch in der Liste steht.
export function replacePlaceholder<T extends { id: string }>(items: T[], tempId: string, created: T): T[] {
  return items.filter((item) => item.id !== created.id).map((item) => (item.id === tempId ? created : item))
}
