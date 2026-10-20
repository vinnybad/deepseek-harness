import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  browserSessionUrl, linkedSessionId, SESSION_URL_PARAM, sessionUrl,
} from '../src/client/session-url.ts'

const sid = (id: string): SessionId => SessionId(id)

interface FakeWindow {
  readonly pushes: (string | URL | null | undefined)[]
  readonly replaces: (string | URL | null | undefined)[]
  readonly listeners: Set<() => void>
  href: string
  readonly stub: {
    location: { href: string }
    history: {
      pushState(data: unknown, unused: string, url?: string | URL | null): void
      replaceState(data: unknown, unused: string, url?: string | URL | null): void
    }
    addEventListener(type: string, listener: () => void): void
    removeEventListener(type: string, listener: () => void): void
  }
}

function fakeWindow(href = 'http://localhost:3080/tools/dsh/'): FakeWindow {
  const fake: FakeWindow = {
    pushes: [],
    replaces: [],
    listeners: new Set(),
    href,
    stub: {
      location: { href },
      history: {
        pushState: (_data, _unused, url) => { fake.pushes.push(url) },
        replaceState: (_data, _unused, url) => { fake.replaces.push(url) },
      },
      addEventListener: (type, listener) => {
        if (type === 'popstate') fake.listeners.add(listener)
      },
      removeEventListener: (type, listener) => {
        if (type === 'popstate') fake.listeners.delete(listener)
      },
    },
  }
  fake.stub.location = {
    get href() { return fake.href },
    set href(value: string) { fake.href = value },
  }
  return fake
}

afterEach(() => { vi.unstubAllGlobals() })

describe('linkedSessionId', () => {
  it('reads a named Session and decodes its identity', () => {
    expect(linkedSessionId('http://localhost:3080/?session=sess%201')).toBe('sess 1')
  })

  it('treats a missing or empty parameter as no Session', () => {
    expect(linkedSessionId('http://localhost:3080/')).toBeUndefined()
    expect(linkedSessionId('http://localhost:3080/?session=')).toBeUndefined()
  })
})

describe('sessionUrl', () => {
  it('addresses a Session without disturbing the mount, other parameters, or the fragment', () => {
    expect(sessionUrl('http://localhost:3080/tools/dsh/?view=flat#chat', sid('abc'))).toBe(
      `/tools/dsh/?view=flat&${SESSION_URL_PARAM}=abc#chat`,
    )
  })

  it('removes the Session while keeping the rest of the URL', () => {
    expect(sessionUrl('http://localhost:3080/?session=abc&view=flat#chat', undefined)).toBe('/?view=flat#chat')
  })
})

describe('browserSessionUrl', () => {
  it('is absent outside a browser', () => {
    vi.stubGlobal('window', undefined)
    expect(browserSessionUrl()).toBeUndefined()
  })

  it('reads the current URL and forwards history writes', () => {
    const fake = fakeWindow()
    vi.stubGlobal('window', fake.stub)
    const page = browserSessionUrl()

    expect(page?.currentHref()).toBe('http://localhost:3080/tools/dsh/')
    page?.push('/tools/dsh/?session=a')
    page?.replace('/tools/dsh/?session=b')

    expect(fake.pushes).toEqual(['/tools/dsh/?session=a'])
    expect(fake.replaces).toEqual(['/tools/dsh/?session=b'])
  })

  it('subscribes to history traversal until the returned unsubscribe runs', () => {
    const fake = fakeWindow()
    vi.stubGlobal('window', fake.stub)
    const listener = vi.fn()
    const stop = browserSessionUrl()?.listen(listener)

    for (const registered of fake.listeners) registered()
    expect(listener).toHaveBeenCalledOnce()

    stop?.()
    expect(fake.listeners.size).toBe(0)
  })
})
