import type { MetadataRoute } from "next"

// Suchmaschinen sollen die Demo nicht indexieren, Link-Vorschauen (LinkedIn, Slack, Messenger) brauchen aber Zugriff.
const LINK_PREVIEW_BOTS = ["LinkedInBot", "Twitterbot", "facebookexternalhit", "Slackbot-LinkExpanding", "WhatsApp", "TelegramBot", "Discordbot"]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: LINK_PREVIEW_BOTS, allow: "/" },
      { userAgent: "*", disallow: "/" }
    ]
  }
}
