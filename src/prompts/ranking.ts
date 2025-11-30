import { Prompt } from './models'

function scorePrefix(title: string, prefix: string): number {
  if (!prefix) return 0.5
  const t = title.toLowerCase()
  const p = prefix.toLowerCase()
  if (t.startsWith(p)) return 1
  if (t.includes(p)) return 0.7
  return 0
}

function scoreLanguage(prompt: Prompt, lang?: string): number {
  if (!lang) return 0.3
  const ls = prompt.scope?.languages
  if (!ls || ls.length === 0) return 0.3
  return ls.includes(lang) ? 0.6 : 0
}

function scorePath(prompt: Prompt, path?: string): number {
  if (!path) return 0.2
  const ps = prompt.scope?.paths
  if (!ps || ps.length === 0) return 0.2
  return ps.some((p: string) => path.includes(p)) ? 0.4 : 0
}

function scoreUsage(prompt: Prompt): number {
  return Math.min(0.5, prompt.usageCount * 0.05)
}

function scoreFresh(prompt: Prompt): number {
  const days = (Date.now() - prompt.updatedAt) / (1000 * 60 * 60 * 24)
  return Math.max(0, 0.3 - days * 0.01)
}

export function rank(prompts: Prompt[], prefix: string, lang?: string, path?: string): Prompt[] {
  return prompts
    .slice()
    .sort((a, b) => {
      const sa = (a.pinned ? 1.5 : 0) + scorePrefix(a.title, prefix) + scoreLanguage(a, lang) + scorePath(a, path) + scoreUsage(a) + scoreFresh(a)
      const sb = (b.pinned ? 1.5 : 0) + scorePrefix(b.title, prefix) + scoreLanguage(b, lang) + scorePath(b, path) + scoreUsage(b) + scoreFresh(b)
      return sb - sa
    })
}
