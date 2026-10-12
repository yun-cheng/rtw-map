// A social post under its link in My visit (Visit.tsx): loaded only when asked for, since an embed brings the
// network's own scripts and cookies (socialPost.ts builds it from the link). A YouTube video shows its thumbnail, title
// and channel first (YouTube's oEmbed, no key, no cookies sent), and plays when the thumbnail is tapped.
import { Eye, EyeOff, Play } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTheme } from '../ui/theme'
import { useOnline } from '../ui/useOnline'
import { postHeight, socialPost, type SocialPost } from './socialPost'

const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com'
const small = 'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft'

/** A social post: **Show post** loads the network's embed (online only), **Hide post** removes it. */
export function PostPreview({ url }: { url: string }) {
  const post = socialPost(url, useTheme((s) => s.theme))
  const online = useOnline()
  const [open, setOpen] = useState(false)
  if (!post) return null
  const what = post.ratio ? 'video' : 'post'
  const toggle = (open || online) && (!post.youtube || open) && (
    <button onClick={() => setOpen(!open)} className={small} title={open ? undefined : `Loads it from ${post.platform}, with ${post.platform}'s own cookies`}>
      {open ? <><EyeOff size={12} /> Hide {what}</> : <><Eye size={12} /> Show {what}</>}
    </button>
  )
  return (
    <div className="mt-1 flex flex-col items-start gap-1.5 pl-[22px]">
      {toggle}
      {!open && !online && <span className="text-[12px] text-muted">The {what} shows with a connection.</span>}
      {post.youtube ? <YouTubeVideo post={post} id={post.youtube} playing={open} onPlay={() => setOpen(true)} online={online} /> : open && <PostFrame post={post} />}
    </div>
  )
}

/** The network's embed page, as tall as the post when the page says so (Instagram, Threads, X), else its shape or height. */
function PostFrame({ post }: { post: SocialPost }) {
  const [height, setHeight] = useState<number | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    const target = frame.current?.contentWindow
    // YouTube's player takes commands by message (enablejsapi) once it's ready: it starts at half volume. It says it's
    // there only after being told the page is listening, so that's said until it answers (for a while).
    const send = (msg: object) => target?.postMessage(JSON.stringify(msg), YOUTUBE_ORIGIN)
    let tries = 0
    const listening = post.youtube ? setInterval(() => (++tries > 80 ? clearInterval(listening) : send({ event: 'listening' })), 250) : undefined
    const onMessage = (e: MessageEvent) => {
      if (e.source !== target) return
      if (post.youtube) {
        if (e.origin !== YOUTUBE_ORIGIN || tries > 80) return
        if (/"event":"(onReady|initialDelivery)"/.test(String(e.data))) {
          clearInterval(listening)
          tries = 81
          send({ event: 'command', func: 'setVolume', args: [50] })
        }
        return
      }
      const h = postHeight(e.data)
      if (h) setHeight(h)
    }
    window.addEventListener('message', onMessage)
    return () => {
      clearInterval(listening)
      window.removeEventListener('message', onMessage)
    }
  }, [post.youtube])
  // A YouTube video shows once tapped, so it plays at once, with its controls.
  const src = post.youtube ? `${post.src}${post.src.includes('?') ? '&' : '?'}autoplay=1&controls=1&enablejsapi=1` : post.src
  return (
    <iframe
      ref={frame} src={src} title={`${post.platform} ${post.ratio ? 'video' : 'post'}`} loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
      className="w-full rounded-lg border border-line bg-panel"
      style={post.ratio ? { aspectRatio: post.ratio, maxWidth: post.ratio < 1 ? 320 : undefined } : { height: height ?? post.height, maxWidth: 540 }}
    />
  )
}

/** A YouTube video: its thumbnail (tap to play), then the player, with its title and channel under it. */
function YouTubeVideo({ post, id, playing, onPlay, online }: { post: SocialPost; id: string; playing: boolean; onPlay: () => void; online: boolean }) {
  const info = useVideoInfo(id, online)
  const [noThumb, setNoThumb] = useState(false)
  const upright = (post.ratio ?? 1) < 1
  return (
    <div className="flex w-full flex-col gap-1" style={{ maxWidth: upright ? 320 : undefined }}>
      {playing
        ? <PostFrame post={post} />
        : online && !noThumb && (
          <button onClick={onPlay} aria-label={`Play ${info?.title ?? 'the video'}`} className="group relative w-full overflow-hidden rounded-lg border border-line bg-black" style={{ aspectRatio: post.ratio }}>
            <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setNoThumb(true)}
              // (A removed or unknown video gets YouTube's 120 × 90 grey placeholder.)
              onLoad={(e) => e.currentTarget.naturalWidth <= 120 && setNoThumb(true)} className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-11 w-16 items-center justify-center rounded-xl bg-black/70 text-white transition-colors group-hover:bg-[#ff0033]"><Play size={20} fill="currentColor" /></span>
            </span>
          </button>
        )}
      {online && noThumb && !playing && <button onClick={onPlay} className={small}><Eye size={12} /> Show video</button>}
      {info && (
        <div className="text-[12px] leading-snug">
          <div className="line-clamp-2 font-medium">{info.title}</div>
          {info.author && <div className="text-muted">{info.author}</div>}
        </div>
      )}
    </div>
  )
}

type VideoInfo = { title: string; author: string }

// Titles already fetched, kept in this browser (the latest 200) so they show offline too.
const KEY = 'rtw-map-youtube'
const known = new Map<string, VideoInfo>(readKnown())
const asked = new Set<string>()
const listeners = new Set<() => void>()

function readKnown(): [string, VideoInfo][] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function keep(id: string, info: VideoInfo) {
  known.set(id, info)
  try {
    localStorage.setItem(KEY, JSON.stringify([...known].slice(-200)))
  } catch { /* private window: kept until reload */ }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** A YouTube video's title and channel, from YouTube's oEmbed: asked for once (online), then kept. A private or
 *  removed video has none. */
function useVideoInfo(id: string, online: boolean): VideoInfo | undefined {
  const info = useSyncExternalStore(subscribe, () => known.get(id))
  useEffect(() => {
    if (!online || known.has(id) || asked.has(id)) return
    asked.add(id)
    fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { referrerPolicy: 'no-referrer' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (typeof d?.title === 'string') keep(id, { title: d.title, author: typeof d.author_name === 'string' ? d.author_name : '' })
      })
      .catch(() => asked.delete(id)) // no connection after all: ask again next time
  }, [id, online])
  return info
}
