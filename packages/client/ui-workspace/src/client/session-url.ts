/** Browser URL and history surface for Session deep links. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Query parameter naming the Session a page URL displays. */
export const SESSION_URL_PARAM = 'session'

/** Browser page URL and history operations used to keep one Session addressable. */
export interface SessionUrlEnvironment {
  /** Current absolute page URL. */
  currentHref(): string
  /** Append one history entry for a relative URL. */
  push(url: string): void
  /** Replace the current history entry with a relative URL. */
  replace(url: string): void
  /** Subscribe to browser history traversal. @returns unsubscribe. */
  listen(listener: () => void): () => void
}

/** Read the Session named by a page URL, or absence when it names none. */
export function linkedSessionId(href: string): SessionId | undefined {
  const value = new URL(href).searchParams.get(SESSION_URL_PARAM)
  return value === null || value === '' ? undefined : value as SessionId
}

/** Address one Session, or no Session, without disturbing the mount or other query parameters. */
export function sessionUrl(href: string, sessionId: SessionId | undefined): string {
  const url = new URL(href)
  if (sessionId === undefined) url.searchParams.delete(SESSION_URL_PARAM)
  else url.searchParams.set(SESSION_URL_PARAM, sessionId)
  return `${url.pathname}${url.search}${url.hash}`
}

/** The page environment, or absence outside a browser. */
export function browserSessionUrl(): SessionUrlEnvironment | undefined {
  if (typeof window === 'undefined') return undefined
  const { history, location } = window
  return {
    currentHref: () => location.href,
    push: (url) => { history.pushState(null, '', url) },
    replace: (url) => { history.replaceState(null, '', url) },
    listen: (listener) => {
      window.addEventListener('popstate', listener)
      return () => { window.removeEventListener('popstate', listener) }
    },
  }
}
