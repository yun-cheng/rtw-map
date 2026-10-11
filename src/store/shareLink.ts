// A trip's public link: /s/<token>. This page shows that trip (store/shared.ts) instead of the visitor's own: read-only,
// without signing in, and nothing of it is saved here (the visitor's own trip in this browser stays as it was).

// (No page on the server, where the assistant's runner uses the trip's store.)
const page = (globalThis as { location?: { pathname: string; origin: string } }).location

/** The token when this page is a shared trip's link, else null. */
export const SHARED_TOKEN: string | null = page?.pathname.match(/^\/s\/([\w-]{1,64})\/?$/)?.[1] ?? null

/** The public link for a token. */
export const shareUrl = (token: string) => `${page?.origin ?? ''}/s/${token}`
