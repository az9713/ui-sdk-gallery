import type { AgentAction, AgentStep, createAgent } from "@ui-sdk/web/agent"

type Agent = ReturnType<typeof createAgent>

type Context = {
  agent: Agent
  ask: (question: string) => Promise<boolean>
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
  breaks?: { broke: string; caught: string }[]
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
