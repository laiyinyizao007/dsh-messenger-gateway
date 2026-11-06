/**
 * Which web session does an inbound Telegram message belong to?
 *
 * The gateway's own model gives every Telegram chat its own `msgw-*` session,
 * so the phone talks to a parallel conversation that the browser cannot see.
 * That is the wrong shape for someone who wants one brain with two doors:
 * every conversation should live in the web UI, and Telegram should only be
 * the remote control.
 *
 * This module decides the target. It answers with a session id, or with
 * nothing — which leaves the gateway on its upstream path (a session of its
 * own) for messages that are not about any particular project.
 *
 * The decision is made in three steps, cheapest first:
 *
 *   1. **Name match** — the message mentions the project's directory or
 *      title ("去响应式那个项目") and the candidate list contains it.
 *   2. **Sticky** — the message says nothing that points elsewhere ("接着
 *      刚才那个"), so it stays in the session the chat last used.
 *   3. **Model** — a single cheap call with the candidate list; the model
 *      picks the number. This is what lets "把那个插件的测试补上" find the
 *      right project without an exact name.
 */

import { basename } from 'node:path'

/** How many candidates the router considers. */
export const DEFAULT_MAX_CANDIDATES = 12

/** The plugin name recorded on injected messages. */
export const PLUGIN = '@goodandready/dsh-messenger-gateway'

/**
 * Tokens that identify a candidate.
 *
 * A project is named by its directory (the thing a person says out loud:
 * "响应式插件", "dsh-desktop-responsive") and by its title. The tokens are
 * matched as substrings, so a Chinese title needs no word segmentation.
 */
export function tokensFor(candidate) {
  const tokens = new Set()
  const cwd = String(candidate.cwd || '')
  if (cwd) {
    for (const segment of cwd.split('/')) {
      const clean = segment.trim()
      if (clean.length >= 2) tokens.add(clean.toLowerCase())
    }
    const base = basename(cwd)
    if (base.length >= 2) tokens.add(base.toLowerCase())
  }
  const title = String(candidate.title || '')
  if (title.length >= 2) tokens.add(title.toLowerCase())
  for (const word of title.split(/[\s_\-—·、，,]+/)) {
    const clean = word.trim()
    if (clean.length >= 2) tokens.add(clean.toLowerCase())
  }
  // The full path is a token too: typing it is unambiguous.
  if (cwd.length >= 4) tokens.add(cwd.toLowerCase())
  return [...tokens]
}

/**
 * The candidate whose name the message mentions.
 *
 * @param {string} text - The inbound message.
 * @param {Array<object>} candidates - The candidate list.
 * @returns {object|null} The candidate, or null when nothing matches.
 */
export function keywordMatch(text, candidates) {
  const hay = String(text || '').toLowerCase()
  if (!hay.trim()) return null
  let best = null
  let bestScore = 0
  for (const candidate of candidates) {
    for (const token of tokensFor(candidate)) {
      if (!hay.includes(token)) continue
      // A longer token is a stronger signal: "dsh-desktop-responsive" beats
      // a generic "dsh".
      if (token.length > bestScore) {
        best = candidate
        bestScore = token.length
      }
    }
  }
  return best
}

/**
 * One candidate row for the model prompt.
 *
 * @param {object} candidate - The candidate.
 * @param {number} index - Its position in the list.
 * @returns {string} The row.
 */
export function catalogRow(candidate, index) {
  const where = candidate.cwd ? candidate.cwd : '(no directory)'
  const live = candidate.live ? 'live' : 'stored'
  const when = candidate.updatedAt ? new Date(candidate.updatedAt).toISOString().slice(0, 16).replace('T', ' ') : ''
  return `${index + 1}. ${candidate.title || '(untitled)'} — ${where} [${live}${when ? `, ${when}` : ''}]`
}

/**
 * Ask the model which candidate the message is about.
 *
 * @param {object} deps - `{ llm, text, candidates, model, signal }`.
 * @returns {Promise<string|null>} The chosen session id, or null.
 */
export async function modelRoute(deps) {
  const { llm, text, candidates, model, signal } = deps
  if (!llm || typeof llm.stream !== 'function' || !candidates.length) return null
  const catalog = candidates.map((candidate, index) => catalogRow(candidate, index)).join('\n')
  const prompt = [
    '你是一个会话路由器。用户接下来要你处理一件事，你要判断他指的是下面哪个会话（项目/工作区）。',
    '只回答一个数字（候选的编号）。如果都不像，回答 0。不要解释。',
    '',
    '候选会话：',
    catalog,
    '',
    `用户说：${String(text || '').trim().slice(0, 500)}`,
    '',
    '编号：',
  ].join('\n')
  const options = { messages: [{ role: 'user', content: prompt }] }
  if (signal) options.signal = signal
  if (model) {
    const slash = model.indexOf('/')
    if (slash > 0) {
      options.provider = model.slice(0, slash)
      options.model = model.slice(slash + 1)
    } else {
      options.model = model
    }
  }
  let raw = ''
  try {
    for await (const chunk of llm.stream(options)) {
      const piece = chunk && (chunk.text || (chunk.delta && chunk.delta.text)) || ''
      if (piece) raw += piece
    }
  } catch {
    return null
  }
  const match = String(raw).match(/-?\d+/)
  if (!match) return null
  const index = Number(match[0])
  if (!Number.isInteger(index) || index < 1 || index > candidates.length) return null
  return candidates[index - 1].sessionId
}

/**
 * The sessions a message could belong to.
 *
 * Live agents come first — those are the sessions the browser has open — and
 * the stored sessions fill the rest, most recently touched first.
 *
 * @param {object} gw - The gateway.
 * @param {object} options - `{ max }`.
 * @returns {Promise<Array<object>>} The candidates.
 */
export async function collectCandidates(gw, options = {}) {
  const max = Number(options.max) > 0 ? Number(options.max) : DEFAULT_MAX_CANDIDATES
  const candidates = new Map()

  const agents = gw.ctx.get?.('agents') || gw.ctx.agents
  for (const agent of agents?.list?.() || []) {
    const sessionId = String(agent?.id || agent?.session?.id || '')
    if (!sessionId) continue
    const cwd = String(agent?.session?.meta?.cwd || agent?.options?.cwd || '')
    candidates.set(sessionId, {
      sessionId,
      cwd,
      title: String(agent?.session?.meta?.name || agent?.session?.meta?.title || basename(cwd) || sessionId.slice(0, 8)),
      live: true,
      updatedAt: agent?.session?.updatedAt,
    })
  }

  const sessions = gw.ctx.get?.('sessions') || gw.ctx.sessions
  let rows = []
  try {
    rows = (await sessions?.list?.()) || []
  } catch {
    rows = []
  }
  for (const row of rows) {
    const sessionId = String(row?.sessionId || row?.id || '')
    if (!sessionId) continue
    const projections = row.projections || {}
    const cwd = String(row?.cwd || projections?.cwd || row?.meta?.cwd || '')
    const title = String(row?.title || projections?.title || row?.name || basename(cwd) || sessionId.slice(0, 8))
    const existing = candidates.get(sessionId)
    if (existing) {
      existing.title = title || existing.title
      existing.updatedAt = row?.updatedAt || existing.updatedAt
      continue
    }
    candidates.set(sessionId, {
      sessionId,
      cwd,
      title,
      live: false,
      updatedAt: row?.updatedAt,
    })
  }

  return [...candidates.values()]
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
    .slice(0, max)
}
