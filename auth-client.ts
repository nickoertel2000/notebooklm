import { createAuthClient } from "better-auth/react"

// Bewusst ohne baseURL: Der aktuelle Origin vermeidet „Failed to fetch“, wenn die App
// über einen anderen Port oder 127.0.0.1 statt localhost geöffnet wird.
export const authClient = createAuthClient()
