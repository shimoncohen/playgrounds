# TypeScript Quest: design

Date: 2026-11-16. Status: the design is approved, with Q7 (the TypeScript Quest world, 18 chapters and tier XP) approved as proposed. The plan is [2026-11-16-typescript-quest-phase1.md](../plans/2026-11-16-typescript-quest-phase1.md). Epic: #222 (TypeScript Quest, and deeper JavaScript and Node in Script Quest). The tests run the TypeScript compiler in Node from a pinned dev dependency (see [Compiler in Node tests](#compiler-in-node-tests)). The rank names and base thresholds ([Tier XP and ranks](#tier-xp-and-ranks)), D14 ([Decisions](#decisions)) and the chapter 6 and chapter 14 Suggested-first corrections ([Suggested first](#suggested-first)) are signed off (PRs 11 to 14 shipped on the first set, and the user signed off chapter 14 in PR #249). PR 15's `intrinsic` spike passed ([Engine plan](#engine-plan)).

**Contents:** [TLDR](#tldr) · [Goal](#goal) · [Non-goals](#non-goals) · [Current state](#current-state) · [Story](#story) · [Chapters](#chapters) ([Beginner](#beginner-booking-depot-chapters-1-to-5) · [Intermediate](#intermediate-rail-yard-chapters-6-to-10) · [Advanced](#advanced-signal-tower-chapters-11-to-14) · [TypeScript with Node](#typescript-with-node-engine-wagon-chapters-15-to-18)) · [Tier XP and ranks](#tier-xp-and-ranks) · [Suggested first](#suggested-first) · [Engine plan](#engine-plan) · [Decisions](#decisions) · [Trophy Room](#trophy-room) · [Alternatives](#alternatives) · [Risks](#risks) · [Test plan](#test-plan) · [Observability](#observability) · [Performance](#performance) · [PR chain](#pr-chain) · [Touchpoints](#touchpoints)

## TLDR

- TypeScript Quest is a new playground with 18 chapters in four tiers: Beginner (1 to 5), Intermediate (6 to 10), Advanced (11 to 14) and TypeScript with Node (15 to 18). It is set on the Starlight Circus touring by rail, and its treasure is the Golden Timetable.
- Chapters 1 to 9 and 11 to 14 use the TypeScript REPL that Script chapter 11 already has. Chapters 10 and 15 to 18 use project mode with files and a terminal.
- It loads the shared engine that PRs 4, 7 and 9 shipped (`shared/tscheck.js`, `shared/nodeenv.js`, `shared/scheduler.js`). PR 13 adds multi-file projects, a `tsconfig` and a larger lib. PR 16 adds `.ts` in the virtual terminal, `node --test` and typings for Node.
- Tier XP per mission is 10, 15, 20 and 25. Every tier pays the default 25 XP per chapter badge (`badgeXp`), as there are no old saves.
- Badges are derived from `done` at render time (D14, proposed), so the save has no new stored field. The save key is `typescript-quest-v1`.
- Adding the quest to the catalog (PR 11) costs everyone the "Wanderer" trophy until they start it.

Options for where the TypeScript lib comes from (D2 and D4 weighed them):

| Option | Needs | Gives | Main limit |
|---|---|---|---|
| **Hand-grown lib in `TS_LIB` (chosen), plus hand-written Node typings** | New declarations written and tested per chapter | A small lib that loads fast on a phone, and exactly the surface the chapters teach | Every need must be added by hand; a missing global shows as a confusing error until PR 13 adds it |
| Real `lib.d.ts` from the CDN | Several files fetched at run time, wiring into the compiler host | Every standard global, always correct | Size and load time are unmeasured; PR 13 measures it before any switch |
| `@types/node` | The full package fetched | The real Node typings | Far too large for a phone, so Node typings stay hand-written either way |

## Goal

Give a learner who knows basic JavaScript a path to typed JavaScript: from reading inferred types, through generics and type-level programming, to a typed command-line tool with tests. Do it as a treasure hunt in its own folder, with its own save, loading the same engine Script Quest uses.

## Non-goals

- Any code, test or fixture. PRs 11 to 18 write them.
- Changes to the Script Quest spec or plan. They keep their "PRs 10 to 18 are summary rows" text; this spec and its plan are the real re-plan.
- Learner-facing text for the chapters. The outlines here are descriptions; PRs 11, 12, 14, 15 and 17 write the wording.
- Real ESM execution. Chapter 10 teaches TypeScript `import` and `export` and runs through the virtual Node's CommonJS.
- A full `lib.d.ts` or `@types/node`.
- Edits to `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `shared/catalog.js` or the landing card. PR 11 makes them.

## Current state

All of this was read from the tree at the base of this branch.

**The TypeScript checker (`shared/tscheck.js:1-125`).**

- `TSCheck.{init, check, load}` (`:124`). `load` fetches TypeScript 5.9.3 from jsDelivr, with a second URL as a fallback (`:6-7`).
- One hand-written `TS_LIB` string (`:18-101`). `interface Object` is at `:18` and an empty `interface Symbol` at `:25`.
- `check(prev, src)` (`:102`) builds a `lib.d.ts` plus a `main.ts` made of the previous REPL snippets joined with `;`, with `noLib`, `strict`, ES2020, `module: None` and `noEmit`. It reports only the diagnostics that fall on the new lines, emits JavaScript with `transpileModule`, and extracts interface and type declarations for the memory panel.
- Before PR 13 there was no multi-file support, no `import` and no tsconfig; PR 13 added `checkProject`.
- Before PR 13, `TS_LIB` had no `Object` or `Symbol` constructor values (so no `Object.keys`), no `Map`, `Set`, `Date` or `setInterval`. PR 13 added `Object` (`keys`, `values`, `entries`), `Map`, `Set` and `Date`, but not `Symbol` or `setInterval`, and no iterators, so `for...of` over a `Map`, a `Set` or an array still reports an error (TS2488). `console` has only `log`, `error`, `warn` and `table`. `Extract`, `NonNullable`, `Parameters` and `InstanceType` were missing and PR 13 added them; there is still no `Uppercase`, `Lowercase`, `Capitalize` or `Uncapitalize`.
- It does have `Partial`, `Required`, `Readonly`, `Pick`, `Record`, `Exclude`, `Omit`, `ReturnType` and `Awaited` (`:78`, `:94-101`), and `Promise<T>` with `then`, `catch` and `finally` (`:68-77`).

**The virtual Node (`shared/nodeenv.js`).**

- `NODE_VERSION` is `v22.12.0` (`:8`), while the repo requires Node 24 (`package.json:8`).
- `require` (`:207-219`) knows exactly `fs`, `path`, `os`, `process`, `events` and `http` (`:206`), and resolves `./x`, `.js` and `.json` only. Module code is parsed as `sourceType: 'script'` (`:226`), so only CommonJS runs. There is no `node:test` and no `assert`.
- `fs` has sync, callback and promise forms of `readFile`, `writeFile`, `appendFile`, `readdir`, `stat`, `unlink` and `mkdir`, plus `existsSync` (`:81-93`).
- `http` has `createServer` and `STATUS_CODES` but no `get` or `request` (`:176`; #246, the issue for `http.get`).
- `process` has `argv`, `env`, `exitCode`, `on`, `once`, `off('exit')`, `exit`, `nextTick` and `stdout.write`, and no `stderr` or `stdin` (`:191-197`).

**The scheduler (`shared/scheduler.js:1-150`).** A virtual event loop with a cost table (`COST`, `:3`), a loop guard (`:11-16`, `:69`) and run limits (`:149`).

**The REPL in Script Quest (`programming/script-quest/app.js`).** TypeScript Quest's REPL needs all of this, which is why #229 (the issue to move the value formatter to `shared/`) is bigger than the formatter alone.

- The value formatter block is `:20-84`: `refId` (`:22`), `fnSig` (`:30`), `fmt` (`:40`), `toText` (`:73`), `fmtArgs` (`:74`) and `tableHTML` (`:75`). It emits HTML, so it cannot move into `shared/` unchanged.
- The REPL state `HIST`, `DECLS` and `TYPES` is declared at `:116`, and `freshConsole` resets it at `:135`. `execJS` is at `:156`, `execTS` at `:179` and the memory panel `renderMem` at `:363`.
- A mission check receives `{...RUN, has, kind, val, types}`, which includes `diags` (`:222-249`).
- A visible message and a retry appear when the compiler fails to load (`:225`).
- `runShell` is at `:440`. `cd` only prints a tip (#247, the issue for `cd` and `rm -r` in the virtual terminal).
- The `execJS` path had no loop guard (#241, the issue for a loop guard in the Script console). PR 13 fixes it for both consoles: `prepare` in `shared/jsrealm.js` guards the code it returns with `Scheduler.guardSource`, and each realm owns a guard from `Scheduler.makeGuard`.

**Script chapter 11 ("TypeScript").** It is the only TypeScript teaching today (`programming/script-quest/content/ch-beyond-the-browser.js:6-50`). It has variable annotations, typed functions, an interface with an optional property, a missing property, a literal union, inference, and one generic function (ending at `:49`). It does not teach `Promise<T>`: the word `Promise` does not appear in that file.

**Tier model.** `shared/tiers.js:6-64` is `Tiers.create`: `badgeXp` per tier (default 25 at `:4`), `ranks` and `rankFor` that derive the tier-end ranks, and `doneSep`. `docs/tiers-guideline.md:7` states the model, `:19-20` shows a five-entry base ladder with tier-end ranks, and `:317` is the adoption step that sets `baseRanks` and `tierEndRanks`. Script's own setup is `programming/script-quest/tiers.js:4-23` (`baseRanks`, `tierEndRanks`, `tierView`, `badgePay`).

**Other facts.**

- The catalog lists Script Quest with 23 chapters (`shared/catalog.js:9`).
- The `typescript` commit scope is already accepted (`commitlint.config.mjs:5`), and the syntax loop in `AGENTS.md:17` already lists the new folders.
- `AGENTS.md:97` requires plans and specs before code. `AGENTS.md:79` is the "Add a whole playground" row, and `.claude/skills/new-playground/SKILL.md` lists every place a new quest is wired in.
- `docs/story-guideline.md:19-21` defines cast and legs, and `:39,41` define the `story.js` shape and the catalog test that checks it.
- The `test:engine` script (`package.json:13`) has no `tests/typescript/` glob yet; PR 11 adds it with the first test.
- No test runs the TypeScript compiler in Node: `package.json` has no `typescript` dependency (`devDependencies` at `package.json:19-24`), and the only TS test checks the loader's failure path (`tests/script/engine-modules.test.mjs:127-143`).
- The teach-before-use table is `FIRST` in `tests/script/teach.test.mjs:13-111`. Its indexes are 0-based chapter indexes, so index 12 is rail number 13.
- CI ignores `docs/` and `*.md` (`tools/ci-plan.mjs:18`), so this change runs no quest tests.

## Story

Written with the story guideline in mind (`docs/story-guideline.md`). The outline goes in `programming/typescript-quest/story.js` (PR 11).

- **World:** the Starlight Circus goes on tour. The learner is now the tour's engineer.
- **Cast** (each with a one-line reintroduction, so Script Quest is not required):
  - **Ringmaster Bellamy:** retired, and sends bookings by telegram from each town.
  - **Pepper:** the tightrope kid who asks "why?".
  - **Mumbles:** the parrot that repeats whatever it hears, the living `any`.
- **Places and tiers:**

| Place | Tier | Chapters |
|---|---|---|
| the booking depot | Beginner | 1 to 5 |
| the rail yard | Intermediate | 6 to 10 |
| the signal tower | Advanced | 11 to 14 |
| the engine wagon | TypeScript with Node | 15 to 18 |

- **Treasure:** the Golden Timetable, a tour timetable that can never double-book a wagon, finished by the typed CLI in chapter 18. Chapter 1 sets it up with a smudged paper timetable that books Mumbles twice. Script's lantern is already spent, so this is a new treasure.
- **`story.js` shape** (`docs/story-guideline.md` §3): `world`, `places`, `cast` (name and role) and `treasure`. Each chapter object also carries a one-sentence `story` line (the clue, the puzzle and the find), an `intro` and a `badge`. The `story` line is shown above every mission, so it is written to be read alone and never uses a term the learner has not met.
- World values come from the circus: wagons, towns, performers, tickets and timetable slots, not `foo` and `bar`.

## Chapters

Rules for every chapter:

- **Mode.** "REPL" is the `ts` console. "Project" is project mode with files and a terminal, as design D3 says. Chapter 10 is the one difference: its missions pass on the compiler's diagnostics and on the program's output, so it needs no terminal command beyond running the files. PR 14 hides the terminal there: the Run button runs `main.ts`, so mission 6 says "press Run". Its project files live in memory, are seeded per mission and are not saved, and it has no quick-fire questions; its two diagnostic codes (TS2305, TS2307) are in the Error decoder, with one text section in the Field guide.
- **Missions.** About 6 per chapter (chapter 1 about 7, chapter 18 about 8). An outline gives the title, what the learner writes, and the diagnostic or output that passes it. Diagnostic codes are the expected ones; each is confirmed against the compiler when its chapter is written.
- **Passing.** A mission passes when the learner's own code produces the diagnostic or output asked for, and a check never counts work from an earlier mission.
- **Teach before use.** Every new term appears in the chapter's term list and is taught before any later mission uses it. The `FIRST` table gets an entry per term.
- **`Promise<T>`.** It is taught first in chapter 6 (Generics), as the familiar generic type. Chapters 1 to 5 do not mention it, and chapter 4's callbacks are synchronous. `Awaited` is taught in chapter 13. Chapters 16 and 17 then use `fs.promises` and async tests with both already taught.

### Beginner: booking depot (chapters 1 to 5)

Mode: REPL. Mission XP 10.

**1. Types and inference.** Leg: a smudged paper timetable books Mumbles twice; learn to read what the compiler already knows and to label what it cannot. Badge: Booking Stamp. Starts from what Script chapter 11 does not cover: it has annotations, typed functions, a shape, a missing property, a literal union, inference and one generic function. Chapter 1 adds how inference widens and narrows, and `unknown` against `any`. New terms: widening, literal type, `const` vs `let` inference, `any`, `unknown`, implicit `any`, type assertion `as`.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Read the guess | `const` and `let` variables from the same value, then an assignment to each that only one of them rejects | TS2322 on the `let` or `const` line asked for |
| 2 | Empty crate | A variable declared with no value, annotated so later assignments type-check | The declaration has an annotation and a later assignment of the wrong type is rejected with TS2322 |
| 3 | The parrot problem | A value typed `any`, used wrongly with no error | No diagnostics, then the mission shows what a typed version reports |
| 4 | Parrot on a leash | The same value typed `unknown`, then used without a check | TS18046 reported |
| 5 | Hand the parrot a type | A parameter with no annotation | TS7006 reported (implicit `any`) |
| 6 | Say it again, with `as` | A value read as a narrower type with `as` | No diagnostics; a following mismatch with a non-overlapping `as` reports TS2352 |
| 7 | Smudge cleaned | Two variables whose inferred types differ, fixed with one annotation | No diagnostics and the declared type is the one asked for |

**2. Unions and narrowing.** Leg: the telegrams arrive as text or as numbers; sort them at the depot door. Badge: Switch Lever. Narrowing `unknown` from chapter 1 lands here. New terms: narrowing, `typeof` guard, `in` guard, truthiness narrowing, equality narrowing, discriminated union, tag property, `never` (the type with no values, first met as the leftover in the `default` branch), exhaustive check.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Text or number | A union parameter used with a method only one member has, then a `typeof` check | No diagnostics after the check (try it first without the check: TS2339) |
| 2 | Open the parrot | Narrow the `unknown` from chapter 1 with `typeof` | No diagnostics |
| 3 | Is it there? | A value typed `T \| undefined`, guarded by truthiness or `===` | No diagnostics after the guard (try it first without it: TS18048) |
| 4 | Look inside | Two object shapes told apart with `in` | No diagnostics after the check (try it first without it: TS2339) |
| 5 | Tagged tickets | A discriminated union with a `kind` tag and a `switch` | No diagnostics and each branch uses its own fields |
| 6 | Nothing missed | A `never` check in the `default` branch, with one union member left unhandled | TS2322 reported for the unhandled member (once the case is added it compiles clean) |

**3. Aliases and interfaces.** Leg: every wagon needs a booking card; write the card once and reuse it. Badge: Ticket Blank. New terms: type alias, interface, optional property, `readonly` property, extending, intersection, excess property check, structural typing.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Name it once | A `type` alias for a union or object shape | The alias is used in two declarations with no diagnostics |
| 2 | Booking card | An `interface` with required and optional properties | The memory panel lists the blueprint and a matching value passes |
| 3 | Stuck stamp | A `readonly` property assigned to later | TS2540 reported |
| 4 | Stowaway field | An object literal with an extra property | TS2353 reported |
| 5 | Grow the card | A second `interface` that `extends` the first | A value with both sets of properties passes (try it first with one property missing: TS2741) |
| 6 | Card plus stamp | A type that joins the first interface and an inline shape with `&` | A value with both sets of properties passes (try it first with one missing: TS2322) |
| 7 | Same shape, other name | Two differently named shapes assigned to each other | No diagnostics (structural typing) |

**4. Typed functions.** Leg: the depot clerk's rules for taking a booking: what goes in, what comes out. Badge: Brass Whistle. New terms: return type, optional parameter, default parameter, rest parameter, `T[]` (glossed in place with the rest parameter), callback type, `void`, type predicate (`x is T`). `never` was taught in chapter 2; here it is reused as a function's return type.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | In and out | A function with typed parameters and an explicit return type | No diagnostics (try it first with a wrong return value: TS2322) |
| 2 | Maybe a seat | An optional and a defaulted parameter | A call with fewer arguments passes (try it first with too many: TS2554) |
| 3 | A whole party | A function with a rest parameter `...seats: number[]`, called with several arguments | The call compiles (try it first with a text among the numbers: TS2345) |
| 4 | Call me back | A parameter typed as a function, given a callback | A callback with the right parameter type passes (try it first with the wrong one: TS2345) |
| 5 | Returns nothing | A `void` function called as a statement | No diagnostics (try it first using its result as text: TS2322) |
| 6 | Never returns | A function that always throws, typed `never` | No diagnostics (try it first with a reachable return: TS2322) |
| 7 | Vouch for it | A function returning `x is Ticket` and its use in an `if` | The narrowed branch compiles without a cast |

**5. Arrays and tuples.** Leg: the wagon roster is a list in a fixed order. Badge: Wagon Roster. `T[]` was first met in chapter 4 with the rest parameter, and chapter 5 builds on it. New terms: `readonly` array, tuple, labelled tuple element, optional tuple element. The `Array<T>` spelling waits for chapter 6, which teaches generics.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | One kind per list | A `string[]` and a wrong push | TS2345 reported |
| 2 | Look but do not touch | A `readonly` array and a `push` on it | TS2339 reported |
| 3 | Fixed slots | A tuple of wagon number and performer name | The tuple compiles (try it first with a swapped order: TS2322) |
| 4 | Name the slots | A labelled tuple and reading its slots by index | No diagnostics |
| 5 | Maybe a third slot | An optional tuple element | A short tuple passes (try it first with a too long one: TS2322) |
| 6 | Stay in range | Index past the end of a tuple | TS2493 reported |

### Intermediate: rail yard (chapters 6 to 10)

Mission XP 15. Chapters 6 to 9 use the REPL, chapter 10 uses project mode.

**6. Generics.** Leg: the rail yard moves every kind of cargo with the same coupling; write it once for any cargo. Badge: Coupling Pin. This is where `Promise<T>` is first taught. New terms: type parameter, generic function, generic interface, generic constraint (`extends`), default type argument, `Promise<T>`, `async` return type.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | One coupling, any cargo | A generic `<T>` function that returns what it is given | A string and a number call each infer their own result type |
| 2 | Pair them up | A generic interface with two type parameters | A matching value passes; a mismatch reports TS2322 |
| 3 | Only things with a number | A constraint `T extends { wagon: number }` | A call with a wrong shape reports TS2345 |
| 4 | A default cargo | A default type argument | A use with no argument compiles to the default |
| 5 | A promise of cargo | A `Promise<string>` created and used with `then` | No diagnostics, and a wrong `then` callback type reports TS2345 |
| 6 | Async needs a promise | An `async` function whose return annotation is not a `Promise` | TS1064 reported, then fixed with `Promise<number>` |

**7. Classes and access modifiers.** Leg: each wagon is a class with parts the crew may and may not touch. Badge: Brakeman's Padlock. Uses the compiler's own emit for parameter properties and enums, which `transpileModule` supports. New terms: `class` field types, `private`, `protected`, `public`, `readonly` field, parameter property, `abstract`, `instanceof` narrowing, `implements`.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Typed fields | A class with typed fields and a constructor | TS2564 reported when a field is never set, then fixed |
| 2 | Hands off | A `private` field read from outside | TS2341 reported |
| 3 | Family only | A `protected` member used from a subclass and from outside | TS2445 reported for the outside use only |
| 4 | Shortcut | Parameter properties in a constructor | The class compiles with no field declarations written out |
| 5 | Blueprint only | An `abstract` class and `new` on it | TS2511 reported; a subclass missing the abstract method reports TS2515 |
| 6 | Whose wagon is it | `instanceof` to narrow a union of two classes; `implements` an interface | No diagnostics in each branch |

**8. Literal types and enums.** Leg: the destination board shows only towns on the route. Badge: Destination Dial. It does not repeat chapter 2's literal unions: the chapter 2 union is a few string literals typed by hand, and chapter 8 is about building the allowed values once. New terms: `as const`, `readonly` literal object, `enum`, string enum, enum member type, `satisfies`.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Freeze the board | An object with `as const` and a write to one of its fields | TS2540 reported |
| 2 | Numbered stops | A numeric `enum` and a wrong member | TS2339 reported |
| 3 | Named stops | A string `enum` assigned from a plain string | TS2322 reported |
| 4 | What it becomes | The same enum compiled, with the emitted JavaScript read in the panel | The mission checks the emitted object has the members |
| 5 | Check without widening | `satisfies` on a lookup table | No diagnostics, and a key typo reports TS1360 |
| 6 | Enum or constants | One table written both ways | Both forms compile and the mission asks which is erased from the output |

**9. Utility types.** Leg: the yard keeps ready-made forms for every kind of booking change. Badge: Toolbelt Roll. They are used as ready-made tools; chapters 12 and 13 rebuild some. `Pick` and `Omit` take literal keys here, so they need no `keyof`. New terms: `Partial`, `Required`, `Readonly`, `Record`, `Pick`, `Omit`.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Change only some | `Partial` of a booking card for an update | An update with one field passes; the original type rejects it |
| 2 | Nothing optional | `Required` of a card with optional fields | A missing field reports TS2741 |
| 3 | Lock the card | `Readonly` of a card and a write to it | TS2540 reported |
| 4 | One entry per wagon | `Record` of wagon names to a type | A missing wagon reports TS2741 |
| 5 | Just the name and wagon | `Pick` with literal keys | A value with extra fields reports TS2353 |
| 6 | Everything but the price | `Omit` with literal keys | The omitted property is rejected, with TS2353 |

**10. Modules.** Leg: the crew splits the tour book across files, one per wagon. Badge: Manifest Folder. Project mode: several `.ts` files, run through the virtual Node's CommonJS (PR 13's project checker, and the virtual Node's `require`). New terms: `export`, `import`, default export, `import type`, `export type`, relative import path.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Share a type | An exported interface in one file, imported in another | The second file compiles with no TS2304 |
| 2 | Share a value | An exported function used from another file | The program prints the expected line |
| 3 | The wrong name | An import of a name that is not exported | TS2305 reported |
| 4 | Just the shape | `import type` for an interface | No diagnostics, and the emitted JavaScript has no `require` for it |
| 5 | A missing file | An import path that does not exist | TS2307 reported on one run |
| 6 | Run the tour | Three files run together (press Run on `main.ts`; the terminal is hidden here) | The output matches the expected text |

### Advanced: signal tower (chapters 11 to 14)

Mission XP 20. REPL.

**11. `keyof` and indexed access.** Leg: the signal tower names every lamp; learn to ask a type for its own keys. Badge: Lookup Lens. New terms: `keyof`, `typeof` in a type position, indexed access `T[K]`, `T[number]` on an array type, key constraint `K extends keyof T`.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Ask for the keys | `keyof` of an interface | A key outside the union reports TS2322 |
| 2 | The type of a value | `typeof` in a type for a constant object | A value that leaves out a key of the aliased type reports TS2741 |
| 3 | Look one up | `T[K]` for a named key | A wrong key reports TS2339 |
| 4 | A safe getter | A generic `get<T, K extends keyof T>` | A call with a bad key reports TS2345 |
| 5 | Every value type | `T[keyof T]` | A value of a member type compiles and one of another type reports TS2322 |
| 6 | Index with a number | `T[number]` on an array type | An item that is not the element type reports TS2322 |

**12. Mapped types.** Leg: stencil plates stamp the same change onto every lamp. Badge: Stencil Plate. Rebuilds `Partial` and `Readonly`. New terms: mapped type `[K in keyof T]`, `?` and `readonly` modifiers, `-?` and `-readonly`, a mapped type that changes each value type. Key remapping with `as` waits for chapter 13, because filtering keys needs a conditional type.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Stamp every lamp | A mapped type over an interface | A value of the mapped type needs every key: a missing one reports TS2741 |
| 2 | Rebuild `Partial` | `[K in keyof T]?: T[K]` | A short value passes and a wrong type for a key reports TS2322 (the learner's alias is `Loose`, because redeclaring `Partial` is TS2300) |
| 3 | Rebuild `Readonly` | A `readonly` modifier in a mapped type | A write reports TS2540 |
| 4 | Take the lock off | `-readonly` and `-?` | The write passes, and a value that leaves out a key that is needed again reports TS2741 |
| 5 | Wrap every value | `[K in keyof T]: T[K][]` | Each property is an array of the original type, and a plain value reports TS2322 |
| 6 | Maybe nothing | `[K in keyof T]: T[K] \| null` | A `null` value passes for every key; a number for a string key reports TS2322 |

**13. Conditional types.** Leg: the points lever sends each wagon down one track or the other depending on what it carries. Badge: Points Lever. Rebuilds `ReturnType`, and is where `Awaited` is taught. New terms: conditional type `T extends U ? X : Y`, `infer`, distribution over a union, `ReturnType`, `Exclude`, `NonNullable`, `Awaited`, key remapping with `as` in a mapped type.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Pick a track | A conditional type with two outcomes | Each test type resolves to the expected track, and the wrong track reports TS2322 |
| 2 | One per member | A conditional type applied to a union | The union distributes: a list of both kinds reports TS2322 |
| 3 | Pull out the cargo | `infer` to unwrap an array element | A value that is not the element type reports TS2322 |
| 4 | Rebuild `ReturnType` | `infer R` in a function type | It matches the return type of a test function, and a wrong value reports TS2322 (the learner's alias is `Ret`; redeclaring `ReturnType` is TS2300) |
| 5 | Drop what you do not want | `Exclude` and `NonNullable` | A dropped member reports TS2322, once for each filter (two diagnostics) |
| 6 | Unwrap a promise | A type that peels `Promise<T>` with `infer`, then `Awaited` | It gives the same type as `Awaited` for a nested promise, and a wrong value reports TS2322 |
| 7 | Pick by value type | A mapped type whose `as` clause drops keys of one type (`T[K] extends X ? K : never`) | The result keeps only the matching keys: a dropped key reports TS2322 |

**14. Template literal types.** Leg: the code wheel makes every telegram address from a town and a wagon. Badge: Code Wheel. Its Suggested-first link is Named boxes (2), which teaches template strings, as the [Suggested first](#suggested-first) section explains. New terms: template literal type, `Uppercase`, `Lowercase`, `Capitalize`, `Uncapitalize`, typed event names.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Build an address | A template literal type from two unions | The expected combinations compile and a wrong one reports TS2322 |
| 2 | Shout it | `Uppercase` and `Capitalize` on a literal type | A lowercase literal where capitals belong reports TS2820, a near miss that carries a "did you mean" |
| 3 | Event names | A type of `on${Capitalize<...>}` handler names | A name that is not in the table reports TS2353 (a close misspelling such as `onClse` reports TS2561 instead) |
| 4 | Pull a piece out | `infer` inside a template to read a prefix | The part after the dash is refused: TS2322 |
| 5 | Typed event table | `type Handlers<E extends string> = { [K in E as …]: … }`, a mapped type over a union of event names whose `as` clause builds the handler keys | The new key names exist, and every key needs its own handler: a missing one reports TS2741 |
| 6 | Strict spelling | A function that only takes generated names | A bad name reports TS2345 |

### TypeScript with Node: engine wagon (chapters 15 to 18)

Mission XP 25. Project mode with files and a terminal. The terminal in these chapters runs `tsc` and `node` over `.ts` files (PR 16).

**15. `tsconfig` and strict mode.** Leg: the engine wagon has a control panel of switches; learn what each one catches. Badge: Engine Gauge. New terms: `tsconfig.json`, `compilerOptions`, `strict`, `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals`, `tsc`.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Read the panel | A `tsconfig.json` with `strict` on, then `tsc` | The terminal prints the expected diagnostics for a sample file |
| 2 | No guessing | `noImplicitAny` off, then on | TS7006 appears only when it is on |
| 3 | No surprise nothing | `strictNullChecks` off, then on | TS18048 appears only when it is on |
| 4 | Index with care | `noUncheckedIndexedAccess` on | An array read is typed `T \| undefined` and TS18048 follows |
| 5 | Every path returns | `noImplicitReturns` on | TS7030 reported |
| 6 | No dead parts | `noUnusedLocals` on | TS6133 reported |

**16. Typing `fs` and `http`.** Leg: telegrams come in from the world as plain text; check them before the tour trusts them. Badge: Telegraph Key. Uses the mini typings for `fs`, `path` and `http` that PR 16 supplies. New terms: `fs.readFileSync` result type, `fs.promises` returning `Promise<T>`, `JSON.parse` result, type guard on `unknown` data, request and response types, typed handler.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Read a file | A typed read of a timetable file | The program prints the file's text and `tsc` is clean |
| 2 | Trust nothing | `JSON.parse` result held as `unknown` and used without a check | TS18046 reported |
| 3 | Check the telegram | A type guard that validates parsed data | The program accepts good data and rejects bad data with a clear message |
| 4 | Read without waiting | `fs.promises.readFile` in an `async` function | The program prints the text and `tsc` is clean |
| 5 | Typed handler | An `http.createServer` handler with typed request and response | `curl` in the terminal gets the expected reply |
| 6 | Wrong status | A handler returning the wrong type | TS2345 reported, then fixed |

**17. `node:test`.** Leg: the inspector checks every wagon before the train leaves. Badge: Inspector's Clipboard. New terms: `node:test`, `test`, `describe`, `assert`, `assert.equal`, `assert.deepEqual`, `assert.rejects`, `assert.throws`, async test, `node --test`.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | First check | A `test` that passes, run with `node --test` | The terminal prints the pass summary |
| 2 | A failing check | A test that fails on purpose, then fixed | The failure message shows, then a pass |
| 3 | Group them | `describe` around two tests | The output groups both under the name |
| 4 | Compare shapes | `assert.deepEqual` on two objects | A real difference fails with the difference shown |
| 5 | Test a promise | An async test using an `async` function | The test awaits and passes; forgetting `await` fails |
| 6 | Test the error | `assert.rejects` or `assert.throws` | The thrown error is matched |

**18. Final project: a typed CLI.** Leg: the tour's last job is `tour`, a command that reads a timetable and refuses to book a wagon twice. It finishes the Golden Timetable. Badge: Golden Timetable. New terms: `process.argv`, subcommand, exit code, `process.exitCode`, `process.stderr`, project layout with `src` and `test`.

| # | Mission | You write | Passes when |
|---|---|---|---|
| 1 | Read the command | Parse `process.argv` into a typed command union | `tsc` is clean and each sample command parses |
| 2 | Load the book | Read and validate a timetable file | Bad files give an error message and a non-zero exit code |
| 3 | Typed model | `Timetable`, `Booking` and `Wagon` types | A booking without a wagon reports TS2741 |
| 4 | No double booking | A check that two bookings never share a wagon and slot | The smudged timetable from chapter 1 is rejected with the clashing names |
| 5 | The commands | `list` and `add` subcommands | The terminal output matches for each |
| 6 | Exit codes | Success is 0 and a clash is 1, set through `process.exitCode` | A check of the exit code shows the right one (reading the code with `echo $?` in the virtual terminal is unverified until PR 16; the check may read `process.exitCode` from the run instead) |
| 7 | Test it | A `node:test` file covering a clash and a clean timetable | `node --test` passes |
| 8 | Golden Timetable | A run of `tour` over the full tour book | The output lists every wagon once and the clean exit code is 0 |

## Tier XP and ranks

- **Mission XP:** Beginner 10, Intermediate 15, Advanced 20, TypeScript with Node 25 (the guideline's fourth slot, `docs/tiers-guideline.md:7`).
- **Badge XP:** `badgeXp` is 25 for all four tiers, the default in `shared/tiers.js:4`. There are no old saves, so no tier sets 0.
- **Ranks (signed off).** The base ladder, which stays below the Beginner end, is Stowaway 0, Ticket Clerk 50, Wagon Hand 130, Signalman 240 and Rail Engineer 360. The tier-end ranks are "Chief Engineer" for Intermediate, "Tour Architect" for Advanced and "Timetable Master" for TypeScript with Node, which is the top rank. The shape follows Shell's (`docs/tiers-guideline.md:19-20`) and Script's setup (`programming/script-quest/tiers.js:4-9`).
- **Thresholds.** The tier-end thresholds are derived by `Tiers.create` (`shared/tiers.js:46-53`) and never typed. The figures below are estimates, to be fixed when the chapters exist. The base thresholds may be adjusted to fit the final counts, but they stay below the Beginner end and the names do not change.

| Tier | Chapters | Missions (estimate) | XP per mission | Badges | Cumulative XP at tier end (estimate) |
|---|---|---|---|---|---|
| Beginner | 5 | 33 | 10 | 5 × 25 | 455 |
| Intermediate | 5 | 30 | 15 | 5 × 25 | 1030 (measured, pinned in `tests/typescript/tiers.test.mjs`) |
| Advanced | 4 | 25 (6, 6, 7, 6) | 20 | 4 × 25 | 1630 (measured, pinned in `tests/typescript/tiers.test.mjs`) |
| TypeScript with Node | 4 | 26 (6, 6, 6, 8) | 25 | 4 × 25 | 2380 (measured, pinned in `tests/typescript/tiers.test.mjs`) |

- **Save.** Key `typescript-quest-v1`, folder `programming/typescript-quest/`, commit scope `typescript` (`commitlint.config.mjs:5`), tests in `tests/typescript/`. The catalog entry uses `sep: '.'`, so done-keys are `<chapter>.<mission>`.

## Suggested first

Each chapter has a soft "Suggested first" line under its title (D9) that names Script Quest chapters. Numbers are rail numbers in Script Quest, read from the chapter order in `programming/script-quest/index.html:90-103`. Note that `FIRST` in `tests/script/teach.test.mjs:13-111` uses 0-based chapter indexes, not rail numbers.

Re-check of every link against the real chapter names on the base. All 17 rows name a real chapter with the right rail number, except two that were corrected (rows 6 and 14, both signed off):

| TS chapter | Suggested first | Result |
|---|---|---|
| 1 | TypeScript (11), Named boxes (2) | Correct |
| 2 | True or false (3), Decisions (4) | Correct |
| 3, 11 | Objects (8) | Correct |
| 4 | Functions (7) | Correct |
| 5 | Lists (6), Array superpowers (9) | Correct; mission 4 reads the tuple's slots by index, so no destructuring is needed |
| 6 | Functions (7), Array superpowers (9), ~~none~~ **Time travel (10)** | Corrected: missions 5 and 6 use `Promise<string>`, `then` and `async`, which Time travel (10) teaches |
| 7 | Classes (15) | Correct; an Intermediate chapter |
| 8 | Objects (8), True or false (3) | Correct |
| 9 | Destructuring and spread (14), Objects (8) | Correct; the first is Intermediate, the second Beginner |
| 10 | Modules (17), Node.js (12) | Correct; Modules (17) teaches ESM as reading only, which matches TypeScript `import` and `export` |
| 12 | Array superpowers (9) | Correct |
| 13 | Decisions (4) | Correct; the ternary `? :` is taught at `programming/script-quest/content/ch-javascript-basics.js:127` |
| 14 | ~~Say hello (1)~~ **Named boxes (2)** | Corrected: template strings are taught in Named boxes, in "Fill in the blanks" (`programming/script-quest/content/ch-javascript-basics.js:68`). Say hello does not teach them |
| 15 | Node.js (12) | Correct |
| 16 | Async fs and path (21), A small HTTP server (23) | Correct; both are Intermediate |
| 17 | Errors and try/catch (16), Node.js (12) | Correct; the first is Intermediate |
| 18 | Node.js (12), Async fs and path (21) | Correct; the second is Intermediate |

The approved design said that chapters 6, 7, 9, 14, 17 and 18 point at Script Intermediate chapters that do not exist yet. That sentence was wrong twice over: those chapters now exist (Script has 23), and rows 6 and 14 point at Beginner chapters. The rows that point at Intermediate chapters are 7, 9, 10, 16, 17 and 18, and all of those chapters exist and read as the design intends.

**Chapters 6 and 14 are changes to the approved design** (chapter 6 gains a Script chapter, Time travel (10); Say hello (1) becomes Named boxes (2) for chapter 14). Both corrections are signed off (the chapter 14 one by the user in PR #249); the design table itself stays as approved.

## Engine plan

What each chapter needs, and which PR supplies it ("ok" means the base already supports it):

| Chapters | Need | Supplied by |
|---|---|---|
| 1 to 5 | REPL `ts`, unions, narrowing, arrays, tuples, `unknown` | ok (`check` as is; every answer's outcome is unchanged by the lib growth). `Object.keys`, `Object.values`, `Object.entries`, `Map`, `Set` and `Date` are in `TS_LIB` since PR 13, but there are no iterators, so `for...of` over them reports TS2488 |
| 6, 9, 12, 13 | Generics, utility and mapped types, `infer`, `Promise<T>` | ok: `Extract`, `NonNullable`, `Parameters` and `InstanceType` are in `TS_LIB` since PR 13. `Promise<T>` is first taught in chapter 6 |
| 7, 8 | `abstract`, parameter properties, enums, `satisfies` | ok (`transpileModule` emits them) |
| 10 | Several files, `import` and `export` | `TSCheck.checkProject` (PR 13): `import` between files, diagnostics per file, and emitted CommonJS that runs in the Node env. The editor panel was built in PR 14 (`project.js` and the `app.js` project branch); a run is one `checkProject`, then `main.js` through the virtual Node until the scheduler is done |
| 11 | `keyof`, `typeof`, `T[K]` | ok |
| 14 | `Uppercase`, `Lowercase`, `Capitalize`, `Uncapitalize` | ok: four `type X<S extends string> = intrinsic` lines in `TS_LIB` (PR 15's spike passed: the hand lib and the real `lib.es2020.d.ts` give the same codes, `tests/typescript/lib.test.mjs`) |
| 15 | `tsconfig` strict flags | `checkProject` (PR 13) reads `tsconfig.json` with `ts.parseJsonConfigFileContent`; `noLib`, `types`, `typeRoots`, `lib` and `noEmit` are forced |
| 16 | Typed `fs` and `http` | PR 16's mini typings; `http.get` is #246 |
| 17 | `node:test`, `assert`, `node --test` | PR 16 |
| 18 | Typed CLI, `process.argv`, files in folders, exit codes | PR 16, plus #247 for `cd` and `rm -r` |

What the two engine PRs add:

- **PR 13, `feat(engine): multi-file TypeScript projects with tsconfig and a larger lib`.** `TSCheck.checkProject(files)` (several files, `import` between them, a `tsconfig.json` read through `ts.parseJsonConfigFileContent`, diagnostics per file, emitted CommonJS), a grown `TS_LIB` (`Extract`, `NonNullable`, `Parameters`, `InstanceType`, `Object.keys`/`values`/`entries`, `Map`, `Set`, `Date`), and the REPL loop guard. It measured the real `lib.d.ts` first; the measured numbers and the verdict are under [Lib measurement](#lib-measurement), and D2 stands. The project panel is built in PR 14 with chapter 10, as a thin copy in TypeScript Quest.
- **PR 16, `feat(engine): TypeScript in the virtual terminal, node:test and typings for Node`.** `.ts` files accepted in the terminal, a `tsc` that really checks, `node file.ts` by transpiling, `node --test`, mini typings for `fs`, `path`, `http`, `events`, `node:test` and `assert`, and more of `process` (`stderr`, and `stdin` if the CLI needs it). The terminal interpreter moves to `shared/`, and `app.js` rebinds `runShell`. The part was sized well above L, so it is split in two (plan count 19): **16a, `feat(engine): node:test, assert and typings for Node in the virtual Node`** (engine only, no page loads the new files yet) and **16b, `feat(engine): TypeScript in the virtual terminal`** (`shared/terminal.js`, the page wiring, the `terminal` chapter flag, `tsc` and `node file.ts` in the terminal).
  - **16a decision 5, a separate typings layer.** `shared/nodetypes.js` (9,073 bytes raw, limit 12 KB) exposes `NodeTypes.modules` (`fs` with sync, callback and `promises` forms, `path`, `http`, `events`, `node:test`, `assert`, `assert/strict`, each also under its `node:` name, and the globals `process`, timers, `__dirname`, `__filename`) and `NodeTypes.iterators` (`Symbol.iterator`, `Iterable`, `IterableIterator`, and `entries`/`keys`/`values` on `Array`, `Map`, `Set`, for `for...of`). `checkProject(files, {node:true})` adds both as hidden roots under `/.lib/` and defaults `esModuleInterop` on; the check follows a tsconfig's `module`, the emit stays CommonJS. A second argument also adds `emit` (false when the tsconfig sets `noEmit`) to the result; with no second argument the result is what it was, and `TS_LIB` is unchanged. Divergences from `@types/node`: timer ids are numbers like `setTimeout`'s, `process.exitCode` is `number | undefined`, `fs` reads return `string`, `test`, `it` and `describe` return `void` (the virtual ones return nothing to await, where `@types/node` says `Promise<void>`), no `http.get`/`http.request` (#246). `tests/typescript/node-typings.test.mjs` compiles `modules` with no diagnostic filtered under the real `lib.es2020.d.ts` and `modules` plus `iterators` under the hand lib, and pins the codes for chapter 16 to 18 style snippets (TS2345, TS2339 for `http.get`, TS18046 for `unknown`). Measured on a 3-file project, warm median: 6.3 ms without and 10.3 ms with `{node:true}` (about +4 ms; limit +30 ms), Node v24.13.0, linux x64.
  - **16a decision 6, test output.** `node:test` prints Node's spec reporter with virtual-clock durations and the `ℹ` summary; the output is compared with real `node` after normalising durations, and also stripping stack frames, the `{ generatedMessage, code, actual, expected, operator }` property block that real Node prints under a failing assertion, and the `:line:col` after `test at <file>`. The virtual run prints none of those three (a recorded gap: it has no source positions), so the comparison covers every other line. Measured with Node v24.13.0 and `NODE_TEST_CONTEXT` removed from the child's environment: `--test-reporter=spec` prints spec lines for both `node a.test.js` and `node --test a.test.js`, and the two print the same text. Real `node` prints every `console.log` from tests before the spec lines, and so does the virtual run. A test whose promise never settles fails in the virtual run when the loop goes idle; real `node` hangs on it, so this corner is deliberately not matched. A 10-test file with one 50 ms virtual timer runs in 6 ms wall.
  - **16a decision 7, `assert`.** Messages, `code`, `operator`, `actual`, `expected` and `generatedMessage` equal real Node's for primitives and one-line cases over 40 cases; multi-line diffs are pinned by header and `+`/`-` line shape. `assert.ok` quotes `assert.ok(<value>)`, not the source text of the call. A value that refers to itself prints as `<ref *1> { … [Circular *1] }`; every cycle is numbered `*1`, where Node numbers each distinct one.
  - **16a decision 11 (the `NodeEnv` side) and 13.** `NodeEnv.make`'s `io` takes `builtins(api)` (extra modules; a key with its own `node:` prefix resolves only with it), `transform(key, src)` and `.ts` resolution after `.js` and `.json` only when `transform` is given, so a stale `.js` beside a `.ts` wins as in real Node. `process.stderr.write` reaches `io.out('raw', [text, 'stderr'])`, and a non-zero `process.exitCode` reaches `io.exit`. `require` looks up own properties only, so `constructor`, `toString`, `__proto__` and `hasOwnProperty` throw `MODULE_NOT_FOUND` on both pages.
  - **16b decisions 1 and 14, the terminal moves.** `shared/terminal.js` exposes `Terminal.create(deps)` (DOM-free; `{run, stop, procOn, reset, label, ports}`). Script's `app.js` calls it with `ts` off and keeps `runShell`, `stopProc`, `RUN` and the smoke-hook names; every command prints the bytes it printed before, except that a `process.stderr.write` line now prints with the `err` class. The TypeScript page passes `ts: true`. The compiler is `deps.compiler || window.ts`, the loader `deps.loadTS || TSCheck.load`, the engines `deps.TSCheck` and `deps.NodeTest`, and the Node env `deps.makeNodeEnv`, `deps.nodeCurl` and `deps.NODE_VERSION`, each falling back to the page's global (`window.NodeEnv` for the last three), so the TypeScript `app.js` never names `NodeEnv`. `run` returns a Promise only for `tsc`, `node x.ts` and `node --test` (the compiler may have to load); the page catches a rejection. A `.js` main that requires a `.ts` file before the compiler has loaded throws "The TypeScript compiler is not loaded yet. Run tsc once, then try again." Before a first load the terminal prints `Loading the TypeScript compiler…`.
  - **16b decisions 2 and 16, `RUN`.** With `ts` on, `RUN` is `{src, mode:'sh', t, cmd, args, ok, out, logs, diags, exitCode, tests, ran}` (`logs` is `out`; a node run also has `server`, a `curl` also `reqs`). `RUN.tests` is the `ℹ` summary or `null`. With `ts` off `RUN` is the old object. A terminal run is `mode:'sh'`, so the TypeScript page's `tryComplete` accepts it in a terminal chapter. `RUN.exitCode`: `process.exit(n)` gives `n`, `process.exitCode = n` gives `n`, an uncaught throw gives 1, `tsc` with a diagnostic gives 2, a failing test gives 1.
  - **16b decision 3, `node file.ts`.** The file goes through `ts.transpileModule` (CommonJS, ES2020, `esModuleInterop`) with no type check. Measured with real `node` v24.13.0 (no `NODE_TEST_CONTEXT`): an erasable-only `.ts` file gives the same output, a file with a type error gives the same output and exit 0, an enum is refused (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, exit 1) while the terminal runs it, by design. Divergence: real `node` resolves `import {b} from "./y"` in a `.ts` main as ESM and fails with `ERR_MODULE_NOT_FOUND`; the terminal resolves `./y` to `y.ts` (order: exact key, `.js`, `.json`, `.ts`). `tests/typescript/terminal.test.mjs` skips the real-`node` cases with a reason when the machine's `node` cannot run `.ts` by default. A thrown error has no source line numbers.
  - **16b decisions 9 and 17, `tsc`.** Measured with real `typescript` 5.9.3 (`--pretty false`). No argument and no tsconfig: `Version 5.9.3`, then `tsc: The TypeScript Compiler - Version 5.9.3` and a long help text, exit 1, nothing written (there is no TS5081); the terminal prints the version line and the first two help stanzas (about 400 bytes), a deliberate divergence to save bytes. `tsc a.ts` next to a tsconfig: no TS5112 in 5.9.3; the tsconfig is ignored and the file compiles with the default (non-strict) options. The terminal builds a synthetic tsconfig with `files` set to the named files, so it follows imports and never writes over the real one. Exit status is 0 when clean and 2 for any diagnostic (never 1), with or without `noEmit`; real `tsc` still emits `.js` despite errors unless `noEmit` is set, and so does the terminal (through `store.write`; `outDir` is ignored). Diagnostics print as `file(line,col): error TSnnnn: message`; success is silent. A missing named file prints `error TS6053: File 'x.ts' not found.` plus two indented lines, exit 2. Divergences: compiler flags (`--noEmit`, `--strict`) are ignored; a position-less diagnostic that comes from a tsconfig (TS18003, TS5xxx) prints with position `(1,1)`, because `checkProject` cannot tell it from one at line 1; `tsc` inside an `npm` script is still "not available". The real-`tsc` differential covers TS2322, TS2345, TS2339, TS2307, TS7006, TS2304, TS1005, a clean file, an error in an imported file and `noEmit`.
  - **16b decisions 4 and 8, `node --test`.** `node --test` with no argument runs the files real Node 24 runs: `*.test.{js,ts}`, `*-test`, `*_test`, `test-*`, `test.*` and every `.js`/`.ts` under `test/`, in sorted path order, never `node_modules`. The terminal skips `.mjs` and `.cjs`. `node --test a b` runs each file in its own realm and prints each file's spec lines, one summed `ℹ` block (`duration_ms` a float), then `✖ failing tests:` and the failing sections. A file with no tests counts as one passing test, as in real Node. No test files gives an all-zero block, exit 0; a missing name prints `Could not find 'x'`, exit 1. Divergences: a failing section reads `test at a.test.js` (no `:line:col`) and carries no stack; PR 17's checks should read `RUN.tests` and `RUN.exitCode`. `npm` scripts that start with `node` go through the same handler, so `"test": "node --test"` works.
  - **16b decision 10 and 12, the page.** A chapter's `terminal: true` flag shows the prompt `~/my-app $ `, the input line, the key bar and the editor, with the `.short` console. Enter never continues a line, Tab completes file names, Ctrl+C stops a running process, and Run or Ctrl+Enter echo and run `node <file>` (`node --test <file>` for `*.test.ts`). Chapter switch, Reset files and Fresh console stop the run and kill the terminal's realm. New file takes `.ts`, `.json` and `.txt` names with folders and dotted base names, and still rejects `..` and empty segments. No chapter sets the flag until PR 17; chapter 10 is unchanged, and `projectRun` stays its runner (the parity cases are in `terminal.test.mjs`). `tests/typescript/terminal.browser.mjs` drives the page in Chromium.
  - **16b decision 18, stderr.** A `process.stderr.write` line prints with the `err` class on both pages and is recorded in `RUN.out`.
  - **16b size and timing.** Script page: `app.js` 43,289 B plus `terminal.js` against a base `app.js` of 53,674 B, at most +8 KB raw. TypeScript page: base `app.js` 38,093 B, at most +50 KB raw for `nodetest.js`, `nodetypes.js` and `terminal.js`. Timing, warm median of 21 runs on the 3-file project plus a tsconfig and one test file, Node v24.13.0, `typescript` 5.9.3, linux x64: `checkProject` alone 20.5 ms, the terminal's `tsc` 13.5 ms, `node main.ts` 1.3 ms, `node --test` 2.0 ms.

- **PR 17, the node tier (chapters 15 to 18, 26 missions).** Four chapters, each `tier:'node'`, `mode:'project'`, `terminal:true`, with 6, 6, 6 and 8 missions and 25 XP a mission.
  - **17-1, `RUN.files`.** A `ts` run carries `files`, a copy of the map at command start, so a check reads the learner's sources and tsconfig and never the files `tsc` emits. `RUN.ran` (the started program's `{file, code}`) is read by chapter 16 mission 5, so a server started untyped and edited afterwards does not pass.
  - **17-2, the check shape.** A terminal check reads only `src, cmd, args, ok, out, diags, exitCode, tests, files, ran`, pins `cmd` (and `args` for `node` and `curl`), and reads one run, the last command. `tests/typescript/node-chapters.test.mjs` plays every mission through the terminal harness: reference, starter, near-miss, emptied `.ts` files, every other mission's answer, and a battery of single commands.
  - **17-3, Run on `tsconfig.json`.** Only the exact file name runs `tsc`; every other file keeps the 16b rule.
  - **17-4, "then fixed".** A mission whose spec says "fails, then fixed" (chapter 16 mission 6, chapter 17 missions 2 and 4) passes on the run that shows the failure, and the `how` steps tell the learner to fix it.
  - **17-8, guide cards.** A node-tier card compiles as `main.ts` next to a strict `tsconfig.json` through `checkProject` with `{node:true}`.
  - **17-10, the harness models the page.** A pass holds on the final run and on the last `tryComplete` snapshot of the last command.
  - **17-11, chapter 18 and `ALLOWED`.** Chapter 18 is one CLI that grows, so a later answer meets an earlier check. The map lists each such pair with the feature that carries over (1 against 2 to 8, 2 against 3 to 8, 4 against 5 to 8, 5 against 6 to 8, 6 against 7 and 8, 7 against 8); mission 3 has none. An entry skips only the case "the later reference with the earlier commands", and the case with the later mission's own commands only when both missions run the same commands (4 and 6). No earlier answer ever meets a later check.
  - **17-12, `process.exitCode` in mission 2.** Chapter 18 mission 2 ("bad files give an error") uses the exit code from chapter 17 and sets `process.exitCode = 1` after a `console.error` message, because Node's own error block never reaches `RUN.out`. Mission 6 applies the same rule to `check`. `process.argv` and "subcommand" are first used in mission 1; "exit code" is first used in chapter 17 mission 2.
  - **17-13, the exit lands.** For a sync `node file.ts` run the last judgment fires while `RUN.exitCode` is still 0; a code set through `process.exitCode` arrives afterwards through the scheduler's `end`. The TypeScript terminal's `exit` hook judges again (guarded by `TS` and `!isSync()`, so Script is unchanged), and chapter 18 missions 2 and 6 complete with no extra input.
  - **Flat project layout (chapter 18).** The virtual `require` resolves a relative import against the project root, not the importing file's folder, so `./book` from `src/cli.ts` and `../src/book` from `test/` both fail while `tsc` accepts them. Chapter 18 keeps `cli.ts`, `book.ts` and `book.test.ts` side by side in the project folder, where both agree. This replaces the `src/` and `test/` folders the table above draws; no engine file is edited.

PR 15's spike passed: `intrinsic` works in the hand lib because `lib.d.ts` is passed to the compiler as the default lib name. `lib.test.mjs` runs each snippet under both libs and they agree: a wrong assignment is refused, the types distribute over a union, and ``on${Capitalize<…>}`` handler names work. A literal that is a near miss of a member is refused with TS2820 ("did you mean") instead of TS2322 where the compiler finds a close spelling (`"a"` for `"A"`, `"onclick"` for `"onClick"`), so chapter 14 measures and pins each code. Redeclaring a lib name (`type Partial<T> = …`) is TS2300 in both, and `Awaited<Promise<Promise<string>>>` is `string` in both.

## Decisions

D1, D8 and D10 are defined in the Script spec and are linked, not copied: [D1](2026-11-16-script-quest-tiers-design.md#decisions) (engine in `shared/`), [D8](2026-11-16-script-quest-tiers-design.md#decisions) (scheduler) and [D10](2026-11-16-script-quest-tiers-design.md#decisions) (folder keys and `curl`). D2, D3, D4, D5 and D9 belong to the TypeScript half and are defined here. D14 is new.

| Id | Decision | Alternatives and why they lost |
|---|---|---|
| D2 | **Grow the hand-written TS lib** (`Map`, `Set`, `Date`, `Object.keys`/`values`/`entries`, `Extract`, `NonNullable`, `Parameters`, `InstanceType` in PR 13; `Uppercase` and the like in PR 15, as `intrinsic` aliases, spike passed). A test compiles every mission solution cleanly. PR 13 measured the real lib: the grown hand lib is 6.8 KB raw and checks in 1.13x the old lib's time, while the real `lib.es2020.d.ts` closure is 436 KB raw in 46 files and 9.3x slower per check, so **D2 stands** ([Lib measurement](#lib-measurement)). | Real lib from the CDN: 46 files and 31 KB brotli for ES2020 with no DOM (227 KB brotli with the DOM), and a warm check of about 80 ms against about 8 ms on the measuring machine. `@types/node` is too big for a phone, so Node typings stay hand-written either way. |
| D3 | **REPL for the type-level chapters, project mode with files and a terminal for modules and Node.** Chapters 1 to 9 and 11 to 14 use the REPL; chapters 10 and 15 to 18 use project mode. | One editor-first mode for everything: more scaffold work, and it throws away the REPL Script already has. |
| D4 | **Mini Node typings:** `fs` (including promises), `path`, `http`, `events`, `node:test`, `assert` and `process`. | Full `@types/node`: too large. None: chapters 16 and 17 cannot be taught. |
| D5 | **Keep Script chapter 11 unchanged**, add one pointer to TypeScript Quest on its completion screen (PR 11), and start TypeScript chapter 1 from what Script chapter 11 does not cover. | No pointer: learners miss the next step. Repeat chapter 11: wasted time. |
| D9 | **Static "Suggested first" link** naming the chapter. | A `?c=` deep link: changes which chapter Script's saved state opens. Reading Script's save for "x/y done" like `shared/trophies.js`: nicer, a follow-up. |
| D14 (signed off) | **Badges are derived from `done` at render time**, as Script's `tierView` does (`programming/script-quest/tiers.js:16-19`). The save has no new stored field, and the badge XP is paid once when a chapter's last mission completes. | Stored `badges` and `ch` as Shell does: a new stored field to keep in step with `done`, and the `pristine` rule (`AGENTS.md:80`) needs to know about it. |

### Compiler in Node tests

Design D2 promises "a test compiles every mission solution cleanly". This was settled in PR 11: `typescript` is a dev dependency pinned to 5.9.3, the version the page loads (`shared/tscheck.js:6`), so the checks run under `npm run test:engine` with no network. A test (`tests/typescript/compiler.test.mjs`) keeps the pin in step with the CDN URL. The cost is a large install in CI and `npm ci`.

The alternative was to check only in the browser smoke test. It needs no dependency, but it is slow, depends on the CDN, and gives no per-mission Node test.

## Trophy Room

The user accepted these effects. The lines cited are in `shared/trophies.js`.

- **PR 6 (already merged)** appended Script chapters, so anyone who had finished all 93 original missions no longer has Script counted as complete until they finish the new chapters.
- **PR 11 adds TypeScript Quest to the catalog.** Everyone loses "Wanderer" (`:69`, start every playground) until they start TypeScript Quest. "Playground Master: Programming" (`:75`) and "Grand Master" (`:80`) then also need TypeScript Quest finished. "Finisher" (`:72`) is unchanged.

## Alternatives

Alternatives to each decision are in the [Decisions](#decisions) table and the lib options are in the [TLDR](#tldr). Two more were weighed:

| Option | Needs | Gives | Main limit |
|---|---|---|---|
| **A typed-chapters-only quest, 18 chapters (chosen)** | The shared engine and two new engine PRs | One path from first annotation to a tested CLI | Two engine PRs and four content PRs in the stack |
| Stop at 14 chapters, no TypeScript with Node tier | No terminal or Node typings work | Smaller and sooner | The final project and `node:test` are the point of the quest's treasure, so it would have no ending |
| Reuse Script chapter 11 and add only new chapters after it | Nothing | No overlap to manage | Chapter 11 has no `unknown`, narrowing or generics teaching, so the later chapters would need terms taught first |

## Risks

1. Mission counts, XP totals and thresholds are estimates. Script's own estimate was about 2200 XP and shipped as 2300 (`tests/script/tiers.test.mjs:112`).
2. The rank names, base thresholds, D14 and the chapter 6 and chapter 14 corrections are signed off.
3. The diagnostic codes in the chapter 1 to 14 outlines are measured against `typescript@5.9.3` and pinned in `tests/typescript/content.test.mjs`. Those of chapters 15 to 18 are still expected values, confirmed when each chapter is written.
4. `intrinsic` in a hand lib is verified (PR 15's spike passed: [Engine plan](#engine-plan)). Node's type-stripping behaviour is unverified until PR 16, and this spec does not assert it.
5. The virtual Node reports `v22.12.0` while the repo requires Node 24 (`package.json:8`). PR 16 decides whether to bump it before it teaches `node file.ts`.
6. The project panel UI may not separate from `app.js` cleanly. TypeScript Quest would then carry a thin copy (D1 in the Script spec).
7. The TypeScript compiler's first load from jsDelivr on a phone is unmeasured. PR 13 measured the lib alternatives in Node only; its phone figures are estimates (see [Lib measurement](#lib-measurement)).
8. The REPL block in `programming/script-quest/app.js` is larger than the formatter #229 names, so PR 11's description must decide the whole block (formatter, `execJS`, `execTS`, state and the memory panel).
9. This spec may drift from the tree: PRs 13 and 15 may revise it, and until then the mission counts and the engine table are as measured at the base of this branch.
10. A broken anchor in a Contents list is caught only by a reader; the repo has no doc link check.

## Test plan

Tests per PR. All are CI signals, as there is no backend.

- **Solvability and the compiler** (PR 11 onward): every mission answer passes its own check, and every solution compiles cleanly. How the compiler runs in Node is the open decision above.
- **Teach-before-use:** a test over `FIRST`-style entries for every new term, in the same shape as `tests/script/teach.test.mjs`.
- **Own-input checks:** a mission passes only on the learner's own action (`AGENTS.md:45`).
- **A tier test** that pins the chapter and mission counts and the derived ranks, like `tests/script/tiers.test.mjs`.
- **The catalog-count test** (`tests/trophy/catalog.test.mjs`) and the story outline check it already runs.
- **Project-checker and terminal tests in `vm`** (PRs 13 and 16), with differential checks against real `node` where output order matters.
- **The smoke hook, unedited,** and phone-width checks on every content PR.
- **A visible message and a retry** when the compiler fails to load, copying Script's message (`programming/script-quest/app.js:225`).

This spec's own change is docs only. CI ignores `docs/` (`tools/ci-plan.mjs:18`), so no quest tests run for it, and the evidence is a re-read of every cited line against the tree.

## Observability

There is no backend, so no dashboards, alerts or BI insights. The signals are the CI results above, the unedited smoke test, and the on-page message when the compiler fails to load. A running-process indicator in the Node chapters tells the learner when a program is still running.

## Performance

- PR 13 measured the real `lib.d.ts` against the grown lib in Node (see [Lib measurement](#lib-measurement)). No throttled-phone timing was taken.
- The first-load time of `typescript@5.9.3` from jsDelivr is unmeasured.
- The `createProgram` re-parse per run was measured in PR 13: parsing the grown lib is 12% of a warm REPL check, below the 25% line, so no lib cache was added.
- A scheduler-driven `node --test` run finishes well under a second.
- Quest page load is no more than 10% slower than the Script Quest baseline, the same limit the Script spec sets. PR 13 replaces the timing check, which is noisy, with byte limits: at most 12 KB more first-party JS on the Script page and 20 KB on the TypeScript page.

### Lib measurement

Measured in Node by a throwaway script (not in the repo). Machine: Intel Core i7-9700 at 3.0 GHz, 8 cores, Node v24.13.0, `typescript@5.9.3`. Each cell is one fresh process. Cold is the first program in the process, and warm is the median of 20 runs after 3 warm-ups. Run-to-run noise is about 10%: V0's warm REPL check read 7.2 ms in the first run (taken before the lib edit, with V2 at 84.5 ms and V3 at 477.7 ms) and 7.5 ms in the last.

- V0: the hand lib before PR 13.
- V1: the grown hand lib that PR 13 ships.
- V2: the real `lib.es2020.d.ts` closure with no DOM, plus a `console` shim.
- V3: the real default `lib.es2020.full.d.ts` closure, with the DOM.

| Variant | Files | Raw (B) | Gzip (B) | Brotli (B) | REPL cold (ms) | REPL warm (ms) | Project cold (ms) | Project warm (ms) | Lib parse alone (ms) |
|---|---|---|---|---|---|---|---|---|---|
| V0 | 1 | 5,013 | 1,434 | 1,274 | 77.7 | 7.5 | 80.6 | 7.6 | 0.61 |
| V1 | 1 | 6,807 | 1,909 | 1,716 | 82.7 | 8.5 | 87.5 | 9.9 | 1.01 |
| V2 | 46 | 435,844 | 46,354 | 31,144 | 292.0 | 79.1 | 319.1 | 81.2 | 20.49 |
| V3 | 51 | 2,353,858 | 316,604 | 226,971 | 838.8 | 498.8 | 826.3 | 489.9 | 95.94 |

The REPL scenario is `check` with 6 previous snippets. The project scenario is 3 files and a `tsconfig.json`. Both timings are `createProgram` plus diagnostics, with the lib parsed on every run, as `check` does.

Verdicts:

- **Size limit.** V1 is 6.8 KB raw, under the 16 KB limit.
- **Time limit.** V1's warm REPL check is 1.13x V0's (8.5 ms against 7.5 ms), under 1.5x.
- **Real-lib rule.** V2's warm REPL check is 9.3x V1's, over the 2x limit, so the rule does not trigger and **D2 stands**. V2's brotli size (31 KB) is under the 100 KB limit. V3 is 59x V1's warm check.
- **Re-parse cost.** Parsing the lib is 12% of V1's warm REPL check and 10% of its project check, under the 25% line, so no lib cache was added. V2 would sit at 26% and 25.2%, both above the 25% line.
- **Phone estimate (not measured).** On Lighthouse "Slow 4G" (1.6 Mbps, 150 ms round trip per file), V2 gzipped is 46 KB, about 0.23 s of transfer plus 46 round trips, about 7 s if the files load one after another and about 0.4 s if bundled into one. V3 is about 9 s and 1.7 s. With a x4 CPU factor on the Node time, a warm check is about 34 ms for V1, 316 ms for V2 and 2 s for V3. V1 adds no file: it is inside `tscheck.js`, 1.8 KB more raw and 0.5 KB more gzipped than V0.

## PR chain

All PRs target `feat/222-ts-quest`. Sizes are changed lines: S under 150, M up to 500, L up to 1000, XL above. The plan holds the stacking rules and the sync with `main`.

| PR | Title | Contains | Needs |
|---|---|---|---|
| 10 | `docs(typescript): add the TypeScript Quest spec and plan` | This spec and the plan | PRs 2 and 9 |
| 11 | `feat(typescript): scaffold TypeScript Quest with tiers and chapter 1` | Folder, save key, `story.js`, landing card, catalog entry, tiers, chapter 1, the `test:engine` glob with the first test | 2, 3, 5, 10 |
| 12 | `feat(typescript): Beginner chapters` | Chapters 2 to 5 in REPL mode | 11 |
| 13 | `feat(engine): multi-file TypeScript projects with tsconfig and a larger lib` | Project checker, tsconfig flags, grown lib | 4 |
| 14 | `feat(typescript): Intermediate chapters` | Chapters 6 to 10 | 12, 13 |
| 15 | `feat(typescript): Advanced chapters` | Chapters 11 to 14, after the `intrinsic` spike | 14 |
| 16 | `feat(engine): TypeScript in the virtual terminal, node:test and typings for Node` | `.ts` in the terminal, `tsc`, `node --test`, typings | 9, 13 |
| 17 | `feat(typescript): TypeScript with Node tier and final project` | Chapters 15 to 18 | 15, 16 |
| 18 | `feat(typescript): add TypeScript Quest and deepen Script Quest` | `feat/222-ts-quest` to `main` | all |

## Touchpoints

| Touchpoint | PR | Status |
|---|---|---|
| This spec and `docs/superpowers/plans/2026-11-16-typescript-quest-phase1.md` | 10 | new |
| `programming/typescript-quest/` (`index.html`, `app.js`, `style.css`, `story.js`, `tiers.js`, `content/` with `quickfire.js` and `guide.js`) | 11 | new |
| `shared/catalog.js`, landing card in `programming/index.html`, `tests/trophy/chapters.mjs`, `NAMES` in `tests/smoke.mjs` | 11 | updated |
| `package.json` (`test:engine` glob) and `tests/typescript/` | 11 | updated, new |
| `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, and a pointer on Script chapter 11's completion screen | 11 | updated |
| `programming/typescript-quest/content/` chapter files, plus each chapter's quick-fire and Field guide entries in `quickfire.js` and `guide.js` (with the tier filter) | 12, 14, 15, 17 | new, updated |
| `shared/tscheck.js` (project mode, tsconfig, larger lib) | 13 | updated |
| `shared/tscheck.js` (four `intrinsic` case-changing types), `lib.test.mjs`, the Field guide tier filter in `guide.js` and `app.js` `renderGuide`, `shared/catalog.js`, the hub card in `programming/index.html`, `index.html` chapter tags, `README.md` and this spec's measured codes | 15 | updated |
| `programming/typescript-quest/project.js`, the project panel in `app.js` and `index.html` (with `shared/nodeenv.js` loaded), `tests/typescript/project-harness.mjs` and `project-mode.test.mjs` | 14 | new, updated |
| `shared/nodeenv.js`, the terminal interpreter, typings for Node | 16 | updated, moved |
| `shared/trophies.js` | none | unchanged; effects come from the catalog |
