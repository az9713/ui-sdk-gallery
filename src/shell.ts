import webCss from "@ui-sdk/core/web.css?inline"
import { createAgent } from "@ui-sdk/web/agent"
import { confirm } from "@ui-sdk/web/alert-dialog"
import "@ui-sdk/web/overlays"
import "@ui-sdk/web/segmented-control"
import rowData from "../rows.json"
import shellCss from "./shell.css?inline"
import type { Agent, Context, Entry, Row } from "./ui"

const rows: Row[] = rowData
const LAYERS = ["", "behavior", "primitive", "parts", "complete part", "style"]

const esc = (text: unknown) =>
  String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

const style = (css: string) => document.head.append(Object.assign(document.createElement("style"), { textContent: css }))

function start(entries: Entry[], results: NonNullable<Context["results"]>) {
  style(shellCss)
  const id = new URLSearchParams(location.search).get("ui")
  const entry = entries.find((e) => e.def.id === id)
  if (entry) show(entry, entries, results)
  else index(entries)
}

function show(entry: Entry, entries: Entry[], results: NonNullable<Context["results"]>) {
  const { def, source, result } = entry
  const row = rows.find((r) => r.id === def.id)
  if (!row) throw new Error(`${def.id} is not a row of rows.json`)
  if (def.look?.webCss !== false) style(webCss)
  if (def.look?.tokens === false) document.documentElement.dataset.tokens = "off"
  if (def.css) style(def.css)
  document.title = `${row.id} ${row.title}`

  const at = entries.indexOf(entry)
  const link = (e: Entry | undefined, text: string) =>
    e ? `<a href="?ui=${e.def.id}">${text} ${e.def.id}</a>` : `<span class="g-off">${text}</span>`
  const lines = source.split("\n").length
  document.body.innerHTML = `
    <header class="g-top" data-agent-hidden>
      <nav aria-label="Gallery"><a href="?">All UIs</a>${link(entries[at - 1], "Previous")}${link(entries[at + 1], "Next")}</nav>
      <h1><span class="g-id">${row.id}</span> ${esc(row.title)}</h1>
    </header>
    <main class="g-main">
      <section class="g-stage" data-stage data-ui="${row.id}" aria-label="${esc(row.title)}"></section>
      <aside class="g-card" data-agent-hidden aria-label="Card for ${row.id}">
        <section>
        <h2>Position on the 3 orthogonal axes</h2>
        <dl>
          <dt>Axis 1, role</dt><dd>${row.role}</dd>
          <dt>Axis 2, kind of help</dt><dd>${row.kind}</dd>
          <dt>Axis 3, layer</dt><dd>${row.layer}, ${LAYERS[row.layer]}</dd>
        </dl>
        </section>
        <section>
        <h2>Build face</h2>
        <p class="g-request">${esc(def.request)}</p>
        <dl>
          <dt>Adds</dt><dd>${row.adds.map((a) => `<code>${esc(a)}</code>`).join(" ") || "none"}</dd>
          <dt>Shows</dt><dd>${esc(row.shows)}</dd>
          <dt>Lines</dt><dd>${lines}</dd>
        </dl>
        </section>
        <section>
        <h2>Check face</h2>
        ${
          result
            ? `<p>${result.tests.passed} tests passed. Gate passed at ${esc(result.at)}.</p>
               <ul>${result.tests.names.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`
            : `<p>No gate result is recorded.</p>`
        }
        ${
          def.breaks?.length
            ? `<p>Deliberate breaks that a test caught: ${def.breaks.length}.</p>
               <ul>${def.breaks.map((b) => `<li>${esc(b.broke)} Caught by the test "${esc(b.caught)}".</li>`).join("")}</ul>`
            : ""
        }
        </section>
        <section>
        <h2>Use face</h2>
        <p><button type="button" class="g-run">Run the agent task</button> <span class="g-outcome" role="status"></span></p>
        <p><span class="g-bytes"></span> bytes of bridge snapshot${
          result ? `, ${result.treeBytes} bytes of accessibility tree (my measurement)` : ""
        }.</p>
        <details><summary>Bridge snapshot</summary><pre class="g-snapshot"></pre></details>
        </section>
      </aside>
    </main>
    <div class="g-overlays" data-agent-hidden><ui-overlay-host></ui-overlay-host></div>`

  const ask = (question: string) =>
    confirm({ title: "Allow the agent to do this?", description: question, confirmLabel: "Allow", cancelLabel: "Deny" })
  // The bridge hears components as they are made, so it exists before the UI mounts.
  const agent = createAgent({
    allow: (step) => (def.allow ? def.allow(step, ask) : step.confirm ? ask(step.confirm) : true),
  })
  const stage = document.querySelector<HTMLElement>("[data-stage]")!
  def.mount(stage, { agent, ask, results })

  const pre = document.querySelector(".g-snapshot")!
  const bytes = document.querySelector(".g-bytes")!
  const outcome = document.querySelector(".g-outcome")!
  const refresh = () => {
    const snapshot = agent.snapshot()
    pre.textContent = JSON.stringify(snapshot, null, 1)
    bytes.textContent = String(new TextEncoder().encode(JSON.stringify(snapshot)).length)
  }
  const runTask = async () => {
    if (!def.task) return { ok: false, error: { step: 0, message: "This UI has no agent task." } }
    const outcomeOf = await agent.act({ steps: def.task.steps })
    outcome.textContent = outcomeOf.ok ? "The task is done." : `Stopped: ${outcomeOf.error?.message}`
    refresh()
    return outcomeOf
  }
  const run = document.querySelector<HTMLButtonElement>(".g-run")!
  if (def.task) run.addEventListener("click", runTask)
  else run.disabled = true
  agent.subscribe(() => queueMicrotask(refresh))
  requestAnimationFrame(() => {
    refresh()
    Object.assign(window, {
      gallery: { id: row.id, agent, stage, runTask, done: () => def.task?.done(stage), person: def.task?.person ?? "allow", breaks: def.breaks ?? [] },
    })
  })
}

function index(entries: Entry[]) {
  document.title = "UI SDK gallery"
  const built = new Set(entries.map((e) => e.def.id))
  const control = (name: string, values: string[]) => `
    <ui-segmented-control aria-label="${name}" default-value="All" data-filter="${name.toLowerCase()}">
      <ui-segmented-control-indicator></ui-segmented-control-indicator>
      ${["All", ...values].map((v) => `<ui-segmented-control-item value="${v}">${v}</ui-segmented-control-item>`).join("")}
    </ui-segmented-control>`
  style(webCss)
  document.body.innerHTML = `
    <header class="g-top"><h1>UI SDK gallery</h1></header>
    <main class="g-index">
      <p>${built.size} of ${rows.length} UIs are built. Each UI has a position on the 3 orthogonal axes: axis 1 is the role, axis 2 is the kind of help, axis 3 is the layer.</p>
      <div class="g-filters">
        <label>Axis 1, role ${control("Role", ["Build", "Use"])}</label>
        <label>Axis 2, kind of help ${control("Kind", ["Mechanism", "Knowledge", "Check", "Control"])}</label>
        <label>Axis 3, layer ${control("Layer", ["1", "2", "3", "4", "5"])}</label>
      </div>
      <table>
        <thead><tr><th>ID</th><th>UI</th><th>Role</th><th>Kind of help</th><th>Layer</th><th>State</th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr data-role="${r.role}" data-kind="${r.kind}" data-layer="${r.layer}">
              <td>${r.id}</td>
              <td>${built.has(r.id) ? `<a href="?ui=${r.id}">${esc(r.title)}</a>` : esc(r.title)}</td>
              <td>${r.role}</td><td>${r.kind}</td><td>${r.layer}, ${LAYERS[r.layer]}</td>
              <td>${built.has(r.id) ? "Built" : "Not built"}</td></tr>`,
          )
          .join("")}</tbody>
      </table>
    </main>`
  const filter: Record<string, string> = { role: "All", kind: "All", layer: "All" }
  for (const el of document.querySelectorAll<HTMLElement>("[data-filter]"))
    el.addEventListener("valuechange", (event) => {
      filter[el.dataset.filter!] = (event as CustomEvent<{ value: string }>).detail.value
      for (const tr of document.querySelectorAll<HTMLElement>("tbody tr"))
        tr.hidden = Object.entries(filter).some(([key, value]) => value !== "All" && tr.dataset[key] !== value)
    })
}

export { start }
export type { Agent }
