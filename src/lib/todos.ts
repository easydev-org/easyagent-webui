// Session todos, derived from the LAST `todo-write` call in a session's history.
//
// The tool REPLACES the whole list on every call (it is a checklist, not a log), so the most recent
// call's input IS the current list. There is no todos RPC and no `todos-updated` event, and adding
// one would duplicate state the messages already carry — the message store is reactive, so this
// derivation updates live while the agent streams a new call.

import type { ChatMessage } from './models'

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type TodoPriority = 'high' | 'medium' | 'low'

export interface Todo {
  content: string
  status: TodoStatus
  priority: TodoPriority
}

const STATUSES: readonly TodoStatus[] = ['pending', 'in_progress', 'completed', 'cancelled']
const PRIORITIES: readonly TodoPriority[] = ['high', 'medium', 'low']

/** True for the bundled todo tool, bare or extension-qualified (`x.todo-write`). */
export function isTodoWrite(name: string | null | undefined): boolean {
  if (!name) return false
  return name === 'todo-write' || name === 'todowrite' || name.endsWith('.todo-write')
}

function asStatus(v: unknown): TodoStatus {
  return STATUSES.includes(v as TodoStatus) ? (v as TodoStatus) : 'pending'
}

function asPriority(v: unknown): TodoPriority {
  return PRIORITIES.includes(v as TodoPriority) ? (v as TodoPriority) : 'medium'
}

/**
 * Parse `{ todos: [...] }` into a typed list, or null when the shape is not a todo list.
 *
 * Null (rather than []) is what lets a caller tell three different things apart: not a todo call,
 * still streaming (no `input` yet), and a genuinely empty list.
 */
export function parseTodos(input: unknown): Todo[] | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return null
  const raw = (input as Record<string, unknown>)['todos']
  if (!Array.isArray(raw)) return null
  const out: Todo[] = []
  for (const item of raw) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const o = item as Record<string, unknown>
    out.push({
      content: typeof o['content'] === 'string' ? o['content'] : '',
      status: asStatus(o['status']),
      priority: asPriority(o['priority']),
    })
  }
  return out
}

/**
 * The session's current todos: scan messages NEWEST-first and return the first parseable
 * `todo-write`. Newest-first because a later call replaces the earlier one, and scanning backwards
 * stops at the first hit instead of walking the whole history.
 */
export function latestTodos(messages: readonly ChatMessage[]): Todo[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i]!.parts
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j]!
      if (p.type !== 'tool' || !isTodoWrite(p.tool)) continue
      const todos = parseTodos(p.state?.input)
      if (todos !== null) return todos
    }
  }
  return []
}

/** Counts for the header badge: `remaining` is anything not completed and not cancelled. */
export function todoCounts(todos: readonly Todo[]): {
  total: number
  done: number
  remaining: number
} {
  let done = 0
  for (const t of todos) {
    if (t.status === 'completed' || t.status === 'cancelled') done++
  }
  return { total: todos.length, done, remaining: todos.length - done }
}
