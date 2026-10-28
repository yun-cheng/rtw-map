// Base64url (RFC 4648 §5, without padding): tokens, keys and signatures in URLs, cookies and headers. Shared by the
// Worker and the browser (the push keys).

export const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
/** The bytes back (with or without padding); throws if it isn't base64url. */
export const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))
