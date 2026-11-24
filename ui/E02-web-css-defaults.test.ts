import { expect, test } from "vitest"
import { keys, mountUI, settle } from "../src/testing"
import ui from "./E02-web-css-defaults"

const { root, agent } = mountUI(ui)

test("look: the definition switches the gallery tokens off and has no CSS of its own", () => {
  expect(ui.look).toEqual({ tokens: false })
  expect(ui.css).toBeUndefined()
})

test("keyboard: Space changes a switch", async () => {
  ;[...root.querySelectorAll<HTMLElement>("ui-tabs-tab button")].find((b) => b.textContent === "Notifications")!.click()
  await settle()
  const digest = root.querySelector<HTMLElement>("ui-switch")!
  digest.focus()
  await keys("Space")
  expect(digest.getAttribute("aria-checked")).toBe("false")
})

test("agent: the bridge finds each control by its name", async () => {
  const result = await agent.act({ steps: [{ ref: "Project name", action: "setValue", args: ["Atlas"] }] })
  expect(result.ok, result.error?.message).toBe(true)
  expect(root.querySelector("input")!.value).toBe("Atlas")
})
