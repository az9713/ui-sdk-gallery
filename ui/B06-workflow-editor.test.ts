import { checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { nodeEditor } from "./B06-workflow-editor"

// 4 nodes of 168 by 64 units. Alpha has an output, Beta an input and an output, Gamma and Delta an input.
const titles = { a: "Alpha", b: "Beta", c: "Gamma", d: "Delta" }
const defaultPositions = { a: { x: 32, y: 120 }, b: { x: 272, y: 120 }, c: { x: 512, y: 32 }, d: { x: 512, y: 248 } }
const sides: Record<string, string[]> = { a: ["out"], b: ["in", "out"], c: ["in"], d: ["in"] }
const node = (key: keyof typeof titles) =>
  `<node value="${key}">${sides[key].map((side) => `<port value="${key}:${side}"></port>`).join("")}${titles[key]}</node>`
const markup = `<root aria-label="Flow"><world><wires></wires>${(["a", "b", "c", "d"] as const).map(node).join("")}</world><tool value="in">Zoom in</tool><tool value="out">Zoom out</tool><tool value="fit">Fit</tool></root>`
const options = { titles, defaultPositions }
type View = ReturnType<typeof mount<typeof nodeEditor>>
const focused = () => document.activeElement?.getAttribute("aria-label")

// jsdom has no layout. Each element gets its own getBoundingClientRect, as mount() gives it one.
function box(el: Element, left: number, top: number, width: number, height: number) {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) }),
  })
}
// The frame is 800 by 400 at (0, 0), so at the start a canvas unit is a screen pixel. A port is 14 px, centered on its node's edge.
function layOut(frame: Element, find: (port: string) => Element | null | undefined, positions: Record<string, { x: number; y: number }>) {
  box(frame, 0, 0, 800, 400)
  for (const [key, { x, y }] of Object.entries(positions)) {
    const into = find(`${key}:in`)
    const out = find(`${key}:out`)
    if (into) box(into, x - 7, y + 25, 14, 14)
    if (out) box(out, x + 161, y + 25, 14, 14)
  }
}
function mountLaidOut() {
  const view = mount(nodeEditor, options, markup)
  layOut(view.root, (port) => view.part("port", port), defaultPositions)
  return view
}
const port = (view: View, key: string) => view.part("port", key)!.getAttribute("data-connect")

// A mouse press on `el` at `from`, moves to `to`, then up. `during` runs before the button goes up.
async function press(el: Element, from: [number, number], to: [number, number], during?: () => void) {
  const at = (x: number, y: number, buttons = 1) =>
    ({ clientX: x, clientY: y, button: 0, buttons, pointerId: 7, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true }) as PointerEventInit
  el.dispatchEvent(new PointerEvent("pointerdown", at(...from)))
  for (let i = 1; i <= 4; i++)
    el.dispatchEvent(new PointerEvent("pointermove", at(from[0] + ((to[0] - from[0]) * i) / 4, from[1] + ((to[1] - from[1]) * i) / 4)))
  await settle()
  during?.()
  el.dispatchEvent(new PointerEvent("pointerup", at(...to, 0)))
  await settle()
}

test("keyboard: the canvas and the nodes are 2 tab stops, and the arrow keys go to the nearest node on screen", async () => {
  const view = mountLaidOut()
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(view.root)
    await view.keys("Tab")
    expect(focused()).toBe("Alpha")
    expect(view.root.querySelectorAll('[role="group"][tabindex="0"]').length).toBe(1)
    await view.keys("ArrowRight")
    expect(focused()).toBe("Beta")
    await view.keys("ArrowRight")
    expect(focused()).toBe("Gamma")
    await view.keys("ArrowDown")
    expect(focused()).toBe("Delta")
    await view.keys("ArrowLeft")
    expect(focused()).toBe("Beta")
    await view.keys("ArrowUp")
    expect(focused()).toBe("Gamma")
    await view.keys("Home")
    expect(focused()).toBe("Alpha")
    await view.keys("End")
    expect(focused()).toBe("Delta")
    expect(view.root.querySelectorAll('[role="group"][tabindex="0"]').length).toBe(1)
    expect(view.part("node", "d")!.getAttribute("tabindex")).toBe("0")
    // Each node is in view, so focus does not pan.
    expect(view.state.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
  } finally {
    view.unmount()
  }
})

test("keyboard: Alt with an arrow moves the focused node 8 units, Shift makes it 80, and the canvas edge stops it", async () => {
  const view = mountLaidOut()
  try {
    view.part("node", "b")!.focus()
    await view.keys("Alt+ArrowRight")
    expect(view.state.positions.b).toEqual({ x: 280, y: 120 })
    expect(view.changes.at(-1)).toMatchObject({ key: "positions", reason: "move-key", source: "keyboard" })
    await view.keys("Alt+Shift+ArrowDown")
    expect(view.state.positions.b).toEqual({ x: 280, y: 200 })
    expect(view.part("node", "b")!.getAttribute("style")).toContain("left: 280px; top: 200px")
    expect(focused()).toBe("Beta")
    expect(view.announced.at(-1)).toBe("Beta moved to 280, 200.")
    view.part("node", "a")!.focus()
    await view.keys("Alt+Shift+ArrowLeft")
    expect(view.state.positions.a).toEqual({ x: 0, y: 120 })
    await view.keys("Alt+ArrowLeft")
    expect(view.state.positions.a).toEqual({ x: 0, y: 120 })
  } finally {
    view.unmount()
  }
})

test("keyboard: C starts a connection from a node's output, the arrow keys choose an input, and Enter or Space connects", async () => {
  const view = mountLaidOut()
  try {
    view.part("node", "a")!.focus()
    await view.keys("c")
    expect(view.state.connecting).toMatchObject({ from: "a:out", to: null, keyboard: true })
    expect(port(view, "a:out")).toBe("source")
    expect(view.announced.at(-1)).toBe("Connecting from Alpha output. Arrows choose a port, Enter connects, Escape cancels.")
    await view.keys("ArrowRight")
    expect(view.state.connecting?.to).toBe("b:in")
    expect(port(view, "b:in")).toBe("target")
    await view.keys("Enter")
    expect(view.state.value).toEqual([{ from: "a:out", to: "b:in" }])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "connect-key", source: "keyboard" })
    expect(view.state.connecting).toBe(null)
    expect(port(view, "b:in")).toBe(null)
    expect(focused()).toBe("Alpha")
    expect(view.announced.at(-1)).toBe("Connected Alpha output to Beta input.")
    expect(view.part("node", "b")!.getAttribute("aria-description")).toBe("Input from Alpha.")
    expect(view.part("node", "a")!.getAttribute("aria-description")).toBe("Output to Beta.")

    view.part("node", "b")!.focus()
    await view.keys("C", "ArrowUp", "Space")
    expect(view.state.value).toEqual([
      { from: "a:out", to: "b:in" },
      { from: "b:out", to: "c:in" },
    ])
    expect(view.part("node", "b")!.getAttribute("aria-description")).toBe("Input from Alpha. Output to Gamma.")
  } finally {
    view.unmount()
  }
})

test("keyboard: Escape cancels a connection, and an output takes only an input of another node that is not yet connected", async () => {
  const view = mountLaidOut()
  try {
    view.api.connectNodes("Beta", "Delta")
    view.part("node", "b")!.focus()
    await view.keys("c")
    expect(port(view, "b:out")).toBe("source")
    expect(port(view, "a:out")).toBe(null)
    expect(port(view, "b:in")).toBe(null)
    expect(port(view, "c:in")).toBe("candidate")
    expect(port(view, "d:in")).toBe(null)
    await view.keys("Escape")
    expect(view.state.connecting).toBe(null)
    expect(port(view, "c:in")).toBe(null)
    expect(view.announced.at(-1)).toBe("Canceled.")
    expect(view.state.value).toEqual([{ from: "b:out", to: "d:in" }])
    expect(focused()).toBe("Beta")
    // Gamma has no output, so C does nothing there.
    view.part("node", "c")!.focus()
    await view.keys("c")
    expect(view.state.connecting).toBe(null)
  } finally {
    view.unmount()
  }
})

test("keyboard: on the canvas, the arrow keys pan by 40 pixels, and =, - and 0 zoom", async () => {
  const view = mountLaidOut()
  try {
    view.root.focus()
    await view.keys("ArrowRight", "ArrowDown")
    expect(view.state.viewport).toEqual({ x: -40, y: -40, zoom: 1 })
    expect(view.changes.at(-1)).toMatchObject({ key: "viewport", reason: "pan-key", source: "keyboard" })
    await view.keys("ArrowLeft", "ArrowUp")
    expect(view.state.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
    // On a node, the arrow keys move focus, not the canvas.
    view.part("node", "a")!.focus()
    await view.keys("ArrowRight")
    expect(focused()).toBe("Beta")
    expect(view.state.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
    view.root.focus()
    await view.keys("=")
    expect(view.state.viewport.zoom).toBe(1.25)
    expect(view.changes.at(-1)).toMatchObject({ key: "viewport", reason: "zoom-key" })
    expect(view.announced.at(-1)).toBe("Zoom 125%")
    await view.keys("-")
    expect(view.state.viewport.zoom).toBe(1)
    await view.keys("=", "=", "0")
    expect(view.state.viewport.zoom).toBe(1)
  } finally {
    view.unmount()
  }
})

test("pointer: a drag on a node moves it by the distance divided by the zoom, on the 8 unit grid, and its wires follow", async () => {
  const view = mountLaidOut()
  try {
    view.api.connectNodes("Alpha", "Beta")
    view.api.zoomTo(2)
    const wire = () => view.part("wires")!.querySelector("[data-edge]")!.getAttribute("d")
    expect(wire()).toBe("M200 152C248 152 224 152 272 152")
    // 64 by 32 screen pixels at zoom 2 is 32 by 16 units.
    await press(view.part("node", "b")!, [356, 152], [420, 184], () => {
      expect(view.part("node", "b")!.hasAttribute("data-dragging")).toBe(true)
      expect(view.part("node", "b")!.getAttribute("style")).toContain("translate")
      expect(wire()).toBe("M200 152C252 152 252 168 304 168")
    })
    expect(view.state.positions.b).toEqual({ x: 304, y: 136 })
    expect(view.changes.at(-1)).toMatchObject({ key: "positions", reason: "drag" })
    expect(view.part("node", "b")!.hasAttribute("data-dragging")).toBe(false)
    expect(wire()).toBe("M200 152C252 152 252 168 304 168")
  } finally {
    view.unmount()
  }
})

test("pointer: a drag from an output port to an input port connects them and does not move the node", async () => {
  const view = mountLaidOut()
  try {
    await view.drag(view.part("port", "a:out")!, { to: view.part("port", "b:in")! })
    expect(view.state.value).toEqual([{ from: "a:out", to: "b:in" }])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "drag" })
    expect(view.state.positions.a).toEqual({ x: 32, y: 120 })
    expect(view.changes.filter((change) => change.key === "positions")).toEqual([])
    await view.drag(view.part("port", "b:out")!, { by: { x: 40, y: 200 } })
    expect(view.state.value).toEqual([{ from: "a:out", to: "b:in" }])
    expect(view.state.connecting).toBe(null)
    expect(view.state.positions.b).toEqual({ x: 272, y: 120 })
  } finally {
    view.unmount()
  }
})

test("pointer: a drag on empty canvas pans it, the wheel pans, and Ctrl with the wheel zooms", async () => {
  const view = mountLaidOut()
  try {
    await view.drag(view.root, { by: { x: 48, y: 24 } })
    expect(view.state.viewport).toEqual({ x: 48, y: 24, zoom: 1 })
    expect(view.changes.at(-1)).toMatchObject({ key: "viewport", reason: "drag" })
    const wheel = (init: WheelEventInit) => view.root.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init }))
    wheel({ deltaX: 0, deltaY: 100 })
    expect(view.state.viewport).toEqual({ x: 48, y: -76, zoom: 1 })
    expect(view.changes.at(-1)).toMatchObject({ key: "viewport", reason: "wheel" })
    wheel({ deltaY: -100, ctrlKey: true, clientX: 400, clientY: 200 })
    expect(view.state.viewport.zoom).toBeGreaterThan(1)
    // A drag that starts on a node moves the node, not the canvas.
    const before = view.state.viewport
    await view.drag(view.part("node", "a")!, { by: { x: 32, y: 0 } })
    expect(view.state.viewport).toEqual(before)
  } finally {
    view.unmount()
  }
})

test("pointer: Zoom in, Zoom out and Fit change the zoom", async () => {
  const view = mountLaidOut()
  try {
    await view.click(view.part("tool", "in")!)
    expect(view.state.viewport.zoom).toBe(1.25)
    await view.click(view.part("tool", "out")!)
    expect(view.state.viewport.zoom).toBe(1)
    view.api.zoomTo(3)
    await view.click(view.part("tool", "fit")!)
    const { x, y, zoom } = view.state.viewport
    expect(zoom).toBeLessThanOrEqual(1)
    // Every node is inside the 800 by 400 frame.
    for (const { x: left, y: top } of Object.values(view.state.positions)) {
      expect(x + left * zoom).toBeGreaterThanOrEqual(0)
      expect(y + top * zoom).toBeGreaterThanOrEqual(0)
      expect(x + (left + 168) * zoom).toBeLessThanOrEqual(800)
      expect(y + (top + 64) * zoom).toBeLessThanOrEqual(400)
    }
  } finally {
    view.unmount()
  }
})

test("agent: connectNodes, moveNode, zoomTo and fitView check their arguments", async () => {
  const view = mountLaidOut()
  try {
    expect(() => view.api.connectNodes("Alpha", "Omega")).toThrow('No node "Omega". Nodes: Alpha, Beta, Gamma, Delta.')
    expect(() => view.api.connectNodes("Gamma", "Delta")).toThrow("Gamma has no output.")
    expect(() => view.api.connectNodes("Beta", "Alpha")).toThrow("Alpha has no input.")
    expect(() => view.api.connectNodes("Beta", "Beta")).toThrow("Beta cannot connect to itself.")
    expect(view.api.connectNodes("alpha", "b")).toBe(true)
    expect(() => view.api.connectNodes("Alpha", "Beta")).toThrow("Alpha is already connected to Beta.")
    expect(view.state.value).toEqual([{ from: "a:out", to: "b:in" }])
    expect(view.changes.at(-1)).toMatchObject({ key: "value", reason: "imperative" })

    expect(() => view.api.moveNode("Beta", "left" as never, 8)).toThrow('moveNode takes a node and 2 numbers, like moveNode("Beta", 240, 80).')
    expect(view.api.moveNode("Beta", 2000, -50)).toBe(true)
    expect(view.state.positions.b).toEqual({ x: 792, y: 0 })

    expect(() => view.api.zoomTo("big")).toThrow('zoomTo takes a scale, like 1.5 or "150%".')
    view.api.zoomTo("200%")
    expect(view.state.viewport.zoom).toBe(2)
    view.api.zoomTo(10)
    expect(view.state.viewport.zoom).toBe(4)
    view.api.fitView()
    expect(view.state.viewport.zoom).toBeLessThanOrEqual(1)
    expect(view.changes.at(-1)).toMatchObject({ key: "viewport", reason: "imperative" })
  } finally {
    view.unmount()
  }
})

test("server: the node editor renders with no DOM", () => {
  checkServer(nodeEditor, options, markup)
})

// checkDirection expects Left and Right to swap in right to left. On a canvas they do not: they are physical.
test("direction: in both text directions, Right goes to the node on the right, moves it right and pans the same way", async () => {
  const results: unknown[] = []
  try {
    for (const dir of ["ltr", "rtl"]) {
      document.documentElement.dir = dir
      const view = mountLaidOut()
      try {
        view.part("node", "a")!.focus()
        await view.keys("ArrowRight", "Alt+ArrowRight")
        const after = { focused: focused(), b: view.state.positions.b }
        view.root.focus()
        await view.keys("ArrowRight")
        results.push({ ...after, viewport: view.state.viewport })
      } finally {
        view.unmount()
      }
    }
  } finally {
    document.documentElement.dir = ""
  }
  expect(results[0]).toEqual({ focused: "Beta", b: { x: 280, y: 120 }, viewport: { x: -40, y: 0, zoom: 1 } })
  expect(results[1]).toEqual(results[0])
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const flow = () => page.root.querySelector<HTMLElement>("b06-flow")!
const pageNode = (key: string) => page.root.querySelector<HTMLElement>(`b06-flow-node[value="${key}"]`)!
const alt = (key: string) =>
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, altKey: true, bubbles: true, cancelable: true }))

test("names: the page names the canvas and each node, and draws a wire for each connection", async () => {
  page = mountUI(ui)
  await settle()
  expect(flow().getAttribute("role")).toBe("application")
  expect(flow().getAttribute("aria-label")).toBe("Workflow canvas")
  const nodes = [...page.root.querySelectorAll("b06-flow-node")]
  expect(nodes.map((el) => el.getAttribute("aria-label"))).toEqual(["Webhook", "Filter", "Send email", "Add sheet row"])
  expect(nodes.map((el) => el.getAttribute("aria-roledescription"))).toEqual(["node", "node", "node", "node"])
  expect(nodes.filter((el) => el.getAttribute("tabindex") === "0").length).toBe(1)
  expect(pageNode("filter").getAttribute("aria-description")).toBe("Input from Webhook. Output to Add sheet row.")
  expect([...page.root.querySelectorAll("b06-flow-tool button")].map((el) => el.textContent)).toEqual(["Zoom out", "Zoom in", "Fit"])
  expect(page.root.querySelectorAll("b06-flow-wires path[data-edge]").length).toBe(2)
  expect([...page.root.querySelectorAll("b06-flow-port")].every((el) => el.getAttribute("aria-hidden") === "true")).toBe(true)
  expect(page.root.querySelector("[data-zoom]")!.textContent).toBe("100%")
  expect(status()).toBe("No change yet.")
})

test("keyboard: on the page, C and Up connect Filter to Send email, Alt with Down moves it, and Zoom in zooms", async () => {
  const positions = { webhook: { x: 40, y: 152 }, filter: { x: 272, y: 152 }, email: { x: 528, y: 56 }, sheet: { x: 528, y: 248 } }
  layOut(flow(), (key) => page.root.querySelector(`b06-flow-port[value="${key}"]`), positions)
  pageNode("filter").focus()
  await keys("c", "ArrowUp", "Enter")
  expect(status()).toBe("Connected Filter to Send email.")
  expect(page.root.querySelectorAll("b06-flow-wires path[data-edge]").length).toBe(3)
  expect(pageNode("email").getAttribute("aria-description")).toBe("Input from Filter.")
  pageNode("email").focus()
  alt("ArrowDown")
  await settle()
  expect(status()).toBe("Moved Send email to 528, 64.")
  page.root.querySelector<HTMLElement>('b06-flow-tool[value="in"] button')!.focus()
  await keys("Enter")
  expect(page.root.querySelector("[data-zoom]")!.textContent).toBe("125%")
})

test("agent: an agent finds the canvas and its nodes, connects 2 nodes, moves 1, zooms, and is refused a connection that exists", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const entry = page.live().find((e) => e.label === "Workflow canvas")!
  expect(entry.actions).toEqual(["connectNodes", "moveNode", "zoomTo", "fitView"])
  const found = await page.agent.query({ within: "Workflow canvas", text: "sheet" })
  expect(JSON.stringify(found)).toContain("Add sheet row")

  const result = await page.agent.act({
    steps: [
      { ref: "Workflow canvas", action: "connectNodes", args: ["Webhook", "Add sheet row"] },
      { ref: "Workflow canvas", action: "moveNode", args: ["Add sheet row", 528, 320] },
      { ref: "Workflow canvas", action: "zoomTo", args: ["80%"] },
    ],
  })
  expect(result.ok, result.error?.message).toBe(true)
  expect(pageNode("sheet").getAttribute("aria-description")).toBe("Input from Filter, Webhook.")
  expect(status()).toBe("Moved Add sheet row to 528, 320.")
  expect(page.root.querySelector("[data-zoom]")!.textContent).toBe("80%")

  const refused = await page.agent.act({ steps: [{ ref: "Workflow canvas", action: "connectNodes", args: ["Filter", "Send email"] }] })
  expect(refused.ok).toBe(false)
  expect(refused.error?.message).toContain("Filter is already connected to Send email.")
  expect(page.root.querySelectorAll("b06-flow-wires path[data-edge]").length).toBe(4)
})
