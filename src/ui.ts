import type { AgentAction, AgentStep, createAgent } from "@ui-sdk/web/agent"

type Agent = ReturnType<typeof createAgent>

type Context = {
  agent: Agent
  ask: (question: string) => Promise<boolean>
  // The measured result of each UI, by ID, from results/*.json at build time. Row F11 draws them.
  results?: Record<string, Pick<Result, "snapshotBytes" | "treeBytes">>
}

type UI = {
  id: string
  request: string
  css?: string
  look?: { webCss?: boolean; tokens?: boolean }
  allow?: (step: AgentAction, ask: Context["ask"]) => boolean | Promise<boolean>
  mount: (root: HTMLElement, context: Context) => void
  task?: {
    steps: AgentStep[]
    person?: "allow" | "deny"
    done: (root: HTMLElement) => boolean
  }
  // Each break is applied by the gate: find is replaced with replace, and the test named caught must fail.
  breaks?: { broke: string; find: string; replace: string; caught: string }[]
}

type Row = {
  id: string
  title: string
  set: string
  layer: number
  role: string
  kind: string
  adds: string[]
  shows: string
}

type Result = {
  at: string
  tests: { passed: number; names: string[] }
  snapshotBytes: number | null
  treeBytes: number
  tabStops: number
  lines: number
}

type Entry = { def: UI; source: string; result: Result | null }

export type { Agent, Context, Entry, Result, Row, UI }
