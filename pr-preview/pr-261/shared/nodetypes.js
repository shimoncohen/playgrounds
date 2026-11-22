(function (root) {
'use strict';
// Hand-written subset of @types/node. Deliberate divergences: timer ids are numbers like the lib's
// setTimeout, process.exitCode is number | undefined, fs reads return string, and test, it and describe return void
// (the virtual ones return nothing to await; only t.test returns a promise).
const alias=n=>`declare module 'node:${n}' { export * from '${n}'; }`;
const exp=n=>`declare module 'node:${n}' { import m = require('${n}'); export = m; }`;
const modules=`
declare module 'fs' {
  interface Stats { isFile(): boolean; isDirectory(): boolean; size: number; }
  type Cb<T> = (err: Error | null, value: T) => void;
  type Done = (err: Error | null) => void;
  function existsSync(path: string): boolean;
  function readFileSync(path: string, encoding?: string): string;
  function writeFileSync(path: string, data: string): void;
  function appendFileSync(path: string, data: string): void;
  function readdirSync(path: string): string[];
  function statSync(path: string): Stats;
  function unlinkSync(path: string): void;
  function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  function readFile(path: string, cb: Cb<string>): void;
  function readFile(path: string, encoding: string, cb: Cb<string>): void;
  function writeFile(path: string, data: string, cb: Done): void;
  function appendFile(path: string, data: string, cb: Done): void;
  function readdir(path: string, cb: Cb<string[]>): void;
  function stat(path: string, cb: Cb<Stats>): void;
  function unlink(path: string, cb: Done): void;
  function mkdir(path: string, cb: Done): void;
  function mkdir(path: string, options: { recursive?: boolean }, cb: Done): void;
  namespace promises {
    function readFile(path: string, encoding?: string): Promise<string>;
    function writeFile(path: string, data: string): Promise<void>;
    function appendFile(path: string, data: string): Promise<void>;
    function readdir(path: string): Promise<string[]>;
    function stat(path: string): Promise<Stats>;
    function unlink(path: string): Promise<void>;
    function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  }
}
${alias('fs')}
declare module 'path' {
  const sep: string;
  function join(...parts: string[]): string;
  function resolve(...parts: string[]): string;
  function normalize(p: string): string;
  function dirname(p: string): string;
  function basename(p: string, ext?: string): string;
  function extname(p: string): string;
  function isAbsolute(p: string): boolean;
  function relative(from: string, to: string): string;
}
${alias('path')}
declare module 'events' {
  class EventEmitter {
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit(event: string | symbol, ...args: any[]): boolean;
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
    removeAllListeners(event?: string | symbol): this;
    listenerCount(event: string | symbol): number;
  }
  export { EventEmitter };
  export default EventEmitter;
}
declare module 'node:events' { export * from 'events'; export { default } from 'events'; }
declare module 'http' {
  import { EventEmitter } from 'events';
  type Headers = { [name: string]: string | number | string[] };
  class IncomingMessage extends EventEmitter {
    url?: string;
    method?: string;
    headers: { [name: string]: string | string[] | undefined };
  }
  class ServerResponse extends EventEmitter {
    statusCode: number;
    setHeader(name: string, value: string | number | string[]): this;
    writeHead(status: number, headers?: Headers): this;
    write(chunk: string): boolean;
    end(chunk?: string): void;
  }
  class Server extends EventEmitter {
    listen(port: number, callback?: () => void): this;
    close(callback?: () => void): this;
  }
  const STATUS_CODES: { [code: number]: string | undefined };
  function createServer(listener?: (req: IncomingMessage, res: ServerResponse) => void): Server;
}
${alias('http')}
declare module 'node:test' {
  interface TestContext { readonly name: string; test(name: string, fn?: (t: TestContext) => void | Promise<void>): Promise<void>; }
  type TestFn = (t: TestContext) => void | Promise<void>;
  type Hook = () => void | Promise<void>;
  function test(name: string, fn?: TestFn): void;
  function it(name: string, fn?: TestFn): void;
  function describe(name: string, fn?: () => void): void;
  function suite(name: string, fn?: () => void): void;
  function before(fn: Hook): void;
  function after(fn: Hook): void;
  function beforeEach(fn: Hook): void;
  function afterEach(fn: Hook): void;
  export { test, it, describe, suite, before, after, beforeEach, afterEach };
  export default test;
}
declare module 'assert' {
  function assert(value: unknown, message?: string | Error): asserts value;
  namespace assert {
    class AssertionError extends Error {
      actual: unknown; expected: unknown; operator: string; code: string; generatedMessage: boolean;
      constructor(options: { message?: string; actual?: unknown; expected?: unknown; operator?: string });
    }
    function ok(value: unknown, message?: string | Error): asserts value;
    function equal(actual: unknown, expected: unknown, message?: string | Error): void;
    function notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    function strictEqual<T>(actual: unknown, expected: T, message?: string | Error): asserts actual is T;
    function notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    function deepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    function notDeepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    function deepStrictEqual<T>(actual: unknown, expected: T, message?: string | Error): asserts actual is T;
    function notDeepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    function throws(fn: () => unknown, expected?: unknown, message?: string): void;
    function doesNotThrow(fn: () => unknown, message?: string): void;
    function rejects(promiseOrFn: Promise<unknown> | (() => Promise<unknown>), expected?: unknown, message?: string): Promise<void>;
    function doesNotReject(promiseOrFn: Promise<unknown> | (() => Promise<unknown>), message?: string): Promise<void>;
    function match(value: string, regexp: RegExp, message?: string | Error): void;
    function doesNotMatch(value: string, regexp: RegExp, message?: string | Error): void;
    function fail(message?: string | Error): never;
    function ifError(value: unknown): void;
    const strict: typeof assert;
  }
  export = assert;
}
declare module 'assert/strict' { import a = require('assert'); const s: typeof a; export = s; }
${exp('assert')}
${exp('assert/strict')}
interface Process {
  argv: string[];
  env: { [name: string]: string | undefined };
  exitCode: number | undefined;
  exit(code?: number): never;
  cwd(): string;
  on(event: string, listener: (...args: any[]) => void): this;
  stdout: { write(text: string): boolean };
  stderr: { write(text: string): boolean };
}
declare var process: Process;
declare function setInterval(f: (...args: any[]) => void, ms?: number, ...args: any[]): number;
declare function clearInterval(id: number | undefined): void;
declare function clearTimeout(id: number | undefined): void;
declare function setImmediate(f: (...args: any[]) => void, ...args: any[]): number;
declare function clearImmediate(id: number | undefined): void;
declare var __dirname: string;
declare var __filename: string;
`;
// Real lib files already define these, so they load only with the hand lib.
const iterators=`
interface SymbolConstructor { readonly iterator: unique symbol; readonly asyncIterator: unique symbol; }
declare var Symbol: SymbolConstructor;
interface IteratorYieldResult<T> { done?: false; value: T; }
interface IteratorReturnResult<R> { done: true; value: R; }
type IteratorResult<T, R = any> = IteratorYieldResult<T> | IteratorReturnResult<R>;
interface Iterator<T, R = any, N = undefined> { next(...args: [] | [N]): IteratorResult<T, R>; return?(value?: R): IteratorResult<T, R>; }
interface Iterable<T> { [Symbol.iterator](): Iterator<T>; }
interface IterableIterator<T> extends Iterator<T> { [Symbol.iterator](): IterableIterator<T>; }
interface Array<T> { [Symbol.iterator](): IterableIterator<T>; entries(): IterableIterator<[number, T]>; keys(): IterableIterator<number>; values(): IterableIterator<T>; }
interface ReadonlyArray<T> { [Symbol.iterator](): IterableIterator<T>; }
interface String { [Symbol.iterator](): IterableIterator<string>; }
interface Map<K, V> { [Symbol.iterator](): IterableIterator<[K, V]>; entries(): IterableIterator<[K, V]>; keys(): IterableIterator<K>; values(): IterableIterator<V>; }
interface Set<T> { [Symbol.iterator](): IterableIterator<T>; entries(): IterableIterator<[T, T]>; keys(): IterableIterator<T>; values(): IterableIterator<T>; }
`;
root.NodeTypes={modules,iterators};
})(typeof window !== 'undefined' ? window : globalThis);
