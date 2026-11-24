import {
  type ChangeDetails,
  type ConnectDraft,
  type ConnectReason,
  createChange,
  createConnect,
  createMove,
  createRovingFocus,
  createViewport,
  css,
  definePrimitive,
  live,
  type MoveDraft,
  type MovePoint,
  type MoveReason,
  spatialMove,
  type Viewport,
  type ViewportReason,
} from "@ui-sdk/core"
import { createParts, wrappedButton } from "@ui-sdk/web"
import type { UI } from "../src/ui"

// A port's key is its node's key, ":", and its side: "filter:in", "filter:out".
type Edge = { from: string; to: string }
type Positions = Record<string, MovePoint>
type Options = {
  titles: Record<string, string>
  value?: Edge[]
  defaultValue?: Edge[]
  onValueChange?: (value: Edge[], details: ChangeDetails<ConnectReason | "imperative">) => void
  positions?: Positions
  defaultPositions?: Positions
  onPositionsChange?: (value: Positions, details: ChangeDetails<MoveReason>) => void
  viewport?: Viewport
  defaultViewport?: Viewport
  // "pan-key" is not in the shared vocabulary: an arrow key on the canvas pans it.
  onViewportChange?: (value: Viewport, details: ChangeDetails<ViewportReason | "pan-key">) => void
}
// titles is an option that each node renders from, so the state has a copy.
type State = {
  titles: Record<string, string>
  value: Edge[]
  positions: Positions
  viewport: Viewport
  moving: MoveDraft | null
  connecting: ConnectDraft | null
  focused: string | null
}

// The geometry comes from state, not from measured boxes: each node is 168 by 64 canvas units.
const NODE = { width: 168, height: 64 }
const WORLD = { width: 960, height: 540 }
const PAN: Record<string, [number, number]> = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }
const nodeOf = (port: string) => port.slice(0, port.lastIndexOf(":"))
const sideOf = (port: string) => port.slice(port.lastIndexOf(":") + 1)
const boxOf = ({ x, y }: MovePoint) => ({ left: x, top: y, right: x + NODE.width, bottom: y + NODE.height })

const placed = (state: State, node: string): MovePoint => {
  const point = state.positions[node]
  const moving = state.moving
  return moving?.keys.includes(node) ? { x: point.x + moving.dx, y: point.y + moving.dy } : point
}
const portPoint = (state: State, port: string) => {
  const { x, y } = placed(state, nodeOf(port))
  return { x: sideOf(port) === "out" ? x + NODE.width : x, y: y + NODE.height / 2 }
}
const curve = (a: MovePoint, b: MovePoint) => {
  const bend = Math.max(48, Math.abs(b.x - a.x) / 2)
  return `M${a.x} ${a.y}C${a.x + bend} ${a.y} ${b.x - bend} ${b.y} ${b.x} ${b.y}`
}
const wires = (state: State) => {
  const paths = state.value.map((edge) => `<path data-edge d="${curve(portPoint(state, edge.from), portPoint(state, edge.to))}"/>`)
  const draft = state.connecting
  if (draft) paths.push(`<path data-draft d="${curve(portPoint(state, draft.from), draft.to ? portPoint(state, draft.to) : draft)}"/>`)
  return `<svg width="${WORLD.width}" height="${WORLD.height}">${paths.join("")}</svg>`
}
const describe = (state: State, node: string) => {
  const name = (port: string) => state.titles[nodeOf(port)]
  const from = state.value.filter((edge) => nodeOf(edge.to) === node).map((edge) => name(edge.from))
  const to = state.value.filter((edge) => nodeOf(edge.from) === node).map((edge) => name(edge.to))
  const text = [from.length ? `Input from ${from.join(", ")}.` : "", to.length ? `Output to ${to.join(", ")}.` : ""]
  return text.join(" ").trim() || "Not connected."
}

const nodeEditor = definePrimitive({
  name: "node-editor",
  options: {
    titles: "value",
    value: "value",
    defaultValue: "value",
    onValueChange: "callback",
    positions: "value",
    defaultPositions: "value",
    onPositionsChange: "callback",
    viewport: "value",
    defaultViewport: "value",
    onViewportChange: "callback",
  },
  controlled: ["value", "positions", "viewport"],
  live: ["viewport", "moving", "connecting"],
  state: (options: Options): State => ({
    titles: options.titles,
    value: options.value ?? options.defaultValue ?? [],
    positions: options.positions ?? options.defaultPositions ?? {},
    viewport: options.viewport ?? options.defaultViewport ?? { x: 0, y: 0, zoom: 1 },
    moving: null,
    connecting: null,
    focused: null,
  }),
  sync: (options) => ({
    titles: options.titles,
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.positions === undefined ? {} : { positions: options.positions }),
    ...(options.viewport === undefined ? {} : { viewport: options.viewport }),
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const title = (node: string) => store.get().titles[node] ?? node
    const ports = () => [...context.parts()].filter((part) => part.slot === "port").map((part) => part.key)
    const linked = (from: string, to: string) => store.get().value.some((edge) => edge.from === from && edge.to === to)
    const join = (from: string, to: string, details: { reason: ConnectReason | "imperative"; event?: Event }) =>
      change("value", [...store.get().value, { from, to }], details)

    const viewport = createViewport(context, {
      key: "viewport",
      surface: () => context.element("root"),
      set: (value, details) => change("viewport", value, details),
    })
    const connect = createConnect(context, {
      slot: "port",
      draft: "connecting",
      canConnect: (from, to) => sideOf(from) === "out" && sideOf(to) === "in" && nodeOf(from) !== nodeOf(to) && !linked(from, to),
      point: (x, y) => viewport.toCanvas(x, y),
      connect: join,
      label: (port) => `${title(nodeOf(port))} ${sideOf(port) === "out" ? "output" : "input"}`,
    })
    const move = createMove(context, {
      key: "positions",
      draft: "moving",
      set: (value, details) => change("positions", value, details),
      step: () => 8,
      scale: () => store.get().viewport.zoom,
      bounds: () => ({ minX: 0, minY: 0, maxX: WORLD.width - NODE.width, maxY: WORLD.height - NODE.height }),
      label: title,
    })
    const roving = createRovingFocus<State, { value: string }>(context, {
      slot: "node",
      key: "focused",
      move: spatialMove({ rect: (_el, node) => boxOf(store.get().positions[node]) }),
    })

    const nodeKey = (name: unknown) => {
      const { titles } = store.get()
      const node = Object.keys(titles).find((key) => key === name || titles[key].toLowerCase() === String(name).toLowerCase())
      if (!node) throw new Error(`No node "${name}". Nodes: ${Object.values(titles).join(", ")}.`)
      return node
    }
    const all = () => {
      const boxes = Object.values(store.get().positions).map(boxOf)
      return {
        left: Math.min(...boxes.map((box) => box.left)),
        top: Math.min(...boxes.map((box) => box.top)),
        right: Math.max(...boxes.map((box) => box.right)),
        bottom: Math.max(...boxes.map((box) => box.bottom)),
      }
    }
    const fitView = () => viewport.fit(all(), { padding: 32, maxZoom: 1 })

    return {
      viewport,
      connect,
      move,
      roving,
      describe,
      nodes: () => Object.entries(store.get().titles).map(([value, label]) => ({ value, label })),
      connectNodes: (from: string, to: string) => {
        const out = `${nodeKey(from)}:out`
        const into = `${nodeKey(to)}:in`
        if (!ports().includes(out)) throw new Error(`${title(nodeOf(out))} has no output.`)
        if (!ports().includes(into)) throw new Error(`${title(nodeOf(into))} has no input.`)
        if (nodeOf(out) === nodeOf(into)) throw new Error(`${title(nodeOf(out))} cannot connect to itself.`)
        if (linked(out, into)) throw new Error(`${title(nodeOf(out))} is already connected to ${title(nodeOf(into))}.`)
        return join(out, into, { reason: "imperative" })
      },
      moveNode: (node: string, x: number, y: number) => {
        const key = nodeKey(node)
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y)))
          throw new Error(`moveNode takes a node and 2 numbers, like moveNode("${title(key)}", 240, 80).`)
        return move.moveTo(key, { x: Number(x), y: Number(y) })
      },
      zoomTo: (zoom: number | string) => {
        const scale = typeof zoom === "string" && zoom.trim().endsWith("%") ? parseFloat(zoom) / 100 : Number(zoom)
        if (!(scale > 0)) throw new Error(`zoomTo takes a scale, like 1.5 or "150%".`)
        return viewport.zoomTo(scale)
      },
      fitView,
      // The buttons call the viewport as code does, so they report imperative, with no event.
      tool: (key: string) => (key === "fit" ? fitView() : viewport.zoomBy(key === "in" ? 1.25 : 0.8)),
      reveal: (node: string, event: FocusEvent) =>
        viewport.reveal(boxOf(store.get().positions[node]), { padding: 24 }, { reason: "focus-in", event }),
      // Keys on a node: arrows go to the nearest node, Alt with an arrow moves it, C starts a connection.
      nodeKeydown: (event: KeyboardEvent, node: string, el: HTMLElement) => {
        if (connect.active()) {
          connect.keydown(event)
          return
        }
        if (move.keydown(event, node)) return
        if (event.key.toLowerCase() === "c" && !event.altKey && !event.ctrlKey && !event.metaKey) {
          if (ports().includes(`${node}:out`) && connect.start(`${node}:out`)) event.preventDefault()
          return
        }
        roving.keydown(event, el)
      },
      // Keys on the canvas: +, - and 0 zoom from anywhere in it, and the arrows pan when the canvas itself has focus.
      frameKeydown: (event: KeyboardEvent, own: boolean) => {
        if (event.defaultPrevented || viewport.keydown(event)) return
        const pan = PAN[event.key]
        if (!own || !pan || event.altKey || event.ctrlKey || event.metaKey) return
        event.preventDefault()
        const { x, y, zoom } = viewport.get()
        change("viewport", { x: x + pan[0], y: y + pan[1], zoom }, { reason: "pan-key", event })
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      role: "application",
      attrs: () => ({ tabindex: "0", style: css({ position: "relative", overflow: "clip", "touch-action": "none" }) }),
      on: {
        wheel: (event, { api }) => api.viewport.wheel(event),
        pointerdown: (event, { el, api }) => {
          if (event.target === el) api.viewport.pointerdown(event)
        },
        keydown: (event, { el, api }) => api.frameKeydown(event, event.target === el),
      },
    }),
    world: slot({
      attrs: () => ({ style: css({ position: "absolute", left: "0", top: "0" }) }),
      live: live((state, { api }) => ({ style: api.viewport.style(state) })),
    }),
    wires: slot({
      attrs: () => ({ "aria-hidden": "true" }),
      bind: (el, part) => {
        const draw = () => void (el.innerHTML = wires(part.store.get()))
        draw()
        return part.store.subscribe(draw)
      },
    }),
    node: slot<{ value: string }>({
      role: "group",
      focus: "roving",
      props: { value: "string" },
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-roledescription": "node",
        "aria-label": state.titles[part.key],
        "aria-description": part.api.describe(state, part.key),
        "aria-keyshortcuts": "C",
        style: css({
          position: "absolute",
          left: `${state.positions[part.key].x}px`,
          top: `${state.positions[part.key].y}px`,
          width: `${NODE.width}px`,
          height: `${NODE.height}px`,
          "touch-action": "none",
        }),
      }),
      live: live((state, { api, key }) => ({
        "data-dragging": api.move.dragging(state, key) ? "" : undefined,
        style: api.move.style(state, key),
      })),
      on: {
        keydown: (event, { el, api, key }) => api.nodeKeydown(event, key, el!),
        // A press on an output port never gets here: createConnect stops its propagation.
        pointerdown: (event, { el, api, key }) => api.move.pointerdown(event, key, el!),
        focus: (event, { api, key }) => api.reveal(key, event),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
    port: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (_state, { key }) => ({ "aria-hidden": "true", "data-side": sideOf(key) }),
      live: live((state, { api, key }) => ({ "data-connect": api.connect.role(state, key) })),
      on: {
        pointerdown: (event, { el, api, key }) => {
          if (el && sideOf(key) === "out") api.connect.pointerdown(event, key, el)
        },
      },
    }),
    tool: slot<{ value: string }>({
      role: "button",
      focus: "native",
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }) => api.tool(key),
    }),
  }),
  agent: { actions: ["connectNodes", "moveNode", "zoomTo", "fitView"], items: (api) => api.nodes() },
})

const NODES = [
  { key: "webhook", title: "Webhook", note: "New order", x: 40, y: 152, sides: ["out"] },
  { key: "filter", title: "Filter", note: "Total over $100", x: 272, y: 152, sides: ["in", "out"] },
  { key: "email", title: "Send email", note: "To the sales team", x: 528, y: 56, sides: ["in"] },
  { key: "sheet", title: "Add sheet row", note: "Orders sheet", x: 528, y: 248, sides: ["in"] },
]
const TITLES = Object.fromEntries(NODES.map((node) => [node.key, node.title]))
const POSITIONS = Object.fromEntries(NODES.map((node) => [node.key, { x: node.x, y: node.y }]))
const EDGES: Edge[] = [
  { from: "webhook:out", to: "filter:in" },
  { from: "filter:out", to: "sheet:in" },
]

createParts(nodeEditor, {
  root: { tag: "b06-flow", display: "block", options: () => ({ titles: TITLES, defaultPositions: POSITIONS, defaultValue: EDGES }) },
  world: "b06-flow-world",
  wires: "b06-flow-wires",
  node: "b06-flow-node",
  port: "b06-flow-port",
  tool: { tag: "b06-flow-tool", target: wrappedButton, display: "contents" },
})

const port = (node: string, side: string) => `<b06-flow-port value="${node}:${side}"></b06-flow-port>`
const html = `
<h2>New order alert</h2>
<b06-flow aria-label="Workflow canvas" aria-describedby="b06-keys">
  <b06-flow-world>
    <b06-flow-wires></b06-flow-wires>
    ${NODES.map(
      (node) => `<b06-flow-node value="${node.key}">${node.sides.includes("in") ? port(node.key, "in") : ""}
      <strong>${node.title}</strong> <span>${node.note}</span>${node.sides.includes("out") ? port(node.key, "out") : ""}</b06-flow-node>`,
    ).join("")}
  </b06-flow-world>
  <div data-tools>
    <span data-zoom>100%</span>
    <b06-flow-tool value="out"><button>Zoom out</button></b06-flow-tool>
    <b06-flow-tool value="in"><button>Zoom in</button></b06-flow-tool>
    <b06-flow-tool value="fit"><button>Fit</button></b06-flow-tool>
  </div>
</b06-flow>
<p id="b06-keys" data-hint>Drag empty space or scroll to pan, and hold Ctrl while you scroll to zoom. Drag a node to move it. Drag from the dot on its right side to the dot of another node to connect them. With the keyboard: on the canvas, the arrow keys pan and +, - and 0 zoom. On a node, the arrow keys go to the nearest node, Alt with an arrow moves it, and C starts a connection: the arrow keys choose an input, Enter connects, Escape cancels.</p>
<p role="status" data-status>No change yet.</p>`

const styles = `
[data-stage] { display: grid; gap: 16px; max-width: 880px; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] b06-flow {
  height: 400px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-muted); cursor: grab;
}
[data-stage] b06-flow:focus-visible, [data-stage] b06-flow-node:focus-visible, [data-stage] b06-flow-tool button:focus-visible {
  outline: 2px solid var(--ui-ring); outline-offset: 2px;
}
[data-stage] b06-flow-wires { position: absolute; left: 0; top: 0; pointer-events: none; }
[data-stage] b06-flow-wires svg { display: block; overflow: visible; fill: none; stroke: var(--ui-muted-foreground); stroke-width: 2; }
[data-stage] b06-flow-wires [data-draft] { stroke: var(--ui-primary); stroke-dasharray: 6 4; }
[data-stage] b06-flow-node {
  display: grid; align-content: center; gap: 2px; padding: 0 20px;
  border: 1px solid var(--ui-input); border-radius: var(--ui-radius); background: var(--ui-background); color: var(--ui-foreground);
  font-size: 0.875rem; line-height: 1.3; cursor: grab; user-select: none;
}
[data-stage] b06-flow-node span { color: var(--ui-muted-foreground); font-size: 0.8125rem; }
[data-stage] b06-flow-node[data-dragging] { cursor: grabbing; box-shadow: 0 8px 24px var(--ui-shadow); }
[data-stage] b06-flow-port {
  position: absolute; top: 50%; width: 14px; height: 14px; margin-top: -7px;
  border: 2px solid var(--ui-primary); border-radius: 50%; background: var(--ui-background);
}
[data-stage] b06-flow-port[data-side="in"] { left: -8px; }
[data-stage] b06-flow-port[data-side="out"] { right: -8px; cursor: crosshair; }
[data-stage] b06-flow-port[data-connect] { background: var(--ui-primary); }
[data-stage] b06-flow-port[data-connect="target"] { border-color: var(--ui-ring); background: var(--ui-ring); }
[data-stage] [data-tools] {
  position: absolute; right: 12px; bottom: 12px; display: flex; gap: 8px; align-items: center; padding: 8px 8px 8px 12px;
  border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-background); cursor: default;
}
[data-stage] [data-zoom] { min-width: 5ch; text-align: end; font-size: 0.875rem; }
[data-stage] b06-flow-tool button {
  height: 32px; padding: 0 12px; border: 1px solid var(--ui-input); border-radius: var(--ui-radius);
  background: var(--ui-background); color: var(--ui-foreground); font: inherit; font-size: 0.875rem; cursor: pointer;
}
[data-stage] [data-hint], [data-stage] [data-status] { max-width: 68ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const status = root.querySelector("[data-status]")!
  const zoom = root.querySelector("[data-zoom]")!
  const flow = root.querySelector("b06-flow")!
  const title = (port: string) => TITLES[nodeOf(port)]
  let edges = EDGES
  let positions = POSITIONS
  flow.addEventListener("valuechange", (event) => {
    const next = (event as CustomEvent<{ value: Edge[] }>).detail.value
    const added = next.find((edge) => !edges.some((old) => old.from === edge.from && old.to === edge.to))
    edges = next
    if (added) status.textContent = `Connected ${title(added.from)} to ${title(added.to)}.`
  })
  flow.addEventListener("positionschange", (event) => {
    const next = (event as CustomEvent<{ value: Positions }>).detail.value
    const moved = Object.keys(next).filter((key) => next[key].x !== positions[key]?.x || next[key].y !== positions[key]?.y)
    positions = next
    if (moved.length) status.textContent = `Moved ${moved.map((key) => TITLES[key]).join(", ")} to ${next[moved[0]].x}, ${next[moved[0]].y}.`
  })
  flow.addEventListener("viewportchange", (event) => {
    zoom.textContent = `${Math.round((event as CustomEvent<{ value: Viewport }>).detail.value.zoom * 100)}%`
  })
}

const ui: UI = {
  id: "B06",
  request:
    "Build a workflow node editor: a person pans and zooms the canvas, moves nodes by drag and by keyboard, and connects an output port to an input port by drag and by keyboard.",
  css: styles,
  mount,
  task: {
    steps: [
      { ref: "Workflow canvas", action: "connectNodes", args: ["Filter", "Send email"] },
      { ref: "Workflow canvas", action: "moveNode", args: ["Send email", 528, 40] },
      { ref: "Workflow canvas", action: "zoomTo", args: ["80%"] },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Moved Send email to 528, 40." &&
      root.querySelector("[data-zoom]")!.textContent === "80%" &&
      !!root.querySelector('b06-flow-node[value="filter"]')?.getAttribute("aria-description")?.includes("Send email"),
  },
  breaks: [
    {
      broke: "A drag no longer divides the pointer distance by the zoom.",
      find: "scale: () => store.get().viewport.zoom,",
      replace: "",
      caught: "pointer: a drag on a node moves it by the distance divided by the zoom, on the 8 unit grid, and its wires follow",
    },
    {
      broke: "An output can connect to another output.",
      find: 'sideOf(from) === "out" && sideOf(to) === "in" && ',
      replace: "",
      caught: "keyboard: Escape cancels a connection, and an output takes only an input of another node that is not yet connected",
    },
    {
      broke: "A drag on empty canvas no longer pans it.",
      find: "if (event.target === el) api.viewport.pointerdown(event)",
      replace: "",
      caught: "pointer: a drag on empty canvas pans it, the wheel pans, and Ctrl with the wheel zooms",
    },
    {
      broke: "C no longer starts a connection.",
      find: "&& connect.start(",
      replace: "&& Boolean(",
      caught: "keyboard: C starts a connection from a node's output, the arrow keys choose an input, and Enter or Space connects",
    },
    {
      broke: "Alt with an arrow no longer moves a node.",
      find: "if (move.keydown(event, node)) return",
      replace: "",
      caught: "keyboard: Alt with an arrow moves the focused node 8 units, Shift makes it 80, and the canvas edge stops it",
    },
    {
      broke: "The arrow keys on the canvas no longer pan it.",
      find: "if (!own || !pan",
      replace: "if (true || !pan",
      caught: "keyboard: on the canvas, the arrow keys pan by 40 pixels, and =, - and 0 zoom",
    },
    {
      broke: "=, - and 0 on the canvas no longer zoom.",
      find: " || viewport.keydown(event)",
      replace: "",
      caught: "keyboard: on the canvas, the arrow keys pan by 40 pixels, and =, - and 0 zoom",
    },
  ],
}

export { nodeEditor }
export default ui
