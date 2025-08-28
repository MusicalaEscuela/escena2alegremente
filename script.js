/*************************************************
 *  ALEGREMENTE · Escenas – script.js (versión completa)
 *  - Plegables (con persistencia por card)
 *  - Checklist con estado persistente y copia al portapapeles
 *  - Reproductor de audio robusto (autoplay-friendly)
 *  - Visores PDF: Guion y Partitura (detección si no existen)
 *  - Filtros por área/centro/logística + búsqueda (persistentes + URL hash)
 *  - Recursos y Docentes renderizados dinámicamente
 *  - Overlay de imágenes (vista previa)
 *  - Accesibilidad básica y atajos
 **************************************************/

/* ==============================
   Utilidades generales
============================== */
const U = (() => {
  const qs = (sel, ctx = document) => ctx.querySelector(sel);
  const qsa = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);
  const debounce = (fn, ms = 250) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };
  const slug = (s) => (s || '')
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { return false; }
  };
  return { qs, qsa, on, debounce, slug, copy };
})();

/* ==============================
   Constantes de almacenamiento
============================== */
const STORAGE = {
  FILTERS: 'escena2_filters_v1',
  FOLDS:   'escena2_folds_v1',
  CHECK:   'escena2_check_v1'
};

/* ==============================
   Plegables de Cards (con persistencia)
============================== */
(function(){
  function cardId(card, idx){
    const h = card.querySelector('header h2');
    return 'card-' + (U.slug(h?.textContent) || idx);
  }

  function getState(){
    try { return JSON.parse(localStorage.getItem(STORAGE.FOLDS) || '{}'); }
    catch { return {}; }
  }
  function setState(state){ localStorage.setItem(STORAGE.FOLDS, JSON.stringify(state || {})); }

  function toggleHeader(h){
    const card = h.parentElement;
    const content = card.querySelector('.content');
    const caret = h.querySelector('.caret');
    if (!content) return;
    const open = content.style.display !== 'none';
    content.style.display = open ? 'none' : 'block';
    if (caret) caret.textContent = open ? 'Expandir' : 'Contraer';

    // persistir
    const id = card.getAttribute('data-id');
    const st = getState();
    st[id] = !open;
    setState(st);
  }

  // expone global para HTML inline
  window.toggle = toggleHeader;

  document.addEventListener('DOMContentLoaded', () => {
    const cards = U.qsa('.card');
    const st = getState();

    cards.forEach((card, i) => {
      const id = cardId(card, i);
      card.setAttribute('data-id', id);

      const hdr = card.querySelector('header');
      if (hdr && !hdr.querySelector('.caret')) {
        const span = document.createElement('span');
        span.className = 'caret';
        span.textContent = 'Contraer';
        hdr.appendChild(span);
      }

      // Enlace ancla por card
      if (hdr && !hdr.querySelector('.anchor-link')) {
        const a = document.createElement('button');
        a.className = 'anchor-link';
        a.type = 'button';
        a.title = 'Copiar enlace a esta sección';
        a.textContent = '🔗';
        a.style.marginLeft = '8px';
        a.style.fontSize = '14px';
        a.style.background = 'transparent';
        a.style.border = 'none';
        a.style.cursor = 'pointer';
        hdr.insertBefore(a, hdr.lastChild);
        U.on(a, 'click', async (e) => {
          e.stopPropagation();
          const url = `${location.origin}${location.pathname}#${id}`;
          const ok = await U.copy(url);
          if (ok) { a.textContent = '✅'; setTimeout(()=>a.textContent='🔗',900); }
        });
      }

      const isOpen = st[id] !== false; // por defecto abierto
      const content = card.querySelector('.content');
      if (content) content.style.display = isOpen ? 'block' : 'none';
      const caret = card.querySelector('.caret');
      if (caret) caret.textContent = isOpen ? 'Contraer' : 'Expandir';
    });

    // Abrir card si viene con hash
    if (location.hash) {
      const target = document.querySelector(location.hash);
      if (target && target.classList.contains('card')) {
        const c = target.querySelector('.content');
        const ca = target.querySelector('.caret');
        if (c && c.style.display === 'none') {
          c.style.display = 'block'; if (ca) ca.textContent = 'Contraer';
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // Botones opcionales (si existen en el HTML)
    const btnOpenAll = U.qs('#btnExpandAll');
    const btnCloseAll = U.qs('#btnCollapseAll');
    U.on(btnOpenAll, 'click', () => {
      const st = getState();
      U.qsa('.card').forEach(card => {
        const id = card.getAttribute('data-id');
        const c = card.querySelector('.content'); const ca = card.querySelector('.caret');
        if (c) c.style.display = 'block'; if (ca) ca.textContent = 'Contraer';
        st[id] = true;
      });
      setState(st);
    });
    U.on(btnCloseAll, 'click', () => {
      const st = getState();
      U.qsa('.card').forEach(card => {
        const id = card.getAttribute('data-id');
        const c = card.querySelector('.content'); const ca = card.querySelector('.caret');
        if (c) c.style.display = 'none'; if (ca) ca.textContent = 'Expandir';
        st[id] = false;
      });
      setState(st);
    });
  });
})();

/* ==============================
   Checklist (parsea [ ] a checkboxes + persistencia)
============================== */
(function(){
  function getState(){
    try { return JSON.parse(localStorage.getItem(STORAGE.CHECK) || '{}'); }
    catch { return {}; }
  }
  function setState(state){
    localStorage.setItem(STORAGE.CHECK, JSON.stringify(state || {}));
  }

  // convierte items " [ ] texto " en <label><input type=checkbox>texto</label>
  function enhanceChecklist(ul){
    if (!ul) return;
    const st = getState();
    Array.from(ul.children).forEach((li, idx) => {
      const raw = li.textContent.trim();
      const id  = (ul.id || 'checklist') + '-' + idx;
      const m = raw.match(/^\[( |x|X)\]\s*(.*)$/);
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.cursor = 'pointer';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.style.marginRight = '8px';
      const saved = st[id];
      const checked = saved != null ? !!saved : !!(m && /x/i.test(m[1]));
      input.checked = checked;

      const text = document.createElement('span');
      text.textContent = m ? m[2] : raw;

      li.textContent = '';
      li.appendChild(label);
      label.appendChild(input);
      label.appendChild(text);

      input.addEventListener('change', () => {
        const st = getState();
        st[id] = input.checked;
        setState(st);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    enhanceChecklist(document.getElementById('check-escena2'));
    enhanceChecklist(document.getElementById('check-escena1'));
    enhanceChecklist(document.getElementById('check-escena'));
    const btnCopy = document.getElementById('btnCopyChecklist');
    if (btnCopy) {
      btnCopy.addEventListener('click', async () => {
        const lines = U.qsa('#check-escena2 li span').map(s => s.textContent.trim());
        const ok = await U.copy(lines.join('\n') || 'Checklist no encontrada');
        alert(ok ? 'Checklist copiada.' : 'No se pudo copiar.');
      });
    }
  });

  // expone por si usas el onclick de tu HTML legado
  window.copyChecklist = async function(){
    const lines = U.qsa('#check-escena2 li span').map(s => s.textContent.trim());
    const ok = await U.copy(lines.join('\n') || 'Checklist no encontrada');
    alert(ok ? 'Checklist copiada.' : 'No se pudo copiar.');
  };
})();

/* ==============================
   Reproductor de Audio (robusto)
============================== */
(function(){
  const audio = document.getElementById('sceneAudio');
  const btn = document.getElementById('btnPlay');
  if (!audio || !btn) return;

  const sources = ['Mango Tango.mp3','mango-tango.mp3','MangoTango.mp3'];
  let idx = 0;

  function setSrc(f){ audio.src = encodeURI(f) + `?v=${Date.now()}`; }
  function updateBtn(){ btn.textContent = audio.paused ? '▶ Reproducir' : '⏸️ Pausar'; }
  function markBlocked(){
    btn.style.borderColor = '#f59e0b';
    btn.style.boxShadow = '0 0 0 3px rgba(245,158,11,.25)';
    btn.title = 'Tu navegador bloqueó el autoplay. Haz clic para iniciar.';
  }

  async function tryPlay(){
    try { await audio.play(); updateBtn(); }
    catch { markBlocked(); updateBtn(); }
  }

  document.addEventListener('DOMContentLoaded', tryPlay);
  setSrc(sources[idx]);

  const unlock = () => audio.play().then(updateBtn).catch(()=>{});
  window.addEventListener('pointerdown', unlock, { once:true, capture:true });
  window.addEventListener('keydown', unlock, { once:true, capture:true });
  window.addEventListener('touchstart', unlock, { once:true, capture:true });

  btn.addEventListener('click', async () => {
    try { if (audio.paused) await audio.play(); else audio.pause(); }
    catch {}
    updateBtn();
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !/input|textarea|select/i.test(e.target.tagName)) {
      e.preventDefault();
      if (audio.paused) audio.play().catch(()=>{}); else audio.pause();
      updateBtn();
    }
  });

  audio.addEventListener('error', () => {
    if (idx < sources.length - 1) { idx++; setSrc(sources[idx]); tryPlay(); }
    else alert('No se pudo cargar el audio. Revisa "Mango Tango.mp3".');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !audio.paused) audio.pause();
  });
})();

/* ==============================
   Visores PDF (Guion y Partitura)
============================== */
(function(){
  function canCheck(){ return /^https?:/.test(location.protocol); }
  function fileExists(url){
    if (!canCheck()) return Promise.resolve(false);
    return fetch(url, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
  }
  function setPdf(frame, view, down, url){
    const u = encodeURI(url);
    if (view) { view.href = u; view.setAttribute('rel', 'noreferrer'); }
    if (down) { down.href = u; down.download = url; }
    if (frame) frame.src = u + '#toolbar=1&navpanes=0&statusbar=0&view=FitH';
  }

  async function initGuion(){
    const frame = U.qs('#pdfFrame');
    const view  = U.qs('#pdfView');
    const down  = U.qs('#pdfDownload');
    const fb    = U.qs('#pdfFallback');
    const file  = 'Guión Escena II.pdf';
    if (!frame || !view || !down || !fb) return;

    const exists = canCheck() ? await fileExists(file) : true;
    if (exists) { setPdf(frame, view, down, file); fb.style.display='none'; frame.style.display=''; }
    else { frame.style.display='none'; fb.style.display='block'; view.href = encodeURI(file); down.href = encodeURI(file); }
  }

  async function initPartitura(){
    const card  = U.qs('#partituraCard'); if (!card) return;
    const frame = U.qs('#pdfFramePart');
    const view  = U.qs('#pdfViewPart');
    const down  = U.qs('#pdfDownloadPart');
    const fb    = U.qs('#pdfFallbackPart');
    const file  = 'Mango Tango Partitura.pdf';

    if (!/^https?:/.test(location.protocol)) { card.style.display = 'none'; return; }

    const exists = await fileExists(file);
    if (exists) { setPdf(frame, view, down, file); fb.style.display='none'; frame.style.display=''; card.style.display=''; }
    else { frame.style.display='none'; fb.style.display='block'; card.style.display=''; view.href = encodeURI(file); down.href = encodeURI(file); }
  }

  document.addEventListener('DOMContentLoaded', () => { initGuion(); initPartitura(); });

  // Abrir todo antes de imprimir y restaurar luego
  window.addEventListener('beforeprint', () => {
    U.qsa('.card .content').forEach(c => c.style.display='block');
    U.qsa('.card .caret').forEach(ca => ca.textContent='Contraer');
  });
})();

/* ==============================
   Filtros, Búsqueda, Recursos, Docentes
============================== */
(function(){
  const chips  = U.qsa('.chip');
  const cards  = U.qsa('.card');
  const q      = U.qs('#q');
  const ICON   = { pdf:'📄', audio:'🎵', sheet:'📊', doc:'📝', link:'🔗' };

  // Recursos base (ajusta aquí los nombres reales si cambian)
  let RESOURCES = [
    { title: 'Guión Escena II (PDF)', href: 'Guión Escena II.pdf', areas: ['teatro','produccion'], type: 'pdf' },
    { title: 'Pista: Mango Tango (MP3)', href: 'Mango Tango.mp3',   areas: ['musica'],           type: 'audio' }
  ];

  // Docentes ejemplo (ajusta URLs cuando existan)
  const TEACHERS = [
    { name: 'Brenda Giraldo',     url: 'docentes/brenda.html',   areas: ['teatro'],   centros: ['lucero'] },
    { name: 'Yusting Camila',     url: 'docentes/yusting.html',  areas: ['danza'],    centros: ['arroyo'] },
    { name: 'Santiago Gutiérrez', url: 'docentes/santiago.html', areas: ['plastica'], centros: ['jerusalen'] }
  ];

  /* ---------- Estado ---------- */
  function getFilters(){
    try { return JSON.parse(localStorage.getItem(STORAGE.FILTERS) || '{}'); }
    catch { return {}; }
  }
  function setFilters(st){ localStorage.setItem(STORAGE.FILTERS, JSON.stringify(st || {})); }

  function currentState(){
    const areas   = chips.filter(c => c.dataset.type==='area'   && c.classList.contains('active')).map(c => c.dataset.area);
    const centros = chips.filter(c => c.dataset.type==='centro' && c.classList.contains('active')).map(c => c.dataset.centro);
    const logs    = chips.filter(c => c.dataset.type==='log'    && c.classList.contains('active')).map(c => c.dataset.log);
    const query   = (q && q.value ? q.value.trim() : '');
    return { areas, centros, logs, query };
  }

  function stateMatches(card, st){
    const tags = (card.dataset.tags || 'general').split(/\s+/);
    const areaOk   = (st.areas.length   === 0) || st.areas.some(a => tags.includes(a));
    const centrosC = (card.dataset.centros || '').split(/\s+/).filter(Boolean);
    const centroOk = (st.centros.length === 0) || st.centros.some(c => centrosC.includes(c));
    const logsC    = (card.dataset.log     || '').split(/\s+/).filter(Boolean);
    const logOk    = (st.logs.length    === 0) || st.logs.some(l => logsC.includes(l));
    const textOk   = (card.textContent || '').toLowerCase().includes((st.query||'').toLowerCase());
    return areaOk && centroOk && logOk && textOk;
  }

  /* ---------- URL Hash <-> Estado ---------- */
  function stateToHash(st){
    const p = new URLSearchParams();
    if (st.areas?.length)   p.set('areas',   st.areas.join(','));
    if (st.centros?.length) p.set('centros', st.centros.join(','));
    if (st.logs?.length)    p.set('logs',    st.logs.join(','));
    if (st.query)           p.set('q',       st.query);
    return '#' + p.toString();
  }
  function hashToState(){
    const h = location.hash.startsWith('#') ? location.hash.slice(1) : '';
    const p = new URLSearchParams(h);
    return {
      areas:   (p.get('areas')   || '').split(',').filter(Boolean),
      centros: (p.get('centros') || '').split(',').filter(Boolean),
      logs:    (p.get('logs')    || '').split(',').filter(Boolean),
      query:   p.get('q') || ''
    };
  }

  /* ---------- Render ---------- */
  function renderResources(){
    const ul = U.qs('#res-list'); if (!ul) return;
    const st = currentState();
    const items = RESOURCES.filter(r => !st.areas.length || r.areas.some(a => st.areas.includes(a)));
    ul.innerHTML = items.map(r =>
      `<li><a href="${encodeURI(r.href)}" target="_blank" rel="noreferrer">${ICON[r.type]||ICON.link} ${r.title}</a>
        <small class="muted">(${r.areas.join(', ')})</small></li>`
    ).join('') || `<li class="muted">No hay recursos para este filtro.</li>`;
  }

  function renderTeachers(){
    const ul = U.qs('#teachers-list'); if (!ul) return;
    const st = currentState();
    const items = TEACHERS.filter(t => {
      const byArea   = !st.areas.length   || t.areas.some(a => st.areas.includes(a));
      const byCentro = !st.centros.length || t.centros.some(c => st.centros.includes(c));
      const byQuery  = !st.query          || t.name.toLowerCase().includes((st.query||'').toLowerCase());
      return byArea && byCentro && byQuery;
    });
    ul.innerHTML = items.map(t =>
      `<li><a href="${t.url}" target="_blank" rel="noreferrer">${t.name}</a>
        <span class="teacher-tags">${t.areas.join(', ')}</span></li>`
    ).join('') || `<li class="muted">No hay docentes para este filtro/búsqueda.</li>`;
  }

  function applyFilters(){
    const st = currentState();
    let count = 0;
    cards.forEach(card => {
      const show = stateMatches(card, st);
      card.style.display = show ? '' : 'none';
      if (show) count++;
    });
    renderResources();
    renderTeachers();
    setFilters(st);
    // refleja en URL (sin recargar)
    const newHash = stateToHash(st);
    if (location.hash !== newHash) history.replaceState(null, '', newHash);
    const counter = U.qs('#visibleCount');
    if (counter) counter.textContent = String(count);
  }

  /* ---------- Restaurar estado al cargar ---------- */
  function restore(){
    // Prioridad: URL hash → LocalStorage
    const fromHash = hashToState();
    const hasHash  = Object.values(fromHash).some(v => Array.isArray(v) ? v.length : v);
    const st = hasHash ? fromHash : getFilters();

    // activar chips
    chips.forEach(chip => {
      const t = chip.dataset.type;
      const key = t === 'area' ? 'areas' : (t === 'centro' ? 'centros' : 'logs');
      if (st[key]?.includes(chip.dataset[t])) chip.classList.add('active');
    });

    if (q && st.query) q.value = st.query;
  }

  /* ---------- Partitura opcional: si existe, añadir a recursos ---------- */
  function canCheck(){ return /^https?:/.test(location.protocol); }
  function fileExists(url){ return fetch(url, { method: 'HEAD' }).then(r => r.ok).catch(() => false); }
  async function maybeAddPartitura(){
    const file = 'Mango Tango Partitura.pdf';
    if (!canCheck()) return;
    const ok = await fileExists(file);
    if (ok && !RESOURCES.some(r => r.href === file)) {
      RESOURCES.push({ title: 'Partitura: Mango Tango (PDF)', href: file, areas: ['musica'], type: 'pdf' });
      renderResources();
    }
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    restore();
    chips.forEach(chip => U.on(chip, 'click', () => { chip.classList.toggle('active'); applyFilters(); }));
    if (q) U.on(q, 'input', U.debounce(applyFilters, 180));
    applyFilters();
    maybeAddPartitura();
  });

  // Atajos: Ctrl/Cmd+K para enfocar búsqueda
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      const s = U.qs('#q'); if (s) { e.preventDefault(); s.focus(); s.select(); }
    }
  });
})();

/* ==============================
   Vista previa de imágenes (overlay)
============================== */
(function(){
  function overlay(){
    let o = document.getElementById('imgPreviewOverlay');
    if (!o){
      o = document.createElement('div');
      o.id = 'imgPreviewOverlay';
      Object.assign(o.style, {
        position:'fixed', inset:'0', display:'none', zIndex:'9999',
        background:'rgba(0,0,0,.85)', alignItems:'center', justifyContent:'center'
      });
      const img = document.createElement('img');
      img.alt = 'Vista previa';
      Object.assign(img.style, {
        maxWidth:'90vw', maxHeight:'90vh', borderRadius:'12px', boxShadow:'0 10px 30px rgba(0,0,0,.5)'
      });
      o.appendChild(img);
      document.body.appendChild(o);
      o.addEventListener('click', () => o.style.display='none');
      document.addEventListener('keydown', e => { if (e.key === 'Escape') o.style.display='none'; });
    }
    return o;
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-preview]');
    if (!a) return;
    e.preventDefault();
    const o = overlay();
    o.querySelector('img').src = a.getAttribute('href');
    o.style.display = 'flex';
  });
})();
