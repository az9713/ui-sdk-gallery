import type { UI } from "../src/ui"

// Comparison build of B17: the same request, written with plain HTML and script. No @ui-sdk import, no task.
const STATIONS = ["Harbour", "Old Market", "Cathedral", "Museum", "Mill Park", "Stadium", "Airport"]

const html = `
<h2>Line 4</h2>
<div class="x03-line" role="listbox" aria-orientation="horizontal" aria-label="Metro stations" data-line>
  ${STATIONS.map((name, index) => `<div class="x03-station" role="option" aria-selected="false" tabindex="${index === 0 ? 0 : -1}" data-station="${name}">${name}</div>`).join("")}
</div>
<p role="status" data-status>Boarding at Harbour. Pick a destination.</p>
<button type="button" class="x03-button" data-plan>Plan trip</button>`

const css = `
[data-stage] { display: grid; gap: 20px; justify-items: start; }
[data-stage] h2, [data-stage] p { margin: 0; }
[data-stage] h2 { font-size: 1rem; font-weight: 600; }
[data-stage] .x03-line { display: flex; width: 100%; max-width: 640px; }
[data-stage] .x03-station {
  position: relative; display: flex; flex: 1 1 0; min-width: 0; box-sizing: border-box; flex-direction: column; align-items: center; gap: 10px;
  padding: 4px 2px 8px; border-radius: var(--ui-radius);
  font-size: 0.8125rem; line-height: 1.25; text-align: center; overflow-wrap: anywhere; cursor: pointer; user-select: none;
}
[data-stage] .x03-station::after { content: ""; position: absolute; top: 8px; left: 0; right: 0; height: 6px; background: var(--ui-primary); }
[data-stage] .x03-station:first-child::after { left: 50%; }
[data-stage] .x03-station:last-child::after { right: 50%; }
[data-stage] .x03-station::before {
  content: ""; position: relative; z-index: 1; width: 14px; height: 14px; flex: none; box-sizing: border-box;
  border: 3px solid var(--ui-primary); border-radius: 50%; background: var(--ui-background);
}
[data-stage] .x03-station[aria-selected="true"]::before { background: var(--ui-primary); outline: 3px solid var(--ui-background); box-shadow: 0 0 0 5px var(--ui-primary); }
[data-stage] .x03-station[aria-selected="true"] { font-weight: 600; }
[data-stage] .x03-station:focus-visible, [data-stage] .x03-button:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] .x03-button { padding: 8px 14px; border: 1px solid var(--ui-input); border-radius: var(--ui-radius); background: var(--ui-background); color: var(--ui-foreground); font: inherit; font-weight: 600; cursor: pointer; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

const TYPEAHEAD_RESET_MS = 700

function mount(root: HTMLElement) {
  root.innerHTML = html
  const line = root.querySelector<HTMLElement>("[data-line]")!
  const status = root.querySelector("[data-status]")!
  const stations = [...root.querySelectorAll<HTMLElement>("[data-station]")]
  let destination: string | null = null

  // Roving tabindex: 1 tab stop on the station that has focus.
  const focus = (station: HTMLElement) => {
    for (const other of stations) other.tabIndex = other === station ? 0 : -1
    station.focus()
  }
  const pick = (station: HTMLElement) => {
    destination = station.dataset.station!
    for (const other of stations) other.setAttribute("aria-selected", String(other === station))
    status.textContent = `Destination: ${destination}.`
  }

  // Typeahead: the typed letters make a query. The same letter again steps to the next station that starts with it.
  let query = ""
  let timer: ReturnType<typeof setTimeout> | undefined
  const reset = () => {
    query = ""
    clearTimeout(timer)
  }
  const type = (letter: string, from: number) => {
    const lower = letter.toLowerCase()
    const repeated = query !== "" && [...query].every((char) => char === lower)
    query = repeated ? lower : query + lower
    clearTimeout(timer)
    timer = setTimeout(reset, TYPEAHEAD_RESET_MS)
    const start = query.length === 1 ? from + 1 : from
    for (let step = 0; step < stations.length; step++) {
      const station = stations[(start + step) % stations.length]
      if (station.textContent!.toLowerCase().startsWith(query)) return station
    }
    return null
  }

  line.addEventListener("keydown", (event) => {
    const station = (event.target as HTMLElement).closest<HTMLElement>("[data-station]")
    if (!station || event.defaultPrevented) return
    const at = stations.indexOf(station)
    const rtl = (line.closest("[dir]")?.getAttribute("dir") ?? document.documentElement.dir) === "rtl"
    const next: Record<string, number> = {
      ArrowRight: Math.min(at + (rtl ? -1 : 1), stations.length - 1),
      ArrowLeft: Math.max(at + (rtl ? 1 : -1), 0),
      Home: 0,
      End: stations.length - 1,
    }
    if (event.key in next) {
      event.preventDefault()
      reset()
      return focus(stations[Math.min(Math.max(next[event.key], 0), stations.length - 1)])
    }
    if (event.key === "Escape") return reset()
    // Space continues a query that is in progress, and picks the station when none is.
    if ((event.key === " " && query === "") || event.key === "Enter") {
      event.preventDefault()
      reset()
      return pick(station)
    }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === " ") event.preventDefault()
    const found = type(event.key, at)
    if (found) focus(found)
  })

  line.addEventListener("click", (event) => {
    const station = (event.target as HTMLElement).closest<HTMLElement>("[data-station]")
    if (!station) return
    reset()
    focus(station)
    pick(station)
  })

  root.querySelector("[data-plan]")!.addEventListener("click", () => {
    if (destination === null) status.textContent = "Pick a destination first."
    else {
      const stops = STATIONS.indexOf(destination)
      status.textContent = `Trip to ${destination}: ${stops} ${stops === 1 ? "stop" : "stops"} from Harbour.`
    }
  })
}

const ui: UI = {
  id: "X03",
  request:
    "Build a metro line map: a row of stations that is 1 tab stop, where Left and Right move between stations, typing a station's name jumps to it, and Space or Enter picks it.",
  css,
  mount,
}

export default ui
