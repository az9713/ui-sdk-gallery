import { createConfirm, type UiAlertDialogElement } from "@ui-sdk/web/alert-dialog"
import "@ui-sdk/web/button"
import "@ui-sdk/web/field"
import "@ui-sdk/web/input"
import "@ui-sdk/web/menu"
import "@ui-sdk/web/select"
import "@ui-sdk/web/switch"
import "@ui-sdk/web/tabs"
import type { UI } from "../src/ui"

type Role = "admin" | "member"
type Member = { id: string; name: string; role: Role }

const TEAM: [string, Role][] = [
  ["Ada Moreno", "admin"], ["Bram Visser", "admin"], ["Chen Liu", "admin"], ["Dalia Haddad", "member"],
  ["Emeka Obi", "member"], ["Freya Lund", "member"], ["Gus Tran", "member"], ["Hana Sato", "member"],
  ["Ines Duarte", "member"], ["Jonah Weiss", "member"], ["Kira Novak", "member"], ["Leo Marsh", "member"],
  ["Mina Rahimi", "member"], ["Nadia Okafor", "member"], ["Omar Farouk", "member"], ["Priya Nair", "member"],
  ["Quinn Doyle", "member"], ["Rosa Ibarra", "member"], ["Sami Kaur", "member"], ["Theo Park", "member"],
  ["Uma Fischer", "member"], ["Vik Petrov", "member"], ["Wen Zhao", "member"], ["Yara Costa", "member"],
]
const EMAILS = [
  { name: "deploys", text: "Failed deploys", on: true },
  { name: "comments", text: "New comments", on: true },
  { name: "digest", text: "Weekly digest", on: false },
  { name: "usage", text: "Usage reports", on: false },
]
const ROLE = { admin: "Admin", member: "Member" }
const DOTS = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>`

// FNV-1a: the same name gives the same identicon on each run.
function hash(text: string) {
  let h = 2166136261
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

// A 5 x 5 identicon, mirrored on its middle column: 15 bits of the hash pick the cells, 8 bits the hue.
function identicon(name: string) {
  const h = hash(name)
  const hue = Math.round(((h & 0xff) / 256) * 360)
  const cells: string[] = []
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++)
      if ((h >>> (8 + y * 3 + x)) & 1)
        for (const cx of new Set([x, 4 - x])) cells.push(`<rect x="${cx}" y="${y}" width="1" height="1"/>`)
  return `<svg class="f04-identicon" viewBox="-0.75 -0.75 6.5 6.5" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><rect x="-0.75" y="-0.75" width="6.5" height="6.5" fill="hsl(${hue} 40% 20%)"/><g fill="hsl(${hue} 80% 66%)">${cells.join("")}</g></svg>`
}

const row = (m: Member) => `
  <li class="f04-member" data-member="${m.id}">
    ${identicon(m.name)}
    <span class="f04-name">${m.name}</span>
    <span class="f04-role" data-role="${m.role}">${ROLE[m.role]}</span>
    <ui-menu>
      <ui-menu-trigger><button aria-label="Manage ${m.name}">${DOTS}</button></ui-menu-trigger>
      <ui-menu-content align="end">
        <ui-menu-item value="admin"${m.role === "admin" ? " disabled" : ""}>Make admin</ui-menu-item>
        <ui-menu-item value="member"${m.role === "member" ? " disabled" : ""}>Make member</ui-menu-item>
        <ui-menu-separator></ui-menu-separator>
        <ui-menu-item value="remove" destructive>Remove from team</ui-menu-item>
      </ui-menu-content>
    </ui-menu>
  </li>`

const html = (team: Member[]) => `
<ui-tabs default-value="members">
  <ui-tabs-list aria-label="Settings sections">
    <ui-tabs-tab value="general"><button type="button">General</button></ui-tabs-tab>
    <ui-tabs-tab value="members"><button type="button">Members</button></ui-tabs-tab>
    <ui-tabs-tab value="notifications"><button type="button">Notifications</button></ui-tabs-tab>
  </ui-tabs-list>
  <ui-tabs-panel value="general">
    <ui-field name="name">
      <ui-field-label>Project name</ui-field-label>
      <ui-input><input value="Apollo" required /></ui-input>
      <ui-field-error></ui-field-error>
    </ui-field>
    <ui-field>
      <ui-field-label>Visibility</ui-field-label>
      <ui-select name="visibility" default-value="private">
        <ui-select-trigger><button><ui-select-value></ui-select-value></button></ui-select-trigger>
        <ui-select-content>
          <ui-select-item value="private">Private</ui-select-item>
          <ui-select-item value="internal">Internal</ui-select-item>
          <ui-select-item value="public">Public</ui-select-item>
        </ui-select-content>
      </ui-select>
    </ui-field>
  </ui-tabs-panel>
  <ui-tabs-panel value="members">
    <p class="f04-count" data-count></p>
    <ul class="f04-members" aria-label="Team members">${team.map(row).join("")}</ul>
  </ui-tabs-panel>
  <ui-tabs-panel value="notifications">
    <p>Email me about:</p>
    ${EMAILS.map(
      (e) => `
    <ui-field data-row>
      <ui-switch name="${e.name}"${e.on ? " checked" : ""}><ui-switch-thumb></ui-switch-thumb></ui-switch>
      <ui-field-label>${e.text}</ui-field-label>
    </ui-field>`,
    ).join("")}
  </ui-tabs-panel>
</ui-tabs>
<ui-button data-save><button>Save changes</button></ui-button>
<p role="status" data-status>No change is saved.</p>
<ui-alert-dialog>
  <ui-alert-dialog-backdrop hidden></ui-alert-dialog-backdrop>
  <ui-alert-dialog-content hidden keep-mounted>
    <div class="f04-ask">
      <span data-avatar></span>
      <div>
        <ui-alert-dialog-title>Remove this member?</ui-alert-dialog-title>
        <ui-alert-dialog-description data-description>A member loses access.</ui-alert-dialog-description>
      </div>
    </div>
    <div class="f04-answers">
      <ui-alert-dialog-close><button>Keep member</button></ui-alert-dialog-close>
      <ui-alert-dialog-close value="confirm" data-agent-confirm="Removes a member from the team"><button>Confirm removal</button></ui-alert-dialog-close>
    </div>
  </ui-alert-dialog-content>
</ui-alert-dialog>`

const css = `
[data-stage] { display: grid; gap: 20px; max-width: 940px; }
[data-stage] p { margin: 0; }
[data-stage] ui-tabs-panel:not([hidden]) { display: grid; gap: 16px; justify-items: start; padding-top: 20px; }
[data-stage] [data-row] { flex-direction: row; align-items: center; gap: 12px; }
[data-stage] .f04-count { color: var(--ui-muted-foreground); }
[data-stage] .f04-members { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; width: 100%; margin: 0; padding: 0; list-style: none; }
[data-stage] .f04-member { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 8px 8px 8px 10px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
[data-stage] .f04-identicon { display: block; width: 40px; height: 40px; border-radius: 8px; }
[data-stage] .f04-name { font-weight: 600; }
[data-stage] [data-save] button { justify-self: start; }
[data-stage] .f04-role { padding: 4px 10px; border: 1px solid var(--ui-border); border-radius: 999px; color: var(--ui-muted-foreground); font-size: 0.8125rem; }
[data-stage] .f04-role[data-role="admin"] { border-color: var(--ui-ring); color: var(--ui-foreground); }
[data-stage] [data-slot="menu-trigger"] svg { width: 16px; height: 16px; fill: currentColor; }
[data-stage] [data-status] { max-width: 60ch; color: var(--ui-muted-foreground); }
[data-stage] .f04-ask { display: flex; gap: 16px; align-items: flex-start; }
[data-stage] .f04-ask .f04-identicon { width: 48px; height: 48px; }
[data-stage] .f04-ask > div { display: grid; gap: 6px; }
[data-stage] .f04-answers { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
@media (max-width: 720px) { [data-stage] .f04-members { grid-template-columns: minmax(0, 1fr); } }
`

function mount(root: HTMLElement) {
  const team: Member[] = TEAM.map(([name, role]) => ({ id: name.toLowerCase().replace(" ", "-"), name, role }))
  root.innerHTML = html(team)
  const settings = { name: "Apollo", visibility: "private" }
  const emails = new Map(EMAILS.map((e) => [e.name, e.on]))
  const status = root.querySelector("[data-status]")!
  const count = root.querySelector("[data-count]")!
  const admins = () => team.filter((m) => m.role === "admin").length
  const counted = () => (count.textContent = `${team.length} members, ${admins()} admins.`)
  counted()

  const on = (selector: string, event: string, change: (value: never) => void) =>
    root.querySelector(selector)!.addEventListener(event, (e) => change((e as CustomEvent).detail.value as never))
  on("ui-input", "valuechange", (value: string) => (settings.name = value))
  on("ui-select", "valuechange", (value: string) => (settings.visibility = value))
  for (const toggle of root.querySelectorAll<HTMLElement>("ui-switch"))
    toggle.addEventListener("checkedchange", (e) => emails.set(toggle.getAttribute("name")!, (e as CustomEvent).detail.value))

  const confirm = createConfirm<Member>()
  const dialog = root.querySelector<UiAlertDialogElement<Member>>("ui-alert-dialog")!
  dialog.controller = confirm.controller
  dialog.addEventListener("payloadchange", (e) => {
    const member = (e as CustomEvent<{ value?: Member }>).detail.value
    if (!member) return
    root.querySelector("[data-avatar]")!.innerHTML = identicon(member.name)
    root.querySelector("[data-description]")!.textContent = `${member.name} loses access to ${settings.name}.`
    root.querySelector("[data-agent-confirm]")!.setAttribute("data-agent-confirm", `Removes ${member.name} from the team`)
  })

  const setRole = (member: Member, item: HTMLElement, role: Role) => {
    member.role = role
    const badge = item.querySelector<HTMLElement>(".f04-role")!
    badge.dataset.role = role
    badge.textContent = ROLE[role]
    for (const choice of item.querySelectorAll("ui-menu-item[value=admin], ui-menu-item[value=member]"))
      choice.toggleAttribute("disabled", choice.getAttribute("value") === role)
    counted()
    status.textContent = `${member.name} is now ${role === "admin" ? "an admin" : "a member"}.`
  }
  const remove = async (member: Member, item: HTMLElement) => {
    if (!(await confirm(member))) {
      status.textContent = `Kept ${member.name} on the team.`
      return
    }
    const next = (item.nextElementSibling ?? item.previousElementSibling)?.querySelector("button")
    next?.focus()
    item.remove()
    team.splice(team.indexOf(member), 1)
    counted()
    status.textContent = `Removed ${member.name} from the team.`
  }
  for (const item of root.querySelectorAll<HTMLElement>(".f04-member")) {
    const member = team.find((m) => m.id === item.dataset.member)!
    item.querySelector("ui-menu")!.addEventListener("action", (e) => {
      const value = (e as CustomEvent<{ value: string }>).detail.value
      if (value === "remove") void remove(member, item)
      else setRole(member, item, value as Role)
    })
  }

  root.querySelector("[data-save]")!.addEventListener("action", () => {
    const chosen = EMAILS.filter((e) => emails.get(e.name)).map((e) => e.text.toLowerCase())
    status.textContent = `Saved ${settings.name}: ${settings.visibility}, ${team.length} members, ${admins()} admins, emails for ${chosen.join(" and ") || "nothing"}.`
  })
}

const ui: UI = {
  id: "F04",
  request:
    "Build team settings with 3 tabs: a project name and visibility, 24 members with a menu on each row and a confirm before a removal, and 4 email switches, then 1 Save.",
  css,
  mount,
  task: {
    steps: [
      { ref: "Settings sections", action: "setValue", args: ["General"] },
      { ref: "Project name", action: "setValue", args: ["Atlas"] },
      { ref: "Visibility", action: "setValue", args: ["Internal"] },
      { ref: "Settings sections", action: "setValue", args: ["Members"] },
      { ref: "Manage Nadia Okafor", action: "press", args: ["Make admin"] },
      { ref: "Manage Theo Park", action: "press", args: ["Remove from team"] },
      { ref: "Remove this member?", action: "press", args: ["Confirm removal"] },
      { ref: "Settings sections", action: "setValue", args: ["Notifications"] },
      { ref: "New comments", action: "setChecked", args: [false] },
      { ref: "Weekly digest", action: "setChecked", args: [true] },
      { ref: "Save changes", action: "press" },
    ],
    done: (root) =>
      root.querySelector("[data-status]")!.textContent ===
      "Saved Atlas: internal, 23 members, 4 admins, emails for failed deploys and weekly digest.",
  },
}

export default ui
