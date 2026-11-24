import "@ui-sdk/web/button"
import "@ui-sdk/web/timeline"
import type { UI } from "../src/ui"

const clips = [
  { title: "Cold open", start: 0, end: 3 },
  { title: "Title card", start: 3, end: 6 },
  { title: "Product close-up", start: 6, end: 12 },
  { title: "Interview b-roll", start: 12, end: 19 },
  { title: "End card", start: 19, end: 24 },
]
const longest = Math.max(...clips.map((clip) => clip.end - clip.start))

const timecode = (seconds: number) => `00:${String(seconds).padStart(2, "0")}`

const item = (clip: (typeof clips)[number]) => `
  <ui-timeline-item value="${clip.title}">
    <ui-timeline-marker style="--clip-share: ${(clip.end - clip.start) / longest}"></ui-timeline-marker>
    <ui-timeline-title>${clip.title}</ui-timeline-title>
    <ui-timeline-time><time datetime="PT${clip.start}S">${timecode(clip.start)} to ${timecode(clip.end)}</time></ui-timeline-time>
    <ui-timeline-description></ui-timeline-description>
  </ui-timeline-item>`

const html = `
<h2>Launch teaser, ${timecode(24)}</h2>
<ui-timeline orientation="horizontal" loop="false" aria-label="Teaser clips">
  ${clips.map(item).join("")}
</ui-timeline>
<div data-controls>
  <ui-button data-previous><button type="button">Previous clip</button></ui-button>
  <ui-button data-next><button type="button">Next clip</button></ui-button>
  <ui-button data-home><button type="button">Go to playhead</button></ui-button>
  <p role="status" data-status></p>
</div>`

const css = `
[data-stage] { display: grid; gap: 20px; max-width: 1080px; }
[data-stage] h2 { margin: 0; font-size: 1.125rem; font-weight: 600; }
[data-stage] p { margin: 0; }
[data-stage] ui-timeline { display: grid; grid-template-columns: repeat(auto-fit, minmax(176px, 1fr)); gap: 8px; }
[data-stage] ui-timeline-item { display: grid; align-content: start; justify-items: start; gap: 4px; padding: 12px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-muted); }
[data-stage] ui-timeline-item:focus-visible { outline: 2px solid var(--ui-ring); outline-offset: 2px; }
[data-stage] ui-timeline-item[data-current] { border-color: var(--g-warm); }
[data-stage] ui-timeline-marker { display: block; width: calc(var(--clip-share) * 100%); min-width: 24px; height: 20px; margin-bottom: 8px; border: 2px dashed var(--ui-input); border-radius: 4px; }
[data-stage] ui-timeline-marker[data-complete] { border: 2px solid var(--ui-primary); background: var(--ui-primary); }
[data-stage] ui-timeline-marker[data-current] { border: 2px solid var(--g-warm); background: var(--g-warm); }
[data-stage] ui-timeline-title { font-weight: 600; }
[data-stage] ui-timeline-time { font-family: var(--ui-font-mono, ui-monospace, Consolas, monospace); font-size: 0.8125rem; color: var(--ui-foreground); }
[data-stage] ui-timeline-description { color: var(--ui-muted-foreground); font-size: 0.8125rem; }
[data-stage] [data-controls] { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; }
[data-stage] [data-status] { color: var(--ui-muted-foreground); }
`

function mount(root: HTMLElement) {
  root.innerHTML = html
  const timeline = root.querySelector("ui-timeline")!
  const items = [...root.querySelectorAll("ui-timeline-item")]
  const status = root.querySelector("[data-status]")!

  let playhead = 2
  const cue = (at: number) => {
    playhead = at
    const clip = clips[at]
    items.forEach((el, index) => {
      el.setAttribute("status", index < at ? "complete" : index === at ? "current" : "upcoming")
      const length = clips[index].end - clips[index].start
      const state = index < at ? "played" : index === at ? "current" : "ahead"
      el.querySelector("ui-timeline-description")!.textContent = `${length} s, ${state}`
    })
    status.textContent = `Playhead at ${timecode(clip.start)} on ${clip.title}.`
  }

  cue(2)
  root.querySelector("[data-previous]")!.addEventListener("action", () => cue(Math.max(playhead - 1, 0)))
  root.querySelector("[data-next]")!.addEventListener("action", () => cue(Math.min(playhead + 1, clips.length - 1)))
  root.querySelector("[data-home]")!.addEventListener("action", () => timeline.api.focus(clips[playhead].title))
}

const ui: UI = {
  id: "A18",
  request: "Build a video editor's clip timeline: 5 clips in a row, each with its timecodes, Previous and next buttons that move the playhead, and a button that returns focus to the clip at the playhead.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Next clip", action: "press" },
      { ref: "Next clip", action: "press" },
      { ref: "Go to playhead", action: "press" },
    ],
    done: (root) => root.querySelector("[data-status]")!.textContent === "Playhead at 00:19 on End card.",
  },
}

export default ui
