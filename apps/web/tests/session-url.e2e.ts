/** Conversation URL tracking and deep links through the shipped Web composition. */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { saveFailureShot } from './support.ts'

const ALPHA = SessionId('session-url-alpha')
const BETA = SessionId('session-url-beta')

describe('web e2e: conversation deep links', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let context: BrowserContext
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  async function seed(sessionId: SessionId, title: string, text: string): Promise<void> {
    const workspace = scaffold.ctx.workspaceRegistry.list()
      .find(item => item.path === scaffold.workspaceCwd)
    if (workspace === undefined) throw new Error('web e2e deep links: seeded Workspace is missing')
    const handle = await scaffold.ctx.agents.create({
      sessionId,
      meta: { cwd: scaffold.workspaceCwd },
      agentOptions: scaffold.ctx.agentDefaultModel.currentSelection(),
    })
    try {
      handle.agent.session.append('turn/start', { turn: 1 })
      const user = handle.agent.session.append('user/message', createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'user' },
      }), { surfaceOp: 'append' })
      handle.agent.session.append('session/title', {
        title,
        messageSeqs: [user.seq],
        source: { kind: 'fallback' },
      })
      handle.agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      await scaffold.ctx.sessions.flush(handle.agent.session)
      await workspace.attachSession(sessionId)
    } finally {
      await handle.dispose()
    }
  }

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
    await seed(ALPHA, 'Alpha conversation', 'Alpha message')
    await seed(BETA, 'Beta conversation', 'Beta message')
    browser = await chromium.launch()
    context = await browser.newContext({
      viewport: { width: 1680, height: 1000 },
      locale: 'en-US',
      timezoneId: 'Asia/Shanghai',
    })
    page = await context.newPage()
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[data-composer-input]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  function deepLink(sessionId: SessionId): string {
    const url = new URL(scaffold.baseUrl)
    url.searchParams.set('session', sessionId)
    return url.href
  }

  function addressSession(): string | null {
    return new URL(page.url()).searchParams.get('session')
  }

  it('opens a linked conversation in another tab and keeps the tab address in sync', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-session-url'))
    await page.goto(deepLink(ALPHA), { waitUntil: 'load' })
    await page.getByText('Alpha message', { exact: true }).waitFor({ timeout: 30_000 })
    expect(addressSession()).toBe(ALPHA)

    await page.getByText('Beta conversation', { exact: true }).first().click()
    await page.getByText('Beta message', { exact: true }).waitFor({ timeout: 15_000 })
    expect(addressSession()).toBe(BETA)

    await page.reload({ waitUntil: 'load' })
    await page.getByText('Beta message', { exact: true }).waitFor({ timeout: 30_000 })
    expect(addressSession()).toBe(BETA)

    await page.goBack()
    await page.getByText('Alpha message', { exact: true }).waitFor({ timeout: 15_000 })
    expect(addressSession()).toBe(ALPHA)

    const second = await context.newPage()
    try {
      await second.goto(deepLink(ALPHA), { waitUntil: 'load' })
      await second.getByText('Alpha message', { exact: true }).waitFor({ timeout: 30_000 })
      expect(new URL(second.url()).searchParams.get('session')).toBe(ALPHA)
    } finally {
      await second.close()
    }

    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 90_000)
})
