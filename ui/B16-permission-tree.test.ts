import { checkDirection, checkPattern, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui, { permissionTree } from "./B16-permission-tree"

// The tree order of these paths: Docs, Docs/Read, Docs/Write, Admin, Admin/Users, Admin/Users/Add, Admin/Users/Ban, Admin/Logs.
const paths = ["Docs/Read", "Docs/Write", "Admin/Users/Add", "Admin/Users/Ban", "Admin/Logs"]
const order = ["Docs", "Docs/Read", "Docs/Write", "Admin", "Admin/Users", "Admin/Users/Add", "Admin/Users/Ban", "Admin/Logs"]
const branches = ["Docs", "Admin", "Admin/Users"]
const item = (key: string) =>
  `<item value="${key}">${branches.includes(key) ? "<span data-chevron></span>" : ""}${key.split("/").at(-1)}</item>`
const markup = `<root aria-label="Permissions">${order.map(item).join("")}</root>`
type View = ReturnType<typeof mount<typeof permissionTree>>
const at = (view: View, key: string) => view.part("item", key) as HTMLElement
const shows = (view: View, key: string) => at(view, key).isConnected && !at(view, key).hidden
const checked = (view: View, key: string) => at(view, key).getAttribute("aria-checked")
const sorted = (value: string[]) => [...value].sort()

test("keyboard: Down, Up, Home and End move through the permissions that show", async () => {
  const view = mount(permissionTree, { paths, defaultExpanded: ["Docs", "Admin"] }, markup)
  try {
    await view.keys("Tab")
    expect(document.activeElement).toBe(at(view, "Docs"))
    await view.keys("ArrowDown")
    expect(document.activeElement).toBe(at(view, "Docs/Read"))
    await view.keys("ArrowDown", "ArrowDown")
    expect(document.activeElement).toBe(at(view, "Admin"))
    expect(shows(view, "Admin/Users/Add")).toBe(false)
    await view.keys("End")
    expect(document.activeElement).toBe(at(view, "Admin/Logs"))
    await view.keys("ArrowUp")
    expect(document.activeElement).toBe(at(view, "Admin/Users"))
    await view.keys("Home", "ArrowUp")
    expect(document.activeElement).toBe(at(view, "Docs"))
  } finally {
    view.unmount()
  }
})

test("keyboard: Right opens a branch and then enters it, Left goes to the parent and then closes it", async () => {
  const view = mount(permissionTree, { paths }, markup)
  try {
    await view.keys("Tab")
    expect(at(view, "Docs").getAttribute("aria-expanded")).toBe("false")
    expect(shows(view, "Docs/Read")).toBe(false)
    await view.keys("ArrowRight")
    expect(at(view, "Docs").getAttribute("aria-expanded")).toBe("true")
    expect(view.changes.at(-1)).toMatchObject({ key: "expanded", reason: "list-navigation", source: "keyboard" })
    expect(document.activeElement).toBe(at(view, "Docs"))
    expect(shows(view, "Docs/Read")).toBe(true)
    await view.keys("ArrowRight")
    expect(document.activeElement).toBe(at(view, "Docs/Read"))
    expect(at(view, "Docs/Read").hasAttribute("aria-expanded")).toBe(false)
    await view.keys("ArrowRight")
    expect(document.activeElement).toBe(at(view, "Docs/Read"))
    await view.keys("ArrowLeft")
    expect(document.activeElement).toBe(at(view, "Docs"))
    await view.keys("ArrowLeft")
    expect(at(view, "Docs").getAttribute("aria-expanded")).toBe("false")
    expect(shows(view, "Docs/Read")).toBe(false)
  } finally {
    view.unmount()
  }
})

test("keyboard: the tree is 1 tab stop, and each permission has its level and place", async () => {
  const view = mount(permissionTree, { paths, defaultExpanded: branches }, markup)
  try {
    await view.keys("Tab", "ArrowDown", "ArrowDown", "ArrowDown")
    expect(document.activeElement).toBe(at(view, "Admin"))
    expect(view.root.querySelectorAll('[tabindex="0"]').length).toBe(1)
    expect(at(view, "Admin").getAttribute("tabindex")).toBe("0")
    expect(at(view, "Docs").getAttribute("tabindex")).toBe("-1")
    expect(at(view, "Admin/Users/Ban").getAttribute("aria-level")).toBe("3")
    expect(at(view, "Admin/Users/Ban").getAttribute("aria-posinset")).toBe("2")
    expect(at(view, "Admin/Users/Ban").getAttribute("aria-setsize")).toBe("2")
    expect(at(view, "Admin/Logs").getAttribute("aria-level")).toBe("2")
    expect(at(view, "Admin/Logs").getAttribute("aria-posinset")).toBe("2")
  } finally {
    view.unmount()
  }
})

test("keyboard: Space on a branch checks all of it, Space again clears it, and Enter checks 1 permission", async () => {
  const view = mount(permissionTree, { paths, defaultExpanded: ["Docs"] }, markup)
  try {
    await view.keys("Tab", "Space")
    expect(sorted(view.state.checked)).toEqual(["Docs/Read", "Docs/Write"])
    expect(view.changes.at(-1)).toMatchObject({ key: "checked", reason: "item-press", source: "keyboard" })
    expect(checked(view, "Docs")).toBe("true")
    expect(checked(view, "Docs/Read")).toBe("true")
    expect(at(view, "Docs/Write").hasAttribute("data-checked")).toBe(true)
    expect(checked(view, "Admin")).toBe("false")
    await view.keys("Space")
    expect(view.state.checked).toEqual([])
    expect(checked(view, "Docs/Write")).toBe("false")
    expect(at(view, "Docs").hasAttribute("data-unchecked")).toBe(true)
    await view.keys("ArrowDown", "Enter")
    expect(view.state.checked).toEqual(["Docs/Read"])
    expect(checked(view, "Docs/Read")).toBe("true")
  } finally {
    view.unmount()
  }
})

test("keyboard: unchecking 1 permission makes each branch above it mixed", async () => {
  const all = ["Admin/Users/Add", "Admin/Users/Ban", "Admin/Logs"]
  const view = mount(permissionTree, { paths, defaultChecked: all, defaultExpanded: ["Admin", "Admin/Users"] }, markup)
  try {
    expect(checked(view, "Admin")).toBe("true")
    await view.keys("Tab", "ArrowDown", "ArrowDown", "ArrowDown")
    expect(document.activeElement).toBe(at(view, "Admin/Users/Add"))
    await view.keys("Space")
    expect(sorted(view.state.checked)).toEqual(["Admin/Logs", "Admin/Users/Ban"])
    expect(checked(view, "Admin/Users/Add")).toBe("false")
    expect(checked(view, "Admin/Users/Ban")).toBe("true")
    expect(checked(view, "Admin/Users")).toBe("mixed")
    expect(checked(view, "Admin")).toBe("mixed")
    expect(at(view, "Admin").hasAttribute("data-indeterminate")).toBe(true)
    expect(at(view, "Admin").hasAttribute("data-checked")).toBe(false)
    expect(checked(view, "Docs")).toBe("false")
  } finally {
    view.unmount()
  }
})

test("keyboard: a locked permission keeps its state, and its branch stays mixed", async () => {
  const view = mount(permissionTree, { paths, locked: ["Admin/Users/Ban"], defaultExpanded: ["Admin", "Admin/Users"] }, markup)
  try {
    expect(at(view, "Admin/Users/Ban").getAttribute("aria-disabled")).toBe("true")
    expect(at(view, "Admin/Users/Add").hasAttribute("aria-disabled")).toBe(false)
    await view.keys("Tab", "ArrowDown", "Space")
    expect(sorted(view.state.checked)).toEqual(["Admin/Logs", "Admin/Users/Add"])
    expect(checked(view, "Admin/Users/Ban")).toBe("false")
    expect(checked(view, "Admin/Users")).toBe("mixed")
    expect(checked(view, "Admin")).toBe("mixed")
    await view.keys("ArrowDown", "ArrowDown", "ArrowDown")
    expect(document.activeElement).toBe(at(view, "Admin/Users/Ban"))
    await view.keys("Space")
    expect(checked(view, "Admin/Users/Ban")).toBe("false")
    await view.keys("ArrowUp", "ArrowUp", "ArrowUp", "Space")
    expect(view.state.checked).toEqual([])
    expect(checked(view, "Admin")).toBe("false")
  } finally {
    view.unmount()
  }
})

test("pointer: a click on the arrow opens a branch, and a click on the row checks it", async () => {
  const view = mount(permissionTree, { paths, locked: ["Admin/Users/Ban"] }, markup)
  try {
    await view.click(at(view, "Docs").querySelector("[data-chevron]")!)
    expect(view.state.expanded).toEqual(["Docs"])
    expect(view.changes.at(-1)).toMatchObject({ key: "expanded", reason: "trigger-press" })
    expect(view.state.checked).toEqual([])
    await view.click(at(view, "Docs/Read"))
    expect(view.state.checked).toEqual(["Docs/Read"])
    expect(checked(view, "Docs")).toBe("mixed")
    await view.click(at(view, "Docs").querySelector("[data-chevron]")!)
    expect(view.state.expanded).toEqual([])
    expect(view.state.checked).toEqual(["Docs/Read"])
  } finally {
    view.unmount()
  }
})

test("keyboard: typing a letter moves to the next permission that starts with it", async () => {
  const view = mount(permissionTree, { paths, defaultExpanded: branches }, markup)
  try {
    await view.keys("Tab", "w")
    expect(document.activeElement).toBe(at(view, "Docs/Write"))
    expect(view.state.checked).toEqual([])
  } finally {
    view.unmount()
  }
})

test("pattern: the tree passes the tree pattern check", async () => {
  const view = mount(permissionTree, { paths, defaultExpanded: ["Docs"] }, markup)
  try {
    await checkPattern(view.root, "tree")
  } finally {
    view.unmount()
  }
})

test("server: the permission tree renders with no DOM", () => {
  checkServer(permissionTree, { paths, locked: ["Admin/Users/Ban"], defaultExpanded: ["Docs"] }, markup)
})

test("direction: Right and Left follow the text direction", async () => {
  await checkDirection(permissionTree, { paths }, markup)
})

// The page mounts after the tests above: Tab in a mount() view goes to the first control of the document.
let page: ReturnType<typeof mountUI>
const status = () => page.root.querySelector("[data-status]")!.textContent
const row = (key: string) => page.root.querySelector<HTMLElement>(`b16-permission[value="${key}"]`)!

test("names: the page names the tree, each permission and the button, and shows the 3 states", async () => {
  page = mountUI(ui)
  await settle()
  const tree = page.root.querySelector("b16-permission-tree")!
  expect(tree.getAttribute("role")).toBe("tree")
  expect(tree.getAttribute("aria-label")).toBe("Permissions")
  expect(page.root.querySelectorAll("b16-permission[role=treeitem]").length).toBe(12)
  expect(page.root.querySelector("button")!.textContent).toBe("Save role")
  expect(row("Projects").getAttribute("aria-checked")).toBe("true")
  expect(row("Billing").getAttribute("aria-checked")).toBe("mixed")
  expect(row("Members").getAttribute("aria-checked")).toBe("false")
  expect(row("Billing/Invoices/Refund").getAttribute("aria-disabled")).toBe("true")
  expect(row("Billing/Invoices/Refund").textContent).toBe("Refund Owner only")
  expect(page.root.querySelectorAll("b16-permission[aria-disabled]").length).toBe(1)
  expect(status()).toBe("4 of 8 permissions are on.")
})

test("keyboard: on the page, Space checks a section and 1 permission, and the status line reports it", async () => {
  row("Members").focus()
  await keys("Space")
  expect(status()).toBe("6 of 8 permissions are on.")
  expect(row("Members").getAttribute("aria-checked")).toBe("true")
  await keys("ArrowDown", "Space")
  expect(document.activeElement).toBe(row("Members/Invite"))
  expect(status()).toBe("5 of 8 permissions are on.")
  expect(row("Members").getAttribute("aria-checked")).toBe("mixed")
  await keys("Space", "ArrowUp", "Space")
  expect(row("Members").getAttribute("aria-checked")).toBe("false")
  expect(status()).toBe("4 of 8 permissions are on.")
  page.root.querySelector<HTMLElement>("button")!.focus()
  await keys("Enter")
  expect(status()).toBe("Saved: 4 of 8 permissions for Support agent.")
})

test("agent: an agent finds the tree, checks a section, unchecks 1 permission and saves, and cannot change a locked one", async () => {
  for (const entry of page.live()) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy()
  const tree = page.live().find((entry) => entry.label === "Permissions")!
  expect(tree.actions).toContain("toggle")
  const found = await page.agent.query({ within: "Permissions" })
  expect(JSON.stringify(found)).toContain("Billing/Invoices/Refund")

  const locked = await page.agent.act({ steps: [{ ref: "Permissions", action: "toggle", args: ["Billing/Invoices/Refund"] }] })
  expect(locked.ok).toBe(false)
  expect(locked.error?.message).toContain("is disabled now")
  const unknown = await page.agent.act({ steps: [{ ref: "Permissions", action: "toggle", args: ["Billing/Taxes"] }] })
  expect(unknown.ok).toBe(false)
  expect(unknown.error?.message).toContain("No permission")

  const result = await page.agent.act({ steps: ui.task!.steps })
  expect(result.ok, result.error?.message).toBe(true)
  expect(status()).toBe("Saved: 5 of 8 permissions for Support agent.")
  expect(row("Members").getAttribute("aria-checked")).toBe("mixed")
  expect(row("Members/Remove").getAttribute("aria-checked")).toBe("false")
  expect(row("Billing/Invoices/Refund").getAttribute("aria-checked")).toBe("false")
  expect(ui.task!.done(page.root)).toBe(true)
})
