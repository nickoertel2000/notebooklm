// Ohne Import von Server-Modulen, damit auch die Login-Seite den Wert nutzen kann.
export const TURNSTILE_HEADER = "x-turnstile-token"

export type TurnstileAction = "signup" | "demo"
