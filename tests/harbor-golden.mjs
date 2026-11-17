// Golden transcript of Harbor Quest: plays every mission via "Fill it in for me", then fixed probe lines, two puzzles,
// the progress export, UI probes and "Reset all progress", and compares the lot to fixtures. Refactors must keep it green.
// Rewrite fixtures deliberately with: node tests/harbor-golden.mjs --update
// Run under another host timezone with: node tests/harbor-golden.mjs --tz Asia/Kolkata (must give the same output).
// Set PW_CHROMIUM to use a specific Chromium binary.
//
// Determinism choices (all in the page, so the transcript does not depend on the host):
//  - Context: timezoneId 'UTC', locale 'en-US', viewport 1280x800. stamp() (log timestamps) and `date` read local-time getters,
//    so the zone is fixed; clf(), dt() and the `date` of a container use UTC and are already stable.
//  - Date.now is frozen. Time moves only through __hq.skip: 8 x skip(250) before every attempt and probe, mirroring `wait`
//    in tests/harbor/solvability.test.mjs. The 100 ms quick-fire timer stays real but reads the frozen clock, so it never expires.
//  - Math.random is a seeded generator (container ids, pod hashes, pod placement, image sizes, quick-fire order, puzzle shuffles).
//  - setInterval with delay 250 (the world tick) is a no-op; setTimeout stays real (editor open after `edit`, 400 ms save).
//  - The other nondeterminism sources in the harbor-quest scripts, and what controls them: Intl/toLocale*/navigator/innerWidth/performance/crypto
//    are not used; `new Date(` always receives now() or a stored timestamp; matchMedia('(pointer:fine)') only decides focus.
//  - The export's savedAt (the only wall-clock field of the envelope) is deleted.
// Not driven through real interaction (injected through __hq.S, then persisted):
//  - insideLost: no command deletes the pod you are inside, so the probe execs into a pod, marks it Terminating via __hq.S, and
//    skips 8 x 250 ms; the sys line and the prompt are recorded.
// Files written through the editor after the export (so the export stays the course's own state): Dockerfile.dot (COPY . .),
// pod.yaml (a Pod with an env list), bad.yaml (a selector that does not match its template) and a compose.yaml with an
// environment list. The course files never reach those build, apply and compose branches.
// Coverage: a throwaway page.coverage run over the harbor-quest scripts (app.js, ui.js, engine/*.js, content/*.js) against this
// golden listed every function never called. The probes above were extended until only these were left, none of which a probe
// line can reach:
//  - ev and fixHdr (both engine/k8s.js): dead code, never referenced.
//  - the combined-short-flag splitter in the mission-check normaliser (content/quickfire.js, `-dp` to `-d -p`): it runs only for
//    the current mission's check, and checkMission (ui.js) returns early for a finished mission.
// Not run: the quick-fire score-bonus path (stopFire with a score), which would change XP and S.best.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
if (args.includes('--tz')) process.env.TZ = args[args.indexOf('--tz') + 1];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = path.join(ROOT, 'tests/fixtures/harbor-golden.json');
const PROGRESS = path.join(ROOT, 'tests/fixtures/harbor-progress-complete.json');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

// {pod0}, {pod1} and {pod1ip} are running pods of the default namespace, {cid4} is the short id of container probe4;
// all are filled from the live world just before the line is sent.
// '@insideLost' marks the pod you are inside as Terminating and lets the clock run, instead of typing a line.
const PROBES = [
  'help', 'clear', 'frobnicate', 'history', 'date', 'pwd', 'whoami', 'hostname', 'uname',
  'cat shop.yaml', 'cat nofile.txt', 'echo hello', 'touch probe.txt', 'ls', 'ls -la', 'rm probe.txt', 'rm nofile.txt',
  'curl localhost:8080', 'curl localhost:9', 'curl', 'sudo ls', 'kind get clusters', 'edit probe.txt',
  'docker','docker --version', 'docker version', 'docker info', 'docker bogus', 'docker ps -q',
  'docker pull nginx:alpine', 'docker pull nosuchimage',
  'docker run -d --name probe1 -p 9091:80 nginx:alpine', 'docker run -d --name probe1 nginx', 'docker run --rm -p 9090:80 nginx:alpine', 'docker run nosuchimage', 'docker run --rm alpine echo hi',
  'docker run -d alpine echo hi', 'docker run -itd --name probe5 alpine', 'docker run -it --name probe6 alpine sh', 'echo hi', 'exit', 'docker run --name pgx postgres', 'docker run --name fg nginx:alpine',
  'docker logs probe1', 'docker logs ghost', 'docker exec probe1 ls /', 'docker exec ghost ls', 'docker inspect probe1', 'docker inspect ghost',
  'docker stop probe1', 'docker start probe1', 'docker restart probe1', 'docker kill probe1', 'docker rm probe1', 'docker rm ghost',
  'docker network create probenet', 'docker network create probenet', 'docker network inspect probenet', 'docker network rm probenet', 'docker network rm ghost',
  'docker volume create probevol', 'docker volume inspect probevol', 'docker volume rm probevol', 'docker volume rm ghost',
  'docker build -t probe:1 .', 'docker build', 'docker tag probe:1 probe:2', 'docker tag ghost:1 x:1', 'docker push probe:2', 'docker push ghost',
  'docker login', 'docker logout', 'docker history probe:1', 'docker history ghost', 'docker rmi probe:2', 'docker rmi ghost',
  'docker network create probenet2', 'docker run -d --name probe2 --network probenet2 nginx:alpine', 'docker network inspect probenet2', 'docker network ls',
  'docker volume create probevol2', 'docker volume ls', 'docker volume prune',
  'docker container ls', 'docker image ls', 'docker system df', 'docker system prune', 'docker container prune',
  // inside a container: the container shell's file commands
  'docker run -d --name probe4 -e A=b -v probevol2:/data nginx:alpine', 'docker inspect probe4', 'docker inspect nginx:alpine', 'docker logs {cid4}', 'docker tag probe:1 me/probe:3', 'docker login', 'docker push me/probe:3', 'docker logout',
  'docker exec -it probe4 sh', 'pwd', 'ls /etc/nginx', 'ls -l /etc/nginx', 'touch /data/a.txt', 'ls /data', 'cat /data/a.txt', 'rm /data/a.txt', 'ls /data', 'cd /tmp', 'touch a.txt', 'mkdir d', 'ls', 'cat a.txt', 'cat nofile', 'rm a.txt', 'rm nofile', 'echo hi', 'env', 'ps', 'whoami', 'hostname', 'curl localhost', 'ping -c 1 localhost', 'apt-get update', 'sleep 1', 'date', 'nginx', 'node', 'redis-cli ping', 'frobnicate', 'help', 'exit',
  'docker compose', 'docker compose ps', 'docker compose logs', 'docker compose config', 'docker compose bogus', 'docker compose build', 'docker compose stop', 'docker compose down -v', 'docker compose up -d', 'docker stop shop-web-1', 'docker compose up -d',
  'kubectl','kubectl version', 'kubectl cluster-info', 'kubectl config current-context', 'kubectl bogus', 'kubectl top', 'kubectl edit',
  'kubectl get pods -o wide', 'kubectl get pods -o name', 'kubectl get pods ghost', 'kubectl get deploy ghost', 'kubectl get svc ghost', 'kubectl get cm ghost',
  'kubectl get deploy web -o yaml', 'kubectl get svc web -o yaml', 'kubectl get pod {pod0} -o yaml', 'kubectl get pods -n kube-system', 'kubectl get pods -l app=web', 'kubectl get nodes', 'kubectl get ns', 'kubectl get cm', 'kubectl get endpoints', 'kubectl get events', 'kubectl get all', 'kubectl get rs', 'kubectl get svc -A', 'kubectl get nope',
  'kubectl describe pod {pod0}', 'kubectl describe deploy web', 'kubectl describe svc web', 'kubectl describe node harbor-worker', 'kubectl describe pod ghost',
  'kubectl create deployment probe --image=nginx', 'kubectl create deployment probe --image=nginx', 'kubectl create namespace probens', 'kubectl create configmap pcm --from-literal=a=b',
  'kubectl get pods -n probens', 'kubectl get cm', 'kubectl describe cm pcm', 'kubectl describe ns probens', 'kubectl create deployment inner --image=nginx -n probens', 'kubectl get all -n probens',
  'kubectl run probepod --image=nginx', 'kubectl run probepod --image=nginx',
  'kubectl scale deployment probe --replicas=2', 'kubectl scale deployment ghost --replicas=2',
  'kubectl expose deployment probe --port=80', 'kubectl expose deployment ghost --port=80', 'curl probe', 'kubectl get svc -o wide',
  'kubectl set image deployment/probe nginx=nginx:1.26', 'kubectl set image deployment/ghost nginx=nginx:1.26', 'kubectl set image deployment/probe nginx=nginx:1.99', 'kubectl describe deploy probe',
  'kubectl rollout status deployment/probe', 'kubectl rollout history deployment/probe', 'kubectl rollout history deployment/probe --revision=1', 'kubectl rollout undo deployment/probe --to-revision=1', 'kubectl rollout undo deployment/ghost',
  'kubectl rollout restart deployment/probe', 'kubectl rollout status deployment/ghost', 'kubectl describe deploy probe',
  'kubectl logs {pod0}', 'kubectl logs ghost', 'kubectl logs -l app=web', 'kubectl logs deployment/web', 'kubectl exec {pod0} -- ls', 'kubectl exec ghost -- ls',
  'kubectl port-forward svc/web 9292:80', 'kubectl port-forward svc/ghost 9292:80', 'kubectl port-forward pod/{pod0} 9393:80', 'curl localhost:9292', 'curl localhost:9393',
  'kubectl apply -f missing.yaml', 'kubectl apply -f shop.yaml', 'kubectl delete pod ghost', 'kubectl delete pod {pod1}', 'kubectl delete deployment probe', 'kubectl delete deployment ghost',
  'kubectl delete svc probe', 'kubectl delete pods -l app=nothing', 'kubectl expose pod probepod --port=80', 'kubectl expose pod ghost --port=80', 'kubectl delete pod probepod',
  'kubectl create configmap nscm --from-literal=a=b -n probens',
  'kubectl create namespace probens2', 'kubectl create deployment inner2 --image=nginx -n probens2', 'kubectl delete deployment --all -n probens2', 'kubectl delete pods --all -n probens2',
  'kubectl expose deployment inner --port=80 -n probens', 'kubectl delete namespace probens', 'kubectl get cm pcm -o yaml', 'k get pods',
  // inside a pod: resolveFrom's pod branch (service name, pod IP, ping) and the HIT flash
  'kubectl exec -it {pod0} -- sh', 'hostname', 'curl web', 'curl web:80', 'curl {pod1ip}', 'curl nosuch', 'ping -c 2 web', 'ping -c 2 {pod1ip}', 'ping nosuch', 'exit',
  // the pod you are inside disappears
  'kubectl exec -it {pod0} -- sh', '@insideLost',
];

// Reference solutions of the first Dockerfile and YAML puzzles (PZ_DF[0], PZ_Y[0]).
const DF0 = ['FROM python:3.12-slim', 'WORKDIR /app', 'COPY requirements.txt .', 'RUN pip install -r requirements.txt', 'COPY . .', 'EXPOSE 5000', 'CMD ["python", "app.py"]'];
const Y0 = ['Deployment', '3', 'web', 'nginx:1.27'];

const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }).end(fs.readFileSync(p));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-harbor-golden-'));

let failed = null;
try {
  const ctx = await browser.newContext({ acceptDownloads: true, timezoneId: 'UTC', locale: 'en-US', viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    const T0 = Date.UTC(2026, 0, 1);
    Date.now = () => T0;
    let s = 0x9e3779b9;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const si = window.setInterval.bind(window);
    window.setInterval = (f, ms, ...a) => (ms === 250 ? 0 : si(f, ms, ...a));
    // Every line added to the terminal, in order; the screen is capped at 600 lines and `clear` empties it, so counting DOM nodes is not enough.
    window.__lines = [];
    new MutationObserver(ms => {
      for (const m of ms) if (m.target.id === 'screen') for (const n of m.addedNodes) window.__lines.push(n.textContent);
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(`${base}/programming/harbor-quest/`);
  await page.waitForSelector('#cmd');

  const text = async sel => (await page.textContent(sel)).trim();
  const mark = () => page.evaluate(() => window.__lines.length);
  const since = n => page.evaluate(n => window.__lines.slice(n), n);
  const wait = () => page.evaluate(() => { for (let i = 0; i < 8; i++) window.__hq.skip(250); });
  const status = async () => ({
    xpText: await text('#xpText'), rank: await text('#rank'),
    badges: await page.evaluate(() => Object.keys(window.__hq.S.badges).length),
  });

  const missions = [];
  const counts = await page.evaluate(() => window.__hq.CH.map(c => c.missions.length));
  for (let ch = 0; ch < counts.length; ch++) {
    await page.click(`.chap[data-ch="${ch}"]`);
    for (let mi = 0; mi < counts[ch]; mi++) {
      const at = await page.evaluate(() => window.__hq.S.mi);
      assert.equal(at, mi, `chapter ${ch}: the quest is at mission ${at}, expected ${mi}`);
      const title = await text('#mission h2');
      let done = false;
      for (let attempt = 0; attempt < 6 && !done; attempt++) {
        await wait();
        const n = await mark();
        await page.click('#mission button[data-act="show"]');
        const typed = await page.inputValue('#cmd');
        await page.press('#cmd', 'Enter');
        if (/^edit /.test(typed)) {
          assert.equal(typed, 'edit shop.yaml', `no scripted edit for "${typed}"`);
          await page.waitForSelector('#editor:not([hidden])');
          await page.fill('#edText', (await page.inputValue('#edText')).replace('replicas: 2', 'replicas: 4'));
          await page.click('#edSave');
        }
        missions.push({ chapter: ch, mission: mi, attempt, title, typed, output: (await since(n)).join('\n'), ...(await status()) });
        done = await page.evaluate(([c, m]) => !!window.__hq.S.done[c + '.' + m], [ch, mi]);
      }
      assert.ok(done, `chapter ${ch} mission ${mi} "${title}" did not complete in 6 attempts`);
    }
    assert.deepEqual(errors, [], `page errors in chapter ${ch}`);
  }

  const probes = [];
  const probe = async raw => {
    const live = await page.evaluate(() => {
      const pods = window.__hq.S.k.pods.filter(p => !p.sys && p.ns === 'default' && p.phase === 'Running');
      return { pod0: pods[0]?.name, pod1: pods[1]?.name, pod1ip: pods[1]?.ip, cid4: window.__hq.S.d.containers.find(c => c.name === 'probe4')?.id.slice(0, 6) };
    });
    const line = raw.replace(/\{(pod0|pod1|pod1ip|cid4)\}/g, (_, k) => live[k]);
    const n = await mark();
    if (line === '@insideLost') {
      await page.evaluate(() => { const S = window.__hq.S; S.k.pods.find(p => p.name === S.inside.id).phase = 'Terminating'; });
      await wait();
    } else {
      await wait();
      await page.evaluate(l => window.__hq.run(l), line);
    }
    probes.push({
      line, output: (await since(n)).join('\n'),
      prompt: await text('#prompt'), where: await text('#where'),
      hit: await page.locator('#view .hit').count(),
      ...(await status()),
    });
    // `edit` opens the editor after 30 ms; close it so the next probe starts from the terminal.
    if (/^(edit|nano|vim|vi|code|open) /.test(line)) {
      await page.waitForSelector('#editor:not([hidden])');
      await page.press('#edText', 'Escape');
    }
  };
  for (const p of PROBES) await probe(p);
  assert.deepEqual(errors, [], 'page errors in probes');

  const puzzles = [];
  await page.click('#t-puz');
  const poolClick = async line => {
    const idx = await page.evaluate(l => [...document.querySelectorAll('#pzDf [data-pool]')].findIndex(b => b.textContent === l), line);
    assert.ok(idx >= 0, `no piece "${line}"`);
    await page.click(`#pzDf [data-pool="${idx}"]`);
  };
  await poolClick(DF0[1]);
  await page.click('[data-pz="dfcheck"]');
  puzzles.push({ puzzle: 'df0 wrong', fb: await text('#pzDf .fb'), ...(await status()) });
  await page.click('#pzDf [data-placed="0"]');
  for (const l of DF0) await poolClick(l);
  await page.click('[data-pz="dfcheck"]');
  puzzles.push({ puzzle: 'df0 solved', fb: await text('#pzDf .fb'), ...(await status()) });
  await page.selectOption('#pzsel0', 'Pod');
  await page.click('[data-pz="ycheck"]');
  puzzles.push({ puzzle: 'y0 wrong', fb: await text('#pzY .fb'), ...(await status()) });
  for (let k = 0; k < Y0.length; k++) await page.selectOption(`#pzsel${k}`, Y0[k]);
  await page.click('[data-pz="ycheck"]');
  puzzles.push({ puzzle: 'y0 solved', fb: await text('#pzY .fb'), ...(await status()) });
  assert.deepEqual(errors, [], 'page errors in puzzles');

  await page.click('#t-quest');
  await page.click('.pg-trigger');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Export to file')]);
  const exported = path.join(tmp, 'progress.json');
  await dl.saveAs(exported);
  const progress = JSON.parse(fs.readFileSync(exported, 'utf8'));
  // savedAt is the only wall-clock field in the export envelope.
  delete progress.savedAt;

  // UI probes: handlers no other test reaches. They run after the export, so they cannot change the fixture.
  const ui = {};
  await page.keyboard.press('Escape'); // closes the progress panel left open by the export

  const val = () => page.inputValue('#cmd');
  const tab = async v => {
    await page.fill('#cmd', v);
    const n = await mark();
    await page.press('#cmd', 'Tab');
    return { cmd: await val(), lines: await since(n) };
  };
  ui.tab = {};
  for (const v of ['doc', 'kubectl ', 'k ', 'docker ','docker compose ', 'docker network ', 'kubectl get ', 'kubectl get po', 'kubectl rollout ', 'kubectl delete ', 'kubectl describe svc w', 'ls Doc', 'cat ', 'web']) ui.tab[v] = await tab(v);
  await page.evaluate(() => window.__hq.run('docker exec -it web sh'));
  ui.tabInside = {};
  for (const v of ['c', 'ls /us', 'cat /etc/ng']) ui.tabInside[v] = await tab(v);
  await page.evaluate(() => window.__hq.run('exit'));
  await page.fill('#cmd', 'docker ps');
  ui.keys = {};
  // The extra-keys bar is hidden on a desktop viewport, so its buttons get a dispatched click.
  const key = k => page.dispatchEvent(`#keys [data-k="${k}"]`, 'click');
  await key('--');
  ui.keys.dashes = await val();
  await key('UP');
  ui.keys.up = await val();
  await key('TAB');
  ui.keys.tab = await val();
  const kn = await mark();
  await page.fill('#cmd', 'pwd');
  await key('ENTER');
  ui.keys.enter = await since(kn);
  await page.press('#cmd', 'ArrowUp');
  await page.press('#cmd', 'ArrowUp');
  ui.keys.arrowUp2 = await val();
  await page.press('#cmd', 'ArrowDown');
  ui.keys.arrowDown = await val();
  await page.fill('#cmd', 'half typed');
  const cn = await mark();
  await page.press('#cmd', 'Control+c');
  ui.keys.ctrlC = { cmd: await val(), lines: await since(cn) };
  await page.press('#cmd', 'Control+l');
  ui.keys.ctrlL = await page.locator('#screen .line').count();
  await page.click('#term');

  const en = await mark();
  await page.fill('#cmd', 'edit notes.txt');
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#editor:not([hidden])');
  await page.fill('#edText', 'one');
  await page.press('#edText', 'End');
  await page.press('#edText', 'Tab');
  await page.keyboard.type('two');
  await page.press('#edText', 'Control+s');
  await page.fill('#cmd', 'edit notes.txt');
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#editor:not([hidden])');
  ui.editor = { name: await text('#edName'), text: await page.inputValue('#edText') };
  await page.click('#edCancel');
  ui.editor.lines = await since(en);
  ui.editor.file = await page.evaluate(() => window.__hq.S.files['notes.txt']);
  const writeFile = async (name, body) => {
    await page.fill('#cmd', `edit ${name}`);
    await page.press('#cmd', 'Enter');
    await page.waitForSelector('#editor:not([hidden])');
    await page.fill('#edText', body);
    await page.click('#edSave');
  };
  const runAll = async lines => {
    const n = await mark();
    for (const l of lines) { await wait(); await page.evaluate(l => window.__hq.run(l), l); }
    return since(n);
  };
  await writeFile('Dockerfile.dot', 'FROM node:20-alpine\nCOPY . .\nCMD ["node", "app.js"]'); // COPY of the whole folder
  ui.buildDot = await runAll(['docker build -f Dockerfile.dot -t dot:1 .']);
  await writeFile('pod.yaml', 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: ypod\nspec:\n  containers:\n    - name: app\n      image: nginx\n      env:\n        - name: GREETING\n          value: hello');
  ui.applyPod = await runAll(['kubectl apply -f pod.yaml', 'kubectl apply -f pod.yaml', 'kubectl describe pod ypod']);
  await writeFile('bad.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: bad\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: bad\n  template:\n    metadata:\n      labels:\n        app: other\n    spec:\n      containers:\n        - name: c\n          image: nginx');
  ui.applyBad = await runAll(['kubectl apply -f bad.yaml']);
  await writeFile('compose.yaml', 'services:\n  web:\n    image: nginx:alpine\n    environment:\n      - MODE=probe');
  ui.composeEnvList = await runAll(['docker compose down', 'docker compose up -d', 'docker compose down']);

  ui.view = {};
  for (const v of ['k8s', 'docker']) {
    await page.click(`#vseg [data-v="${v}"]`);
    ui.view[v] = { title: await text('#vTitle'), pressed: await page.getAttribute(`#v${v === 'k8s' ? 'K8s' : 'Docker'}`, 'aria-pressed') };
    for (const sel of ['[data-pod]', '[data-ctr]', '[data-fill]']) {
      if (!(await page.locator(`#view ${sel}`).count())) continue;
      await page.click(`#view ${sel}`);
      ui.view[v][sel] = await val();
    }
  }

  const fills = await page.evaluate(() => window.__hq.CH.flatMap((c, ci) => c.missions.flatMap((m, mi) => (m.fill ? [{ ci, mi, pod: !!m.fill.pod, ctr: !!m.fill.ctr }] : []))));
  ui.fills = [];
  for (const f of fills) {
    await page.click(`#chapters [data-ch="${f.ci}"]`);
    await page.click(`#mission [data-mi="${f.mi}"]`);
    for (const [kind, sel, v] of [['pod', '[data-pod]', 'k8s'], ['ctr', '[data-ctr]', 'docker']]) {
      if (!f[kind]) continue;
      await page.click(`#vseg [data-v="${v}"]`);
      const has = await page.locator(`#view ${sel}`).count();
      if (has) await page.click(`#view ${sel}`);
      ui.fills.push({ ...f, kind, has, cmd: has ? await val() : null });
    }
  }

  await page.click('#chapters [data-ch="0"]');
  await page.click('#mission [data-mi="0"]');
  const hintState = async () => ({ btn: await text('#mission [data-act="hint"]'), hint: await page.locator('#mission .hint').count() ? await text('#mission .hint') : null });
  await page.click('#mission [data-act="hint"]');
  ui.hint1 = await hintState();
  await page.click('#mission [data-act="hint"]');
  ui.hint2 = await hintState();

  await page.click('#t-fire');
  ui.fireIdle = await text('#fStage');
  await page.click('#fStart');
  await page.waitForTimeout(250); // lets the real 100 ms timer fire; the frozen clock keeps the time at 75
  ui.fireStart = { task: await text('#fTask'), score: await text('#fScore'), time: await text('#fTime') };
  await page.click('#fSkip');
  ui.fireSkip = { fb: await text('#fFb'), task: await text('#fTask'), streak: await text('#fStreak') };
  await page.fill('#fIn', 'definitely not a command');
  await page.press('#fIn', 'Enter');
  ui.fireWrong = { fb: await text('#fFb'), task: await text('#fTask'), score: await text('#fScore'), streak: await text('#fStreak') };
  // Skipping through the whole pool reshuffles the order once (showQ wraps), so count the skips until the first task comes back.
  const first = ui.fireStart.task;
  ui.fireWrapAfter = 0;
  while (ui.fireWrapAfter < 500) {
    await page.click('#fSkip');
    ui.fireWrapAfter++;
    if ((await text('#fTask')) === first) break;
  }
  await page.click('#fStop');
  ui.fireOver = { stage: await text('#fStage'), score: await text('#fScore'), streak: await text('#fStreak'), best: await text('#fBest'), ...(await status()) };

  await page.click('#t-quest');
  const rn = await mark();
  await page.click('#resetWorld');
  ui.resetArmed = await text('#resetWorld');
  await page.waitForTimeout(4100); // the arming times out on a real 4 s timer
  ui.resetDisarmed = await text('#resetWorld');
  await page.click('#resetWorld');
  await page.click('#resetWorld');
  ui.resetWorld = { btn: await text('#resetWorld'), lines: await since(rn), ...(await status()), view: await text('#view') };
  assert.deepEqual(errors, [], 'page errors in the UI probes');

  await page.click('#t-guide');
  await page.click('#wipeAll');
  const wipeArmed = await text('#wipeAll');
  await page.click('#wipeAll');
  const reset = {
    wipeArmed, ...(await status()),
    saved: await page.evaluate(() => JSON.parse(localStorage.getItem('harbor-quest-v1'))),
    firstLine: await text('#screen .line'),
    tab: await page.evaluate(() => document.querySelector('#tab-quest').hidden),
  };
  assert.deepEqual(errors, []);

  const golden = { chapters: counts, missions, probes, puzzles, ui, reset };
  if (UPDATE) {
    fs.writeFileSync(GOLDEN, JSON.stringify(golden, null, 2) + '\n');
    fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2) + '\n');
    console.log(`wrote ${missions.length} mission steps, ${probes.length} probes; xp=${progress.data?.xp}, badges=${Object.keys(progress.data?.badges || {}).length}`);
  } else {
    assert.deepEqual(golden, JSON.parse(fs.readFileSync(GOLDEN, 'utf8')), 'transcript differs from golden');
    assert.deepEqual(progress, JSON.parse(fs.readFileSync(PROGRESS, 'utf8')), 'progress export differs from golden');
    console.log(`ok: ${missions.length} mission steps and ${probes.length} probes match golden`);
  }
  await ctx.close();
} catch (e) { failed = e; }
await browser.close(); server.close(); fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(failed); process.exit(1); }
