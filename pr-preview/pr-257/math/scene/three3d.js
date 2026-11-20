// 3D scenes. One shared WebGLRenderer per page (browsers cap live WebGL contexts); its canvas moves into whichever scene is shown.
(() => {
  const MQ = globalThis.MQ = globalThis.MQ || {};
  const T = MQ.three3d = {};
  let renderer = null, failed = false, current = null;
  const NOGL = '<p class="nogl">3D needs WebGL, which this browser has turned off. The sliders and formula still work.</p>';

  const getRenderer = () => {
    if (renderer || failed) return renderer;
    try {
      if (typeof WebGLRenderingContext === 'undefined') throw new Error('no WebGL');
      // preserveDrawingBuffer keeps the frame readable for screenshots and the browser test's readPixels check.
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    } catch (e) { failed = true; renderer = null; }
    return renderer;
  };

  const meshOf = (geo, color, term, opts) => {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, ...opts }));
    m.userData.term = term;
    return m;
  };

  const build = (def, state, colorOf) => {
    const g = new THREE.Group(), p = state.params;
    const terms = def.terms || ['a', 'b', 'c'];
    const color = t => new THREE.Color(t ? colorOf(t) : '#888888');
    let extent = 1;
    if (def.shape === 'box') {
      const [a, b, c] = def.size(p), e = 0.06;
      extent = Math.max(a, b, c);
      g.add(meshOf(new THREE.BoxGeometry(a, b, c), color(), null, { transparent: true, opacity: 0.3 }));
      [[0, a, [a, e, e]], [1, b, [e, b, e]], [2, c, [e, e, c]]].forEach(([axis, len, dims]) => {
        for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
          const m = meshOf(new THREE.BoxGeometry(...dims), color(terms[axis]), terms[axis]);
          const half = [a / 2, b / 2, c / 2];
          const pos = [0, 0, 0], others = [0, 1, 2].filter(i => i !== axis);
          pos[others[0]] = sy * half[others[0]];
          pos[others[1]] = sz * half[others[1]];
          m.position.set(...pos);
          g.add(m);
        }
      });
    } else if (def.shape === 'sphere') {
      extent = def.size(p);
      g.add(meshOf(new THREE.SphereGeometry(extent, 32, 16), color(def.term), def.term));
    } else if (def.shape === 'cylinder' || def.shape === 'cone') {
      const [r, h] = def.size(p);
      extent = Math.max(r, h);
      g.add(meshOf(def.shape === 'cone' ? new THREE.ConeGeometry(r, h, 32) : new THREE.CylinderGeometry(r, r, h, 32), color(def.term), def.term));
    } else if (def.shape === 'surface') {
      const n = 40, r = def.range || 3, pos = [], idx = [];
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
        const x = -r + 2 * r * i / n, y = -r + 2 * r * j / n, z = def.f(x, y, p);
        pos.push(x, Number.isFinite(z) ? z : 0, y);
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j; idx.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      extent = r;
      g.add(meshOf(geo, color(def.term), def.term, { side: THREE.DoubleSide }));
    } else if (def.shape === 'vector') {
      const v = new THREE.Vector3(...def.size(p));
      extent = v.length();
      const arrow = new THREE.ArrowHelper(v.clone().normalize(), new THREE.Vector3(), v.length(), color(def.term).getHex());
      arrow.traverse(o => { o.userData.term = def.term; });
      g.add(arrow);
    }
    return { group: g, extent };
  };

  const rec = new WeakMap();

  T.show = (host, def, state, colorOf, hooks = {}) => {
    const r = getRenderer();
    if (!r) { if (!host.querySelector('.nogl')) host.innerHTML = NOGL; return false; }
    let s = rec.get(host);
    if (!s) {
      const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 200);
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.4));
      const sun = new THREE.DirectionalLight(0xffffff, 2);
      sun.position.set(3, 5, 4);
      scene.add(sun);
      const controls = new THREE.OrbitControls(camera, r.domElement);
      s = { camera, scene, controls, group: null, hl: null, fitted: false };
      controls.addEventListener('change', () => T.render(host));
      rec.set(host, s);
    }
    if (current !== host) {
      if (current) rec.get(current).controls.enabled = false;
      host.replaceChildren(r.domElement);
      r.domElement.style.cssText = 'width:100%;display:block;touch-action:none';
      s.controls.enabled = true;
      current = host;
    }
    s.def = def; s.colorOf = colorOf;
    if (s.group) { s.scene.remove(s.group); s.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); }
    const built = build(def, state, colorOf);
    s.group = built.group;
    s.scene.add(s.group);
    if (!s.fitted || built.extent > s.extent) {
      const d = built.extent * 1.6 + 1.5;
      s.camera.position.set(d * 0.8, d * 0.6, d);
      s.controls.update();
      s.fitted = true;
    }
    s.extent = built.extent;
    if (!s.bound) {
      s.bound = true;
      const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
      r.domElement.addEventListener('pointermove', e => {
        if (current !== host) return;
        const b = r.domElement.getBoundingClientRect();
        ndc.set((e.clientX - b.left) / b.width * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
        ray.setFromCamera(ndc, s.camera);
        const hit = ray.intersectObjects(s.group.children, true).find(h => h.object.userData.term);
        const term = hit ? hit.object.userData.term : null;
        if (term !== s.hover) { s.hover = term; hooks.onHover && hooks.onHover(term); }
      });
      new ResizeObserver(() => T.render(host)).observe(host);
    }
    T.render(host);
    return true;
  };

  T.highlight = (host, term) => {
    const s = rec.get(host);
    if (!s || !s.group) return;
    s.hl = term;
    T.render(host);
  };

  T.render = host => {
    const s = rec.get(host);
    if (!renderer || !s || current !== host) return;
    const w = host.clientWidth || 300, h = Math.round(w * 0.75);
    renderer.setSize(w, h, false);
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
    s.group.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.set(s.hl && o.userData.term === s.hl ? 0x666666 : 0x000000); });
    renderer.render(s.scene, s.camera);
  };

  T.hide = host => {
    if (current === host && renderer) { renderer.domElement.remove(); current = null; }
  };

  // Client coordinates of the visible edge mesh of a term nearest the camera, for tests that hover it.
  T.screenOf = (host, term) => {
    const s = rec.get(host);
    if (!s || !s.group || !renderer || current !== host) return null;
    s.camera.updateMatrixWorld();
    const ms = s.group.children.filter(o => o.userData.term === term);
    if (!ms.length) return null;
    const v = ms.map(o => o.position.clone()).sort((a, b) => a.distanceTo(s.camera.position) - b.distanceTo(s.camera.position))[0].project(s.camera);
    const r = renderer.domElement.getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  };

  T.state = host => {
    const s = rec.get(host);
    if (!s || !s.group) return { webgl: !!renderer, meshes: 0 };
    const size = new THREE.Box3().setFromObject(s.group).getSize(new THREE.Vector3());
    return { webgl: !!renderer, meshes: s.group.children.length, size: [size.x, size.y, size.z] };
  };
})();
