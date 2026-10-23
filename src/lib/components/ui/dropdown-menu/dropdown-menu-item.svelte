<script lang="ts">
  // Styled DropdownMenu item + separator wrappers (shared chrome from the index).
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui'
  import { cn } from '$lib/utils'
  import type { Snippet } from 'svelte'

  let {
    class: className,
    children,
    onSelect,
    disabled,
  }: {
    class?: string
    children?: Snippet
    onSelect?: (e: Event) => void
    disabled?: boolean
  } = $props()
</script>

<!-- onSelect must NOT be cancelled by default.
     Cancelling keeps the menu mounted, and a mounted menu keeps a z-50 layer over the whole
     page: whatever the item opens is then unreachable by pointer — it renders, but clicks
     land on the menu layer. That is exactly what happened to the permissions drawer, and it
     would equally affect any other item that opens a panel rather than a modal (a modal's
     own backdrop hides the leftover menu, which is why this went unnoticed).
     A caller that genuinely wants to keep the menu open can preventDefault itself. -->
<DropdownMenuPrimitive.Item
  {disabled}
  onSelect={e => {
    onSelect?.(e)
  }}
  class={cn(
    'relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none',
    'data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
    className,
  )}
>
  {@render children?.()}
</DropdownMenuPrimitive.Item>
