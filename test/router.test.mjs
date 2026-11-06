import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { keywordMatch, modelRoute, collectCandidates, tokensFor } from '../lib/router.js'

/**
 * The router decides which web session an inbound message belongs to.
 *
 * These tests cover the three decisions it makes: a name in the message, a
 * model that reads the candidate list, and the candidate list itself.
 */

const CANDIDATES = [
  {
    sessionId: 'sess-responsive',
    cwd: '/home/averypi/dsh-desktop-responsive',
    title: '响应式插件',
    live: true,
  },
  {
    sessionId: 'sess-gateway',
    cwd: '/home/averypi/dsh-messenger-gateway-local',
    title: 'Telegram 网关 fork',
    live: false,
  },
  {
    sessionId: 'sess-keepalive',
    cwd: '/home/averypi/dsh-audio-keepalive',
    title: '音频保活插件',
    live: false,
  },
]

describe('tokensFor', () => {
  it('names a candidate by its directory, its base name and its title', () => {
    const tokens = tokensFor(CANDIDATES[0])
    assert.ok(tokens.includes('dsh-desktop-responsive'))
    assert.ok(tokens.includes('响应式插件'))
    assert.ok(tokens.includes('/home/averypi/dsh-desktop-responsive'))
  })
})

describe('keywordMatch', () => {
  it('matches a message that names the project directory', () => {
    const hit = keywordMatch('去 dsh-desktop-responsive 那边继续', CANDIDATES)
    assert.equal(hit.sessionId, 'sess-responsive')
  })

  it('matches a message that names the project title', () => {
    const hit = keywordMatch('响应式插件的测试还没跑', CANDIDATES)
    assert.equal(hit.sessionId, 'sess-responsive')
  })

  it('prefers the more specific name over a shared prefix', () => {
    const hit = keywordMatch('接着搞 dsh-audio-keepalive', CANDIDATES)
    assert.equal(hit.sessionId, 'sess-keepalive')
  })

  it('returns null when the message names no project', () => {
    assert.equal(keywordMatch('今天天气怎么样', CANDIDATES), null)
  })
})

describe('modelRoute', () => {
  const llmSaying = (text) => ({
    async *stream() {
      yield { text }
    },
  })

  it('picks the candidate the model names', async () => {
    const picked = await modelRoute({
      llm: llmSaying('2'),
      text: '把那个网关的事做完',
      candidates: CANDIDATES,
    })
    assert.equal(picked, 'sess-gateway')
  })

  it('accepts a number with surrounding words', async () => {
    const picked = await modelRoute({
      llm: llmSaying('编号是 3，谢谢'),
      text: '继续',
      candidates: CANDIDATES,
    })
    assert.equal(picked, 'sess-keepalive')
  })

  it('returns null when the model says none of them', async () => {
    const picked = await modelRoute({
      llm: llmSaying('0'),
      text: '今天天气怎么样',
      candidates: CANDIDATES,
    })
    assert.equal(picked, null)
  })

  it('returns null when the model fails', async () => {
    const picked = await modelRoute({
      llm: {
        async *stream() {
          throw new Error('model down')
        },
      },
      text: '继续',
      candidates: CANDIDATES,
    })
    assert.equal(picked, null)
  })
})

describe('collectCandidates', () => {
  it('merges live agents with stored sessions, live first', async () => {
    const gw = {
      ctx: {
        get(name) {
          if (name === 'agents') {
            return {
              list: () => [
                { id: 'sess-responsive', session: { id: 'sess-responsive', meta: { cwd: '/home/averypi/dsh-desktop-responsive' } } },
              ],
            }
          }
          if (name === 'sessions') {
            return {
              async list() {
                return [
                  { sessionId: 'sess-responsive', title: '响应式插件', updatedAt: 10 },
                  { sessionId: 'sess-gateway', title: 'Telegram 网关 fork', cwd: '/home/averypi/dsh-messenger-gateway-local', updatedAt: 20 },
                ]
              },
            }
          }
          return undefined
        },
      },
    }
    const candidates = await collectCandidates(gw)
    assert.equal(candidates.length, 2)
    assert.equal(candidates[0].sessionId, 'sess-gateway')
    const live = candidates.find((candidate) => candidate.sessionId === 'sess-responsive')
    assert.equal(live.live, true)
    assert.equal(live.title, '响应式插件')
  })
})
