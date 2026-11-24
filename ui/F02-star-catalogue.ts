import "@ui-sdk/web/combobox"
import { easeCubicOut, format, randomLcg, randomNormal, randomUniform, scaleLog, timer } from "d3"
import type { UI } from "../src/ui"

type Kind = "Main sequence" | "Giant" | "Supergiant" | "White dwarf"
type Star = { value: string; label: string; temp: number; lum: number; kind: Kind; spectral: string }
type Combobox = HTMLElement & { items: { value: string; label: string }[]; value: string | null }

const COUNT = 5000
const ROW = 32
const LIST_HEIGHT = 288

// Approximate published values: temperature in K, luminosity in Suns.
const NAMED: [string, number, number, Kind, string][] = [
  ["Sun", 5772, 1, "Main sequence", "G2 V"],
  ["Vega", 9602, 40.1, "Main sequence", "A0 V"],
  ["Sirius A", 9940, 25.4, "Main sequence", "A1 V"],
  ["Sirius B", 25000, 0.056, "White dwarf", "DA2"],
  ["Altair", 7670, 10.6, "Main sequence", "A7 V"],
  ["Procyon A", 6530, 6.9, "Main sequence", "F5 IV-V"],
  ["Alpha Centauri A", 5790, 1.52, "Main sequence", "G2 V"],
  ["Proxima Centauri", 3042, 0.0017, "Main sequence", "M5.5 V"],
  ["Barnard's Star", 3134, 0.0035, "Main sequence", "M4 V"],
  ["Regulus", 12460, 316, "Main sequence", "B8 IV"],
  ["Achernar", 15000, 3150, "Main sequence", "B6 V"],
  ["Arcturus", 4286, 170, "Giant", "K1.5 III"],
  ["Aldebaran", 3910, 439, "Giant", "K5 III"],
  ["Capella", 4970, 79, "Giant", "G3 III"],
  ["Pollux", 4586, 41, "Giant", "K0 III"],
  ["Canopus", 7400, 10700, "Giant", "A9 II"],
  ["Spica", 25300, 20500, "Giant", "B1 III"],
  ["Bellatrix", 21800, 9211, "Giant", "B2 III"],
  ["Betelgeuse", 3600, 126000, "Supergiant", "M1 Ia"],
  ["Antares", 3660, 75900, "Supergiant", "M1.5 Iab"],
  ["Rigel", 12100, 120000, "Supergiant", "B8 Ia"],
  ["Deneb", 8525, 196000, "Supergiant", "A2 Ia"],
  ["Polaris", 6015, 1260, "Supergiant", "F7 Ib"],
  ["Naos", 40000, 550000, "Supergiant", "O4 If"],
  ["40 Eridani B", 16500, 0.013, "White dwarf", "DA2.9"],
]

const BANDS: [number, number, string][] = [
  [30000, 50000, "O"],
  [10000, 30000, "B"],
  [7500, 10000, "A"],
  [6000, 7500, "F"],
  [5200, 6000, "G"],
  [3700, 5200, "K"],
  [2400, 3700, "M"],
]

function spectralOf(temp: number, kind: Kind) {
  if (kind === "White dwarf") return `DA${Math.min(9, Math.max(1, Math.round(50400 / temp)))}`
  const [lo, hi, letter] = BANDS.find(([lo]) => temp >= lo) ?? BANDS[BANDS.length - 1]
  const digit = Math.min(9, Math.floor((10 * (hi - temp)) / (hi - lo)))
  const suffix = kind === "Main sequence" ? "V" : kind === "Giant" ? "III" : "Ib"
  return `${letter}${digit} ${suffix}`
}

// Seeded, so the plot is the same on each run.
function catalogue(): Star[] {
  const source = randomLcg(0.4207)
  const uniform = randomUniform.source(source)
  const normal = randomNormal.source(source)
  const scatter = normal(0, 0.22)
  const stars: Star[] = NAMED.map(([label, temp, lum, kind, spectral]) => ({
    value: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    temp,
    lum,
    kind,
    spectral,
  }))
  let hd = 1000
  const add = (temp: number, logLum: number, kind: Kind) => {
    hd += 1 + Math.floor(source() * 38)
    const t = Math.round(Math.min(44000, Math.max(2450, temp)))
    stars.push({ value: `hd-${hd}`, label: `HD ${hd}`, temp: t, lum: 10 ** Math.min(5.9, Math.max(-3.9, logLum)), kind, spectral: spectralOf(t, kind) })
  }
  const logTemp = uniform(Math.log10(2600), Math.log10(36000))
  const coolBias = uniform(0, 1)
  while (stars.length < COUNT) {
    const pick = source()
    if (pick < 0.78) {
      const lt = coolBias() < 0.45 ? Math.log10(2700) + source() * 0.45 : logTemp()
      add(10 ** lt, Math.min(5.4, 7 * (lt - Math.log10(5772)) + scatter()), "Main sequence")
    } else if (pick < 0.9) {
      const lt = Math.log10(3500) + source() * 0.2
      add(10 ** lt, 1.4 + (Math.log10(5400) - lt) * 7 + scatter(), "Giant")
    } else if (pick < 0.93) {
      add(10 ** (Math.log10(3400) + source() * 1.0), 4 + source() * 1.2, "Supergiant")
    } else {
      const lt = Math.log10(5200) + source() * 0.72
      add(10 ** lt, -3.84 + 4 * (lt - Math.log10(5772)) + scatter() * 0.6, "White dwarf")
    }
  }
  return stars
}

const kelvin = (temp: number) => `${format(",")(Math.round(temp / 10) * 10)} K`
const suns = format(",.2~r")
const luminosity = (star: Star) => `${suns(star.lum)} ${suns(star.lum) === "1" ? "Sun" : "Suns"}`
const summary = (star: Star) => `${star.label}: ${star.spectral}, ${kelvin(star.temp)}, luminosity of ${luminosity(star)}.`

const html = `
<div data-side>
  <h2>Star catalogue</h2>
  <p data-lede>5,000 stars. An agent finds one by query, and the list stays closed.</p>
  <ui-combobox default-value="sun">
    <div data-field>
      <ui-combobox-label>Star</ui-combobox-label>
      <div data-row>
        <ui-combobox-input><input placeholder="Search 5,000 stars" /></ui-combobox-input>
        <ui-combobox-trigger><button aria-label="Show stars"></button></ui-combobox-trigger>
      </div>
    </div>
    <ui-combobox-content hidden>
      <ui-combobox-empty>No star matches.</ui-combobox-empty>
      <div data-scroller><ui-combobox-list></ui-combobox-list></div>
    </ui-combobox-content>
  </ui-combobox>
  <dl data-facts>
    <dt>Spectral class</dt><dd data-fact="spectral"></dd>
    <dt>Temperature</dt><dd data-fact="temp"></dd>
    <dt>Luminosity</dt><dd data-fact="lum"></dd>
    <dt>Group</dt><dd data-fact="kind"></dd>
    <dt>List opened</dt><dd data-fact="opens"></dd>
  </dl>
  <p role="status" data-status></p>
</div>
<figure data-plot>
  <canvas role="img"></canvas>
  <figcaption>Hertzsprung-Russell diagram: temperature against luminosity for each star of the catalogue.</figcaption>
</figure>`

const css = `
[data-stage] { display: grid; grid-template-columns: minmax(260px, 300px) minmax(0, 1fr); gap: 32px; align-items: start; max-width: 1080px; }
[data-stage] [data-side] { display: grid; gap: 16px; }
[data-stage] h2 { margin: 0; font-size: 1.125rem; font-weight: 600; }
[data-stage] [data-lede] { margin: 0; color: var(--ui-muted-foreground); font-size: 0.875rem; }
[data-stage] [data-field] { display: grid; gap: 8px; }
[data-stage] ui-combobox-content { overflow: visible; max-height: none; }
[data-stage] [data-scroller] { position: relative; max-height: ${LIST_HEIGHT}px; overflow-y: auto; }
[data-stage] ui-combobox-list { display: block; position: relative; }
[data-stage] ui-combobox-list ui-combobox-item { position: absolute; inset-inline: 0; }
[data-stage] [data-facts] { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; padding: 12px 16px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); font-size: 0.875rem; }
[data-stage] [data-facts] dt { color: var(--ui-muted-foreground); }
[data-stage] [data-facts] dd { margin: 0; font-variant-numeric: tabular-nums; }
[data-stage] [data-status] { margin: 0; max-width: 60ch; color: var(--ui-muted-foreground); font-size: 0.875rem; }
[data-stage] [data-plot] { display: grid; gap: 8px; margin: 0; min-width: 0; }
[data-stage] [data-plot] canvas { display: block; width: 100%; height: 460px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: #0b1120; }
[data-stage] figcaption { color: var(--ui-muted-foreground); font-size: 0.8125rem; }
`

const color = scaleLog<string>()
  .domain([2400, 3700, 5200, 6000, 7500, 10000, 45000])
  .range(["#ff6a3d", "#ffa65c", "#ffd59a", "#fff4dc", "#f3f5ff", "#c9d8ff", "#8fb0ff"])
  .clamp(true)
const RADIUS: Record<Kind, number> = { "Main sequence": 1.3, Giant: 1.8, Supergiant: 2.4, "White dwarf": 1.2 }
const Y_TICKS: [number, string][] = [
  [1e-4, "10⁻⁴"],
  [1e-2, "0.01"],
  [1, "1"],
  [1e2, "100"],
  [1e4, "10⁴"],
  [1e6, "10⁶"],
]
const X_TICKS = [40000, 20000, 10000, 5000, 3000]

function mount(root: HTMLElement) {
  root.innerHTML = html
  const stars = catalogue()
  const byValue = new Map(stars.map((star) => [star.value, star]))
  const combobox = root.querySelector("ui-combobox") as Combobox
  const scroller = root.querySelector<HTMLElement>("[data-scroller]")!
  const list = root.querySelector<HTMLElement>("ui-combobox-list")!
  const canvas = root.querySelector("canvas")!
  const status = root.querySelector("[data-status]")!
  const fact = (name: string) => root.querySelector(`[data-fact="${name}"]`)!
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  let opens = 0
  let selected: Star | null = byValue.get("sun")!

  let matches = stars
  const rendered = new Map<string, HTMLElement>()
  const renderRows = () => {
    list.style.height = `${matches.length * ROW}px`
    const start = Math.max(0, Math.floor(scroller.scrollTop / ROW) - 4)
    const end = Math.min(matches.length, Math.ceil((scroller.scrollTop + LIST_HEIGHT) / ROW) + 4)
    const visible = new Map(matches.slice(start, end).map((star, offset) => [star.value, start + offset]))
    for (const [value, el] of rendered) {
      if (visible.has(value)) continue
      el.remove()
      rendered.delete(value)
    }
    for (const [value, index] of visible) {
      const el = rendered.get(value) ?? document.createElement("ui-combobox-item")
      if (!rendered.has(value)) {
        const star = byValue.get(value)!
        el.setAttribute("value", value)
        el.setAttribute("label", star.label)
        el.textContent = star.label
        list.append(el)
        rendered.set(value, el)
      }
      el.setAttribute("index", String(index))
      el.style.cssText = `top: ${index * ROW}px; height: ${ROW}px`
    }
  }
  renderRows()
  combobox.items = stars.map(({ value, label }) => ({ value, label }))
  scroller.addEventListener("scroll", renderRows)
  combobox.addEventListener("querychange", (event) => {
    const { value, reason } = (event as CustomEvent<{ value: string; reason: string }>).detail
    const needle = reason === "input-change" ? value.trim().toLowerCase() : ""
    matches = needle ? stars.filter((star) => star.label.toLowerCase().includes(needle)) : stars
    renderRows()
  })
  combobox.addEventListener("highlight", (event) => {
    const { index } = (event as CustomEvent<{ index: number }>).detail
    if (index < 0) return
    const top = index * ROW
    if (top < scroller.scrollTop) scroller.scrollTop = top
    else if (top + ROW > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top + ROW - scroller.clientHeight
    renderRows()
  })

  let base: HTMLCanvasElement | null = null
  let size = { width: 0, height: 0 }
  const margin = { top: 18, right: 20, bottom: 46, left: 62 }
  const x = scaleLog().domain([45000, 2400])
  const y = scaleLog().domain([1e-4, 1e6])

  const drawBase = () => {
    const width = canvas.clientWidth || 640
    const height = canvas.clientHeight || 460
    const ratio = window.devicePixelRatio || 1
    size = { width, height }
    x.range([margin.left, width - margin.right])
    y.range([height - margin.bottom, margin.top])
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    const layer = document.createElement("canvas")
    layer.width = canvas.width
    layer.height = canvas.height
    const ctx = layer.getContext("2d")
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.font = "12px system-ui, 'Segoe UI', sans-serif"
    ctx.strokeStyle = "#1e293b"
    ctx.fillStyle = "#94a3b8"
    ctx.lineWidth = 1
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    for (const [value, label] of Y_TICKS) {
      const py = Math.round(y(value)) + 0.5
      ctx.beginPath()
      ctx.moveTo(margin.left, py)
      ctx.lineTo(width - margin.right, py)
      ctx.stroke()
      ctx.fillText(label, margin.left - 8, py)
    }
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    for (const value of X_TICKS) {
      const px = Math.round(x(value)) + 0.5
      ctx.beginPath()
      ctx.moveTo(px, margin.top)
      ctx.lineTo(px, height - margin.bottom)
      ctx.stroke()
      ctx.fillText(format(",")(value), px, height - margin.bottom + 6)
    }
    ctx.fillText("Surface temperature (K), hotter to the left", (margin.left + width - margin.right) / 2, height - 20)
    ctx.save()
    ctx.translate(16, (margin.top + height - margin.bottom) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textBaseline = "middle"
    ctx.fillText("Luminosity (Sun = 1)", 0, 0)
    ctx.restore()

    ctx.globalAlpha = 0.78
    for (const star of stars) {
      ctx.fillStyle = color(star.temp)
      ctx.beginPath()
      ctx.arc(x(star.temp), y(star.lum), RADIUS[star.kind], 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = "#cbd5e1"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    const region = (text: string, temp: number, lum: number) => ctx.fillText(text, x(temp), y(lum))
    region("Main sequence", 20000, 3e2)
    region("Giants", 3700, 2500)
    region("Supergiants", 9000, 5e5)
    region("White dwarfs", 24000, 1e-3)
    base = layer
  }

  const frame = (ring: number) => {
    const ctx = canvas.getContext("2d")
    if (!ctx || !base) return
    const ratio = canvas.width / size.width
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(base, 0, 0)
    if (!selected) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    const px = x(selected.temp)
    const py = y(selected.lum)
    ctx.strokeStyle = "rgba(251, 146, 60, 0.55)"
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(margin.left, py)
    ctx.lineTo(size.width - margin.right, py)
    ctx.moveTo(px, margin.top)
    ctx.lineTo(px, size.height - margin.bottom)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.strokeStyle = "#fb923c"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(px, py, ring, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = "#ffffff"
    ctx.beginPath()
    ctx.arc(px, py, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = "600 13px system-ui, 'Segoe UI', sans-serif"
    const text = selected.label
    const w = ctx.measureText(text).width + 12
    const left = px + 14 + w > size.width - margin.right ? px - 14 - w : px + 14
    const top = Math.max(margin.top, Math.min(size.height - margin.bottom - 22, py - 11))
    ctx.fillStyle = "#0f172a"
    ctx.strokeStyle = "#fb923c"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(left, top, w, 22, 4)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = "#fed7aa"
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(text, left + 6, top + 11)
  }

  let pulse: ReturnType<typeof timer> | null = null
  const highlight = (animate: boolean) => {
    pulse?.stop()
    pulse = null
    if (!animate || still) return frame(9)
    frame(28)
    pulse = timer((elapsed) => {
      if (!root.isConnected) return pulse?.stop()
      const t = Math.min(1, elapsed / 480)
      frame(28 - 19 * easeCubicOut(t))
      if (t === 1) pulse?.stop()
    })
  }

  const show = (star: Star | null) => {
    selected = star
    fact("spectral").textContent = star?.spectral ?? "None"
    fact("temp").textContent = star ? kelvin(star.temp) : "None"
    fact("lum").textContent = star ? luminosity(star) : "None"
    fact("kind").textContent = star?.kind ?? "None"
    const said = star ? summary(star) : "No star is selected."
    canvas.setAttribute("aria-label", `Hertzsprung-Russell diagram of ${format(",")(stars.length)} stars. ${star ? `Highlighted: ${said}` : said}`)
    status.textContent = `${said} The list opened ${opens} ${opens === 1 ? "time" : "times"}.`
  }
  const count = () => (fact("opens").textContent = `${opens} ${opens === 1 ? "time" : "times"}`)

  combobox.addEventListener("openchange", (event) => {
    if (!(event as CustomEvent<{ value: boolean }>).detail.value) return
    opens++
    count()
  })
  combobox.addEventListener("valuechange", (event) => {
    const star = byValue.get((event as CustomEvent<{ value: string | null }>).detail.value ?? "") ?? null
    show(star)
    highlight(!!star)
  })

  count()
  show(selected)
  drawBase()
  highlight(false)
  const observer = new ResizeObserver(() => {
    if (!root.isConnected) return observer.disconnect()
    if (canvas.clientWidth === size.width && canvas.clientHeight === size.height) return
    drawBase()
    highlight(false)
  })
  observer.observe(canvas)
}

const ui: UI = {
  id: "F02",
  request:
    "Build a star picker over a catalogue of 5,000 stars, with a Hertzsprung-Russell scatter plot that highlights the chosen star, so an agent can find a star by query without opening the list.",
  css,
  mount,
  task: {
    steps: [{ ref: "Star", action: "setValue", args: ["Vega"] }],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent === "Vega: A0 V, 9,600 K, luminosity of 40 Suns. The list opened 0 times.",
  },
}

export default ui
