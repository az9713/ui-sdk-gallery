<!--
The primitive of B20, unchanged, rendered through the Svelte adapter.
Svelte renders its slots as native elements, with the data and the text of D01.
-->
<script module lang="ts">
  import { createParts } from "@ui-sdk/svelte/primitive"
  import { teammatePicker } from "./B20-teammate-picker"
  import { TEAM, TEXT } from "./D01-teammate-picker-react"

  const Picker = createParts(teammatePicker, { root: "div", input: "input", list: "div", person: "div", empty: "p" })
</script>

<script lang="ts">
  import { onMount } from "svelte"

  let { label = TEXT.label("Svelte"), team = TEAM }: { label?: string; team?: readonly string[] } = $props()
  let chosen = $state<string | null>(null)
  // The empty part reads how many names match. The names join the list in their bind, after the first render,
  // and that join does not make the empty part check again. So the empty part renders once the names are bound.
  let bound = $state(false)
  onMount(() => (bound = true))
</script>

<div class="d03-card">
  <h2>{TEXT.heading}</h2>
  <Picker.Root class="d03-picker" role="group" aria-label={label} onValueChange={(value: string | null) => (chosen = value)}>
    <Picker.Input class="d03-input" aria-label={TEXT.search} placeholder={TEXT.search} />
    <Picker.List class="d03-list" aria-label={TEXT.list}>
      {#each team as name (name)}
        <Picker.Person value={name} class="d03-person">{name}</Picker.Person>
      {/each}
    </Picker.List>
    {#if bound}
      <Picker.Empty class="d03-empty">{TEXT.empty}</Picker.Empty>
    {/if}
  </Picker.Root>
  <p role="status" data-status>{chosen ? TEXT.chosen(chosen) : TEXT.none}</p>
</div>
