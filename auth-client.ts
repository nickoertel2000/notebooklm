import { createAuthClient } from "better-auth/react"

// Ohne baseURL nutzt der Client den aktuellen Origin der Seite. Das vermeidet
// cross-origin "Failed to fetch"-Fehler, falls die App z. B. auf Port 3001 oder
// ueber 127.0.0.1 statt localhost geoeffnet wird.
export const authClient = createAuthClient()
