// Links out of the app: opened in a new tab, shown by their site.

/** A link's site, without "www." ("booking.com"); the link as it is if it isn't one. */
export const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** A link's attributes to open it in a new tab, telling the site nothing of the app's page. */
export const external = { target: '_blank', rel: 'noopener noreferrer' } as const
