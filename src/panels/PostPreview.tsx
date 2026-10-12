// A social post under its link in My visit (Visit.tsx): loaded only when asked for, since an embed brings the
// network's own scripts and cookies (socialPost.ts builds it from the link).
import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../ui/theme'
import { useOnline } from '../ui/useOnline'
import { postHeight, socialPost, type SocialPost } from './socialPost'

const small = 'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft'

/** A social post: **Show post** loads the network's embed (online only), **Hide post** removes it. */
export function PostPreview({ url }: { url: string }) {
  const post = socialPost(url, useTheme((s) => s.theme))
  const online = useOnline()
  const [open, setOpen] = useState(false)
  if (!post) return null
  const what = post.ratio ? 'video' : 'post'
  const toggle = (open || online) && (
    <button onClick={() => setOpen(!open)} className={small} title={open ? undefined : `Loads it from ${post.platform}, with ${post.platform}'s own cookies`}>
      {open ? <><EyeOff size={12} /> Hide {what}</> : <><Eye size={12} /> Show {what}</>}
    </button>
  )
  return (
    <div className="mt-1 flex flex-col items-start gap-1.5 pl-[22px]">
      {toggle}
      {!open && !online && <span className="text-[12px] text-muted">The {what} shows with a connection.</span>}
      {open && <PostFrame post={post} />}
    </div>
  )
}

/** The network's embed page, as tall as the post when the page says so (Instagram, Threads, X), else its shape or height. */
function PostFrame({ post }: { post: SocialPost }) {
  const [height, setHeight] = useState<number | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return
      const h = postHeight(e.data)
      if (h) setHeight(h)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  return (
    <iframe
      ref={frame} src={post.src} title={`${post.platform} ${post.ratio ? 'video' : 'post'}`} loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
      className="w-full rounded-lg border border-line bg-panel"
      style={post.ratio ? { aspectRatio: post.ratio, maxWidth: post.ratio < 1 ? 320 : undefined } : { height: height ?? post.height, maxWidth: 540 }}
    />
  )
}
