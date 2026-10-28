<script lang="ts">
  // The session's checklist. Rendered in the header popover and inline in a `todo-write` card.
  //
  // Purely presentational: the caller parses and supplies the list, so this has no opinion about
  // where the todos came from — which is what lets the same component serve both places.
  import { t } from '$lib/i18n.svelte'
  import { AppIcons } from '$lib/icons'
  import { cn } from '$lib/utils'
  import type { Todo, TodoPriority, TodoStatus } from '$lib/todos'

  let { todos }: { todos: readonly Todo[] } = $props()

  function statusIcon(status: TodoStatus) {
    switch (status) {
      case 'completed':
        return AppIcons.success
      case 'in_progress':
        return AppIcons.spinner
      case 'cancelled':
        return AppIcons.close
      default:
        return AppIcons.circle
    }
  }

  function statusTone(status: TodoStatus): string {
    switch (status) {
      case 'completed':
        return 'text-success'
      case 'in_progress':
        return 'text-warning'
      case 'cancelled':
        return 'text-muted-foreground'
      default:
        return 'text-muted-foreground'
    }
  }

  // Priority is shown as a bar rather than a word: a three-word vocabulary ("high"/"medium"/"low")
  // next to every row is noise, and what the reader needs is which rows matter.
  function priorityBar(p: TodoPriority): string {
    switch (p) {
      case 'high':
        return 'bg-destructive'
      case 'medium':
        return 'bg-warning'
      default:
        return 'bg-border'
    }
  }
</script>

{#if todos.length === 0}
  <div class="px-2 py-6 text-center text-meta text-muted-foreground">{t('noTodos')}</div>
{:else}
  <ul class="flex flex-col">
    {#each todos as todo, i (i)}
      {@const Icon = statusIcon(todo.status)}
      {@const finished = todo.status === 'completed' || todo.status === 'cancelled'}
      <li class="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-muted/50">
        <Icon class={cn('mt-0.5 size-3.5 shrink-0', statusTone(todo.status))} />
        <span
          class={cn(
            'min-w-0 flex-1 text-meta break-words',
            finished && 'text-muted-foreground line-through',
          )}
        >
          {todo.content}
        </span>
        <!-- Three-pixel bar, high on the right: it reads as "weight" without competing with the
             status icon for attention. -->
        <span
          class={cn('mt-1 h-3 w-[3px] shrink-0 rounded-full', priorityBar(todo.priority))}
          title={todo.priority}
        ></span>
      </li>
    {/each}
  </ul>
{/if}
