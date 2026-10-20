/**
 * GitHub public REST API helpers.
 * All requests go only to https://api.github.com — never to arbitrary URLs.
 * No GitHub Markdown is rendered as HTML.
 * Each request is bounded by a 10-second timeout AbortController.
 */

const GITHUB_API = 'https://api.github.com'
const GITHUB_TIMEOUT_MS = 10_000

const GITHUB_HEADERS = {
  Accept: 'application/vnd.github.v3+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

/**
 * Create an AbortSignal that times out after GITHUB_TIMEOUT_MS, optionally
 * linked to a caller-supplied signal so both can cancel the request.
 */
function boundedSignal(callerSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(GITHUB_TIMEOUT_MS)
  if (!callerSignal) return timeout
  const ac = new AbortController()
  const abort = () => ac.abort()
  timeout.addEventListener('abort', abort, { once: true })
  callerSignal.addEventListener('abort', abort, { once: true })
  return ac.signal
}

export interface GitHubIssue {
  number: number
  title: string
  state: 'open' | 'closed'
  html_url: string
  repository_url: string
  created_at: string
  updated_at: string
  body: string | null
}

export interface GitHubPR {
  number: number
  title: string
  state: string
  merged: boolean
  merged_at: string | null
  merge_commit_sha: string | null
  html_url: string
  user: { login: string }
  base: {
    repo: {
      full_name: string
      html_url: string
    }
  }
  head: { sha: string }
  body: string | null
}

export type FetchResult<T> =
  | { ok: true; data: T; retrievedAt: string }
  | { ok: false; reason: string; status?: number }

/**
 * Parse a GitHub repository URL or "owner/repo" string.
 * Returns { owner, repo } or null.
 */
export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim()

  // Match https://github.com/owner/repo (with optional trailing slash or path)
  const urlMatch = trimmed.match(
    /^(?:https?:\/\/)?github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)/,
  )
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2].replace(/\/$/, '') }

  // Match owner/repo directly
  const directMatch = trimmed.match(/^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/)
  if (directMatch) return { owner: directMatch[1], repo: directMatch[2] }

  return null
}

/**
 * Parse a GitHub PR URL and extract owner, repo, and PR number.
 * Only processes URLs with github.com as the host.
 */
export function parsePRUrl(
  input: string,
): { owner: string; repo: string; prNumber: number } | null {
  const trimmed = input.trim()
  const match = trimmed.match(
    /^(?:https?:\/\/)?github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/pull\/(\d+)/,
  )
  if (!match) return null
  const prNumber = parseInt(match[3], 10)
  if (isNaN(prNumber) || prNumber <= 0) return null
  return { owner: match[1], repo: match[2], prNumber }
}

/**
 * Parse a GitHub issue URL and extract the issue number.
 * Supports https://github.com/owner/repo/issues/N or plain number.
 */
export function parseIssueInput(input: string): number | null {
  const trimmed = input.trim()
  // URL: https://github.com/owner/repo/issues/N
  const urlMatch = trimmed.match(/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/)
  if (urlMatch) {
    const n = parseInt(urlMatch[1], 10)
    return isNaN(n) || n <= 0 ? null : n
  }
  // Plain number
  const n = parseInt(trimmed, 10)
  if (!isNaN(n) && n > 0 && String(n) === trimmed) return n
  return null
}

/** Canonical PR URL for hashing: https://github.com/owner/repo/pull/N */
export function canonicalPRUrl(owner: string, repo: string, prNumber: number): string {
  return `https://github.com/${owner}/${repo}/pull/${prNumber}`
}

/**
 * Fetch a GitHub issue by owner/repo/issueNumber.
 * Returns structured result with error classification.
 */
export async function fetchIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  signal?: AbortSignal,
): Promise<FetchResult<GitHubIssue>> {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`
  try {
    const res = await fetch(url, { headers: GITHUB_HEADERS, signal: boundedSignal(signal) })
    const retrievedAt = new Date().toISOString()

    if (res.status === 404)
      return { ok: false, reason: 'Issue or repository not found (404). The repository may be private or the issue number may be incorrect.', status: 404 }
    if (res.status === 403) {
      const body: unknown = await res.json().catch(() => ({}))
      const msg = (body as { message?: string }).message ?? ''
      if (msg.toLowerCase().includes('rate limit'))
        return { ok: false, reason: 'GitHub API rate limit reached. Try again in a few minutes.', status: 403 }
      return { ok: false, reason: 'Access denied by GitHub API (403). The repository may be private.', status: 403 }
    }
    if (!res.ok) return { ok: false, reason: `GitHub API error (${res.status}). Please try again.`, status: res.status }

    const data: unknown = await res.json()
    if (typeof data !== 'object' || data === null || typeof (data as Record<string, unknown>).number !== 'number')
      return { ok: false, reason: 'Unexpected response shape from GitHub API.' }

    // Reject pull requests returned on the issues endpoint
    if ((data as { pull_request?: unknown }).pull_request !== undefined)
      return { ok: false, reason: 'That URL points to a pull request, not an issue. Please enter an issue number.' }

    return { ok: true, data: data as GitHubIssue, retrievedAt }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Distinguish caller-cancelled from timeout
      return { ok: false, reason: 'Request was cancelled.' }
    }
    if (err instanceof DOMException && err.name === 'TimeoutError')
      return { ok: false, reason: 'GitHub API request timed out (10 s). Check your connection and try again.' }
    if (err instanceof TypeError)
      return { ok: false, reason: 'Network error reaching GitHub API. Check your connection and try again.' }
    return { ok: false, reason: 'Unexpected error fetching issue data.' }
  }
}

/**
 * Fetch a GitHub PR by owner/repo/prNumber.
 * Returns structured result with full schema validation.
 */
export async function fetchPR(
  owner: string,
  repo: string,
  prNumber: number,
  signal?: AbortSignal,
): Promise<FetchResult<GitHubPR>> {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`
  try {
    const res = await fetch(url, { headers: GITHUB_HEADERS, signal: boundedSignal(signal) })
    const retrievedAt = new Date().toISOString()

    if (res.status === 404)
      return { ok: false, reason: 'Pull request or repository not found (404).', status: 404 }
    if (res.status === 403) {
      const body: unknown = await res.json().catch(() => ({}))
      const msg = (body as { message?: string }).message ?? ''
      if (msg.toLowerCase().includes('rate limit'))
        return { ok: false, reason: 'GitHub API rate limit reached. Try again in a few minutes.', status: 403 }
      return { ok: false, reason: 'Access denied by GitHub API (403).', status: 403 }
    }
    if (!res.ok) return { ok: false, reason: `GitHub API error (${res.status}).`, status: res.status }

    const data: unknown = await res.json()
    if (
      typeof data !== 'object' ||
      data === null ||
      typeof (data as GitHubPR).number !== 'number' ||
      typeof (data as GitHubPR).user?.login !== 'string' ||
      typeof (data as GitHubPR).base?.repo?.full_name !== 'string'
    )
      return { ok: false, reason: 'Unexpected response shape from GitHub API.' }

    return { ok: true, data: data as GitHubPR, retrievedAt }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError')
      return { ok: false, reason: 'Request was cancelled.' }
    if (err instanceof DOMException && err.name === 'TimeoutError')
      return { ok: false, reason: 'GitHub API request timed out (10 s). Check your connection and try again.' }
    if (err instanceof TypeError)
      return { ok: false, reason: 'Network error reaching GitHub API.' }
    return { ok: false, reason: 'Unexpected error fetching pull request data.' }
  }
}
