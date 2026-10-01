// Die Sprache landet im System-Prompt, deshalb nur Werte aus dieser Liste.
export const STUDIO_LANGUAGES = ["Deutsch", "English", "Français", "Español", "Italiano"] as const

export type StudioLanguage = (typeof STUDIO_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: StudioLanguage = "Deutsch"

export function parseLanguage(value: unknown): StudioLanguage {
  return STUDIO_LANGUAGES.find((language) => language === value) ?? DEFAULT_LANGUAGE
}
