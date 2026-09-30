(function () {
  'use strict';
  const { useState, useEffect, useMemo, useRef, useCallback, useContext, createContext, Fragment } = React;
  const html = htm.bind(React.createElement);

  // ---------- Retro structure ----------
  const STAGES = [
    { key: 'assemble', name: 'Assemble', minutes: 5, hint: 'Check in with how ready you feel, then review the orders from the last mission.' },
    { key: 'brainstorm', name: 'Report in', minutes: 15, hint: "Write notes in all four sections. Everyone else's notes stay classified until the debrief." },
    { key: 'group', name: 'Debrief', minutes: 10, hint: 'Read the notes aloud. Drag a note onto a similar one, or use Stack, to group them.' },
    { key: 'vote', name: 'Vote', minutes: 5, hint: 'Give your stars to the items the squad should tackle first. Totals stay sealed until planning.' },
    { key: 'discuss', name: 'Plan the mission', minutes: 10, hint: 'Talk through the top-voted items and turn them into mission orders with an owner and a due date.' },
    { key: 'salute', name: 'Salute', minutes: 5, hint: 'Thank the heroes of this sprint, then copy or download the mission report.' },
  ];
  const STAGE_INDEX = {};
  STAGES.forEach((s, i) => { STAGE_INDEX[s.key] = i; });

  const SECTIONS = [
    { key: 'shield', name: 'The Shield', q: 'What protected us?', ph: 'A practice, tool or teammate that kept us safe…' },
    { key: 'serum', name: 'Super-Soldier Serum', q: 'What made us stronger?', ph: 'A win, a new skill, a moment we were at our best…' },
    { key: 'hydra', name: 'Hydra', q: 'What threatened the mission?', ph: 'A blocker, a recurring problem, a hidden risk…' },
    { key: 'next', name: 'Next Mission', q: 'What should we do next?', ph: 'An idea or commitment for the next sprint…' },
  ];
  const SECTION_INDEX = {};
  SECTIONS.forEach((s, i) => { SECTION_INDEX[s.key] = i; });

  const MOODS = [
    { key: 'ready', label: 'Battle-ready', level: 5 },
    { key: 'steady', label: 'Steady', level: 4 },
    { key: 'low', label: 'Running low', level: 3 },
    { key: 'wounded', label: 'Wounded', level: 2 },
    { key: 'down', label: 'Out of action', level: 1 },
  ];

  const PRACTICE_ID = 'practice-you';
  // True when the page runs as a plain website (for example GitHub Pages) instead of inside Claude.
  const STANDALONE = !(window.claude && typeof window.claude.use === 'function');
  const LS_DEMO = 'captains-shield.board';
  const LS_GUIDE = 'captains-shield.guide';
  const LS_MISSION = 'captains-shield.mission';
  const FACIL_MSG = 'Only people who can edit this page can run the mission controls.';
  const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  // ---------- Helpers ----------
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  function hash(s) { let h = 2166136261; const str = String(s || ''); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function trunc(s, n) { const str = String(s || ''); return str.length > n ? str.slice(0, n - 1).trimEnd() + '…' : str; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  const OP_A = ['Iron', 'Silver', 'Midnight', 'Northern', 'Crimson', 'Steady', 'Quiet', 'Rapid', 'Golden', 'Hidden', 'Steel', 'Liberty'];
  const OP_B = ['Harbor', 'Falcon', 'Lantern', 'Ridge', 'Anvil', 'Compass', 'Beacon', 'Sentinel', 'Meridian', 'Bridge', 'Summit', 'Owl'];
  function opName() { return 'Operation ' + pick(OP_A) + ' ' + pick(OP_B); }
  function nextSprint(label) { const m = /^(.*?)(\d+)\s*$/.exec(label || ''); return m ? m[1] + (Number(m[2]) + 1) : ''; }
  const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const shortFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  function fmtDate(ms) { try { return ms ? dateFmt.format(new Date(ms)) : ''; } catch (e) { return ''; } }
  function fmtDue(iso) { if (!iso) return ''; const p = String(iso).split('-').map(Number); if (p.length !== 3 || p.some(isNaN)) return String(iso); return shortFmt.format(new Date(p[0], p[1] - 1, p[2])); }
  function todayISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function byOldest(a, b) { return (a.createdAt || 0) - (b.createdAt || 0); }
  function byNewest(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }
  function fallbackColor(id) { return 'hsl(' + (hash(id || 'x') % 360) + ' 40% 40%)'; }
  const COMBINING = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
  function slug(s) { return String(s || 'mission').toLowerCase().normalize('NFKD').replace(COMBINING, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'mission'; }
  function oneLine(s) { return String(s || '').replace(/\s*\n\s*/g, ' ').trim(); }
  function starPoints(cx, cy, r, inner) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rad = i % 2 === 0 ? r : r * (inner || 0.382);
      pts.push((cx + rad * Math.cos(a)).toFixed(2) + ',' + (cy + rad * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function deepMerge(a, b) { const out = Object.assign({}, a); Object.keys(b).forEach((k) => { out[k] = isObj(a[k]) && isObj(b[k]) ? deepMerge(a[k], b[k]) : b[k]; }); return out; }
  function randomId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function ownerLabel(o, nameFn) { return o.ownerId ? nameFn(o.ownerId) : (o.ownerName || 'Unassigned'); }
  function prefersReducedMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  // ---------- Local store for practice mode (same calls as the shared store) ----------
  // With a persistKey (the standalone copy outside Claude) it also saves to this browser's localStorage.
  function createMemoryDb(seed, persistKey) {
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const store = new Map();
    const load = (docs) => { store.clear(); Object.keys(docs || {}).forEach((p) => store.set(p, clone(docs[p]))); };
    let saved = null;
    if (persistKey) {
      try { const raw = window.localStorage.getItem(persistKey); if (raw) saved = JSON.parse(raw); } catch (e) { saved = null; }
    }
    load(isObj(saved) ? saved : seed);
    const persist = () => {
      if (!persistKey) return;
      try { const out = {}; store.forEach((v, k) => { out[k] = v; }); window.localStorage.setItem(persistKey, JSON.stringify(out)); } catch (e) { /* storage unavailable: keep working in memory */ }
    };
    const subs = new Set();
    let queued = false;
    const notify = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; persist(); subs.forEach((s) => s.fire()); }, 0); };
    const meta = { fromCache: false, hasPendingWrites: false };
    const snapDoc = (path) => { const d = store.get(path); return { id: path.split('/').pop(), exists: !!d, data: () => (d ? clone(d) : undefined), metadata: meta }; };
    const colSnap = (colPath, filters) => {
      const depth = colPath.split('/').length + 1;
      const docs = [];
      store.forEach((d, p) => {
        const segs = p.split('/');
        if (segs.length !== depth || segs.slice(0, -1).join('/') !== colPath) return;
        if (filters.every((f) => (f[1] === '==' ? d[f[0]] === f[2] : true))) docs.push(snapDoc(p));
      });
      docs.sort((a, b) => (a.id < b.id ? -1 : 1));
      return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta };
    };
    function query(colPath, filters) {
      return {
        where: (f, op, v) => query(colPath, filters.concat([[f, op, v]])),
        orderBy: () => query(colPath, filters),
        limit: () => query(colPath, filters),
        get: async () => colSnap(colPath, filters),
        onSnapshot(next) { const s = { fire: () => next(colSnap(colPath, filters)) }; subs.add(s); setTimeout(s.fire, 0); return () => subs.delete(s); },
      };
    }
    function docRef(path) {
      return {
        id: path.split('/').pop(),
        path,
        get: async () => snapDoc(path),
        set: async (d) => { store.set(path, clone(d)); notify(); },
        update: async (d) => { const cur = store.get(path); if (!cur) throw { code: 'invalid_argument', message: 'Document does not exist' }; store.set(path, deepMerge(cur, clone(d))); notify(); },
        delete: async () => { store.delete(path); notify(); },
        onSnapshot(next) { const s = { fire: () => next(snapDoc(path)) }; subs.add(s); setTimeout(s.fire, 0); return () => subs.delete(s); },
        collection: (p) => collectionRef(path + '/' + p),
      };
    }
    function collectionRef(colPath) {
      return Object.assign(query(colPath, []), {
        path: colPath,
        doc: (id) => docRef(colPath + '/' + (id || randomId())),
        add: async (d) => { const r = docRef(colPath + '/' + randomId()); await r.set(d); return r; },
      });
    }
    return {
      doc: docRef,
      collection: collectionRef,
      reset() {
        try { if (persistKey) window.localStorage.removeItem(persistKey); } catch (e) { /* storage unavailable */ }
        load(seed);
        notify();
      },
    };
  }

  // Example missions for practice mode (the shared board is seeded with the same examples).
  const SAMPLE_MISSIONS = [
    { id: 'ex-sprint-23', name: 'Operation Clean Deploy', sprint: 'Sprint 23', startedAt: Date.UTC(2026, 8, 14, 9), stage: 'salute' },
    { id: 'ex-sprint-24', name: 'Operation Night Owl', sprint: 'Sprint 24', startedAt: Date.UTC(2026, 8, 28, 9), stage: 'vote' },
  ];
  const SAMPLE_CARDS = [
    ['ex-sprint-23', 'c23-1', 'shield', 'Code review turnaround stayed under a day for the whole sprint', null],
    ['ex-sprint-23', 'c23-2', 'serum', 'Shipped the invoice export two days early', null],
    ['ex-sprint-23', 'c23-3', 'hydra', 'Deploys broke twice because staging and production configs drifted apart', null],
    ['ex-sprint-23', 'c23-4', 'hydra', 'Nobody had a runbook when payments paged at 2 a.m.', null],
    ['ex-sprint-23', 'c23-5', 'next', 'Add a smoke test to the deploy pipeline', null],
    ['ex-sprint-23', 'c23-6', 'next', 'Write an on-call runbook for payments', null],
    ['ex-sprint-24', 'c24-1', 'shield', 'Pairing on the checkout refactor caught two bugs before code review', null],
    ['ex-sprint-24', 'c24-2', 'shield', 'Feature flags let us ship the new search dark and roll back in seconds', null],
    ['ex-sprint-24', 'c24-3', 'shield', 'The 10-minute QA handoff every morning kept testing unblocked', null],
    ['ex-sprint-24', 'c24-4', 'serum', 'CI time dropped from 18 to 9 minutes after we sharded the test suite', null],
    ['ex-sprint-24', 'c24-5', 'serum', 'Every story had acceptance criteria before sprint planning, a first for us', null],
    ['ex-sprint-24', 'c24-6', 'serum', 'Lena ran her first incident review and it was clear, calm and blameless', null],
    ['ex-sprint-24', 'c24-7', 'hydra', 'Staging was down for two days and nobody knew who owned it', null],
    ['ex-sprint-24', 'c24-8', 'hydra', 'Three new requests landed on the reporting epic mid-sprint', null],
    ['ex-sprint-24', 'c24-9', 'hydra', 'Flaky end-to-end tests: about 1 in 5 pipeline runs fail for no reason', null],
    ['ex-sprint-24', 'c24-10', 'hydra', 'The payment step in the E2E suite times out at random', 'c24-9'],
    ['ex-sprint-24', 'c24-11', 'hydra', 'Wednesday is wall-to-wall meetings, so there is no focus time', null],
    ['ex-sprint-24', 'c24-12', 'next', 'Name a staging owner at the start of every sprint', null],
    ['ex-sprint-24', 'c24-13', 'next', 'Protect Wednesday afternoons as no-meeting focus time', null],
    ['ex-sprint-24', 'c24-14', 'next', 'Quarantine flaky tests and fix the worst three first', null],
  ];
  const SAMPLE_ORDERS = [
    { id: 'o23-1', mission: 'ex-sprint-23', text: 'Add a staging smoke test to the deploy pipeline', ownerName: 'Priya', due: '2026-09-21', status: 'done', card: 'c23-5' },
    { id: 'o23-2', mission: 'ex-sprint-23', text: 'Book an API contract review with the mobile team', ownerName: 'Marco', due: '2026-09-25', status: 'open', card: 'c23-3' },
    { id: 'o23-3', mission: 'ex-sprint-23', text: 'Write the on-call runbook for the payments service', ownerName: 'Aisha', due: '2026-10-02', status: 'open', card: 'c23-4' },
  ];
  const SAMPLE_SALUTES = [
    { id: 's23-1', mission: 'ex-sprint-23', toName: 'Priya', text: 'Stayed late to untangle the config drift, then documented the fix for everyone.' },
    { id: 's23-2', mission: 'ex-sprint-23', toName: 'Marco', text: 'Turned code reviews around the same day, every day.' },
  ];
  function sampleDocs() {
    const d = {};
    const start = {};
    SAMPLE_MISSIONS.forEach((m) => {
      start[m.id] = m.startedAt;
      d['missions/' + m.id] = { name: m.name, sprint: m.sprint, startedAt: m.startedAt, stage: m.stage, votesPerHero: 3, anonymous: false, example: true, timerEndsAt: null, focus: null };
    });
    SAMPLE_CARDS.forEach((c, i) => {
      d['cards/' + c[1]] = { mission: c[0], column: c[2], text: c[3], author: null, createdAt: start[c[0]] + (i + 1) * 60000, group: c[4], example: true };
    });
    SAMPLE_ORDERS.forEach((o, i) => {
      d['orders/' + o.id] = { mission: o.mission, text: o.text, ownerId: null, ownerName: o.ownerName, due: o.due, status: o.status, doneAt: o.status === 'done' ? Date.UTC(2026, 8, 20, 15) : null, card: o.card, createdAt: start[o.mission] + (40 + i) * 60000, author: null, example: true };
    });
    SAMPLE_SALUTES.forEach((s, i) => {
      d['salutes/' + s.id] = { mission: s.mission, toId: null, toName: s.toName, text: s.text, author: null, createdAt: start[s.mission] + (50 + i) * 60000, example: true };
    });
    return d;
  }

  // ---------- PDF report ----------
  let jsPdfPromise = null;
  function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!jsPdfPromise) {
      jsPdfPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = JSPDF_URL;
        s.async = true;
        s.onload = () => (window.jspdf && window.jspdf.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('jsPDF missing')));
        s.onerror = () => { jsPdfPromise = null; reject(new Error('jsPDF failed to load')); };
        document.head.appendChild(s);
      });
    }
    return jsPdfPromise;
  }
  // The PDF's built-in fonts only cover Latin-1, so other letters are reduced to their base form.
  const PDF_MAP = { 0x2018: "'", 0x2019: "'", 0x201A: "'", 0x2032: "'", 0x201C: '"', 0x201D: '"', 0x201E: '"', 0x2033: '"', 0x2013: '-', 0x2014: '-', 0x2212: '-', 0x2026: '...', 0x2022: '-', 0x2023: '-', 0x25CF: '-', 0x2007: ' ', 0x202F: ' ' };
  function pdfSafe(input) {
    const s = String(input == null ? '' : input).replace(/\r\n?/g, '\n');
    let out = '';
    for (const ch of s) {
      const code = ch.codePointAt(0);
      if (PDF_MAP[code] != null) { out += PDF_MAP[code]; continue; }
      if (code === 10 || (code >= 32 && code < 127) || (code >= 160 && code <= 255)) { out += ch; continue; }
      const base = ch.normalize('NFKD').replace(COMBINING, '');
      for (const b of base) { const c2 = b.codePointAt(0); if ((c2 >= 32 && c2 < 127) || (c2 >= 160 && c2 <= 255)) out += b; }
    }
    return out;
  }
  function buildPdf(JsPDF, r) {
    const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 40;
    const C = { navy: [20, 38, 74], red: [184, 37, 47], blue: [31, 78, 156], white: [255, 255, 255], ink: [20, 32, 58], muted: [96, 106, 126], line: [214, 219, 229], paper: [245, 246, 250], gold: [229, 165, 10], ok: [43, 122, 75], shield: [33, 82, 163], serum: [184, 37, 47], hydra: [47, 63, 99], next: [43, 122, 75] };
    const fill = (c) => doc.setFillColor(c[0], c[1], c[2]);
    const stroke = (c) => doc.setDrawColor(c[0], c[1], c[2]);
    const color = (c) => doc.setTextColor(c[0], c[1], c[2]);
    const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };
    const star = (cx, cy, rad, c) => {
      const pts = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 === 0 ? rad : rad * 0.4; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
      const deltas = [];
      for (let i = 1; i < pts.length; i++) deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
      fill(c);
      doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], 'F', true);
    };
    const shield = (cx, cy, rad) => {
      [[C.red, 1], [C.white, 0.8], [C.red, 0.6], [C.blue, 0.4]].forEach((p) => { fill(p[0]); doc.circle(cx, cy, rad * p[1], 'F'); });
      star(cx, cy + rad * 0.03, rad * 0.37, C.white);
    };
    let page = 1;
    let y = 0;
    const header = (first) => {
      const h = first ? 96 : 50;
      fill(C.navy); doc.rect(0, 0, W, h, 'F');
      fill(C.white); doc.rect(0, h, W, 2, 'F');
      fill(C.red); doc.rect(0, h + 2, W, 4, 'F');
      if (first) {
        shield(M + 26, h / 2, 26);
        color([174, 186, 210]); font('bold', 8.5); doc.text(pdfSafe(r.subtitle).toUpperCase(), M + 66, 38);
        color(C.white); font('bold', 22); doc.text(doc.splitTextToSize(pdfSafe(r.title), W - 2 * M - 70)[0] || '', M + 66, 64);
        y = 134;
      } else {
        shield(M + 13, h / 2, 13);
        color(C.white); font('bold', 11); doc.text(pdfSafe(r.title), M + 36, h / 2 + 4);
        y = 86;
      }
    };
    const footer = () => { color(C.muted); font('normal', 8); doc.text("Captain's Shield Retro - mission report", M, H - 24); doc.text('Page ' + page, W - M, H - 24, { align: 'right' }); };
    const ensure = (need) => { if (y + need > H - 52) { footer(); doc.addPage(); page += 1; header(false); } };
    const heading = (label, sub, col) => {
      ensure(64);
      fill(col); doc.rect(M, y - 2, 5, sub ? 32 : 20, 'F');
      color(C.ink); font('bold', 13); doc.text(pdfSafe(label).toUpperCase(), M + 14, y + 11);
      if (sub) { color(C.muted); font('italic', 9.5); doc.text(pdfSafe(sub), M + 14, y + 25); }
      y += sub ? 48 : 34;
    };

    header(true);
    const gap = 10;
    const bw = (W - 2 * M - gap * 3) / 4;
    r.stats.forEach((s, i) => {
      const x = M + i * (bw + gap);
      fill(C.paper); stroke(C.line); doc.setLineWidth(0.8); doc.roundedRect(x, y, bw, 54, 5, 5, 'FD');
      color(C.ink); font('bold', 22); doc.text(String(s.value), x + 12, y + 29);
      color(C.muted); font('bold', 7.5); doc.text(pdfSafe(s.label).toUpperCase(), x + 12, y + 44);
    });
    y += 80;
    const checked = r.moods.reduce((a, m) => a + m.n, 0);
    if (checked) {
      color(C.muted); font('normal', 9.5);
      doc.text(pdfSafe('Squad readiness: ' + r.moods.filter((m) => m.n).map((m) => m.label + ' ' + m.n).join('  |  ')), M, y);
      y += 24;
    }

    r.sections.forEach((sec) => {
      const col = C[sec.key] || C.navy;
      heading(sec.name, sec.q, col);
      if (!sec.items.length) { color(C.muted); font('italic', 10); doc.text('No notes in this section.', M + 14, y); y += 24; return; }
      sec.items.forEach((it) => {
        font('normal', 10.5);
        const lines = doc.splitTextToSize(pdfSafe(it.text), W - 2 * M - 76);
        ensure(lines.length * 14 + 4);
        star(M + 18, y - 3.6, 4.2, col);
        color(C.ink); font('normal', 10.5);
        lines.forEach((ln, j) => doc.text(ln, M + 30, y + j * 14));
        if (it.stars) { star(W - M - 26, y - 3.6, 5, C.gold); color(C.ink); font('bold', 10); doc.text(String(it.stars), W - M - 16, y); }
        y += lines.length * 14;
        it.kids.forEach((k) => {
          font('normal', 9.5);
          const kl = doc.splitTextToSize(pdfSafe(k), W - 2 * M - 96);
          ensure(kl.length * 12.5 + 2);
          color(C.muted); font('normal', 9.5);
          doc.text('+', M + 32, y);
          kl.forEach((ln, j) => doc.text(ln, M + 44, y + j * 12.5));
          y += kl.length * 12.5;
        });
        y += 8;
      });
      y += 12;
    });

    heading('Mission orders', 'Actions agreed for the next sprint', C.red);
    if (!r.orders.length) { color(C.muted); font('italic', 10); doc.text('No orders were created.', M + 14, y); y += 24; }
    else {
      const cx = { done: M + 8, text: M + 46, owner: W - M - 190, due: W - M - 70 };
      ensure(46);
      fill(C.navy); doc.rect(M, y - 13, W - 2 * M, 20, 'F');
      color(C.white); font('bold', 8);
      doc.text('DONE', cx.done, y); doc.text('ORDER', cx.text, y); doc.text('OWNER', cx.owner, y); doc.text('DUE', cx.due, y);
      y += 22;
      r.orders.forEach((o, i) => {
        font('normal', 10);
        const tl = doc.splitTextToSize(pdfSafe(o.text), cx.owner - cx.text - 12);
        const ol = doc.splitTextToSize(pdfSafe(o.owner), cx.due - cx.owner - 10);
        const h = Math.max(tl.length, ol.length) * 13 + 10;
        ensure(h);
        if (i % 2 === 0) { fill(C.paper); doc.rect(M, y - 12, W - 2 * M, h, 'F'); }
        stroke(C.muted); doc.setLineWidth(0.8); doc.rect(cx.done + 2, y - 8, 9, 9, 'S');
        if (o.done) { fill(C.ok); doc.rect(cx.done + 4, y - 6, 5, 5, 'F'); }
        font('normal', 10);
        color(o.done ? C.muted : C.ink);
        tl.forEach((ln, j) => doc.text(ln, cx.text, y + j * 13));
        color(C.ink);
        ol.forEach((ln, j) => doc.text(ln, cx.owner, y + j * 13));
        doc.text(pdfSafe(o.due || '-'), cx.due, y);
        y += h;
      });
      y += 14;
    }

    heading('Hall of Heroes', 'Shout-outs from the squad', C.blue);
    if (!r.salutes.length) { color(C.muted); font('italic', 10); doc.text('No shout-outs this mission.', M + 14, y); y += 24; }
    r.salutes.forEach((s) => {
      font('normal', 10);
      const tl = doc.splitTextToSize(pdfSafe(s.text), W - 2 * M - 30);
      ensure(tl.length * 13 + 34);
      star(M + 7, y - 4, 5.5, C.gold);
      color(C.ink); font('bold', 11.5); doc.text(pdfSafe('To ' + s.to), M + 18, y);
      y += 15;
      font('normal', 10); color(C.ink);
      tl.forEach((ln, j) => doc.text(ln, M + 18, y + j * 13));
      y += tl.length * 13;
      if (s.from) { color(C.muted); font('italic', 9); doc.text(pdfSafe('From ' + s.from), M + 18, y); y += 13; }
      y += 8;
    });
    footer();
    return doc.output('arraybuffer');
  }
  function buildMarkdown(r) {
    const L = [];
    L.push('# ' + r.title);
    L.push(r.subtitle);
    L.push('');
    L.push(r.stats.map((s) => s.label + ': ' + s.value).join(' · '));
    L.push('');
    r.sections.forEach((sec) => {
      L.push('## ' + sec.name + ': ' + sec.q);
      if (!sec.items.length) L.push('- No notes');
      sec.items.forEach((it) => {
        L.push('- ' + oneLine(it.text) + (it.stars ? ' (' + it.stars + (it.stars === 1 ? ' star)' : ' stars)') : ''));
        it.kids.forEach((k) => L.push('  - ' + oneLine(k)));
      });
      L.push('');
    });
    L.push('## Mission orders');
    if (!r.orders.length) L.push('- No orders');
    r.orders.forEach((o) => L.push('- [' + (o.done ? 'x' : ' ') + '] ' + oneLine(o.text) + ' (Owner: ' + o.owner + (o.due ? ', due ' + o.due : '') + ')'));
    if (r.salutes.length) {
      L.push('');
      L.push('## Hall of Heroes');
      r.salutes.forEach((s) => L.push('- To ' + s.to + ': ' + oneLine(s.text) + (s.from ? ' (from ' + s.from + ')' : '')));
    }
    return L.join('\n');
  }

  // ---------- Context ----------
  const Ctx = createContext(null);
  const useApp = () => useContext(Ctx);

  // ---------- Small pieces ----------
  function Emblem({ size }) {
    return html`<svg className="emblem" width=${size || 44} height=${size || 44} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="49" fill="#C0272D" />
      <circle cx="50" cy="50" r="39" fill="#F4F5F8" />
      <circle cx="50" cy="50" r="29" fill="#C0272D" />
      <circle cx="50" cy="50" r="19.5" fill="#1F4E9C" />
      <polygon points=${starPoints(50, 51.5, 18, 0.382)} fill="#F4F5F8" />
    </svg>`;
  }
  function StarIcon({ filled, size, className }) {
    const on = filled !== false;
    return html`<svg className=${'star' + (on ? '' : ' is-empty') + (className ? ' ' + className : '')} width=${size || 16} height=${size || 16} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <polygon points=${starPoints(10, 10.8, 9, 0.4)} fill=${on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>`;
  }
  function SectionMark({ size }) {
    return html`<svg className="mark" width=${size || 18} height=${size || 18} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="10" fill="currentColor" />
      <polygon points=${starPoints(10, 10.7, 6.4, 0.4)} style=${{ fill: 'var(--mark-star, #FFFFFF)' }} />
    </svg>`;
  }
  function Meter({ level }) {
    return html`<span className=${'meter lvl-' + level} aria-hidden="true">
      ${[1, 2, 3, 4, 5].map((i) => html`<i key=${i} className=${i <= level ? 'on' : ''} style=${{ height: (5 + i * 3) + 'px' }}></i>`)}
    </span>`;
  }
  function Avatar({ id, size }) {
    const { profiles, nameOf } = useApp();
    const px = size || 22;
    const p = id ? profiles[id] : null;
    const label = nameOf(id);
    if (p && p.avatarUrl) return html`<img className="avatar" src=${p.avatarUrl} alt=${label} title=${label} width=${px} height=${px} />`;
    const initials = (label || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
    return html`<span className="avatar" role="img" aria-label=${label} title=${label}
      style=${{ width: px + 'px', height: px + 'px', background: (p && p.color) || fallbackColor(id), fontSize: Math.round(px * 0.42) + 'px' }}>${initials}</span>`;
  }

  // ---------- Header ----------
  function Presence() {
    const { peers, missionId } = useApp();
    const seen = new Set();
    const here = [];
    peers.forEach((p) => {
      if (p.kind !== 'viewer') return;
      if (!p.isMe && (!p.presence || p.presence.m !== missionId)) return;
      const key = p.by || p.peer;
      if (seen.has(key)) return;
      seen.add(key);
      here.push(p);
    });
    if (!here.length) return null;
    const shown = here.slice(0, 5);
    return html`<div className="presence">
      <span className="presence-dot" aria-hidden="true"></span>
      <span className="presence-avs">${shown.map((p) => html`<${Avatar} key=${p.by || p.peer} id=${p.by} size=${26} />`)}</span>
      <span>${here.length} online</span>
    </div>`;
  }
  function TopBar() {
    const { mission, missionsSorted, missionId, selectMission, me, readOnly, setDialog, guideOpen, showGuide } = useApp();
    const facil = me.facilitator && !readOnly;
    return html`<header className="topbar">
      <div className="wrap topbar-in">
        <div className="brand">
          <${Emblem} size=${50} />
          <div className="title-block">
            <div className="eyebrow">${mission ? ['Mission log', mission.sprint, fmtDate(mission.startedAt)].filter(Boolean).join(' · ') : "Captain's Shield Retro"}</div>
            <h1 className="mission-name">
              <span>${mission ? mission.name : 'Mission log'}</span>
              ${mission && mission.example && html`<span className="chip chip-example">Example</span>`}
            </h1>
          </div>
        </div>
        <div className="topbar-tools">
          <${Presence} />
          ${!guideOpen && html`<button type="button" className="btn btn-on-navy" onClick=${showGuide}>How it works</button>`}
          ${missionsSorted.length > 0 && html`<div>
            <label className="sr-only" htmlFor="mission-select">Open a mission</label>
            <select id="mission-select" className="select-navy" value=${missionId || ''} onChange=${(e) => selectMission(e.target.value)}>
              ${missionsSorted.map((m) => html`<option key=${m.id} value=${m.id}>${m.name + (m.sprint ? ' · ' + m.sprint : '')}</option>`)}
            </select>
          </div>`}
          ${facil && html`<button type="button" className="btn btn-primary" onClick=${() => setDialog({ type: 'new' })}>New mission</button>`}
          ${facil && mission && html`<button type="button" className="btn btn-on-navy" onClick=${() => setDialog({ type: 'delete' })}>Delete</button>`}
        </div>
      </div>
    </header>`;
  }

  // ---------- Stage track & briefing ----------
  function StageTrack() {
    const { stage, me, readOnly, act } = useApp();
    const cur = STAGE_INDEX[stage];
    const facil = me.facilitator && !readOnly;
    return html`<nav className="track" aria-label="Retrospective stages">
      <ol>
        ${STAGES.map((s, i) => {
          const state = i < cur ? 'is-done' : i === cur ? 'is-current' : 'is-todo';
          const inner = html`<span className="track-dot">${i + 1}</span><span className="track-label">${s.name}</span>`;
          return html`<li key=${s.key} className=${'track-step ' + state} aria-current=${i === cur ? 'step' : undefined}>
            ${facil
              ? html`<button type="button" className="track-btn" title=${'Move the squad to ' + s.name} onClick=${() => { if (i !== cur) act.setStage(s.key); }}>${inner}</button>`
              : html`<div className="track-btn">${inner}</div>`}
          </li>`;
        })}
      </ol>
    </nav>`;
  }
  function Timer() {
    const { mission, me, readOnly, act, stageDef } = useApp();
    const ends = mission.timerEndsAt || null;
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
      if (!ends) return undefined;
      setNow(Date.now());
      const t = setInterval(() => setNow(Date.now()), 250);
      return () => clearInterval(t);
    }, [ends]);
    const facil = me.facilitator && !readOnly;
    if (!ends) {
      if (!facil) return null;
      return html`<button type="button" className="btn btn-quiet" onClick=${() => act.setTimer(Date.now() + stageDef.minutes * 60000)}>Start ${stageDef.minutes}:00 timer</button>`;
    }
    const left = Math.max(0, ends - now);
    const secs = Math.ceil(left / 1000);
    const face = left === 0 ? "Time's up" : String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
    return html`<div className=${'timer' + (left === 0 ? ' is-up' : '')} role="timer" aria-label=${left === 0 ? "Time's up" : face + ' left'}>
      <span className="timer-face">${face}</span>
      ${facil && html`<button type="button" className="btn btn-quiet btn-sm" onClick=${() => act.setTimer(Math.max(Date.now(), ends) + 60000)}>+1 min</button>`}
      ${facil && html`<button type="button" className="btn btn-quiet btn-sm" onClick=${() => act.setTimer(null)}>Clear</button>`}
    </div>`;
  }
  function StarsLeft() {
    const { starsLeft, starsPer, me, readOnly } = useApp();
    if (readOnly) return null;
    if (!me.id) return html`<span className="pill">Sign in to vote</span>`;
    return html`<span className="pill pill-gold" aria-label=${starsLeft + ' of ' + starsPer + ' stars left'}>
      ${Array.from({ length: starsPer }, (_, i) => html`<${StarIcon} key=${i} filled=${i < starsLeft} size=${15} />`)}
      <span>${starsLeft} left</span>
    </span>`;
  }
  function Briefing() {
    const { stage, stageDef, me, readOnly, act, starsPer } = useApp();
    const i = STAGE_INDEX[stage];
    const next = STAGES[i + 1];
    const facil = me.facilitator && !readOnly;
    const hint = stage === 'vote'
      ? 'You have ' + starsPer + (starsPer === 1 ? ' star' : ' stars') + '. Give them to the items the squad should tackle first. Totals stay sealed until planning.'
      : stageDef.hint;
    return html`<section className="briefing" aria-labelledby="briefing-title">
      <div className="briefing-main">
        <div className="briefing-stage">Stage ${i + 1} of ${STAGES.length}</div>
        <h2 className="briefing-title" id="briefing-title" aria-live="polite">${stageDef.name}</h2>
        <p className="briefing-hint">${hint}</p>
      </div>
      <div className="briefing-tools">
        ${stage === 'vote' && html`<${StarsLeft} />`}
        <${Timer} />
        ${facil && next && html`<button type="button" className="btn btn-primary" onClick=${() => act.setStage(next.key)}>Next: ${next.name} →</button>`}
        ${!facil && !readOnly && html`<span className="muted small">The facilitator moves the squad to the next stage.</span>`}
      </div>
    </section>`;
  }

  // ---------- Board ----------
  function ColumnHead({ sec, count }) {
    return html`<header className="col-head">
      <div className="col-title-row">
        <${SectionMark} />
        <h2 className="col-title" id=${'h-' + sec.key}>${sec.name}</h2>
        ${count != null && html`<span className="col-count" aria-label=${count + (count === 1 ? ' note' : ' notes')}>${count}</span>`}
      </div>
      <p className="col-q">${sec.q}</p>
    </header>`;
  }
  function Composer({ sec }) {
    const { act, setWriting } = useApp();
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const ref = useRef(null);
    const submit = async () => {
      const t = text.trim();
      if (!t || busy) return;
      setBusy(true);
      const ok = await act.addCard(sec.key, t.slice(0, 500));
      setBusy(false);
      if (ok) { setText(''); if (ref.current) ref.current.focus(); }
    };
    return html`<form className="composer" onSubmit=${(e) => { e.preventDefault(); submit(); }}>
      <label className="sr-only" htmlFor=${'compose-' + sec.key}>Add a note to ${sec.name}</label>
      <textarea id=${'compose-' + sec.key} ref=${ref} className="input" rows="2" maxLength="500" placeholder=${sec.ph} value=${text}
        onChange=${(e) => setText(e.target.value)}
        onFocus=${() => setWriting(sec.key)}
        onBlur=${() => setWriting(null)}
        onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
      <div className="composer-row">
        <span className="hint" title="Shift+Enter starts a new line">Enter to add</span>
        <button type="submit" className="btn btn-primary btn-sm" disabled=${!text.trim() || busy}>Add note</button>
      </div>
    </form>`;
  }
  function Note({ card, isChild, stackCount }) {
    const { stage, me, act, readOnly, mission, ui, setUi, nameOf } = useApp();
    const mine = !!me.id && card.author === me.id;
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [confirmDel, setConfirmDel] = useState(false);
    useEffect(() => {
      if (!confirmDel) return undefined;
      const t = setTimeout(() => setConfirmDel(false), 3500);
      return () => clearTimeout(t);
    }, [confirmDel]);

    if (stage === 'brainstorm' && !mine) {
      const h = hash(card.id);
      const bars = [62 + (h % 34), 38 + ((h >>> 6) % 52)];
      if ((h >>> 12) % 2) bars.push(24 + ((h >>> 14) % 40));
      return html`<article className=${'note is-classified' + (isChild ? ' is-child' : '')} aria-label="Classified note from a teammate">
        <div className="redact" aria-hidden="true">${bars.map((w, i) => html`<span key=${i} style=${{ width: w + '%' }}></span>`)}</div>
        <span className="stamp" aria-hidden="true">Classified</span>
      </article>`;
    }

    const earlyStage = stage === 'brainstorm' || stage === 'group';
    const editable = !readOnly && mine && earlyStage;
    const deletable = !readOnly && (mine || me.facilitator) && earlyStage;
    const groupMode = stage === 'group' && !readOnly;
    const isSource = ui.stackSource === card.id;
    const save = async () => {
      const t = draft.trim();
      if (!t) return;
      if (t !== card.text) await act.editCard(card.id, t.slice(0, 500));
      setEditing(false);
    };
    let who = null;
    if (card.example) who = html`<span className="who who-example">Example note</span>`;
    else if (mission.anonymous) who = html`<span className="who">${mine ? 'Your note' : 'Anonymous'}</span>`;
    else if (card.author) who = html`<span className="who"><${Avatar} id=${card.author} size=${20} /><span className="who-name">${nameOf(card.author)}</span></span>`;

    return html`<article
        className=${'note' + (isChild ? ' is-child' : '') + (mine ? ' is-mine' : '') + (isSource ? ' is-source' : '')}
        draggable=${groupMode && !editing ? 'true' : undefined}
        onDragStart=${groupMode && !editing ? (e) => { e.dataTransfer.setData('text/plain', card.id); e.dataTransfer.effectAllowed = 'move'; } : undefined}>
      ${editing
        ? html`<div className="note-edit">
            <label className="sr-only" htmlFor=${'edit-' + card.id}>Edit note</label>
            <textarea id=${'edit-' + card.id} className="input" rows="3" maxLength="500" value=${draft} autoFocus
              onChange=${(e) => setDraft(e.target.value)}
              onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); } else if (e.key === 'Escape') setEditing(false); }} />
            <div className="note-edit-row">
              <button type="button" className="btn btn-quiet btn-sm" onClick=${() => setEditing(false)}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" disabled=${!draft.trim()} onClick=${save}>Save</button>
            </div>
          </div>`
        : html`<p className="note-text">${card.text}</p>`}
      ${!editing && html`<footer className="note-foot">
        ${who}
        ${stackCount > 0 && html`<span className="stack-count">+${stackCount} stacked</span>`}
        <span className="note-actions">
          ${editable && html`<button type="button" className="link-btn" onClick=${() => { setDraft(card.text || ''); setEditing(true); }}>Edit</button>`}
          ${groupMode && !isChild && html`<button type="button" className="link-btn" aria-pressed=${isSource} onClick=${() => setUi({ stackSource: isSource ? null : card.id })}>${isSource ? 'Cancel stack' : 'Stack'}</button>`}
          ${groupMode && isChild && html`<button type="button" className="link-btn" onClick=${() => act.unstack(card.id)}>Unstack</button>`}
          ${deletable && html`<button type="button" className=${'link-btn' + (confirmDel ? ' is-danger' : '')}
            onClick=${() => { if (confirmDel) { setConfirmDel(false); act.deleteCard(card.id); } else setConfirmDel(true); }}>${confirmDel ? 'Confirm delete' : 'Delete'}</button>`}
        </span>
      </footer>`}
    </article>`;
  }
  function VoteButton({ leadId }) {
    const { myVoteSet, act, starsLeft, readOnly, me } = useApp();
    if (readOnly) return null;
    const on = myVoteSet.has(leadId);
    const blocked = !me.id || (!on && starsLeft <= 0);
    return html`<button type="button" className=${'vote' + (on ? ' is-on' : '')} aria-pressed=${on} disabled=${blocked}
        title=${!me.id ? 'Sign in to vote' : blocked ? 'No stars left. Take one back to move it.' : ''}
        onClick=${() => act.toggleVote(leadId)}>
      <${StarIcon} filled=${on} size=${15} />${on ? 'Starred' : 'Give a star'}
    </button>`;
  }
  function Item({ item }) {
    const { lead, children } = item;
    const { stage, ui, setUi, act, readOnly } = useApp();
    const [over, setOver] = useState(false);
    const groupMode = stage === 'group' && !readOnly;
    const src = ui.stackSource;
    const isTarget = groupMode && !!src && src !== lead.id && !children.some((c) => c.id === src);
    const drop = groupMode ? {
      onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; if (!over) setOver(true); },
      onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); },
      onDrop: (e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const id = e.dataTransfer.getData('text/plain'); if (id && id !== lead.id) act.stack(id, lead.id); },
    } : {};
    return html`<div className=${'item' + (children.length ? ' has-kids' : '') + (over ? ' is-over' : '') + (isTarget ? ' is-target' : '')} ...${drop}>
      <${Note} card=${lead} stackCount=${children.length} />
      ${children.length > 0 && html`<div className="kids">${children.map((c) => html`<${Note} key=${c.id} card=${c} isChild=${true} />`)}</div>`}
      ${isTarget && html`<button type="button" className="stack-here" onClick=${() => { act.stack(src, lead.id); setUi({ stackSource: null }); }}>Stack here</button>`}
      ${stage === 'vote' && html`<${VoteButton} leadId=${lead.id} />`}
    </div>`;
  }
  function Column({ sec }) {
    const { stage, readOnly, act, peers, missionId, cardsReady } = useApp();
    const [over, setOver] = useState(false);
    const groupMode = stage === 'group' && !readOnly;
    const writers = peers.filter((p) => !p.isMe && p.presence && p.presence.m === missionId && p.presence.w === sec.key).length;
    const count = sec.items.reduce((n, it) => n + 1 + it.children.length, 0);
    const drop = groupMode ? {
      onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!over) setOver(true); },
      onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); },
      onDrop: (e) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('text/plain'); if (id) act.moveTo(id, sec.key); },
    } : {};
    return html`<section className=${'column col-' + sec.key + (over ? ' is-over' : '')} aria-labelledby=${'h-' + sec.key} ...${drop}>
      <${ColumnHead} sec=${sec} count=${cardsReady ? count : null} />
      <div className="col-body">
        ${stage === 'brainstorm' && !readOnly && html`<${Composer} sec=${sec} />`}
        ${writers > 0 && html`<p className="col-writing"><span className="writing-dots" aria-hidden="true"><i></i><i></i><i></i></span>${writers === 1 ? '1 hero is writing' : writers + ' heroes are writing'}</p>`}
        ${!cardsReady
          ? html`<p className="col-empty">Loading notes…</p>`
          : sec.items.length === 0
            ? html`<p className="col-empty">${stage === 'brainstorm' ? 'No notes yet. Be the first to report in.' : 'No notes in this section.'}</p>`
            : sec.items.map((it) => html`<${Item} key=${it.lead.id} item=${it} />`)}
      </div>
    </section>`;
  }
  function BoardView() {
    const { sectionsWithItems } = useApp();
    return html`<div className="board">${sectionsWithItems.map((sec) => html`<${Column} key=${sec.key} sec=${sec} />`)}</div>`;
  }
  function StackBar() {
    const { ui, setUi, cardsById } = useApp();
    const c = cardsById[ui.stackSource];
    if (!c) return null;
    return html`<div className="stackbar" role="status">
      <span>Stacking “${trunc(c.text, 48)}”. Choose <strong>Stack here</strong> on the note it belongs with.</span>
      <button type="button" className="btn btn-quiet btn-sm" onClick=${() => setUi({ stackSource: null })}>Cancel</button>
    </div>`;
  }

  // ---------- Hero picker (owner / shout-out target) ----------
  function HeroPicker({ idValue, nameValue, onPick, label, selectId, emptyLabel, full }) {
    const { heroIds, nameOf } = useApp();
    const [typing, setTyping] = useState(false);
    const [draft, setDraft] = useState('');
    const value = idValue ? 'id:' + idValue : nameValue ? 'name' : '';
    const ids = !idValue || heroIds.indexOf(idValue) >= 0 ? heroIds : heroIds.concat([idValue]);
    if (typing) {
      return html`<input id=${selectId} className=${full ? 'input' : 'input input-sm'} autoFocus aria-label=${label} placeholder="Type a name" maxLength="60" value=${draft}
        onChange=${(e) => setDraft(e.target.value)}
        onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === 'Escape') { setDraft(''); setTyping(false); } }}
        onBlur=${() => { const t = draft.trim(); setTyping(false); if (t) onPick({ id: null, name: t }); }} />`;
    }
    return html`<select id=${selectId} className=${full ? 'select-full' : 'select-sm'} aria-label=${label} value=${value}
        onChange=${(e) => {
          const v = e.target.value;
          if (v === '__other') { setDraft(''); setTyping(true); }
          else if (v === '') onPick({ id: null, name: null });
          else if (v.indexOf('id:') === 0) onPick({ id: v.slice(3), name: null });
        }}>
      <option value="">${emptyLabel || 'Unassigned'}</option>
      ${ids.map((id) => html`<option key=${id} value=${'id:' + id}>${nameOf(id)}</option>`)}
      ${nameValue && html`<option value="name">${nameValue}</option>`}
      <option value="__other">Someone else…</option>
    </select>`;
  }

  // ---------- Assemble ----------
  function CheckIn() {
    const { heroes, me, act, readOnly, missionId, moodTally } = useApp();
    const mine = me.id && heroes[me.id] && heroes[me.id].missions && heroes[me.id].missions[missionId] ? heroes[me.id].missions[missionId].mood : null;
    const total = moodTally.reduce((a, t) => a + t.n, 0);
    const max = Math.max(1, ...moodTally.map((t) => t.n));
    return html`<section className="panel" aria-labelledby="checkin-title">
      <header className="panel-head">
        <h2 className="panel-title" id="checkin-title">Check in</h2>
        <p className="panel-sub">How ready are you for this debrief? Only the squad totals are shown.</p>
      </header>
      <div className="moods" role="radiogroup" aria-label="Your readiness">
        ${MOODS.map((m) => html`<button key=${m.key} type="button" role="radio" aria-checked=${mine === m.key}
            className=${'mood' + (mine === m.key ? ' is-on' : '')} disabled=${readOnly || !me.id} onClick=${() => act.setMood(m.key)}>
          <${Meter} level=${m.level} /><span>${m.label}</span>
        </button>`)}
      </div>
      ${!me.id && !readOnly && html`<p className="note-muted">Sign in to claude.ai to check in.</p>`}
      <h3 className="mini-title"><span>Squad readiness</span><span>${total} checked in</span></h3>
      <div>
        ${moodTally.map((t) => html`<div className="tally-row" key=${t.key}>
          <span>${t.label}</span>
          <span className="tally-bar"><span className=${'lvl-' + t.level} style=${{ width: (t.n / max) * 100 + '%' }}></span></span>
          <span className="tally-n">${t.n}</span>
        </div>`)}
      </div>
    </section>`;
  }
  function OrderRow({ order, showMission, showSource }) {
    const { act, readOnly, missionsById, cardsById, nameOf } = useApp();
    const [text, setText] = useState(order.text || '');
    const [focused, setFocused] = useState(false);
    const [confirmDel, setConfirmDel] = useState(false);
    useEffect(() => { if (!focused) setText(order.text || ''); }, [order.text, focused]);
    useEffect(() => {
      if (!confirmDel) return undefined;
      const t = setTimeout(() => setConfirmDel(false), 3500);
      return () => clearTimeout(t);
    }, [confirmDel]);
    const done = order.status === 'done';
    const overdue = !done && order.due && order.due < todayISO();
    const src = showSource && order.card ? cardsById[order.card] : null;
    const from = showMission ? missionsById[order.mission] : null;
    const commit = () => {
      const t = text.trim();
      if (!t) { setText(order.text || ''); return; }
      if (t !== order.text) act.updateOrder(order.id, { text: t.slice(0, 280) });
    };
    return html`<li className=${'order' + (done ? ' is-done' : '')}>
      <input type="checkbox" className="check" checked=${done} disabled=${readOnly} aria-label=${done ? 'Mark as not done' : 'Mark as done'}
        onChange=${(e) => act.updateOrder(order.id, { status: e.target.checked ? 'done' : 'open', doneAt: e.target.checked ? Date.now() : null })} />
      <div>
        ${readOnly
          ? html`<p className="order-text-static">${order.text}</p>`
          : html`<input className="order-text" aria-label="Order" maxLength="280" value=${text}
              onChange=${(e) => setText(e.target.value)}
              onFocus=${() => setFocused(true)}
              onBlur=${() => { setFocused(false); commit(); }}
              onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === 'Escape') setText(order.text || ''); }} />`}
        <div className="order-meta">
          ${readOnly
            ? html`<span>${ownerLabel(order, nameOf)}</span>`
            : html`<${HeroPicker} selectId=${'owner-' + order.id} label="Owner" idValue=${order.ownerId} nameValue=${order.ownerName}
                onPick=${(p) => act.updateOrder(order.id, { ownerId: p.id, ownerName: p.name })} />`}
          ${readOnly
            ? (order.due ? html`<span>Due ${fmtDue(order.due)}</span>` : null)
            : html`<input type="date" className="input input-sm" aria-label="Due date" value=${order.due || ''} onChange=${(e) => act.updateOrder(order.id, { due: e.target.value || null })} />`}
          ${overdue && html`<span className="chip chip-bad">Overdue</span>`}
          ${showMission && html`<span className="order-from">${from ? 'From ' + from.name : 'From an earlier mission'}</span>`}
        </div>
        ${src && html`<p className="order-src">Tackles “${trunc(src.text, 90)}”</p>`}
      </div>
      ${!readOnly
        ? html`<button type="button" className=${'link-btn' + (confirmDel ? ' is-danger' : '')}
            onClick=${() => { if (confirmDel) { setConfirmDel(false); act.deleteOrder(order.id); } else setConfirmDel(true); }}>${confirmDel ? 'Confirm' : 'Delete'}</button>`
        : html`<span></span>`}
    </li>`;
  }
  function OrdersReview() {
    const { orders, mission, missionsById } = useApp();
    const t0 = mission.startedAt || 0;
    const prior = orders.filter((o) => o.mission !== mission.id && ((missionsById[o.mission] && missionsById[o.mission].startedAt) || 0) <= t0);
    const open = prior.filter((o) => o.status !== 'done').sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
    const done = prior.filter((o) => o.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    return html`<section className="panel" aria-labelledby="review-title">
      <header className="panel-head">
        <h2 className="panel-title" id="review-title">Last mission's orders</h2>
        <p className="panel-sub">Were the previous actions completed? Tick off what's done and reassign what's stuck.</p>
      </header>
      ${open.length === 0 && done.length === 0 && html`<p className="empty">No orders from earlier missions. They appear here once a mission has been planned.</p>`}
      ${open.length === 0 && done.length > 0 && html`<p className="empty">Every earlier order is done.</p>`}
      ${open.length > 0 && html`<ul className="orders">${open.map((o) => html`<${OrderRow} key=${o.id} order=${o} showMission=${true} />`)}</ul>`}
      ${done.length > 0 && html`<details className="done-list">
        <summary>Completed (${done.length})</summary>
        <ul className="orders">${done.map((o) => html`<${OrderRow} key=${o.id} order=${o} showMission=${true} />`)}</ul>
      </details>`}
    </section>`;
  }
  function AssembleView() {
    return html`<div className="split"><${CheckIn} /><${OrdersReview} /></div>`;
  }

  // ---------- Plan the mission ----------
  function RankedItem({ item, rank, onOrder }) {
    const { lead, children } = item;
    const { voteTotals, mission, me, readOnly, act } = useApp();
    const sec = SECTIONS[SECTION_INDEX[lead.column]] || SECTIONS[0];
    const n = voteTotals[lead.id] || 0;
    const facil = me.facilitator && !readOnly;
    const focused = mission.focus === lead.id;
    return html`<li className=${'ranked-item' + (focused ? ' is-focus' : '')}>
      <span className="rank" aria-label=${'Rank ' + rank}>${rank}</span>
      <div>
        <div className="ranked-top">
          <span className=${'sec-chip col-' + sec.key}>${sec.name}</span>
          <span className=${'stars' + (n ? '' : ' is-zero')} aria-label=${n + (n === 1 ? ' star' : ' stars')}><${StarIcon} size=${14} />${n}</span>
        </div>
        <p className="ranked-text">${lead.text}</p>
        ${children.length > 0 && html`<ul className="ranked-kids">${children.map((c) => html`<li key=${c.id}>${c.text}</li>`)}</ul>`}
        ${(facil || !readOnly) && html`<div className="ranked-actions">
          ${facil && html`<button type="button" className="btn btn-quiet btn-sm" onClick=${() => act.setFocus(focused ? null : lead.id)}>${focused ? 'Take off the table' : 'Put on the table'}</button>`}
          ${!readOnly && html`<button type="button" className="btn btn-quiet btn-sm" onClick=${() => onOrder(lead.id)}>Create order</button>`}
        </div>`}
      </div>
    </li>`;
  }
  function OrderComposer({ linkTo, onClearLink, inputRef }) {
    const { act, cardsById } = useApp();
    const [text, setText] = useState('');
    const [owner, setOwner] = useState({ id: null, name: null });
    const [due, setDue] = useState('');
    const [busy, setBusy] = useState(false);
    const src = linkTo ? cardsById[linkTo] : null;
    const submit = async (e) => {
      e.preventDefault();
      const t = text.trim();
      if (!t || busy) return;
      setBusy(true);
      const ok = await act.addOrder({ text: t.slice(0, 280), ownerId: owner.id, ownerName: owner.name, due: due || null, card: src ? src.id : null });
      setBusy(false);
      if (ok) { setText(''); setOwner({ id: null, name: null }); setDue(''); onClearLink(); }
    };
    return html`<form className="order-form" onSubmit=${submit}>
      ${src && html`<div className="link-chip"><span>Tackles “${trunc(src.text, 70)}”</span><button type="button" className="link-btn" onClick=${onClearLink}>Unlink</button></div>`}
      <div className="field">
        <label className="field-label" htmlFor="order-text">New order</label>
        <input id="order-text" ref=${inputRef} className="input" maxLength="280" placeholder="What will we do, specifically?" value=${text} onChange=${(e) => setText(e.target.value)} />
      </div>
      <div className="order-form-row">
        <div className="field">
          <label className="field-label" htmlFor="order-owner">Owner</label>
          <${HeroPicker} full=${true} selectId="order-owner" label="Owner" idValue=${owner.id} nameValue=${owner.name} onPick=${setOwner} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="order-due">Due</label>
          <input id="order-due" type="date" className="input" value=${due} onChange=${(e) => setDue(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled=${!text.trim() || busy}>Add order</button>
      </div>
    </form>`;
  }
  function DiscussView() {
    const { ranked, mission, me, readOnly, act, ordersHere, cardsById } = useApp();
    const [linkTo, setLinkTo] = useState(null);
    const inputRef = useRef(null);
    const facil = me.facilitator && !readOnly;
    const focus = mission.focus && cardsById[mission.focus] ? cardsById[mission.focus] : null;
    const startOrder = (id) => {
      setLinkTo(id);
      const el = inputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
    };
    return html`<div className="split split-plan">
      <section className="panel" aria-labelledby="ranked-title">
        <header className="panel-head">
          <h2 className="panel-title" id="ranked-title">Ranked by stars</h2>
          <p className="panel-sub">${facil ? 'Start at the top. Put an item on the table to highlight it for everyone.' : 'Start at the top. The facilitator highlights the item being discussed.'}</p>
        </header>
        ${focus && html`<div className="on-table" role="status">
          <span className="on-table-tag">On the table</span>
          <p>${focus.text}</p>
          ${facil && html`<button type="button" className="link-btn" onClick=${() => act.setFocus(null)}>Clear</button>`}
        </div>`}
        ${ranked.length === 0
          ? html`<p className="empty">No notes in this mission yet.</p>`
          : html`<ol className="ranked">${ranked.map((it, i) => html`<${RankedItem} key=${it.lead.id} item=${it} rank=${i + 1} onOrder=${startOrder} />`)}</ol>`}
      </section>
      <section className="panel" aria-labelledby="orders-title">
        <header className="panel-head">
          <h2 className="panel-title" id="orders-title">Mission orders</h2>
          <p className="panel-sub">Give each order one owner and a due date. Two or three orders is plenty for one sprint.</p>
        </header>
        ${!readOnly && html`<${OrderComposer} linkTo=${linkTo} onClearLink=${() => setLinkTo(null)} inputRef=${inputRef} />`}
        ${ordersHere.length === 0
          ? html`<p className="empty">No orders yet. Pick a top item and choose Create order.</p>`
          : html`<ul className="orders">${ordersHere.map((o) => html`<${OrderRow} key=${o.id} order=${o} showSource=${true} />`)}</ul>`}
      </section>
    </div>`;
  }

  // ---------- Salute ----------
  function SaluteComposer() {
    const { act } = useApp();
    const [to, setTo] = useState({ id: null, name: null });
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const ready = !!(to.id || to.name) && !!text.trim();
    const submit = async (e) => {
      e.preventDefault();
      if (!ready || busy) return;
      setBusy(true);
      const ok = await act.addSalute({ toId: to.id, toName: to.name, text: text.trim().slice(0, 400) });
      setBusy(false);
      if (ok) { setText(''); setTo({ id: null, name: null }); }
    };
    return html`<form className="salute-form" onSubmit=${submit}>
      <div className="field">
        <label className="field-label" htmlFor="salute-to">To</label>
        <${HeroPicker} full=${true} selectId="salute-to" label="Hero" emptyLabel="Choose a hero" idValue=${to.id} nameValue=${to.name} onPick=${setTo} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="salute-text">What did they do?</label>
        <textarea id="salute-text" className="input" rows="2" maxLength="400" placeholder="Covered on-call so the rest of us could ship…" value=${text} onChange=${(e) => setText(e.target.value)} />
      </div>
      <div className="form-actions"><button type="submit" className="btn btn-primary" disabled=${!ready || busy}>Salute</button></div>
    </form>`;
  }
  function SaluteCard({ s }) {
    const { nameOf, me, act, readOnly } = useApp();
    const to = s.toId ? nameOf(s.toId) : (s.toName || 'A hero');
    const mine = !!me.id && s.author === me.id;
    return html`<li className="salute">
      <div className="salute-head"><${StarIcon} size=${18} className="salute-star" /><span className="salute-to">${to}</span></div>
      <p className="salute-text">${s.text}</p>
      <div className="salute-foot">
        <span>${s.example ? 'Example shout-out' : s.author ? 'From ' + nameOf(s.author) : 'From a teammate'}</span>
        ${!readOnly && (mine || me.facilitator) && html`<button type="button" className="link-btn" onClick=${() => act.deleteSalute(s.id)}>Delete</button>`}
      </div>
    </li>`;
  }
  function HallOfHeroes() {
    const { salutes, readOnly } = useApp();
    const list = salutes.slice().sort(byNewest);
    return html`<section className="panel" aria-labelledby="hall-title">
      <header className="panel-head">
        <h2 className="panel-title" id="hall-title">Hall of Heroes</h2>
        <p className="panel-sub">Who went above and beyond this mission? Thank them by name.</p>
      </header>
      ${!readOnly && html`<${SaluteComposer} />`}
      ${list.length === 0
        ? html`<p className="empty">No shout-outs yet.</p>`
        : html`<ul className="salutes">${list.map((s) => html`<${SaluteCard} key=${s.id} s=${s} />`)}</ul>`}
    </section>`;
  }
  function MissionReport() {
    const { mission, liveCards, voteTotals, ordersHere, salutes, ranked, canPdf, exportPdf, copySummary, exporting, moodTally, nameOf, totalStars } = useApp();
    const top = ranked.filter((it) => voteTotals[it.lead.id]).slice(0, 3);
    const checkedIn = moodTally.reduce((a, m) => a + m.n, 0);
    const stats = [['Notes', liveCards.length], ['Stars cast', totalStars], ['Orders', ordersHere.length], ['Shout-outs', salutes.length]];
    return html`<section className="panel" aria-labelledby="report-title">
      <header className="panel-head">
        <h2 className="panel-title" id="report-title">Mission report</h2>
        <p className="panel-sub">${[mission.sprint, fmtDate(mission.startedAt), checkedIn ? checkedIn + ' checked in' : ''].filter(Boolean).join(' · ')}</p>
      </header>
      <dl className="stats">${stats.map((s) => html`<div className="stat" key=${s[0]}><dt>${s[0]}</dt><dd>${s[1]}</dd></div>`)}</dl>
      <h3 className="mini-title"><span>Top items</span></h3>
      ${top.length
        ? html`<ol className="top-list">${top.map((it) => html`<li key=${it.lead.id}>
            <span className=${'dot col-' + it.lead.column}></span>
            <span>${it.lead.text}</span>
            <span className="stars"><${StarIcon} size=${13} />${voteTotals[it.lead.id]}</span>
          </li>`)}</ol>`
        : html`<p className="empty">No stars were cast in this mission.</p>`}
      <h3 className="mini-title"><span>Orders</span></h3>
      ${ordersHere.length
        ? html`<ul className="report-orders">${ordersHere.map((o) => html`<li key=${o.id} className=${o.status === 'done' ? 'is-done' : ''}>
            <span className="ro-text">${o.text}</span>
            <span className="ro-meta">${ownerLabel(o, nameOf) + (o.due ? ' · due ' + fmtDue(o.due) : '')}</span>
          </li>`)}</ul>`
        : html`<p className="empty">No orders were created.</p>`}
      <div className="report-actions">
        ${canPdf && html`<button type="button" className="btn btn-primary" disabled=${exporting} onClick=${exportPdf}>${exporting ? 'Preparing PDF…' : 'Download PDF report'}</button>`}
        <button type="button" className="btn btn-quiet" onClick=${copySummary}>Copy summary</button>
      </div>
    </section>`;
  }
  function SaluteView() {
    return html`<div className="split"><${HallOfHeroes} /><${MissionReport} /></div>`;
  }

  // ---------- Dialogs ----------
  function Modal({ title, onClose, children }) {
    const ref = useRef(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(() => {
      const prev = document.activeElement;
      const el = ref.current;
      const first = el && el.querySelector('input, select, textarea, button');
      if (first) first.focus();
      const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
      document.addEventListener('keydown', onKey);
      return () => { document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
    }, []);
    return html`<div className="backdrop" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref=${ref}>
        <h2 className="dialog-title" id="dialog-title">${title}</h2>
        ${children}
      </div>
    </div>`;
  }
  function NewMissionDialog() {
    const { act, missionsSorted, setDialog } = useApp();
    const last = missionsSorted[0];
    const [name, setName] = useState(() => opName());
    const [sprint, setSprint] = useState(() => (last && nextSprint(last.sprint)) || 'Sprint 1');
    const [stars, setStars] = useState('3');
    const [anon, setAnon] = useState(false);
    const [busy, setBusy] = useState(false);
    const close = () => setDialog(null);
    const submit = async (e) => {
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      const ok = await act.createMission({ name: name.trim() || opName(), sprint: sprint.trim(), votesPerHero: Number(stars) || 3, anonymous: anon });
      setBusy(false);
      if (ok) close();
    };
    return html`<${Modal} title="Launch a new mission" onClose=${close}>
      <form className="form" onSubmit=${submit}>
        <div className="field">
          <label className="field-label" htmlFor="nm-name">Mission name</label>
          <div className="input-row">
            <input id="nm-name" className="input" maxLength="60" value=${name} onChange=${(e) => setName(e.target.value)} />
            <button type="button" className="btn btn-quiet btn-sm" onClick=${() => setName(opName())}>Suggest</button>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor="nm-sprint">Sprint</label>
            <input id="nm-sprint" className="input" maxLength="30" value=${sprint} onChange=${(e) => setSprint(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="nm-stars">Stars per hero</label>
            <select id="nm-stars" className="select-full" value=${stars} onChange=${(e) => setStars(e.target.value)}>
              ${[1, 2, 3, 4, 5, 6].map((n) => html`<option key=${n} value=${String(n)}>${n}</option>`)}
            </select>
          </div>
        </div>
        <label className="check-row" htmlFor="nm-anon">
          <input id="nm-anon" type="checkbox" checked=${anon} onChange=${(e) => setAnon(e.target.checked)} />
          <span>Hide who wrote each note</span>
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn btn-quiet" onClick=${close}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled=${busy}>${busy ? 'Launching…' : 'Launch mission'}</button>
        </div>
      </form>
    <//>`;
  }
  function DeleteDialog() {
    const { mission, act, setDialog } = useApp();
    const [busy, setBusy] = useState(false);
    const close = () => setDialog(null);
    if (!mission) return null;
    const remove = async () => {
      setBusy(true);
      const ok = await act.deleteMission(mission.id);
      setBusy(false);
      if (ok) close();
    };
    return html`<${Modal} title="Delete this mission?" onClose=${close}>
      <p className="dialog-body">“${mission.name}” and its notes, orders and shout-outs will be removed for everyone. This can't be undone.</p>
      <div className="dialog-actions">
        <button type="button" className="btn btn-quiet" onClick=${close}>Keep mission</button>
        <button type="button" className="btn btn-danger" disabled=${busy} onClick=${remove}>${busy ? 'Deleting…' : 'Delete mission'}</button>
      </div>
    <//>`;
  }
  function ResetDialog() {
    const { resetBoard, setDialog, showToast } = useApp();
    const close = () => setDialog(null);
    return html`<${Modal} title="Reset this board?" onClose=${close}>
      <p className="dialog-body">Every mission, note, vote, order and shout-out saved in this browser will be replaced by the two example missions. This can't be undone.</p>
      <div className="dialog-actions">
        <button type="button" className="btn btn-quiet" onClick=${close}>Keep my board</button>
        <button type="button" className="btn btn-danger" onClick=${() => { resetBoard(); close(); showToast('Board reset to the example missions.'); }}>Reset board</button>
      </div>
    <//>`;
  }
  function CopyDialog({ text }) {
    const { setDialog } = useApp();
    const ref = useRef(null);
    useEffect(() => { if (ref.current) { ref.current.focus(); ref.current.select(); } }, []);
    return html`<${Modal} title="Copy the summary" onClose=${() => setDialog(null)}>
      <p className="dialog-body">Automatic copying isn't available here. The summary is selected below, so press Ctrl+C (or ⌘C) to copy it.</p>
      <label className="sr-only" htmlFor="copy-area">Mission summary</label>
      <textarea id="copy-area" ref=${ref} className="input copy-area" readOnly rows="10" value=${text} />
      <div className="dialog-actions"><button type="button" className="btn btn-primary" onClick=${() => setDialog(null)}>Done</button></div>
    <//>`;
  }

  // ---------- Empty and loading states ----------
  function LoadingBoard() {
    return html`<${Fragment}>
      <p className="loading-note" role="status">Connecting to mission control…</p>
      <div className="board">
        ${SECTIONS.map((s) => html`<section key=${s.key} className=${'column col-' + s.key}>
          <${ColumnHead} sec=${s} count=${null} />
          <div className="col-body"><p className="col-empty">Loading notes…</p></div>
        </section>`)}
      </div>
    <//>`;
  }
  function NoMissions() {
    const { me, readOnly, setDialog } = useApp();
    const facil = me.facilitator && !readOnly;
    return html`<section className="panel empty-hero">
      <${Emblem} size=${72} />
      <h2 className="panel-title">No missions yet</h2>
      <p>${facil ? 'Launch the first mission, then share this page with your squad.' : 'The facilitator has not launched a mission yet. This page updates as soon as they do.'}</p>
      ${facil && html`<button type="button" className="btn btn-primary" onClick=${() => setDialog({ type: 'new' })}>Launch a mission</button>`}
    </section>`;
  }

  // ---------- Plain-language guide ----------
  const GUIDE_STEPS = [
    ['Check in', 'Everyone says how they feel today, and the team checks whether the tasks from last time got done.'],
    ['Write notes', "Each person writes short notes in four boxes: what helped us, what we did well, what caused problems, and ideas for next time. Other people's notes stay hidden until everyone has finished."],
    ['Read and group', 'All notes are shown. Put notes that say the same thing together.'],
    ['Vote', 'Everyone gets 3 stars to give to the notes that matter most.'],
    ['Make a plan', 'Turn the top notes into tasks. Each task gets one person responsible and a due date.'],
    ['Say thanks', 'Thank the teammates who helped, then download or copy a summary of the meeting.'],
  ];
  const GLOSSARY = [
    ['Mission', 'one meeting'],
    ['Heroes', 'team members'],
    ['Stars', 'votes'],
    ['Mission orders', 'tasks to do'],
    ['Facilitator', 'the person running the meeting'],
  ];
  function Guide({ onHide }) {
    return html`<section className="guide" aria-labelledby="guide-title">
      <div className="guide-head">
        <h2 className="guide-title" id="guide-title">How this works</h2>
        <button type="button" className="btn btn-quiet btn-sm" onClick=${onHide}>Hide guide</button>
      </div>
      <div>
        <p><strong>What is it?</strong> A simple online board for a team meeting where you look back on the last few weeks of work and agree on what to do better next time. Teams often call this meeting a retrospective (or retro for short).</p>
        <p>${STANDALONE
          ? 'One person runs the meeting on a shared screen and moves the team from step to step. Everything is saved in this browser only.'
          : 'One person runs the meeting and moves everyone from step to step. Everyone else joins from their own device.'}</p>
        <p className="guide-label">The superhero words</p>
        <ul className="glossary">${GLOSSARY.map((g) => html`<li key=${g[0]}><strong>${g[0]}</strong> means ${g[1]}</li>`)}</ul>
      </div>
      <ol className="guide-steps">
        ${GUIDE_STEPS.map((s) => html`<li key=${s[0]}><strong>${s[0]}.</strong> ${s[1]}</li>`)}
      </ol>
    </section>`;
  }

  // ---------- About ----------
  const TECH = ['HTML5', 'CSS3', 'JavaScript (ES2020)', 'React 18', 'htm'];
  function About() {
    return html`<footer className="about">
      <div>
        <h2 className="about-title">About this project</h2>
        <p>Captain's Shield Retro is a free online board for team meetings where you look back on recent work. The team writes short notes about what went well and what went wrong, votes on the most important ones, and leaves with a short list of tasks, each with a person responsible. The superhero theme is there to make the meeting more fun. It is inspired by TeamRetro's Captain America Agile Mission Retrospective template.</p>
      </div>
      <div>
        <h2 className="about-title">Built with</h2>
        <ul className="tech">${TECH.map((t) => html`<li key=${t}>${t}</li>`)}</ul>
      </div>
    </footer>`;
  }

  // ---------- App ----------
  function App() {
    const [mode, setMode] = useState('loading');
    const [db, setDb] = useState(null);
    const [userApi, setUserApi] = useState(null);
    const [room, setRoom] = useState(null);
    const [downloads, setDownloads] = useState(null);
    const [me, setMe] = useState({ id: null, facilitator: false, canWrite: null });
    const [missions, setMissions] = useState(null);
    const [cards, setCards] = useState([]);
    const [cardsFor, setCardsFor] = useState(null);
    const [heroes, setHeroes] = useState({});
    const [orders, setOrders] = useState([]);
    const [salutes, setSalutes] = useState([]);
    const [missionId, setMissionIdState] = useState(() => lsGet(LS_MISSION));
    const [peers, setPeers] = useState([]);
    const [profiles, setProfiles] = useState({});
    const [readOnly, setReadOnly] = useState(false);
    const [dialog, setDialog] = useState(null);
    const [toast, setToast] = useState(null);
    const [ui, setUiState] = useState({ stackSource: null });
    const [exporting, setExporting] = useState(false);
    const [guideOpen, setGuideOpen] = useState(() => lsGet(LS_GUIDE) !== 'hidden');
    const hideGuide = useCallback(() => { setGuideOpen(false); lsSet(LS_GUIDE, 'hidden'); }, []);
    const showGuide = useCallback(() => { setGuideOpen(true); lsSet(LS_GUIDE, null); }, []);

    const myHeroRef = useRef(null);
    const heroPending = useRef(0);
    const heroQueue = useRef(Promise.resolve());
    const pendingMission = useRef(null);
    const toastTimer = useRef(null);

    const setUi = useCallback((patch) => setUiState((u) => Object.assign({}, u, patch)), []);
    const showToast = useCallback((text) => {
      setToast({ text, key: Date.now() });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 4500);
    }, []);
    const selectMission = useCallback((id) => {
      setMissionIdState(id || null);
      lsSet(LS_MISSION, id || null);
      setUiState((u) => (u.stackSource ? Object.assign({}, u, { stackSource: null }) : u));
    }, []);

    // Connect to shared storage, or fall back to practice mode in this tab.
    useEffect(() => {
      let settled = false;
      const practice = () => {
        if (settled) return;
        settled = true;
        setDb(createMemoryDb(sampleDocs(), STANDALONE ? LS_DEMO : null));
        setMe({ id: PRACTICE_ID, facilitator: true, canWrite: true });
        setMode('practice');
      };
      const c = window.claude;
      if (!c || typeof c.use !== 'function') { practice(); return undefined; }
      c.use('db').then((d) => {
        if (!d) { practice(); return; }
        if (settled) return;
        settled = true;
        setDb(d);
        setMode('shared');
      }, practice);
      c.use('user').then((u) => { if (u) setUserApi(u); }, () => {});
      c.use('room').then((r) => { if (r) setRoom(r); }, () => {});
      c.use('downloads').then((d) => { if (d) setDownloads(d); }, () => {});
      return undefined;
    }, []);

    useEffect(() => {
      if (mode !== 'shared' || !userApi) return undefined;
      let alive = true;
      Promise.all([userApi.id(), userApi.canEdit(), userApi.can('data.write')]).then((r) => {
        if (alive) setMe({ id: r[0] || null, facilitator: !!r[1], canWrite: r[2] });
      }, () => {});
      return () => { alive = false; };
    }, [mode, userApi]);
    useEffect(() => { if (me.canWrite === false) setReadOnly(true); }, [me.canWrite]);

    // Live data
    useEffect(() => {
      if (!db) return undefined;
      const onErr = (e) => { console.warn('[captains-shield] live data stopped', e && e.code); if (e && (e.code === 'revoked' || e.code === 'not_granted')) setReadOnly(true); };
      const rows = (s) => s.docs.filter((d) => d.exists).map((d) => Object.assign({ id: d.id }, d.data()));
      const offs = [
        db.collection('missions').onSnapshot((s) => setMissions(rows(s)), onErr),
        db.collection('heroes').onSnapshot((s) => { const m = {}; s.docs.forEach((d) => { if (d.exists) m[d.id] = d.data(); }); setHeroes(m); }, onErr),
        db.collection('orders').onSnapshot((s) => setOrders(rows(s)), onErr),
      ];
      return () => offs.forEach((f) => f());
    }, [db]);
    useEffect(() => {
      if (!db || !missionId) return undefined;
      const mid = missionId;
      const onErr = (e) => { console.warn('[captains-shield] live data stopped', e && e.code); if (e && (e.code === 'revoked' || e.code === 'not_granted')) setReadOnly(true); };
      const rows = (s) => s.docs.filter((d) => d.exists).map((d) => Object.assign({ id: d.id }, d.data()));
      const offs = [
        db.collection('cards').where('mission', '==', mid).onSnapshot((s) => { setCards(rows(s)); setCardsFor(mid); }, onErr),
        db.collection('salutes').where('mission', '==', mid).onSnapshot((s) => setSalutes(rows(s)), onErr),
      ];
      return () => offs.forEach((f) => f());
    }, [db, missionId]);

    const missionsSorted = useMemo(() => (missions || []).slice().sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)), [missions]);
    useEffect(() => {
      if (!missions) return;
      if (missionId && missions.some((m) => m.id === missionId)) {
        if (pendingMission.current === missionId) pendingMission.current = null;
        return;
      }
      if (missionId && pendingMission.current === missionId) return;
      const next = missionsSorted.length ? missionsSorted[0].id : null;
      if (next !== missionId) selectMission(next);
    }, [missions, missionsSorted, missionId, selectMission]);

    // Who is here right now
    useEffect(() => {
      if (!room) return undefined;
      return room.onPeers((ch) => setPeers(ch.peers), () => setPeers([]));
    }, [room]);
    useEffect(() => { if (room && missionId) room.presence({ m: missionId }).catch(() => {}); }, [room, missionId]);
    const setWriting = useCallback((col) => { if (room) room.presence({ w: col || null }).catch(() => {}); }, [room]);

    // Derived state
    const mission = (missions || []).find((m) => m.id === missionId) || null;
    const missionsById = useMemo(() => { const o = {}; (missions || []).forEach((m) => { o[m.id] = m; }); return o; }, [missions]);
    const stage = mission && STAGE_INDEX[mission.stage] != null ? mission.stage : 'assemble';
    const stageDef = STAGES[STAGE_INDEX[stage]];
    const cardsReady = cardsFor === missionId;
    const liveCards = useMemo(() => cards.filter((c) => c.mission === missionId), [cards, missionId]);
    const cardsById = useMemo(() => { const o = {}; liveCards.forEach((c) => { o[c.id] = c; }); return o; }, [liveCards]);
    const rootOf = useCallback((id) => {
      let c = cardsById[id];
      let n = 0;
      while (c && c.group && c.group !== c.id && cardsById[c.group] && n < 8) { c = cardsById[c.group]; n += 1; }
      return c ? c.id : null;
    }, [cardsById]);
    const groups = useMemo(() => {
      const leads = [];
      const kids = {};
      liveCards.forEach((c) => { const r = rootOf(c.id); if (r === c.id) leads.push(c); else (kids[r] = kids[r] || []).push(c); });
      return leads.sort(byNewest).map((lead) => ({ lead, children: (kids[lead.id] || []).sort(byOldest) }));
    }, [liveCards, rootOf]);
    const voteTotals = useMemo(() => {
      const t = {};
      Object.keys(heroes).forEach((uid) => {
        const h = heroes[uid];
        const v = h && h.missions && h.missions[missionId] && h.missions[missionId].votes;
        if (Array.isArray(v)) v.forEach((id) => { const r = rootOf(id); if (r) t[r] = (t[r] || 0) + 1; });
      });
      return t;
    }, [heroes, missionId, rootOf]);
    const totalStars = Object.keys(voteTotals).reduce((a, k) => a + voteTotals[k], 0);
    const starsPer = (mission && mission.votesPerHero) || 3;
    const myMission = me.id && heroes[me.id] && heroes[me.id].missions ? heroes[me.id].missions[missionId] : null;
    const myVotes = ((myMission && myMission.votes) || []).filter((v) => rootOf(v));
    const myVoteSet = new Set(myVotes.map(rootOf));
    const starsLeft = Math.max(0, starsPer - myVotes.length);
    const sectionsWithItems = SECTIONS.map((s) => Object.assign({}, s, { items: groups.filter((g) => g.lead.column === s.key) }));
    const ranked = useMemo(() => groups.slice().sort((a, b) =>
      ((voteTotals[b.lead.id] || 0) - (voteTotals[a.lead.id] || 0)) ||
      ((SECTION_INDEX[a.lead.column] || 0) - (SECTION_INDEX[b.lead.column] || 0)) ||
      byOldest(a.lead, b.lead)), [groups, voteTotals]);
    const ordersHere = useMemo(() => orders.filter((o) => o.mission === missionId).sort(byOldest), [orders, missionId]);
    const salutesHere = useMemo(() => salutes.filter((s) => s.mission === missionId), [salutes, missionId]);
    const moodTally = useMemo(() => {
      const t = MOODS.map((m) => Object.assign({ n: 0 }, m));
      Object.keys(heroes).forEach((uid) => {
        const h = heroes[uid];
        const mood = h && h.missions && h.missions[missionId] && h.missions[missionId].mood;
        const row = t.find((x) => x.key === mood);
        if (row) row.n += 1;
      });
      return t;
    }, [heroes, missionId]);

    // Keep my own check-in/vote document current between writes.
    useEffect(() => { if (heroPending.current === 0) myHeroRef.current = me.id ? (heroes[me.id] || null) : null; }, [heroes, me.id]);
    useEffect(() => { setUiState((u) => (u.stackSource ? Object.assign({}, u, { stackSource: null }) : u)); }, [stage]);

    // Names and avatars for everyone the board mentions
    const idsKey = useMemo(() => {
      const s = new Set();
      if (me.id) s.add(me.id);
      Object.keys(heroes).forEach((id) => s.add(id));
      liveCards.forEach((c) => { if (c.author) s.add(c.author); });
      orders.forEach((o) => { if (o.ownerId) s.add(o.ownerId); });
      salutesHere.forEach((x) => { if (x.toId) s.add(x.toId); if (x.author) s.add(x.author); });
      peers.forEach((p) => { if (p.by) s.add(p.by); });
      s.delete(PRACTICE_ID);
      return Array.from(s).sort().join('|');
    }, [me.id, heroes, liveCards, orders, salutesHere, peers]);
    useEffect(() => {
      if (!userApi || !idsKey) return undefined;
      let alive = true;
      userApi.profiles(idsKey.split('|')).then((ps) => { if (alive && ps) setProfiles((prev) => Object.assign({}, prev, ps)); }, () => {});
      return () => { alive = false; };
    }, [userApi, idsKey]);
    const nameOf = useCallback((id) => {
      if (!id) return 'A teammate';
      if (id === me.id || id === PRACTICE_ID) return 'You';
      const p = profiles[id];
      return (p && p.name) || 'A teammate';
    }, [profiles, me.id]);
    const fullName = useCallback((id) => {
      const p = id ? profiles[id] : null;
      if (p && p.name) return p.name;
      return id && (id === me.id || id === PRACTICE_ID) ? 'You' : 'A teammate';
    }, [profiles, me.id]);
    const heroIds = useMemo(() => {
      const s = new Set();
      Object.keys(heroes).forEach((id) => s.add(id));
      liveCards.forEach((c) => { if (c.author) s.add(c.author); });
      peers.forEach((p) => { if (p.by) s.add(p.by); });
      if (me.id) s.delete(me.id);
      const others = Array.from(s).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      return me.id ? [me.id].concat(others) : others;
    }, [heroes, liveCards, peers, me.id, nameOf]);

    // Writes
    const live = useRef(null);
    live.current = { db, missionId, me, liveCards, cardsById, rootOf, starsPer };
    const act = useMemo(() => {
      const L = () => live.current;
      const fail = (e, fallback) => {
        const code = e && e.code;
        console.warn('[captains-shield] change not saved', code, e && e.message);
        const who = L().me;
        if (code === 'invalid_argument') {
          if (who.canWrite === false || (who.canWrite == null && !who.facilitator)) {
            setReadOnly(true);
            showToast("You can view this mission but can't change it. Ask the owner for Contributor access.");
          } else showToast(fallback || "That change wasn't accepted. Reload the page and try again.");
          return;
        }
        if (code === 'quota_exceeded') { showToast('The board is full. Delete an old mission to make room.'); return; }
        if (code === 'resource_exhausted') { showToast('Too many changes at once. Wait a moment and try again.'); return; }
        if (code === 'revoked' || code === 'not_granted') { setReadOnly(true); return; }
        showToast(fallback || "That change didn't save. Check your connection and try again.");
      };
      const write = async (fn, fallback) => {
        try { await fn(); return true; } catch (e) {
          if (e && e.code === 'unavailable') {
            await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
            try { await fn(); return true; } catch (e2) { fail(e2, fallback); return false; }
          }
          fail(e, fallback);
          return false;
        }
      };
      const heroWrite = (mutate) => {
        const s = L();
        if (!s.me.id) { showToast('Sign in to claude.ai to check in and vote.'); return; }
        const uid = s.me.id;
        const mid = s.missionId;
        const cur = myHeroRef.current || { missions: {} };
        const curMissions = cur.missions || {};
        const nextM = mutate(Object.assign({ mood: null, votes: [] }, curMissions[mid] || {}));
        const nextDoc = Object.assign({}, cur, { missions: Object.assign({}, curMissions, { [mid]: nextM }) });
        myHeroRef.current = nextDoc;
        heroPending.current += 1;
        setHeroes((h) => Object.assign({}, h, { [uid]: nextDoc }));
        heroQueue.current = heroQueue.current
          .then(() => write(() => s.db.doc('heroes/' + uid).set(nextDoc)))
          .finally(() => { heroPending.current -= 1; });
      };
      return {
        addCard(column, text) {
          const s = L();
          return write(() => s.db.collection('cards').add({ mission: s.missionId, column, text, author: s.me.id || null, createdAt: Date.now(), group: null }));
        },
        editCard(id, text) { return write(() => L().db.doc('cards/' + id).update({ text })); },
        deleteCard(id) {
          const s = L();
          const kids = s.liveCards.filter((c) => c.group === id).sort(byOldest);
          return write(async () => {
            if (kids.length) {
              await s.db.doc('cards/' + kids[0].id).update({ group: null });
              for (let i = 1; i < kids.length; i++) await s.db.doc('cards/' + kids[i].id).update({ group: kids[0].id });
            }
            await s.db.doc('cards/' + id).delete();
          });
        },
        stack(sourceId, targetId) {
          const s = L();
          const src = s.cardsById[sourceId];
          const target = s.rootOf(targetId);
          if (!src || !target || s.rootOf(sourceId) === target) return Promise.resolve(false);
          const column = s.cardsById[target].column;
          const isChild = !!(src.group && s.cardsById[src.group]);
          const moving = isChild ? [src] : [src].concat(s.liveCards.filter((c) => c.group === src.id));
          return write(async () => { for (const c of moving) await s.db.doc('cards/' + c.id).update({ group: target, column }); });
        },
        moveTo(sourceId, column) {
          const s = L();
          const src = s.cardsById[sourceId];
          if (!src) return Promise.resolve(false);
          const isChild = !!(src.group && s.cardsById[src.group]);
          if (!isChild && src.column === column) return Promise.resolve(false);
          const kids = isChild ? [] : s.liveCards.filter((c) => c.group === src.id);
          return write(async () => {
            await s.db.doc('cards/' + src.id).update({ group: null, column });
            for (const k of kids) await s.db.doc('cards/' + k.id).update({ column });
          });
        },
        unstack(id) { return write(() => L().db.doc('cards/' + id).update({ group: null })); },
        toggleVote(leadId) {
          const s = L();
          if (!s.me.id) { showToast('Sign in to claude.ai to vote.'); return; }
          const mine = myHeroRef.current && myHeroRef.current.missions && myHeroRef.current.missions[s.missionId];
          const current = ((mine && mine.votes) || []).filter((v) => s.rootOf(v));
          const idx = current.findIndex((v) => s.rootOf(v) === leadId);
          let nextVotes;
          if (idx >= 0) nextVotes = current.filter((_, i) => i !== idx);
          else if (current.length < s.starsPer) nextVotes = current.concat([leadId]);
          else { showToast("You've used all " + s.starsPer + ' stars. Take one back to move it.'); return; }
          heroWrite((m) => Object.assign({}, m, { votes: nextVotes }));
        },
        setMood(key) { heroWrite((m) => Object.assign({}, m, { mood: m.mood === key ? null : key })); },
        setStage(key) { const s = L(); return write(() => s.db.doc('missions/' + s.missionId).update({ stage: key, timerEndsAt: null, focus: null }), FACIL_MSG); },
        setTimer(ms) { const s = L(); return write(() => s.db.doc('missions/' + s.missionId).update({ timerEndsAt: ms }), FACIL_MSG); },
        setFocus(id) { const s = L(); return write(() => s.db.doc('missions/' + s.missionId).update({ focus: id }), FACIL_MSG); },
        async createMission(data) {
          const s = L();
          const ref = s.db.collection('missions').doc();
          pendingMission.current = ref.id;
          const ok = await write(() => ref.set({
            name: data.name, sprint: data.sprint, startedAt: Date.now(), stage: 'assemble', votesPerHero: data.votesPerHero,
            anonymous: !!data.anonymous, example: false, timerEndsAt: null, focus: null, createdBy: s.me.id || null,
          }), FACIL_MSG);
          if (ok) { selectMission(ref.id); showToast('Mission launched. Share this page with your squad so they can join.'); }
          else pendingMission.current = null;
          return ok;
        },
        async deleteMission(id) {
          const s = L();
          const ok = await write(async () => {
            for (const name of ['cards', 'salutes', 'orders']) {
              const snap = await s.db.collection(name).where('mission', '==', id).get();
              const ids = snap.docs.map((d) => d.id);
              for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i + 4).map((x) => s.db.doc(name + '/' + x).delete()));
            }
            await s.db.doc('missions/' + id).delete();
          }, 'The mission was only partly deleted. Try again.');
          if (ok) showToast('Mission deleted.');
          return ok;
        },
        addOrder(o) {
          const s = L();
          return write(() => s.db.collection('orders').add({
            mission: s.missionId, text: o.text, ownerId: o.ownerId || null, ownerName: o.ownerName || null, due: o.due || null,
            card: o.card || null, status: 'open', doneAt: null, createdAt: Date.now(), author: s.me.id || null,
          }));
        },
        updateOrder(id, patch) { return write(() => L().db.doc('orders/' + id).update(patch)); },
        deleteOrder(id) { return write(() => L().db.doc('orders/' + id).delete()); },
        addSalute(x) {
          const s = L();
          return write(() => s.db.collection('salutes').add({ mission: s.missionId, toId: x.toId || null, toName: x.toName || null, text: x.text, author: s.me.id || null, createdAt: Date.now() }));
        },
        deleteSalute(id) { return write(() => L().db.doc('salutes/' + id).delete()); },
      };
    }, [showToast, selectMission]);

    // Exports
    const buildReport = () => {
      const within = (key) => ranked.filter((it) => it.lead.column === key);
      return {
        title: mission.name,
        subtitle: ['Mission report', mission.sprint, fmtDate(mission.startedAt)].filter(Boolean).join(' · '),
        stats: [
          { label: 'Notes', value: liveCards.length },
          { label: 'Stars cast', value: totalStars },
          { label: 'Orders', value: ordersHere.length },
          { label: 'Shout-outs', value: salutesHere.length },
        ],
        moods: moodTally,
        sections: SECTIONS.map((s) => ({
          key: s.key, name: s.name, q: s.q,
          items: within(s.key).map((it) => ({ text: it.lead.text, stars: voteTotals[it.lead.id] || 0, kids: it.children.map((c) => c.text) })),
        })),
        orders: ordersHere.map((o) => ({ text: o.text, owner: o.ownerId ? fullName(o.ownerId) : (o.ownerName || 'Unassigned'), due: o.due ? fmtDue(o.due) : '', done: o.status === 'done' })),
        salutes: salutesHere.slice().sort(byOldest).map((x) => ({ to: x.toId ? fullName(x.toId) : (x.toName || 'A hero'), text: x.text, from: x.author ? fullName(x.author) : '' })),
      };
    };
    const copySummary = () => {
      if (!mission) return;
      const text = buildMarkdown(buildReport());
      const fallback = () => setDialog({ type: 'copy', text });
      try {
        navigator.clipboard.writeText(text).then(() => showToast('Summary copied. Paste it into chat or your wiki.'), fallback);
      } catch (e) { fallback(); }
    };
    const exportPdf = async () => {
      if ((!downloads && !STANDALONE) || !mission || exporting) return;
      setExporting(true);
      try {
        const JsPDF = await loadJsPdf();
        const data = buildPdf(JsPDF, buildReport());
        const filename = slug(mission.name) + '-mission-report.pdf';
        if (downloads) {
          const res = await downloads.save({ filename, data });
          if (res && res.status === 'saved') showToast('Mission report saved.');
        } else {
          const href = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
          const a = document.createElement('a');
          a.href = href;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(href), 10000);
          showToast('Mission report downloaded.');
        }
      } catch (e) {
        const code = e && e.code;
        if (code === 'declined') { /* the viewer chose not to save */ }
        else if (code === 'rate_limited') showToast('A download prompt is already open.');
        else if (code && ['unavailable', 'not_granted', 'capability_disabled', 'capability_removed', 'extension_not_enabled'].indexOf(code) >= 0) {
          setDownloads(null);
          showToast('Downloads are not available here. Use Copy summary instead.');
        } else showToast("The PDF couldn't be created. Try again, or use Copy summary.");
      } finally { setExporting(false); }
    };

    const ctx = {
      mode, me, readOnly, mission, missionId, missionsSorted, missionsById, selectMission, stage, stageDef, act, ui, setUi, setDialog, showToast,
      sectionsWithItems, ranked, liveCards, cardsReady, cardsById, voteTotals, totalStars, myVoteSet, starsLeft, starsPer, heroes,
      orders, ordersHere, salutes: salutesHere, moodTally, peers, profiles, nameOf, heroIds, setWriting, canPdf: !!downloads || STANDALONE, exportPdf, copySummary, exporting, guideOpen, showGuide,
      resetBoard: () => { if (db && typeof db.reset === 'function') db.reset(); },
    };

    let body;
    if (mode === 'loading' || missions === null) body = html`<${LoadingBoard} />`;
    else if (!mission) body = html`<${NoMissions} />`;
    else {
      let view;
      if (stage === 'assemble') view = html`<${AssembleView} />`;
      else if (stage === 'discuss') view = html`<${DiscussView} />`;
      else if (stage === 'salute') view = html`<${SaluteView} />`;
      else view = html`<${BoardView} />`;
      body = html`<${Fragment}><${StageTrack} /><${Briefing} /><main>${view}</main><//>`;
    }

    let dialogEl = null;
    if (dialog && dialog.type === 'new') dialogEl = html`<${NewMissionDialog} />`;
    else if (dialog && dialog.type === 'delete') dialogEl = html`<${DeleteDialog} />`;
    else if (dialog && dialog.type === 'copy') dialogEl = html`<${CopyDialog} text=${dialog.text} />`;
    else if (dialog && dialog.type === 'reset') dialogEl = html`<${ResetDialog} />`;

    return html`<${Ctx.Provider} value=${ctx}>
      <${TopBar} />
      <div className="wrap">
        ${guideOpen && html`<${Guide} onHide=${hideGuide} />`}
        ${mode === 'practice' && STANDALONE && html`<div className="banner"><span className="banner-tag">Browser copy</span><span>Everything you add is saved in this browser only, so run the retro from one shared screen.</span><button type="button" className="link-btn" onClick=${() => setDialog({ type: 'reset' })}>Reset to the examples</button></div>`}
        ${mode === 'practice' && !STANDALONE && html`<div className="banner"><span className="banner-tag">Practice mode</span><span>This view can't reach shared storage, so changes stay in this tab. Open the published page to run a live retro with your squad.</span></div>`}
        ${readOnly && html`<div className="banner"><span className="banner-tag">View only</span><span>You can follow this mission, but you can't add notes or vote. Ask the owner for Contributor access.</span></div>`}
        ${mode === 'shared' && mission && mission.example && me.facilitator && !readOnly && html`<div className="banner"><span className="banner-tag">Example mission</span><span>Try every stage here, then choose New mission for your real retro. Share this page with your squad as Contributors so they can add notes and vote; Editors also get the facilitator controls.</span></div>`}
        ${body}
        <${About} />
      </div>
      ${dialogEl}
      ${ui.stackSource && stage === 'group' && html`<${StackBar} />`}
      ${toast && html`<div className="toast" role="status" key=${toast.key}>${toast.text}</div>`}
    <//>`;
  }

  class Boundary extends React.Component {
    constructor(props) { super(props); this.state = { failed: false }; }
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(err) { console.error('[captains-shield]', err); }
    render() {
      if (this.state.failed) {
        return html`<div className="wrap"><section className="panel empty-hero"><h2 className="panel-title">The board hit a snag</h2><p>Reload the page to reconnect.</p></section></div>`;
      }
      return this.props.children;
    }
  }

  ReactDOM.createRoot(document.getElementById('app')).render(html`<${Boundary}><${App} /><//>`);
})();
