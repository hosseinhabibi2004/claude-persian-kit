// A small, hand-written approximation of the parts of Claude Code's plugin API
// this repository uses, so `tsc` can run where the real declaration file is not
// available (CI). Claude Code writes the real, complete file next to a mod when
// it loads one in a session: copy it to typings/claude-code/index.d.ts and
// scripts/typecheck.mjs uses it instead of this stub.
//
// If the real API differs from this file, the real file wins; keep this one as
// small as the code needs.

declare module 'claude-code' {
  export type PluginOptions = Readonly<Record<string, string | number | boolean | readonly string[]>>

  export type PromptComposeSection = {
    id: string
    text: string
    scope: 'shared' | 'session'
  }
  export type PromptComposeResult = { sections: readonly PromptComposeSection[] }

  export type CommandRunResult = { text?: string; context?: readonly string[] }

  export type ConfigRow = {
    key: string
    value: unknown
  }

  export type ProcessRunResult = { exitCode: number; stdout: string; stderr: string }

  export interface Engine {
    plugin: { name: string; root: string }
    command: {
      register(spec: { name: string; description: string; argumentHint?: string }): Promise<unknown>
    }
    config: {
      list(): Promise<ConfigRow[]>
      set(args: { key: string; value: unknown }): Promise<{ value: unknown } | { deny: string }>
    }
    env: { get(name: string): Promise<string | undefined> }
    fs: { exists(path: string): Promise<boolean> }
    process: {
      run(argv: readonly string[], init?: { timeoutMs?: number }): Promise<ProcessRunResult>
    }
    store: {
      get(key: string): Promise<unknown>
      set(key: string, value: unknown): Promise<void>
      delete(key: string): Promise<void>
    }
    clock: { now(): Promise<number> }
  }

  type Next<E, R> = (e?: E) => Promise<R>

  export interface EventMap {
    'session.start': { input: { cwd: string }; result: { cwd: string } }
    'prompt.compose': { input: Record<string, unknown>; result: PromptComposeResult }
    'command.run': { input: { command: string; args: string }; result: CommandRunResult }
  }

  export type Hook<K extends keyof EventMap> = (
    $: Engine,
    e: EventMap[K]['input'],
    next: Next<EventMap[K]['input'], EventMap[K]['result']>,
  ) => EventMap[K]['result'] | Promise<EventMap[K]['result']>

  export interface On {
    <K extends keyof EventMap>(event: K, hook: Hook<K>): { catch(handler: unknown): unknown }
    <K extends keyof EventMap>(
      event: K,
      matcher: Partial<EventMap[K]['input']>,
      hook: Hook<K>,
    ): { catch(handler: unknown): unknown }
  }

  export type Register = (on: On, options: PluginOptions) => unknown
}

declare module 'claude-code/testing' {
  import type { Engine } from 'claude-code'

  type Expectation = {
    toBe(value: unknown): void
    toEqual(value: unknown): void
    toMatch(pattern: RegExp | string): void
  }
  export function expect(value: unknown): Expectation

  export type TestEngine = Engine & {
    session: { start(args: Record<string, unknown>): Promise<unknown> }
    command: Engine['command'] & {
      run(args: Record<string, unknown>): Promise<{ text?: string }>
    }
    prompt: { compose(args?: Record<string, unknown>): Promise<{ sections: readonly { id: string; text: string; scope: string }[] }> }
  }
  // Hooks the test registers stand in for the engine beneath the plugin.
  type TestOn = (event: string, hook: (...args: any[]) => unknown) => unknown
  type Body = ($: TestEngine, on: TestOn) => unknown

  export function test(name: string, body: Body): void
  export function test(name: string, options: { options?: Record<string, unknown> }, body: Body): void

  export const mock: {
    env(on: TestOn, variables: Readonly<Record<string, string>>): void
    store(on: TestOn, entries?: Readonly<Record<string, unknown>>): void
    clock(on: TestOn, options?: { now?: number }): { now(): number; advance(ms: number): Promise<void> }
  }
}

// Mods are plain modules: no DOM, no Node.
declare function h(...args: unknown[]): unknown
declare function Fragment(...args: unknown[]): unknown
