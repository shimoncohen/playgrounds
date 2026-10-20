# Network Quest Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `net-quest/` phase 1: a DOM-free network simulator, a simulated terminal, a packet inspector and chapters 1 to 5 (layers, MAC/ARP, IP, routing, NAT).

**Architecture:** Plain browser scripts sharing one global namespace `NQ` (like `DSQ` and `SQ`), loaded in order from `index.html`. `engine/` (no DOM) holds addressing, packet builders, topology data, the hop-by-hop simulator and the commands. `content/` holds the course as data. `ui.js`, `inspector.js`, `app.js` are the only DOM files. Node tests load the engine and content in a `vm` sandbox, exactly as `tests/ds/content.test.mjs` does.

**Tech Stack:** Plain JS, Node `node:test` + `vm`, Playwright (existing smoke tests). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-20-net-quest-design.md`

## Global Constraints

- No build step, no framework, no new runtime dependency. Pages work opened from disk and on GitHub Pages.
- Engine files (`net-quest/engine/*.js`, `net-quest/content/*.js`) never touch `window`, `document` or `localStorage`.
- Simulation is deterministic: no `Math.random`, no `Date.now`; a fake clock that starts at 0 and advances by 1 per logged event.
- Progress key is exactly `net-quest-v1`. Mission keys are `'<chapter>.<mission>'`; once shipped they are never renumbered, only appended.
- Local assets use relative `<script src>` / `<link href>`; an inlined file never contains `</script` or `</style` (`npm run check` bundles every `*-quest/`).
- Do not regenerate or edit anything under `tests/fixtures/`. Do not weaken, skip or delete an existing test.
- Learner text: whole line explained first, then each part (`how` steps); commands, options, file names and fields are `<code>`; friendly, concrete, never assumes untaught knowledge (AGENTS.md rules 9 to 11, skill `mission-voice`).
- Every mission has a reference `answer` (list of command lines) that passes its own `check`; the do-nothing run must fail it.
- Conventional Commits, scope `net` (needs Task 0). Never bump the version or edit `CHANGELOG.md`. Keep the attribution trailer your tooling adds.
- Match surrounding code: compact style of `ds-quest/*.js`, comment density, naming.

## Review Focus

1. **Bad address input** (`ip addr add 10.0.0.300/24`, `/33`, no prefix, `ip route add default via nowhere`): a one-line error naming the problem, state unchanged. Pinned in Tasks 2 and 8.
2. **Duplicate IP on one segment**: the first ARP responder in device order wins and the log shows both replies; never throws. Task 6.
3. **Routing loop** (two routers whose default routes point at each other): the packet dies by TTL with "time exceeded"; the sim terminates. Task 6.
4. **Odd command lines** (empty line, unknown command, unclosed quote, `ping` with no argument, a 5,000-character line): friendly error, no exception, output capped. Task 8.
5. **Learner locks themselves out** (`ip addr del` of the only address, `ip link set eth0 down`): commands keep working, "reset scenario" restores a clean topology, checks do not crash. Also a saved game with unknown mission keys or a bad shape loads without throwing. Tasks 8 and 11.

---

## PR split

- **PR 0** (tooling, separate): Task 0.
- **PR A** (branch off `main`, after the spec merges): Tasks 1 to 11 (engine, UI, chapter 1).
- **PR B**: Tasks 12 to 16 (chapters 2 to 5, quick-fire, guide, docs).

### Task 0: Allow the `net` commit scope

**Files:**
- Modify: `commitlint.config.mjs` (add `'net'` to `scope-enum`)

- [ ] **Step 1: Verify the failure first.** Run `printf '%s\n' "feat(net): x" | npx --no -- commitlint`. Expected: scope-enum error.
- [ ] **Step 2: Add `'net'`** after `'ds'` in the list.
- [ ] **Step 3: Verify.** The same command exits 0.
- [ ] **Step 4: Commit and open its own PR** titled `ci: allow the net commit scope` (CI/tooling changes are flagged as separate, AGENTS.md "Where things go").

### Task 1: Scaffold and wire the quest

**Files:**
- Create: `net-quest/index.html`, `net-quest/style.css`, `net-quest/app.js`
- Modify: `index.html` (landing card), `tests/smoke.mjs` (add `'net'` to the `NAMES` list), `package.json` (`test:engine` also globs `tests/net/*.test.mjs`), `.github/workflows/ci.yml` (`node --check` list gains `net-quest/*.js net-quest/engine/*.js net-quest/content/*.js tests/net/*.mjs`), `README.md` (table row + repo map), `AGENTS.md` ("What this is" list and a "Where things go" row)

**Interfaces:**
- Produces: page shell with ids `chapters`, `mission`, `term`, `screen`, `cmd`, `prompt`, `inspector`, `diagram`, tabs `quest|fire|guide`; `window.PROGRESS={key:"net-quest-v1",name:"Network Quest"}`.

- [ ] **Step 1:** Add `'net'` to `NAMES` in `tests/smoke.mjs`. Run `node tests/smoke.mjs`; expected: the `net-quest` tests FAIL (404).
- [ ] **Step 2:** Create the shell by copying the shape of `ds-quest/index.html` (header, tabs, XP bar, `shared/*` css/js including `how`, `nav`, `progress`, `theme`). Brand glyph `⇄`, rank placeholder "Packet Rookie". Quest tab: `missionCol` (chapters + mission card) and a right column holding `#term` (terminal) above `#inspector`, plus `#diagram`. `app.js` only switches tabs for now.
- [ ] **Step 3:** Landing card in `index.html` (same markup as the `ds-quest` card, `data-key="net-quest-v1"`, "1 chapter"-style sub updated in Task 16), README row, repo-map line, AGENTS.md mentions, CI glob, `package.json` glob.
- [ ] **Step 4:** Run `npm run check` (bundles `net-quest`) and `node tests/smoke.mjs`. Expected: all pass, including `net-quest loads cleanly` and `progress survives export, wipe and import`.
- [ ] **Step 5: Commit** `feat(net): scaffold Network Quest`.

### Task 2: Addressing helpers (`engine/ip.js`)

**Files:**
- Create: `net-quest/engine/ip.js`, `tests/net/harness.mjs`, `tests/net/ip.test.mjs`

**Interfaces:**
- Produces on `NQ.ip`: `parse(s: string) -> number|null` (IPv4 to uint32, `null` if invalid), `fmt(n: number) -> string`, `cidr(s: string) -> {ip:number, prefix:number, mask:number, net:number, bcast:number}|null`, `inSubnet(ip: number, c: cidr) -> boolean`, `isPrivate(ip: number) -> boolean` (RFC 1918 plus 127/8 and 169.254/16 are "not public"; also expose `isPublic`), `mac(n: number) -> string` (`02:00:00:00:00:NN`).
- Produces in `harness.mjs`: `loadNet() -> NQ` (fresh `vm` context, loads `net-quest/engine/*.js` in the order listed in `index.html`, returns `sandbox.NQ`). Later tasks append their files to its list.

- [ ] **Step 1: Write failing tests** in `tests/net/ip.test.mjs`: `parse('10.0.0.2') === 167772162`; `parse('10.0.0.300') === null`; `parse('1.2.3') === null`; `fmt(parse('192.168.1.1')) === '192.168.1.1'`; `cidr('10.0.0.2/24')` gives `net` of `10.0.0.0`, `bcast` of `10.0.0.255`; `cidr('10.0.0.2/33') === null`; `cidr('10.0.0.2') === null`; `/0`, `/30`, `/32` boundaries; `isPrivate` true for `10.1.2.3`, `172.16.0.1`, `172.31.255.255`, `192.168.0.1`; false for `172.32.0.1`, `8.8.8.8`, `203.0.113.5`.
- [ ] **Step 2:** Run `node --test tests/net/ip.test.mjs`. Expected: FAIL (file missing).
- [ ] **Step 3:** Implement as above. Mask math uses `>>> 0` to stay unsigned (`/0` and `/32` are the traps).
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(net): add IPv4 address helpers`.

### Task 3: Packet builders and hex (`engine/packets.js`)

**Files:**
- Create: `net-quest/engine/packets.js`, `tests/net/packets.test.mjs`

**Interfaces:**
- Consumes: `NQ.ip`.
- Produces on `NQ.pkt`: a packet is `{layers: Layer[]}`, `Layer = {name: 'Ethernet'|'ARP'|'IPv4'|'ICMP', fields: {[k]: string|number}}`, outermost first. Builders: `eth(src, dst, type)`, `arp(op: 'request'|'reply', sha, spa, tha, tpa)`, `ipv4(src, dst, ttl, proto)`, `icmp(type: 'echo-request'|'echo-reply'|'time-exceeded'|'dest-unreachable', id, seq)`, `stack(...layers) -> packet`, `hex(packet) -> string` (space-separated bytes, encapsulated in order, lengths and ethertype/protocol numbers filled in), `layerNames(packet) -> string[]`, `clone(packet)`.

- [ ] **Step 1: Failing tests:** an echo request stack is `['Ethernet','IPv4','ICMP']`; `hex` of an ARP request starts with `ff ff ff ff ff ff` (broadcast dst) then the sender MAC, then `08 06`; IPv4 hex has version/IHL byte `45`, the TTL byte equals the field, protocol byte `01` for ICMP; checksum field matches a hand-computed value for one fixed packet (compute it in the test with the RFC 1071 algorithm written inline); `clone` is deep (mutating the clone's TTL leaves the original).
- [ ] **Step 2:** Run; expected FAIL.
- [ ] **Step 3:** Implement. Hex must be derived from the fields, never stored, so the inspector and sim cannot disagree.
- [ ] **Step 4:** Run; expected PASS. Add `packets.js` to the `harness.mjs` list.
- [ ] **Step 5: Commit** `feat(net): add packet layers and hex encoding`.

### Task 4: Topology and scenarios (`engine/topology.js`)

**Files:**
- Create: `net-quest/engine/topology.js`, `tests/net/topology.test.mjs`

**Interfaces:**
- Consumes: `NQ.ip`.
- Produces: `NQ.SCENARIOS: {[name]: ScenarioSpec}`, `NQ.createNet(name: string, setup?: {dev: string, cmd: string}[]) -> Net` (setup lines run through `net.exec` once Task 8 lands), `Net.clone() -> Net`, `Net.reset() -> void`. Until Task 8 exists, a non-empty `setup` throws `Error('setup needs the shell (Task 8)')`; Task 8 replaces that throw.
- `Net` shape: `{name, me: string, devices: {[id]: Device}, log: LogEntry[], clock: number}`; `Device = {id, kind: 'host'|'switch'|'router', ifaces: {[name]: {mac, ip: string|null /* cidr */, up: boolean, peer: 'dev.iface'}}, routes: {dst: string /* cidr or 'default' */, via: string|null, dev: string}[], neigh: {[ip]: mac}, macTable: {[mac]: ifaceName} /* switches */, nat: {inside: string, outside: string, table: Entry[]}|null}`.
- Scenario table (ids and addresses are fixed; later tasks and content rely on them). MACs are `NQ.ip.mac(n)` numbered in the order devices are listed here:
  - `pair`: `laptop` eth0 `10.0.0.2/24`; `phone` eth0 `10.0.0.3/24`; switch `sw1` ports `p1`,`p2`. `me` = `laptop`.
  - `office`: `laptop` `192.168.1.10/24` default via `192.168.1.1`; `printer` `192.168.1.20/24`; switch `sw1`; router `r1` eth0 `192.168.1.1/24`, eth1 `10.0.1.1/30`; router `r2` eth0 `10.0.1.2/30`, eth1 `172.16.0.1/24`, default via `10.0.1.1`; `server` `172.16.0.10/24` default via `172.16.0.1`; `r1` has route `172.16.0.0/24` via `10.0.1.2`. `me` = `laptop`.
  - `home`: `laptop` `192.168.1.10/24`, `phone` `192.168.1.11/24` (both default via `192.168.1.1`); switch `sw1`; router `home` eth0 `192.168.1.1/24`, eth1 `203.0.113.5/30`, NAT inside eth0 outside eth1, default via `203.0.113.6`; router `isp` eth0 `203.0.113.6/30`, eth1 `198.51.100.1/24`; `web` `198.51.100.10/24` default via `198.51.100.1`. `me` = `laptop`.

- [ ] **Step 1: Failing tests:** for every scenario, every `peer` points to an existing iface whose `peer` points back; MACs are unique across the net; all IPs in a scenario parse; `createNet` twice gives independent objects; `clone()` is deep and `reset()` restores the original spec after a mutation; `createNet('nope')` throws an Error whose message lists the valid names.
- [ ] **Step 2:** Run; expected FAIL.
- [ ] **Step 3:** Implement. Specs are plain data; `createNet` builds `Net` by deep-copying the spec and keeps the spec for `reset()`.
- [ ] **Step 4:** Run; PASS. Add `topology.js` to the harness list.
- [ ] **Step 5: Commit** `feat(net): add topology model and starter scenarios`.

### Task 5: Local delivery, ARP and switching (`engine/sim.js`, part 1)

**Files:**
- Create: `net-quest/engine/sim.js`, `tests/net/sim-local.test.mjs`

**Interfaces:**
- Consumes: `NQ.pkt`, `NQ.ip`, `Net`.
- Produces: `LogEntry = {t: number, dev: string, iface: string, dir: 'tx'|'rx'|'fwd'|'drop'|'nat', verdict: string, packet: Packet}`; `NQ.sim.ping(net, from: string, dstIp: string, opts?: {ttl?: number, seq?: number}) -> {delivered: boolean, reason: string|null, replyFrom: string|null, hops: string[], entries: LogEntry[]}`; entries are also appended to `net.log` and `net.clock` advances by 1 per entry. Reasons (exact strings, used by commands and checks): `'no route'`, `'interface down'`, `'host unreachable'` (ARP got no answer), `'ttl exceeded'`, `'no address'`.
- Behavior: same-subnet send → ARP request (broadcast) if `neigh` lacks the target → switch floods unknown/broadcast and learns source MACs in `macTable`, forwards known unicast to one port → target replies → sender caches `neigh` → echo request/reply. A second ping to the same host produces no ARP entries.

- [ ] **Step 1: Failing tests** on `pair`: first `ping laptop → 10.0.0.3` is delivered and `entries` contain an ARP request with `dst` `ff:ff:ff:ff:ff:ff`, an ARP reply, an echo request and an echo reply, in that order; after it `laptop.neigh['10.0.0.3']` equals `phone`'s eth0 MAC and `sw1.macTable` has both MACs; the second ping logs no ARP layer; pinging `10.0.0.99` gives `{delivered:false, reason:'host unreachable'}`; with `phone` eth0 `up=false` gives `'host unreachable'` and a `drop`; clock is strictly increasing across entries.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement `ping` for the L2 case: a private `deliverFrame(net, devId, ifaceName, packet)` that switches/hosts handle by kind. Keep `sim.js` split into small functions per device kind; routers arrive in Task 6.
- [ ] **Step 4:** Run; PASS. Add `sim.js` to the harness list.
- [ ] **Step 5: Commit** `feat(net): simulate ARP, switching and local ping`.

### Task 6: Routing, TTL and traceroute (`engine/sim.js`, part 2)

**Files:**
- Modify: `net-quest/engine/sim.js`
- Test: `tests/net/sim-routing.test.mjs`

**Interfaces:**
- Produces: `NQ.sim.route(dev: Device, dstIp: string) -> {via: string|null, dev: string}|null` (longest prefix; `default` last; connected subnets from ifaces), `NQ.sim.traceroute(net, from, dstIp, maxHops = 30) -> {hops: {ttl: number, from: string|null /* ip */, reached: boolean}[], entries: LogEntry[]}`. Routers decrement TTL, rewrite Ethernet src/dst per hop (logged as `fwd`), send ICMP `time-exceeded` from the ingress iface IP when TTL hits 0, and `dest-unreachable` ("no route") if they have no route. `ping` gains cross-subnet delivery: the sender ARPs for the gateway, not the target.

- [ ] **Step 1: Failing tests** on `office`: `ping laptop → 172.16.0.10` delivered; the echo request's Ethernet dst at first hop is `r1`'s eth0 MAC while IPv4 dst stays `172.16.0.10` (assert both in the same log entry); TTL seen at `server` is `64 - 2`; `traceroute` shows hops `192.168.1.1`, `10.0.1.2`, `172.16.0.10`; `ping` with `ttl: 1` gives `'ttl exceeded'`; removing `laptop`'s default route gives `'no route'`; **loop (Review Focus 3):** point `r1` and `r2` defaults at each other, ping `8.8.8.8` terminates with `'ttl exceeded'` in under 100 entries; **duplicate IP (Review Focus 2):** on `pair`, give `phone` a second address equal to `laptop`'s (`10.0.0.2/24`) and add a third host answering the same IP; `ping 10.0.0.2` from the third host gets one ARP answer from the first device in scenario order, the log shows both ARP replies, and nothing throws.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement per Interfaces. Initial packet TTL is 64.
- [ ] **Step 4:** Run; PASS (Task 5 tests still pass).
- [ ] **Step 5: Commit** `feat(net): simulate routing, TTL and traceroute`.

### Task 7: NAT and the public side (`engine/sim.js`, part 3)

**Files:**
- Modify: `net-quest/engine/sim.js`
- Test: `tests/net/sim-nat.test.mjs`

**Interfaces:**
- Produces: on a router with `nat`, packets entering `nat.inside` and leaving `nat.outside` have IPv4 src rewritten to the outside iface IP, an entry `{inside: ip, outside: ip, id}` is added to `nat.table`, the log entry `dir: 'nat'` carries both before/after addresses in `verdict` text (`'src 192.168.1.10 → 203.0.113.5'`); replies matching a table entry are rewritten back; an unsolicited packet entering from outside with no table entry is dropped with reason `'no nat mapping'`. Private source addresses leaving a router *without* NAT toward the public side are dropped by `isp` with reason `'private source'` (documented teaching behavior; `isp` in `home` has `dropPrivate: true`, add that flag to the scenario spec).

- [ ] **Step 1: Failing tests** on `home`: `ping laptop → 198.51.100.10` delivered; `web` sees source `203.0.113.5`; `nat.table` has one entry and the reply reaches `laptop` from `198.51.100.10`; `ping web → 192.168.1.10` (private, from outside) fails; `ping web → 203.0.113.5` unsolicited from outside fails with `'no nat mapping'`; removing `home`'s `nat` makes `laptop → web` fail with `'private source'`.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; all sim tests PASS.
- [ ] **Step 5: Commit** `feat(net): simulate NAT and private-source filtering`.

### Task 8: Shell and `ip` commands (`engine/shell.js`, `engine/cmds-ip.js`)

**Files:**
- Create: `net-quest/engine/shell.js`, `net-quest/engine/cmds-ip.js`, `tests/net/shell.test.mjs`, `tests/net/cmds-ip.test.mjs`
- Modify: `net-quest/engine/topology.js` (`createNet` now runs `setup` through `exec`)

**Interfaces:**
- Produces: `Net.exec(line: string, devId?: string) -> {out: string[], err: string[], code: number, entries: LogEntry[]}` (default device is `net.me`; `entries` are the log entries that line added). `NQ.CMDS: {[name]: (net, dev, args: string[], io) => {out, err, code}}`; commands register themselves with `NQ.CMDS.ip = ...`. Parser: whitespace split, `'` and `"` quotes, `|` into `grep <text>` and `head [-n N]` only; errors in the style `bash: foo: command not found` (with a `did you mean` hint from edit distance 1 or 2 against `NQ.CMDS` keys); output capped at 200 lines with a final `… output truncated`; input over 1,000 chars gives `bash: line too long`.
- `ip` subcommands: `addr [show]`, `addr add <cidr> dev <if>`, `addr del <cidr> dev <if>`, `route [show]`, `route add <cidr|default> via <ip> [dev <if>]`, `route del <cidr|default>`, `neigh [show]`, `neigh add <ip> lladdr <mac> dev <if>`, `neigh del <ip> dev <if>`, `link [show]`, `link set <if> up|down`. Output formatted like real `ip` (two-line `addr` blocks, `default via X dev eth0`). Also `help` (lists the commands that exist now) and `reset`-free: reset is a UI button calling `Net.reset()`.

- [ ] **Step 1: Failing tests:** parser (quotes, pipe to `grep` and `head -n 1`, unclosed quote gives an error not a throw, empty line gives `code 0` and no output, 5,000-char line gives `bash: line too long`); unknown command suggests `ip` for `ipp`; `ip addr` on `pair` prints `10.0.0.2/24` and the MAC; `ip addr add 10.0.0.300/24 dev eth0` and `.../33` and a missing prefix each give a one-line error and leave `ip addr` output unchanged (**Review Focus 1**); `ip route add default via nowhere` errors; `ip route add 10.5.0.0/24 via 192.168.1.1` works on `office` and `ip route` shows it; `ip route add` via an address that is not on a connected subnet errors like real Linux (`Nexthop has invalid gateway`); `ip link set eth0 down` then `ip addr` shows `state DOWN`; **lockout (Review Focus 5):** after `ip addr del 10.0.0.2/24 dev eth0` and `ip link set eth0 down` every command still returns without throwing and `Net.reset()` restores the original `ip addr` output; `ip addr | grep 10.0.0` filters.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement. **Step 4:** Run; PASS. Add both files to the harness list.
- [ ] **Step 5: Commit** `feat(net): add the shell parser and ip commands`.

### Task 9: `ping`, `traceroute`, `arping`, `ipcalc` (`engine/cmds-net.js`)

**Files:**
- Create: `net-quest/engine/cmds-net.js`, `tests/net/cmds-net.test.mjs`

**Interfaces:**
- Produces commands: `ping [-c N] <ip>` (default 4, max 10; output like real `ping`: `64 bytes from 10.0.0.3: icmp_seq=1 ttl=64 time=N ms` where `time` is `entries`-derived, deterministic: 1 ms per hop pair; failures print `From <ip> icmp_seq=1 Destination Host Unreachable` / `Time to live exceeded` / `ping: connect: Network is unreachable`; trailing statistics block), `traceroute <ip>` (one line per hop, `* * *` when the hop is silent), `arping -c 1 <ip>` (prints the MAC), `ipcalc <cidr>` (Address, Netmask, Network, Broadcast, HostMin, HostMax, Hosts; invalid input gives a one-line error).

- [ ] **Step 1: Failing tests:** `ping -c 2 10.0.0.3` on `pair` prints two reply lines and `2 packets transmitted, 2 received, 0% packet loss`; unknown host `10.0.0.99` prints `Destination Host Unreachable` and `100% packet loss`, exit code 1; `ping` with no argument prints a usage line (**Review Focus 4**); `ping -c 99` clamps to 10 without error; `traceroute 172.16.0.10` on `office` prints 3 numbered lines; `ipcalc 192.168.1.0/26` gives `HostMax 192.168.1.62`, `Hosts 62`; `ipcalc 10.0.0.1/31` and `/32` do not crash; `ipcalc` of garbage errors.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement on top of `NQ.sim`. **Step 4:** Run; PASS.
- [ ] **Step 5: Commit** `feat(net): add ping, traceroute, arping and ipcalc`.

### Task 10: Mission model, check context and chapter 1 (`content/`)

**Files:**
- Create: `net-quest/content/model.js`, `net-quest/content/ch-1-layers.js`, `net-quest/content/extras.js` (`QF`, `GUIDE`, `RANKS` seeds), `tests/net/content.test.mjs`, `tests/net/codestyle.test.mjs`

**Interfaces:**
- Consumes: `Net`, `NQ.sim`.
- Produces: `NQ.CH: Chapter[]` where `Chapter = {name, badge, intro, learned: string[], missions: Mission[]}` (chapters register via `NQ.CH.push` from `content/ch-*.js`, loaded in order); `Mission = {title, goal, how: string[], anat?, explain, hint, scenario: string, setup?: {dev, cmd}[], answer: string[], check: (ctx) => true|string, question?: {ask: string, expect: (ctx) => string}}`. `NQ.makeCtx(net, history, answered) -> ctx` with: `ctx.ping(from, ip) -> {delivered, reason, hops}` (**runs on `net.clone()`**, so probing never changes the learner's ARP caches or log), `ctx.route(dev, ip) -> {via, dev}|null`, `ctx.addr(dev) -> {[iface]: cidr|null}`, `ctx.last(pred) -> LogEntry|null` (latest entry from the learner's own log), `ctx.history: {line, code}[]`, `ctx.answered: string|null`. `NQ.runMission(m, lines: string[]) -> boolean|string` builds the scenario, runs the lines on `net.me`, builds the ctx, returns `m.check(ctx)`. `NQ.RANKS: {xp: number, name: string}[]` (top title "Packet Whisperer").
- Chapter 1 ("Layers and packets", 6 missions on scenario `pair`, appended order is final): (1) `ping` a neighbour and spot that something travelled; (2) name the layers an echo packet is stacked from (question: `ctx` computes `pkt.layerNames(...).join(',')` from the last echo request; accept `Ethernet,IPv4,ICMP` case-insensitively with spaces/arrows normalised); (3) find the TTL in the inspector (question, computed); (4) find the destination MAC of the ARP request (question, computed, expects `ff:ff:ff:ff:ff:ff`); (5) read which layer holds the IP address (question, computed from layer names); (6) `ping -c 3` and read the packet count. Every mission has `how` with whole-line step first; copy tone from `ds-quest/content.js`.

- [ ] **Step 1: Failing tests** in `content.test.mjs` for every mission of every chapter: reference `answer` passes; empty `[]` fails; starter state (scenario + `setup`, no commands) fails; keys unique by `chapterIndex.missionIndex`; `how` is a non-empty array whose first item is a sentence about the whole line; `scenario` exists in `NQ.SCENARIOS`; a question mission's `expect(ctx)` is a non-empty string that does not appear verbatim in the mission's `goal`/`explain`/`hint` (answers are computed, not leaked); lazy-answer cases per chapter-1 mission (e.g. mission 1 fails if only `ip addr` was run; mission 4 fails for answering `00:00:00:00:00:00`); a probe via `ctx.ping` leaves `net.log.length` and `laptop.neigh` unchanged. `codestyle.test.mjs`: copy the `bareMentions` rule set from `tests/shell/codestyle.test.mjs` (import it, do not duplicate: it is exported) and add the net command names `ip ping traceroute arping ipcalc` to the safe list via a local extra rule; run it over every `goal`, `how`, `explain`, `hint`.
- [ ] **Step 2:** Run; FAIL. **Step 3:** Implement model, ctx and chapter 1, then `extras.js` with 6 quick-fire questions and 4 guide entries for chapter 1 topics (layers, encapsulation, MAC, ARP). **Step 4:** Run all `tests/net`; PASS.
- [ ] **Step 5: Commit** `feat(net): add mission model and chapter 1`.

### Task 11: UI, inspector, diagram, progress (`ui.js`, `inspector.js`, `app.js`)

**Files:**
- Create: `net-quest/ui.js`, `net-quest/inspector.js`
- Modify: `net-quest/app.js`, `net-quest/style.css`, `net-quest/index.html` (script order: `shared/*`, `engine/*` in harness order, `content/*`, `ui.js`, `inspector.js`, `app.js`), `tests/smoke.mjs`

**Interfaces:**
- Consumes: `NQ.createNet`, `Net.exec`, `NQ.runMission` pieces (`makeCtx`), `NQ.CH`, `NQ.RANKS`, `HowSteps.html`.
- Produces: state saved under `net-quest-v1` as `{ch, mi, done: {[key]: true}, xp, badges, tab, answers}`; load tolerates unknown keys and wrong shapes (**Review Focus 5**: falls back to a fresh state, never throws). Terminal: prompt `laptop:~$`, history with up/down arrows, Enter runs `net.exec`, after each command the mission check runs and, if true and not already done, awards XP once (never celebrate a finished mission twice; failed commands never complete a mission). "Reset scenario" button rebuilds the net from the mission. Inspector: list of the last command's `entries` (time, device, direction, verdict, layer names); selecting one shows a table of layers and fields, a hex dump (`pkt.hex`) and highlights the path in the diagram; arrow keys move through the list; question missions show an answer input above the list. Diagram: inline SVG built from `net.devices` (boxes for devices, lines for links), with a text list equivalent (`<ul>` of "laptop eth0 ↔ sw1 p1") readable by screen readers; nothing colour-only (shape and label as well).
- 390px: terminal and inspector are two toggle buttons over one panel; diagram collapses to the list.

- [ ] **Step 1: Failing browser test** in `tests/smoke.mjs` (`net-quest: ping shows a reply and an inspector entry`): open `net-quest/`, type `ping -c 1 10.0.0.3` in `#cmd`, press Enter; expect `#screen` to contain `1 packets transmitted, 1 received`, expect at least 4 inspector rows, click the first echo row and expect the layer table to contain `Ethernet`, `IPv4`, `ICMP`; a second test: finish mission 0.0 and expect the XP text to change exactly once even after running the command again; a third: seed `localStorage['net-quest-v1']` with `'{"done":5,"xp":"x"}'` and expect the page to load with no console errors.
- [ ] **Step 2:** Run `node tests/smoke.mjs`; expect the three new tests to FAIL.
- [ ] **Step 3:** Implement the three DOM files and styles (reuse the variables and classes of `ds-quest/style.css`; no new fonts).
- [ ] **Step 4:** Run `npm run check && npm test`. Expected: all pass, no console errors.
- [ ] **Step 5:** Look at the page in Playwright screenshots at 1280 and 390 wide; note what you saw in the PR (AGENTS.md "Before you open a PR").
- [ ] **Step 6: Commit** `feat(net): add terminal, packet inspector and diagram`.
- [ ] **Step 7:** Run the `pre-pr-check` skill, then open PR A titled `feat(net): add Network Quest foundation and chapter 1`.

---

## PR B: chapters 2 to 5

Each chapter is one task: write `content/ch-N-*.js`, add its `<script>` to `index.html` (append only), extend the lazy-answer cases in `content.test.mjs`, run the full suite, commit. All chapters must pass the generic tests from Task 10 without changing them. Missions are 5 to 7 each; goals below are the outcomes the `check` verifies.

### Task 12: Chapter 2, MAC and ARP (scenario `pair`/`office`)

- [ ] Outcomes: read your own MAC; trigger an ARP exchange and read the ARP table with `ip neigh`; delete a neighbour entry then `ping` again to see ARP repeat; add a static neighbour entry with a wrong MAC and see delivery fail, then fix it; answer which device learns MACs (question, computed from `sw1.macTable`); find the broadcast address. Checks run `ctx.ping` and inspect `ctx.addr`/neigh via the net.
- [ ] Commit `feat(net): add chapter 2, MAC and ARP`.

### Task 13: Chapter 3, IP addressing (scenario `pair`/`office`)

- [ ] Outcomes: give `phone` a working address with `ip addr add`; fix a mask typo; use `ipcalc` to answer how many hosts fit in a `/26` (question, computed with `NQ.ip.cidr`); tell private from public addresses (question set from `isPrivate`); fix a duplicate address; `/32` and `/31` edge case explanation. Fault setups use `setup` commands.
- [ ] Commit `feat(net): add chapter 3, IP addressing`.

### Task 14: Chapter 4, Routing and the gateway (scenario `office`)

- [ ] Outcomes: read `ip route`; fix a missing default route; fix a wrong gateway; `traceroute` to the server and name the second hop (question, computed); add a missing static route on `r1` (the learner repairs the router from the terminal: add `dev?: string` on `Mission`, meaning "the terminal runs on this device", default `net.me`, and have `runMission` and the UI honour it, with a test); spot a routing loop with `traceroute` (scenario `office` with `setup` pointing `r2` default at `r1`).
- [ ] Commit `feat(net): add chapter 4, routing and the gateway`.

### Task 15: Chapter 5, NAT and public networks (scenario `home`)

- [ ] Outcomes: ping the public web server from `laptop`; read the translated source address in the inspector (question, computed); explain why `web` cannot ping `laptop` (question, multiple fixed keywords accepted from a computed reason string); restore a deleted default route on `home`; understand a private-source drop on `isp` after NAT is removed and fix by re-adding it (needs a `nat` command or `ip`-style toggle: add `nat on|off` to `cmds-ip.js` with its own tests in this task).
- [ ] Commit `feat(net): add chapter 5, NAT and public networks`.

### Task 16: Quick-fire, guide, ranks, docs, final checks

- [ ] Extend `extras.js` to at least 3 quick-fire questions and 1 guide entry per chapter; set landing-card chapter count; README/AGENTS final wording.
- [ ] Play every chapter once in a browser (`playtest` skill), 1280 and 390 wide; run `review-mission` on the diff; run `pre-pr-check`; open PR B titled `feat(net): add chapters 2 to 5`.

---

## Self-review

- **Spec coverage:** engine (Tasks 2 to 7), editing commands (8), commands (8, 9, 15), missions/checks/inspector questions/fix-it/solvability (10 to 15), UI/diagram/390px/accessibility/progress (11), testing list (tests inside each task; smoke and golden in 1 and 11), wiring (1, 16), delivery split (PR split), roadmap untouched. The golden test the spec calls for is the `ping` browser test in Task 11.
- **Naming consistency:** `NQ.ip`, `NQ.pkt`, `NQ.sim`, `NQ.CMDS`, `NQ.CH`, `NQ.makeCtx`, `NQ.runMission`, `Net.exec/clone/reset` are used the same way in every task. Reasons are the fixed strings from Task 5 plus `'no nat mapping'` and `'private source'` (Task 7).
- **Spec open question:** the subnet helper is `ipcalc` (real tool name), decided in Task 9.
- **Spec addition to flag:** the plan adds an optional `dev` field on `Mission` (Task 14) and a `nat on|off` command (Task 15), both needed by the fix-it missions; the spec did not name them.
