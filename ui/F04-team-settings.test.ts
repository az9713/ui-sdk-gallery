import { expect, test } from "vitest"
import { keys, mountUI, settle, tabbable } from "../src/testing"
import ui from "./F04-team-settings"

const { root, agent, person, live } = mountUI(ui)
const status = () => root.querySelector("[data-status]")!.textContent
const count = () => root.querySelector("[data-count]")!.textContent
const tab = (name: string) => [...root.querySelectorAll<HTMLElement>("ui-tabs-tab button")].find((b) => b.textContent === name)!
const button = (name: string) => [...root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === name)!
const row = (id: string) => root.querySelector<HTMLElement>(`[data-member="${id}"]`)
const trigger = (name: string) => root.querySelector<HTMLElement>(`button[aria-label="Manage ${name}"]`)!
const menu = (name: string) => trigger(name).closest<HTMLElement & { open: boolean }>("ui-menu")!
const item = (name: string, text: string) => [...menu(name).querySelectorAll<HTMLElement>("ui-menu-item")].find((i) => i.textContent === text)!
const dialog = () => root.querySelector<HTMLElement & { open: boolean }>("ui-alert-dialog")!
const badge = (id: string) => row(id)!.querySelector(".f04-role")!.textContent
const names = ["Ada Moreno", "Bram Visser", "Chen Liu", "Dalia Haddad", "Emeka Obi", "Freya Lund", "Gus Tran", "Hana Sato", "Ines Duarte", "Jonah Weiss", "Kira Novak", "Leo Marsh",
  "Mina Rahimi", "Nadia Okafor", "Omar Farouk", "Priya Nair", "Quinn Doyle", "Rosa Ibarra", "Sami Kaur", "Theo Park", "Uma Fischer", "Vik Petrov", "Wen Zhao", "Yara Costa"]

test("names: each control has the name that the page shows, and each of the 24 rows has its own menu", async () => {
  await settle()
  const labels = live().map((entry) => entry.label)
  for (const entry of live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  for (const label of ["Settings sections", "Project name", "Visibility", "Failed deploys", "New comments", "Weekly digest", "Usage reports", "Save changes", "Remove this member?"])
    expect(labels, `${label} is not in the snapshot`).toContain(label)
  const menus = live().filter((entry) => entry.component === "menu")
  expect(menus.map((entry) => entry.label)).toEqual(names.map((name) => `Manage ${name}`))
  for (const [i, entry] of menus.entries()) expect(entry.row).toContain(names[i])
  expect(count()).toBe("24 members, 3 admins.")
  expect(button("Save changes").getAttribute("aria-disabled")).toBeNull()
  expect(root.querySelector("ui-tabs-list")!.getAttribute("aria-label")).toBe("Settings sections")
})

test("visual: each member has a generated identicon, hidden from the bridge and from screen readers", () => {
  const icons = [...root.querySelectorAll<SVGElement>(".f04-members svg.f04-identicon")]
  expect(icons).toHaveLength(24)
  for (const icon of icons) {
    expect(icon.getAttribute("aria-hidden")).toBe("true")
    expect(icon.querySelectorAll("g rect").length).toBeGreaterThan(0)
  }
  expect(new Set(icons.map((icon) => icon.innerHTML)).size).toBe(24)
})

test("agent: the scripted task renames, promotes, removes after the person allows it, flips 2 emails and saves", async () => {
  const steps = ui.task!.steps
  expect(ui.task!.done(root)).toBe(false)
  const opened = await agent.act({ steps: steps.slice(0, 6) })
  expect(opened.ok, opened.error?.message).toBe(true)
  expect(badge("nadia-okafor")).toBe("Admin")
  expect(dialog().open).toBe(true)
  expect(root.querySelector("[data-description]")!.textContent).toBe("Theo Park loses access to Atlas.")

  const refused = await agent.act({ steps: [steps[6]] })
  expect(refused.ok).toBe(false)
  expect(person.asked).toEqual(["Removes Theo Park from the team"])
  expect(row("theo-park")).not.toBeNull()

  person.approves = true
  const rest = await agent.act({ steps: steps.slice(6) })
  expect(rest.ok, rest.error?.message).toBe(true)
  expect(row("theo-park")).toBeNull()
  expect(count()).toBe("23 members, 4 admins.")
  expect(ui.task!.done(root)).toBe(true)
  expect(status()).toBe("Saved Atlas: internal, 23 members, 4 admins, emails for failed deploys and weekly digest.")
})

test("keyboard: the tab list is 1 tab stop, and ArrowRight and ArrowLeft move between the 3 tabs", async () => {
  tab("General").click()
  await settle()
  expect(tabbable(root).filter((el) => el.closest("ui-tabs-list"))).toEqual([tab("General")])
  tab("General").focus()
  await keys("ArrowRight")
  expect(document.activeElement).toBe(tab("Members"))
  expect(tab("Members").getAttribute("aria-selected")).toBe("true")
  await keys("ArrowRight")
  expect(document.activeElement).toBe(tab("Notifications"))
  await keys("ArrowLeft")
  expect(document.activeElement).toBe(tab("Members"))
  expect(tab("Members").getAttribute("aria-selected")).toBe("true")
})

test("keyboard: each row menu is 1 tab stop, Enter opens it on Make admin, and Enter promotes the member", async () => {
  tab("Members").click()
  await settle()
  const stops = tabbable(root).filter((el) => el.closest(".f04-members"))
  expect(stops).toHaveLength(23)
  for (const stop of stops) expect(stop.getAttribute("aria-label")).toMatch(/^Manage /)
  trigger("Dalia Haddad").focus()
  await keys("Enter")
  expect(menu("Dalia Haddad").open).toBe(true)
  expect(document.activeElement).toBe(item("Dalia Haddad", "Make admin"))
  await keys("Enter")
  expect(menu("Dalia Haddad").open).toBe(false)
  expect(badge("dalia-haddad")).toBe("Admin")
  expect(status()).toBe("Dalia Haddad is now an admin.")
  expect(count()).toBe("23 members, 5 admins.")
  expect(document.activeElement).toBe(trigger("Dalia Haddad"))
  expect(item("Dalia Haddad", "Make admin").getAttribute("aria-disabled")).toBe("true")
  expect(item("Dalia Haddad", "Make member").getAttribute("aria-disabled")).toBeNull()
})

test("keyboard: ArrowDown and ArrowUp move through a row menu past its separator, and Escape closes it with no change", async () => {
  trigger("Emeka Obi").focus()
  await keys("ArrowDown")
  expect(document.activeElement).toBe(item("Emeka Obi", "Make admin"))
  await keys("ArrowDown")
  expect(document.activeElement).toBe(item("Emeka Obi", "Make member"))
  await keys("ArrowDown")
  expect(document.activeElement).toBe(item("Emeka Obi", "Remove from team"))
  await keys("ArrowUp")
  expect(document.activeElement).toBe(item("Emeka Obi", "Make member"))
  await keys("Escape")
  expect(menu("Emeka Obi").open).toBe(false)
  expect(document.activeElement).toBe(trigger("Emeka Obi"))
  expect(badge("emeka-obi")).toBe("Member")
  expect(status()).toBe("Dalia Haddad is now an admin.")
})

test("keyboard: Keep member closes the confirm dialog and removes nobody", async () => {
  trigger("Freya Lund").focus()
  await keys("ArrowUp")
  expect(document.activeElement).toBe(item("Freya Lund", "Remove from team"))
  await keys("Enter")
  await settle()
  expect(dialog().open).toBe(true)
  expect(document.activeElement).toBe(button("Keep member"))
  expect(root.querySelector("[data-description]")!.textContent).toBe("Freya Lund loses access to Atlas.")
  await keys("Enter")
  await settle()
  expect(dialog().open).toBe(false)
  expect(row("freya-lund")).not.toBeNull()
  expect(status()).toBe("Kept Freya Lund on the team.")
  expect(document.activeElement).toBe(trigger("Freya Lund"))
})

test("keyboard: Confirm removal removes the member, and focus goes to the next row menu", async () => {
  trigger("Gus Tran").focus()
  await keys("ArrowUp", "Enter")
  await settle()
  expect(dialog().open).toBe(true)
  button("Confirm removal").focus()
  await keys("Enter")
  await settle()
  expect(dialog().open).toBe(false)
  expect(row("gus-tran")).toBeNull()
  expect(count()).toBe("22 members, 5 admins.")
  expect(status()).toBe("Removed Gus Tran from the team.")
  expect(document.activeElement).toBe(trigger("Hana Sato"))
})

test("keyboard: Space changes each email switch, and Enter on Save reports them", async () => {
  tab("Notifications").click()
  await settle()
  const switches = [...root.querySelectorAll<HTMLElement>("ui-switch")]
  expect(switches.map((s) => s.getAttribute("aria-checked"))).toEqual(["true", "false", "true", "false"])
  for (const toggle of switches) {
    toggle.focus()
    await keys("Space")
  }
  expect(switches.map((s) => s.getAttribute("aria-checked"))).toEqual(["false", "true", "false", "true"])
  button("Save changes").focus()
  await keys("Enter")
  expect(status()).toBe("Saved Atlas: internal, 22 members, 5 admins, emails for new comments and usage reports.")
})

test("keyboard: an empty project name is invalid", async () => {
  tab("General").click()
  await settle()
  const input = root.querySelector("input")!
  input.value = ""
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("blur", { bubbles: true }))
  await settle()
  expect(input.validity.valueMissing).toBe(true)
  input.value = "Atlas"
  input.dispatchEvent(new Event("input", { bubbles: true }))
  await settle()
})
