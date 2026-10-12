import { describe, expect, it } from 'vitest'
import { postHeight, socialPost } from './socialPost'

const src = (url: string) => socialPost(url)?.src

describe('social posts', () => {
  it('embeds YouTube videos and Shorts, keeping the start time', () => {
    expect(src('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90')
    expect(src('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(socialPost('https://youtube.com/shorts/dQw4w9WgXcQ')?.ratio).toBe(9 / 16)
    expect(socialPost('https://m.youtube.com/watch?v=dQw4w9WgXcQ')?.ratio).toBe(16 / 9)
    expect(socialPost('https://www.youtube.com/@somechannel')).toBeNull()
  })

  it('embeds Instagram posts and reels, also from links with the account name', () => {
    expect(src('https://www.instagram.com/p/C1a2B3c4D5e/?igsh=xyz')).toBe('https://www.instagram.com/p/C1a2B3c4D5e/embed/captioned/')
    expect(src('https://instagram.com/reels/C1a2B3c4D5e')).toBe('https://www.instagram.com/reel/C1a2B3c4D5e/embed/captioned/')
    expect(src('https://www.instagram.com/some.user/p/C1a2B3c4D5e/')).toBe('https://www.instagram.com/p/C1a2B3c4D5e/embed/captioned/')
    expect(socialPost('https://www.instagram.com/some.user/')).toBeNull()
  })

  it('embeds Threads, X and TikTok posts', () => {
    expect(src('https://www.threads.net/@some.user/post/C1a2B3c4D5e')).toBe('https://www.threads.com/@some.user/post/C1a2B3c4D5e/embed')
    expect(src('https://twitter.com/someone/status/1234567890?s=20')).toBe('https://platform.twitter.com/embed/Tweet.html?id=1234567890&dnt=true&theme=light')
    expect(socialPost('https://x.com/someone/status/1234567890', 'dark')?.src).toContain('theme=dark')
    expect(src('https://www.tiktok.com/@some.user/video/7234567890123456789')).toBe('https://www.tiktok.com/player/v1/7234567890123456789?description=1')
    expect(socialPost('https://vm.tiktok.com/ZMabc123/')).toBeNull()
  })

  it('embeds Facebook posts and videos, not pages', () => {
    expect(socialPost('https://www.facebook.com/somepage/posts/pfbid0abc')?.src).toMatch(/^https:\/\/www\.facebook\.com\/plugins\/post\.php\?href=https%3A%2F%2Fwww\.facebook\.com%2Fsomepage%2Fposts%2Fpfbid0abc&/)
    expect(socialPost('https://m.facebook.com/somepage/videos/123456/')?.src).toContain('/plugins/video.php?')
    expect(socialPost('https://www.facebook.com/reel/123456')?.ratio).toBe(9 / 16)
    expect(socialPost('https://www.facebook.com/somepage')).toBeNull()
  })

  it('leaves other links alone', () => {
    expect(socialPost('https://www.getyourguide.com/kotor-l1234/')).toBeNull()
    expect(socialPost('not a link')).toBeNull()
  })

  it('reads the heights embeds ask for', () => {
    expect(postHeight(JSON.stringify({ type: 'MEASURE', details: { height: 712.4 } }))).toBe(713)
    expect(postHeight({ 'twttr.embed': { method: 'twttr.private.resize', params: [{ height: '388px', width: 550 }] } })).toBe(388)
    expect(postHeight('599')).toBe(599)
    expect(postHeight('{"type":"OTHER"}')).toBeNull()
    expect(postHeight('hello')).toBeNull()
  })
})
