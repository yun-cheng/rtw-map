// A link to a post on a social network, as the network's own embed page (My visit's links, Visit.tsx): built from the
// link alone, with no keys and nothing fetched or kept by us. Only public posts show; the rest get the network's own
// "unavailable" box. Short links (vm.tiktok.com, fb.watch…) don't say which post they are, so they stay plain links.
import type { Theme } from '../ui/theme'

export type Platform = 'Instagram' | 'Threads' | 'Facebook' | 'X' | 'TikTok' | 'YouTube'

export type SocialPost = {
  platform: Platform
  /** The embed page, for an iframe. */
  src: string
  /** A video's shape (width / height), kept as the panel's width changes; else the post's height in px to start with,
   *  which the page may change (`postHeight`). */
  ratio?: number
  height?: number
}

const hostOf = (u: URL) => u.hostname.toLowerCase().replace(/^(www|m|mobile|web)\./, '')

/** The post a link is to, or null for any other link. `theme` is for the networks whose embed has one (X). */
export function socialPost(url: string, theme: Theme = 'light'): SocialPost | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = hostOf(u)
  const path = u.pathname
  let m: RegExpMatchArray | null

  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtu.be') {
    const id = host === 'youtu.be' ? path.slice(1) : path === '/watch' ? u.searchParams.get('v') : path.match(/^\/(?:shorts|live|embed)\/([\w-]+)/)?.[1]
    if (!id || !/^[\w-]{11}$/.test(id)) return null
    const start = startSeconds(u.searchParams.get('t') ?? u.searchParams.get('start'))
    return { platform: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`, ratio: path.startsWith('/shorts/') ? 9 / 16 : 16 / 9 }
  }
  if (host === 'instagram.com' && (m = path.match(/^\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/))) {
    return { platform: 'Instagram', src: `https://www.instagram.com/${m[1] === 'p' || m[1] === 'tv' ? m[1] : 'reel'}/${m[2]}/embed/captioned/`, height: 640 }
  }
  if ((host === 'threads.net' || host === 'threads.com') && (m = path.match(/^\/(@[\w.]+)\/post\/([\w-]+)/))) {
    return { platform: 'Threads', src: `https://www.threads.com/${m[1]}/post/${m[2]}/embed`, height: 480 }
  }
  if (host === 'facebook.com') {
    const href = `https://www.facebook.com${path}${u.search}`
    if (/^\/(?:[\w.]+\/videos\/|watch\/?$|reel\/|share\/[vr]\/)/.test(path)) {
      const reel = /^\/(?:reel|share\/r)\//.test(path)
      return { platform: 'Facebook', src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false`, ratio: reel ? 9 / 16 : 16 / 9 }
    }
    if (/^\/(?:[\w.]+\/posts\/|groups\/[\w.]+\/(?:posts|permalink)\/|permalink\.php|story\.php|photo\/?$|photo\.php|[\w.]+\/photos\/|share\/p\/)/.test(path)) {
      return { platform: 'Facebook', src: `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(href)}&show_text=true&width=500`, height: 600 }
    }
    return null
  }
  if ((host === 'x.com' || host === 'twitter.com') && (m = path.match(/^\/\w+\/status(?:es)?\/(\d+)/))) {
    return { platform: 'X', src: `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&dnt=true&theme=${theme}`, height: 420 }
  }
  if (host === 'tiktok.com' && (m = path.match(/^\/@[\w.-]+\/video\/(\d+)/))) {
    return { platform: 'TikTok', src: `https://www.tiktok.com/player/v1/${m[1]}?description=1`, ratio: 9 / 16 }
  }
  return null
}

/** YouTube's start time: `90`, `90s` or `1m30s`. */
function startSeconds(t: string | null): number {
  const m = t?.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/)
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0
}

/** The height an embed page asks for, in a message it posts to the page around it (Instagram's `MEASURE`, X's
 *  `twttr.private.resize`, Threads' bare number), or null for any other message. */
export function postHeight(data: unknown): number | null {
  let d = data
  if (typeof d === 'string') {
    try {
      d = JSON.parse(d)
    } catch {
      return null
    }
  }
  let h: unknown = d
  if (d && typeof d === 'object') {
    const o = d as { type?: unknown; details?: { height?: unknown }; 'twttr.embed'?: { method?: unknown; params?: { height?: unknown }[] } }
    h = o.type === 'MEASURE' ? o.details?.height : o['twttr.embed']?.method === 'twttr.private.resize' ? o['twttr.embed'].params?.[0]?.height : null
  }
  const n = typeof h === 'string' ? parseFloat(h) : h
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(Math.ceil(n), 2000) : null
}
