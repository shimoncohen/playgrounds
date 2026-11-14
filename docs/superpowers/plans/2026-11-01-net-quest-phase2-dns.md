# Network Quest Phase 2 (DNS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Network Quest phase 2: UDP and DNS packet layers, a DNS model, the commands `dig`, `sleep`, `resolvectl` and `rndc`, and two chapters (18 missions) that teach names, resolvers and caches.

**Architecture:** Same as phase 1: plain browser scripts on the shared `NQ` namespace, loaded in order from `net-quest/index.html`. New engine files `engine/dns.js` (after `sim.js`) and `engine/cmds-dns.js` (after `cmds-net.js`); new content files `content/ch-6-dns-basics.js` and `content/ch-7-resolution.js` (before `extras.js`). `sim.js` gets four small seams (UDP listen, UDP expect, session `ext` with idle hooks, `NQ.sim.kit`). Node tests load the engine and content through `tests/net/harness.mjs`.

**Tech Stack:** Plain JS, Node `node:test` + `vm`, Playwright (existing smoke tests). No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-01-net-quest-dns-design.md`

Line numbers cited below are as of `cd80fac`. Several files (`app.js`, `ui.js`, `cmds-ip.js`, most test bodies) were read only by search, so re-check every cited line in the PR that touches it.

## Global Constraints

- No new dependency, no build step, no framework. Pages work opened from disk and on GitHub Pages.
- The engine stays DOM-free and deterministic: no `Math.random`, no `Date.now`. Ids, ports and query times are derived from hashes and counts.
- The progress key `net-quest-v1` and mission keys `0.x` to `4.x` are unchanged.
- Never touch `tests/fixtures/`. Do not weaken, skip or delete a test.
- Keys `5.x` and `6.x` are append-only once shipped.
- Rebase phase 2 PR C and PR D on #41 if it lands first (both touch `tests/smoke.mjs` and the README).
- An inlined file never contains `</script` or `</style`.
- Learner text follows AGENTS.md rules 9 to 12 and the `mission-voice` skill: the whole line first, then the parts; code in `<code>`; teach before use.
- The new commands' `help` text avoids DNS terms.
- Commit scope is `net`. Never bump the version or edit `CHANGELOG.md`. Keep the attribution trailer your tooling adds.

## Review Focus

1. **Step budget.** A cold resolution is estimated at 45 to 70 steps; the test asserts under 150 and records the measured number; `STEP_LIMIT` stays 500. Task B4.
2. **Replay determinism and TTL.** Same commands, same output; TTL counts on `dns.now`; setup keeps the clock and cache. Tasks B4 and D1-D2.
3. **`AVAIL` gating changing `help` and `suggest`.** `dig` never appears in chapters 1 to 5; `dog` does not suggest it. Task B5.
4. **Chapters 1 to 5 byte-identical packets** (ICMP, ARP, IPv4) and unchanged device lists. Tasks B1 and B3.
5. **Teach-before-use.** Every term has an earlier teaching mission. Tasks C3 and D3.
6. **No computed answer in card text** (`content.test.mjs:57`); the word `0` is absent from the card text of 5.7 and 6.4. Tasks C1-C2 and D1-D2.
7. **390px layout of the 7-device scenario.** Played at 1280 and 390. Tasks C5 and D5.

---

## PR split

Phase 2 uses its own letters; the phase 1 plan also had a PR A and a PR B.

- **Phase 2 PR A** (done by this plan's commit): the spec, this plan, two pointer lines in the phase 1 spec. Docs only.
- **Phase 2 PR B**: Tasks B0 to B8 (engine, commands, scenarios, gating, inspector; no chapter).
- **Phase 2 PR C**: Tasks C1 to C5 (chapter 6, keys `5.0` to `5.8`, interim ranks).
- **Phase 2 PR D**: Tasks D1 to D6 (chapter 7, keys `6.0` to `6.8`, final ranks, docs wiring).

Each PR branches from the latest `main` and ends with the `pre-pr-check` skill. PRs C and D start after PR B has merged (they need `dig` and the scenarios), and PR D starts after PR C has merged.

### Task B0: Wire the new files

**Files:**
- Modify: `net-quest/index.html` (script order), `tests/net/harness.mjs` (`FILES`)
- Create: `net-quest/engine/dns.js`, `net-quest/engine/cmds-dns.js` (empty shells)

- [ ] **Step 1: Write a failing test.** In `tests/net/dns.test.mjs`, `test('dns.js and cmds-dns.js load')` asserts `typeof NQ.dns === 'object'` and `typeof NQ.dnsCmds === 'object'`.
- [ ] **Step 2:** Run `node --test tests/net/dns.test.mjs`. Expected: FAIL (`NQ.dns` undefined).
- [ ] **Step 3:** Add `dns.js` after `sim.js` and `cmds-dns.js` after `cmds-net.js` in both `net-quest/index.html` and `harness.mjs` `FILES`. The two lists keep the same order. Each shell defines its namespace object only.
- [ ] **Step 4:** Run the test. Expected: PASS. Run `npm run check`. Expected: green.
- [ ] **Step 5: Commit** `feat(net): wire DNS engine files`.

### Task B1: UDP and DNS packet layers (`engine/packets.js`)

**Files:**
- Modify: `net-quest/engine/packets.js`, `tests/net/packets.test.mjs`

**Interfaces:**
- Produces: `NQ.pkt.udp(sport, dport)`, `NQ.pkt.dns(fields)`, `PROTO.UDP = 17`, `ENC.UDP`, `ENC.DNS`. The `ENC` interface `(fields, body)` is unchanged.

- [ ] **Step 1: Write failing tests** in `packets.test.mjs`:
  - `udp hex`: a UDP layer over a 12-byte body has length bytes `00 14` (8 header + 12), and checksum bytes `00 00`.
  - `ipv4 protocol byte for udp`: protocol byte `11` (17).
  - `dns query hex`: for `www.example.test` A, the question section is `03 77 77 77 07 65 78 61 6d 70 6c 65 04 74 65 73 74 00 00 01 00 01`, the header is 12 bytes, flags carry `rd`, `tc` is 0.
  - `dns record fields round trip`: `an1 = 'www.example.test. 300 IN A 198.18.0.80'` encodes and parses back to the same string through the shared parser.
  - `chapters 1 to 5 bytes unchanged`: fixed ICMP echo, ARP request and IPv4 packets produce the same hex as the values captured from `main` before the change (copy them from the current output into the test first, then change the code).
- [ ] **Step 2:** Run `node --test tests/net/packets.test.mjs`. Expected: the new tests FAIL, the byte-identity test PASSES (it pins today's bytes).
- [ ] **Step 3:** Implement. UDP length is derived from the body; checksum zero. DNS has a 12-byte header, label-length names, no compression, `tc` 0.
- [ ] **Step 4:** Run the file. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(net): add UDP and DNS packet layers`.

### Task B2: `sim.js` seams and UDP dispatch

**Files:**
- Modify: `net-quest/engine/sim.js`
- Create: `tests/net/sim-udp.test.mjs`

**Interfaces:**
- Produces: `NQ.sim.udp.listen(port, fn)`, `NQ.sim.udp.expect(ctx, devId, port, fn)`, `session()` with `ext: {}`, idle hooks beside `lost()` in `settle`, and `NQ.sim.kit` with `ipSend`, `settle`, `session`, `layer`, `ownIface`, `nextHop`.

- [ ] **Step 1: Write failing tests** in `sim-udp.test.mjs`:
  - `expect claim wins`: a datagram to a claimed (device, port) reaches the claim, not `listen`.
  - `listen service`: with no claim, the registered service for the port runs.
  - `dns service only on dns roles`: port 53 on a plain host returns false and falls to rule 3.
  - `unsolicited udp is dropped silently`: the log ends with "no one is listening on UDP port 9999", no reply and no ICMP entry.
  - `reply must match pending query`: a reply with a wrong source IP, port or id is dropped by rule 3.
  - `icmp error with id 0 is not a claim`: a router-dropped UDP datagram yields a "delivered: ICMP" entry and the session status does not change.
  - `icmp and arp unchanged`: an echo ping on `office` logs the same entries as before (compare to captured values).
- [ ] **Step 2:** Run `node --test tests/net/sim-udp.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement the four seams. Dispatch goes in `ipRx` before the `if(!ic)` drop, in the order claim, service, drop. Re-check the surrounding lines in `sim.js` first.
- [ ] **Step 4:** Run the new file and `node --test tests/net/sim-local.test.mjs tests/net/sim-route.test.mjs tests/net/sim-nat.test.mjs`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(net): add UDP dispatch seams to the simulator`.

### Task B3: Scenarios `dns` and `dns-stale`

**Files:**
- Modify: `net-quest/engine/topology.js`, `tests/net/topology.test.mjs`

- [ ] **Step 1: Write failing tests.** `topology.test.mjs:7` (the `names` array) gets `'dns'` and `'dns-stale'` appended to the scenario list (re-check the line). The existing per-scenario checks then apply (peers symmetric, unique MACs, all IPs parse). Add `dns scenario has seven devices` (`laptop`, `resolver`, `sw1`, `r1`, `root`, `tld`, `auth`), `dns-stale seeds one cache entry` (`www.example.test A 198.18.0.99`, `expires` 3600, `dns.now` 0) and `existing devices carry no dns field` for `pair`, `office` and `home`.
- [ ] **Step 2:** Run `node --test tests/net/topology.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement `dnsSpec(opts)`. `spec()` writes `devices[id].dns` only when the options carry `dns`, so existing devices stay byte-identical. Address table and zone data are in the spec, sections 3 and 5.
- [ ] **Step 4:** Run the file. Expected: PASS, including `topology.test.mjs:147` (net keys unchanged).
- [ ] **Step 5: Commit** `feat(net): add the dns and dns-stale scenarios`.

### Task B4: DNS model (`engine/dns.js`)

**Files:**
- Modify: `net-quest/engine/dns.js`, `tests/net/dns.test.mjs`

**Interfaces:**
- Produces: `NQ.dns.query(net, from, {server, name, type, rd}) -> {status: 'ok'|'timeout', msg, server, entries, steps, ms}`; `dns.now` handling; cache with positive, negative and delegation entries.

- [ ] **Step 1: Write failing tests** in `dns.test.mjs`, on `dns`:
  - Zone lookup against `auth`: `www.example.test A` gives `aa` and 198.18.0.80; `shop.example.test A` gives the CNAME then the A record; `example.test MX` gives `10 mail.example.test.` with `mail.example.test` A 198.18.0.25 in additional; `www.example.test MX` gives NODATA with the SOA; `wwww.example.test A` gives NXDOMAIN with the SOA; a name outside every zone gives REFUSED.
  - Referrals: `root` answers `www.example.test` with a `test.` NS referral plus glue; `tld` with an `example.test.` referral plus glue.
  - Resolver: `laptop` → `resolver` returns 198.18.0.80 with flags `qr rd ra`; the cache then holds the answer and both delegations.
  - Cache hit: the second query has `ms` 0; the cold one is 36 (three upstream queries at 12 ms).
  - Negative cache: NXDOMAIN for `wwww.example.test` is cached for min(SOA TTL, SOA minimum) seconds, and the next query is a hit.
  - TTL via `dns.now`: after `sleep` of 120 seconds the TTL shown is 180; past 300 seconds the entry has expired and the next query shows 300.
  - Id determinism: two runs give the same `id`, and a different name gives a different one.
  - `servfail on idle`: with `auth` down, the resolver answers SERVFAIL to the client after the idle hook; the loop ends.
  - `cname depth 8`: a chain of nine CNAMEs gives SERVFAIL; a chain of eight resolves.
  - `cold lookup steps`: `steps < 150`; the test prints the measured count, and the PR description records it.
- [ ] **Step 2:** Run `node --test tests/net/dns.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement zone lookup, resolver, cache, continuation in `ctx.ext.dns.pending` keyed `resolver|serverIp|id`, and the idle hook. Pending state never survives `clone`.
- [ ] **Step 4:** Run the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(net): add the DNS zone, resolver and cache model`.

### Task B5: Commands and gating (`engine/cmds-dns.js`, `shell.js`)

**Files:**
- Modify: `net-quest/engine/cmds-dns.js`, `net-quest/engine/shell.js`
- Create: `tests/net/cmds-dns.test.mjs`
- Modify: `tests/net/shell.test.mjs`

- [ ] **Step 1: Write failing tests.** In `cmds-dns.test.mjs`:
  - `dig header and sections`: the output has the opcode, status, id, flags and counts line, then question, answer, authority, additional, `Query time`, `SERVER` and `MSG SIZE`, and no `WHEN`.
  - `dig +short` prints only the data; `dig example.test NS`, `MX`, `AAAA`, `TXT` and `CNAME` each print the right record type.
  - `rd warning`: `dig @192.0.2.10 www.example.test` prints `;; WARNING: recursion requested but not available`, flags `qr rd`, no `ra`; `@203.0.113.10` gives `qr aa rd`.
  - `norecurse miss`: on an empty cache, NOERROR, empty answer, a referral to the nearest cached delegation (root hints when none), flags `qr ra`, Query time 0. After a normal `dig` it answers from the cache.
  - `trace`: one session per hop, every hop with `rd` off and no warning, ends at `auth`.
  - `sleep`, `resolvectl dns eth0 192.168.1.53` and `rndc flush` change `dns.now`, the stub's resolver and the cache respectively.
  - Exit codes: NXDOMAIN and NODATA exit 0; a timeout exits 9 with `;; communications error to` and `;; no servers could be reached`.
  - `dig ignores icmp errors`: a UDP datagram dropped by a router leaves `dig` as a timeout.
  - `dig @own ip times out`: pins the loopback limit.
  - In `shell.test.mjs`: `help` on `laptop` in `office` has no `dig`; in `dns` it has `dig`, `sleep` and `resolvectl` but not `rndc`; on `resolver` it has `rndc`. `suggest('dog')` never returns `dig` outside a `dns` scenario. An unavailable command says `command not found`. Re-check the existing `help` assertions first.
- [ ] **Step 2:** Run both files. Expected: FAIL.
- [ ] **Step 3:** Implement `dig`, `sleep`, `resolvectl`, `rndc`, and `NQ.AVAIL[name](dev)` checked in dispatch, `help` and `suggest()`. Predicates: `dig` and `sleep` need a `dns` field; `resolvectl` needs `dns.resolver`; `rndc` needs a recursive resolver.
- [ ] **Step 4:** Run `node --test tests/net/cmds-dns.test.mjs tests/net/shell.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(net): add dig, sleep, resolvectl and rndc with per-device gating`.

### Task B6: Inspector notes and code style

**Files:**
- Modify: `net-quest/inspector.js`, `tests/shell/codestyle.test.mjs`

- [ ] **Step 1: Write the failing test.** `codestyle.test.mjs:9-10` (the `SAFE` and `AMBIG` command lists; re-check the lines) gets `resolvectl` and `rndc` added to `SAFE` (not English words) and `dig` to `AMBIG` (an English word, checked only before a verb). `sleep` is already in `AMBIG`. Run `node --test tests/shell/codestyle.test.mjs`. Expected: FAIL for any learner text that names them bare, or pass if none exists yet.
- [ ] **Step 2:** Add a `NOTE` for `UDP` and `DNS` to `inspector.js`; `ui.js` `KIND` stays unchanged. Records render as flat scalars (`an1` to `an3`, `ns1` to `ns2`, `ar1` to `ar2`).
- [ ] **Step 3:** Run `npm run test:engine`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(net): explain UDP and DNS in the inspector`.

### Task B7: Mission probe `ctx.dig`

**Files:**
- Modify: `net-quest/content/model.js`, `tests/net/content.test.mjs` or `tests/net/dns.test.mjs`

- [ ] **Step 1: Write a failing test**, `ctx.dig leaves the learner's net alone`: after `ctx.dig('laptop', 'www.example.test', 'A', {})` the log length, the resolver cache and `dns.now` equal their values before.
- [ ] **Step 2:** Run. Expected: FAIL (`ctx.dig` undefined).
- [ ] **Step 3:** Add `dig(from, name, type, opts)` to `makeCtx`, running on a clone like `ping`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** `feat(net): let mission checks probe DNS on a clone`.

### Task B8: Final verification for PR B

- [ ] **Step 1:** Run `npm run check`. Expected: green.
- [ ] **Step 2:** Run `npm run test:engine`. Expected: all PASS, fixtures untouched (`git diff --stat -- tests/fixtures` is empty).
- [ ] **Step 3:** Run the `node --check` loop from AGENTS.md. Expected: no output.
- [ ] **Step 4:** Run `npm run test:browser` once. Expected: unchanged green (no chapter yet).
- [ ] **Step 5:** Run the `pre-pr-check` skill. Open the PR; the description records the measured cold-lookup step count. This task ends in the PR; it makes no commit.

### Task C1-C2: Chapter 6 "Names and DNS" (`content/ch-6-dns-basics.js`)

**Files:**
- Create: `net-quest/content/ch-6-dns-basics.js`
- Modify: `net-quest/index.html`, `tests/net/harness.mjs` (load before `extras.js`), `tests/net/content.test.mjs`

**Interfaces:**
- Produces: nine missions, keys `5.0` to `5.8`, 10 XP each, scenario `dns`; the rank title "Name Finder" is earned at 360 XP (after 5.3). Mission table: spec, section 10.

- [ ] **Step 1: Write failing tests** (existing generic tests cover every mission once the file is loaded; add chapter-specific ones):
  - `solvability`: each mission's reference `answer` passes its own `check`.
  - `do nothing fails`: the empty run fails every mission; 5.2 fails until `dig www.example.test` has run (its card names that line first).
  - `wrong and lazy answers fail`: for 5.1 (300), 5.2 (destination port), 5.4 (the mail server's name), 5.5 and 5.6, a wrong value and an empty value fail.
  - `no answer leak`: 5.4's card text does not name `mail.example.test`, and the card text of 5.7 contains no standalone `0` (`content.test.mjs:57`).
  - 5.8 starts with the laptop pointing at a dead resolver, fails until `resolvectl dns eth0 192.168.1.53` is run, and its card mentions that this laptop asks the resolver direct and that real systems often use a local helper at 127.0.0.53.
- [ ] **Step 2:** Run `node --test tests/net/content.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Write the chapter. Every mission has `how` steps and chip meanings, and the whole line is explained before the parts. Follow `mission-voice`. Teach terms in the order of spec section 11.
- [ ] **Step 4:** Run the file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(net): add chapter 6, names and DNS`.

### Task C3: Teach-before-use rows for chapter 6

**Files:**
- Modify: `tests/net/teach.test.mjs`

- [ ] **Step 1: Write the failing rows.** Add the `FIRST` rows for 5.0 to 5.8 as listed in spec section 11 (term → key), with `UDP port` and `DNS TTL` regexes where the spec says so. Add the "chapter 6 does not use later terms" block (no `+norecurse`, `+trace`, `rndc flush`, `DNS cache`, `DNS TTL`, `authoritative`, `referral`, `glue`, `recursive` before their keys).
- [ ] **Step 2:** Run `node --test tests/net/teach.test.mjs`. Expected: FAIL until the chapter text is fixed.
- [ ] **Step 3:** Fix the chapter text, not the test.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** `test(net): pin the teaching order of chapter 6`.

### Task C4: Quick-fire, guide and interim ranks

**Files:**
- Modify: `net-quest/content/extras.js`, `tests/net/content.test.mjs` (about lines 689 to 704)

- [ ] **Step 1: Write failing assertions.** Total XP 410, 7 ranks `[0,80,190,250,290,360,410]`, Name Finder at 360 and the top rank at 410 titled Packet Whisperer (PR D inserts Cache Keeper at 460 and moves Packet Whisperer to 500); 6 quick-fire questions and 4 guide entries with `ch:5`, one quick-fire on SERVFAIL; none gives away a later term.
- [ ] **Step 2:** Run. Expected: FAIL (total 320, 6 ranks).
- [ ] **Step 3:** Add the entries and the interim ranks.
- [ ] **Step 4:** Run `npm run test:engine`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(net): add chapter 6 quick-fire, guide and interim ranks`.

### Task C5: Smoke test and layout

**Files:**
- Modify: `tests/smoke.mjs` (about lines 1692 and 1792; re-check, #41 also edits this file)

- [ ] **Step 1: Write failing assertions.** Chapter count five → six; a chapter 6 play-through that solves 5.0 and 5.3 by typing the commands.
- [ ] **Step 2:** Run `npm run test:browser`. Expected: the new assertions FAIL.
- [ ] **Step 3:** Update the counts and the play-through.
- [ ] **Step 4:** Run `npm run test:browser`. Expected: PASS. Play chapter 6 at 1280 and at 390 wide and check the 7-device diagram in both; keep screenshots for the PR.
- [ ] **Step 5: Commit** `test(net): cover chapter 6 in the smoke test`.
- [ ] **Step 6:** Run `pre-pr-check`; open the PR.

### Task D1-D2: Chapter 7 "Resolvers and caches" (`content/ch-7-resolution.js`)

**Files:**
- Create: `net-quest/content/ch-7-resolution.js`
- Modify: `net-quest/index.html`, `tests/net/harness.mjs`, `tests/net/content.test.mjs`

**Interfaces:**
- Produces: nine missions, keys `6.0` to `6.8`, 10 XP each; the rank title "Cache Keeper" is earned at 460 XP (after 6.4); 6.7 runs on `dns-stale`.

- [ ] **Step 1: Write failing tests** as in C1-C2, plus:
  - 6.4's card text contains no standalone `0`; its answer is the second query time.
  - 6.6: setup warms the cache with `dig www.example.test` on `laptop` and keeps the clock; after `sleep 120` the expected TTL is 300 minus seconds since cached (180), computed from the net; a `sleep 400` run shows 300 and is not accepted as 180. The card says the practice shell skips the wait.
  - 6.7: on `dns-stale`, doing nothing fails; `rndc flush` passes; `sleep 3600` also passes (outcome check).
  - 6.8: `dig +trace www.example.test` passes; a plain `dig` does not.
  - 6.1's card teaches `rd` with the warning; `ra` first appears in 6.3.
- [ ] **Step 2:** Run `node --test tests/net/content.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Write the chapter.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** `feat(net): add chapter 7, resolvers and caches`.

### Task D3: Teach-before-use rows for chapter 7, quick-fire and guide gating

**Files:**
- Modify: `tests/net/teach.test.mjs`, `net-quest/content/extras.js`

- [ ] **Step 1: Write failing rows.** `FIRST` rows for 6.0 to 6.8 (spec section 11), the "chapter 7 does not use later terms" block, and the quick-fire and guide gating tests for `ch:6` (6 quick-fire, 4 guide; none uses a term before its key).
- [ ] **Step 2:** Run `node --test tests/net/teach.test.mjs tests/net/content.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Add the entries; fix chapter text, not the tests.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** `feat(net): add chapter 7 quick-fire, guide and teaching order`.

### Task D4: Final ranks

**Files:**
- Modify: `net-quest/content/extras.js`, `tests/net/content.test.mjs` (about lines 689 to 704)

- [ ] **Step 1: Write failing assertions.** Total 500, 8 ranks `[0,80,190,250,290,360,460,500]`, titles Name Finder 360, Cache Keeper 460, Packet Whisperer 500. The rank test's spacing rule (≤470 for Cache Keeper) is re-checked in the file.
- [ ] **Step 2:** Run. Expected: FAIL (total 410, 7 ranks).
- [ ] **Step 3:** Update the ranks.
- [ ] **Step 4:** Run `npm run test:engine`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(net): set the final ranks for 500 XP`.

### Task D5: Smoke test and layout

**Files:**
- Modify: `tests/smoke.mjs`

- [ ] **Step 1: Write failing assertions.** Chapter count six → seven; a chapter 7 play-through that solves 6.0 and 6.4.
- [ ] **Step 2:** Run `npm run test:browser`. Expected: FAIL.
- [ ] **Step 3:** Update the counts and the play-through.
- [ ] **Step 4:** Run `npm run test:browser`. Expected: PASS. Check the layout at 1280 and 390 wide.
- [ ] **Step 5: Commit** `test(net): cover chapter 7 in the smoke test`.

### Task D6: Docs wiring and "As built"

**Files:**
- Modify: `README.md` (rows near lines 17 and 110: "five" → "seven"; re-check), `index.html` (landing card "7 chapters"), `AGENTS.md` (row `Change Network Quest (chapters 1 to 7)`), `docs/superpowers/specs/2026-11-01-net-quest-dns-design.md` ("As built")

- [ ] **Step 1:** Update the README rows, the landing card and the AGENTS.md row. Run `npm run test:browser`; the landing-card tests must pass.
- [ ] **Step 2:** Complete the spec's "As built" with what the engine does that the spec did not predict: the measured cold-lookup step count, the final `help` assertions, and any change to the seeded list.
- [ ] **Step 3:** Run `npm run check`, `npm run test:engine`, `npm run test:browser` and the `node --check` loop. Expected: all PASS.
- [ ] **Step 4:** Screenshots of both chapters at 1280 and 390 for the PR.
- [ ] **Step 5: Commit** `docs(net): document the DNS chapters`. Run `pre-pr-check`; open the PR.

---

## Self-review

- **Spec coverage.** Spec sections map to tasks: 3 (scenarios) → B3; 4 (seams) → B1, B2; 5 (engine) → B4, B7; 6 (commands) → B5; 7 (time, NAT and UDP) → B2, B4, B5; 8 (gating) → B5; 9 (inspector) → B6; 10 (missions) → C1-C2, D1-D2; 11 (teach-before-use) → C3, D3; 12 (ranks) → C4, D4; 13 (delivery) → PR split; 14 (tests to change) → every task lists its test file, including `topology`, `content`, `teach`, `codestyle`, `shell`, `harness.mjs` `FILES`, `index.html` order, `smoke.mjs`, `dns.test.mjs`, `cmds-dns.test.mjs`, `sim-udp.test.mjs` and `packets.test.mjs`; the "As built" section → D6; 18 (diagrams) needs no task.
- **No placeholders.** Every step names its test, expected value or command. Line numbers are marked "re-check".
- **Consistent names and numbers.** 18 missions, 10 XP each, keys `5.0` to `5.8` and `6.0` to `6.8`; totals 320, 410, 500; interim ranks `[0,80,190,250,290,360,410]`; final ranks `[0,80,190,250,290,360,460,500]` (360,460,500 for the three titles); scenarios `dns` and `dns-stale`; commands `dig`, `sleep`, `resolvectl`, `rndc`.
