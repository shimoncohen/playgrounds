# Network Quest (`net-quest/`) design

Date: 2026-10-20. Status: draft for review.

## Goal

A new playground that teaches networking by doing: addressing (IP, MAC), local vs public networks, DNS, the layer models, packets, and protocols (TCP, UDP, HTTP/1.1/2/3, HTTPS/TLS, gRPC and more). Same quest format as the others: chapters of missions with honest checks, quick-fire, field guide, XP and ranks.

Learners work in a **simulated terminal** (`ip`, `ping`, `traceroute`, later `dig`, `curl`, `nc`) against a **simulated network**, and read what happened in a **packet inspector** (Wireshark-style layer view). Nothing touches the real network.

## Decisions

- **One playground, many chapters**, not several playgrounds. Topics build on each other (encapsulation, TCP, HTTP, then HTTP/3 over QUIC over UDP) and share one simulation engine. Revisit a split only if the quest grows past about 8 chapters.
- **Hybrid interaction**: simulated terminal plus packet inspector.
- **Learners can edit the topology** (addresses, routes, link state, ARP entries), not just observe it.
- **Phased delivery.** This spec's build is phase 1 only: foundation and addressing. Later phases get their own plan and PR.
- **Own small engine**, not Shell Quest's interpreter. Shell Quest's engine is a full bash implementation tied to a global, and the bundler inlines only a quest's own files plus `shared/`. Reusing it would need a refactor of a shipped quest (out of scope, risks the golden fixtures).

## Scope

In scope (phase 1): engine, terminal, inspector, topology diagram, chapters 1 to 5, quick-fire, field guide, ranks, tests, repo wiring.

Out of scope (later phases): DNS, TCP/UDP, HTTP/TLS, HTTP/2, HTTP/3/QUIC, gRPC, WebSockets. The engine is built so these add layers to `packets.js` and new commands, not rewrites.

## Engine (`net-quest/engine/`, DOM-free, runs in Node)

- **Topology** (`topology.js`): data. Hosts, switches, routers with interfaces (MAC, IP/prefix, up/down), routes, ARP tables, and a NAT edge to a "public" side. Each mission names a **scenario** (a small prebuilt topology, possibly seeded with a fault).
- **Simulator** (`sim.js`): moves a packet hop by hop and appends every step to a **packet log**: time, device, layer-by-layer headers, verdict (forwarded, delivered, dropped with reason, NAT-rewritten). Handles ARP, ICMP echo, TTL expiry, switching, routing, NAT. Deterministic: no randomness, fake clock.
- **Packets** (`packets.js`): header structures per layer and their hex encoding. Phase 1: Ethernet, ARP, IPv4, ICMP.
- **Commands** (`cmds-*.js`, `shell.js`): a small parser (quotes, flags, `|` into `grep` and `head`). Phase 1 commands: `ip addr`, `ip route`, `ip neigh`, `ip link`, `ping`, `traceroute`, `arping`, a subnet helper, `help`.
- **Editing**: `ip addr add/del`, `ip route add/del`, `ip link set up/down`, `ip neigh add/del`. State is per mission; "reset scenario" restores it.
- Engine files must not touch the DOM or `window`. DOM code lives in `ui.js`, `inspector.js`, `app.js`.

## Missions and checks

Mission shape follows the other quests (goal, `how` steps with the whole line explained first, then each part, chips, hint, explain, reference `answer`, `check`), plus a `scenario` name.

- **Checks run on simulated outcomes**, e.g. "a `ping` from `laptop` to `10.0.0.9` is delivered" or "`laptop` has a route to `192.168.1.0/24`". Each check runs a fresh probe against the learner's final topology, so typing a command that changes nothing cannot pass.
- **Inspector questions**: concept missions may ask about a packet ("what is the TTL after the router?"). The expected value is computed by the sim, never hardcoded, so engine changes cannot drift from content.
- **Fix-it missions**: the scenario starts broken (wrong gateway, mask typo, duplicate IP, interface down); the learner diagnoses and repairs it.
- Reference `answer` is a list of commands. The solvability test replays it and requires the check to pass; a "do nothing" run must fail it.

### Phase 1 chapters

Keys are `'<chapter>.<mission>'`; once shipped they are never renumbered, only appended. About 5 to 7 missions each.

1. **Layers and packets**: the 7-layer and 4-layer models, encapsulation, reading a packet in the inspector.
2. **MAC and ARP**: same-network delivery, switch behaviour, the ARP table.
3. **IP addressing**: addresses, prefixes, subnet maths, private vs public ranges.
4. **Routing and the gateway**: default route, `traceroute`, TTL, fix-it missions.
5. **NAT and public networks**: private-to-public translation, why the outside cannot start a connection in.

Also: quick-fire questions, field guide entries, a `RANKS` ladder with a fun top title. Learner text follows `mission-voice` and AGENTS rules 9 to 11 (whole line first, code in `<code>`, friendly tone, no unexplained prior knowledge).

## Files

```
net-quest/
  index.html  style.css  app.js        course arrays (CH, QF, GUIDE, RANKS), glue
  ui.js  inspector.js                  the only DOM files besides app.js
  engine/  topology.js sim.js packets.js shell.js cmds-*.js
  content/ ch-1-layers.js ch-2-mac-arp.js ch-3-ip.js ch-4-routing.js ch-5-nat.js
tests/net/*.test.mjs
```

Engine loads as a global namespace (like Shell Quest's `SQ`) via plain `<script src>` with relative paths, so it works from disk and on GitHub Pages and bundles with `tools/build.py`.

## UI

- Tabs: Quest, Quick-fire, Field guide. Shared header, XP bar, theme toggle, nav, and `HowSteps` cards.
- Desktop: mission card left; terminal above and inspector below (or side by side when wide). An inline SVG topology diagram highlights the path of the selected log entry.
- 390px wide: terminal and inspector stack with a toggle; the diagram collapses to a list; the input stays usable with the on-screen keyboard.
- Accessibility: inspector is a keyboard-navigable list and table; the diagram has a text equivalent; no colour-only meaning.
- Progress key `net-quest-v1` via `shared/progress.js`. Never renamed.

## Testing

Node (`tests/net/`, part of `npm run test:engine`):
- sim: ARP, same-subnet delivery, gateway, TTL expiry, NAT, drops
- commands: output format, errors, editing commands
- determinism: same inputs give the same log
- solvability for every mission, plus the "do nothing fails" test
- codestyle: learner text uses `<code>` for commands and fields
- content integrity: unique keys, every mission has `how`

Browser:
- add `net-quest` to the `tests/smoke.mjs` list (loads cleanly, tabs, progress export/import)
- one Playwright golden: `ping` in an early mission gives a reply and an inspector entry

Other gates: `python3 tools/build.py --check` bundles (no `</script` or `</style` in inlined files); `node --check` globs in `.github/workflows/ci.yml` extended for `net-quest/engine/*.js`, `net-quest/content/*.js`, `net-quest/*.js`, `tests/net/*.mjs`.

## Wiring (new-playground checklist)

Landing card in `index.html`; README table row and "Map of the repo"; `AGENTS.md` "Where things go" row; smoke list; CI glob. Per hard rules: no build step, no new runtime dependency, no fixture regeneration, one concern per PR.

## Delivery

Phase 1 is one PR for engine plus chapters 1 to 5. If review size is too large, split: (a) engine, terminal, inspector and chapter 1, then (b) chapters 2 to 5. CI and `commitlint` rules apply (Conventional Commits). CHANGELOG and versions untouched.

## Roadmap (separate specs/plans)

2. DNS: `dig`, resolver chain, record types, caching
3. Transport: UDP, TCP handshake, retransmit, ports, `nc`
4. HTTP/1.1, TLS/HTTPS: `curl`
5. HTTP/2, HTTP/3 with QUIC, gRPC, WebSockets and more

## Open questions

- Chapter 1 depends on the inspector, so chapter 1 and the inspector land together.
- Exact subnet helper name and flags (decide in the plan; keep real-tool-like).
