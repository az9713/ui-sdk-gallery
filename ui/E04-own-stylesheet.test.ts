import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./E04-own-stylesheet"

const { root, agent } = mountUI(ui)

test("look: the definition switches web.css off and carries an own stylesheet on data-slot and state attributes", () => {
  expect(ui.look).toEqual({ webCss: false })
  const css = ui.css!
  expect(css).toContain('[data-slot="tabs-tab"][data-selected]')
  expect(css).toContain('[data-slot="switch"][data-checked]')
  // The rules select by data-slot and state attribute: no ui-* tag name and no class.
  expect(css).not.toMatch(/(^|[\s,>])ui-[a-z-]+/m)
  expect(css).not.toMatch(/(^|[\s,>])\.[a-z]/m)
})

test("keyboard: Space changes a switch", async () => {
  ;[...root.querySelectorAll<HTMLElement>("ui-tabs-tab button")].find((b) => b.textContent === "Notifications")!.click()
  await settle()
  const digest = root.querySelector<HTMLElement>("ui-switch")!
  digest.focus()
  await keys("Space")
  expect(digest.getAttribute("aria-checked")).toBe("false")
  expect(digest.hasAttribute("data-checked")).toBe(false)
})

test("agent: the bridge finds each control by its name", async () => {
  const result = await agent.act({ steps: [{ ref: "Project name", action: "setValue", args: ["Atlas"] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(root.querySelector("input")!.value).toBe("Atlas")
})
