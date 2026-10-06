// 语文备课室 —— 页面交互（无依赖）
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } },
  };

  // ───── 深浅色 ─────
  const themeBtn = $('[data-theme-toggle]');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const root = document.documentElement;
      const cur = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      store.set('theme', next);
    });
  }

  // ───── 高考作文左栏：窄屏折叠（页面里的内联脚本在首屏前收起）；桌面上没有折叠按钮，屏幕变宽时必须展开 ─────
  const essNav = $('.ess-nav');
  if (essNav) {
    const narrow = matchMedia('(max-width: 999px)');
    narrow.addEventListener('change', () => { essNav.open = !narrow.matches; });
    // 桌面侧栏自身可滚动时，把当前项滚到侧栏可见范围内（只滚侧栏，不动页面）
    const cur = $('a[aria-current="page"]', essNav) || $('.is-current', essNav);
    if (cur && !narrow.matches && essNav.scrollHeight > essNav.clientHeight) {
      essNav.scrollTop = Math.max(0, cur.getBoundingClientRect().top - essNav.getBoundingClientRect().top - essNav.clientHeight / 3);
    }
  }

  // ───── 顶栏下拉菜单：点别处、点菜单项（含同页锚点）或按 Esc 收起 ─────
  const navMenus = $$('[data-nav-menu]');
  document.addEventListener('click', (ev) => {
    navMenus.forEach((d) => { if (d.open && (!d.contains(ev.target) || ev.target.closest('.nav-menu a'))) d.open = false; });
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    navMenus.forEach((d) => { if (d.open) { d.open = false; d.querySelector('summary').focus(); } });
  });

  // ───── 「/」聚焦搜索 ─────
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = ev.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    // 搜索页、首页用页内大搜索框（顶栏搜索在这两页隐藏），其余页面用顶栏
    const input = $('[data-search-form] input') || $('.home-search input') || $('.header-search input');
    if (input && input.offsetParent !== null) { ev.preventDefault(); input.focus(); input.select(); }
  });

  // ───── 标签页 ─────
  const tabsEl = $('[data-tabs]');
  const tabs = tabsEl ? $$('[data-tab]', tabsEl) : [];
  const panels = $$('[data-panel]');
  function activate(key, { updateHash = true } = {}) {
    const tab = tabs.find((t) => t.dataset.tab === key);
    if (!tab) return false;
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    panels.forEach((p) => p.classList.toggle('active', p.dataset.panel === key));
    if (updateHash) history.replaceState(null, '', location.pathname + location.search + '#tab-' + key);
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  }
  function openAncestors(el) {
    for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
  }
  function showTarget(el) {
    const panel = el.closest('[data-panel]');
    if (panel) activate(panel.dataset.panel, { updateHash: false });
    openAncestors(el);
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }
  function fromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('tab-') && activate(h.slice(4), { updateHash: false })) return true;
    const el = h && document.getElementById(h);
    if (el) { showTarget(el); return true; }
    return false;
  }
  if (tabs.length) {
    tabs.forEach((t) =>
      t.addEventListener('click', (ev) => {
        ev.preventDefault();
        activate(t.dataset.tab);
        const top = tabsEl.getBoundingClientRect().top + scrollY - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h'), 10);
        if (scrollY > top) scrollTo({ top });
      }),
    );
    tabsEl.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      const next = tabs[(i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      activate(next.dataset.tab);
      next.focus();
    });
    if (!fromHash()) activate(tabs[0].dataset.tab, { updateHash: false });
    addEventListener('hashchange', fromHash);
    // 页内锚点（如单元资料 #res-3、小目录）
    document.addEventListener('click', (ev) => {
      const a = ev.target.closest('a[href^="#"]');
      if (!a || a.dataset.tab) return;
      const el = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
      if (el && el.closest('[data-panel]')) { ev.preventDefault(); history.replaceState(null, '', a.getAttribute('href')); showTarget(el); }
    });
  }

  // ───── 教材注释浮窗 ─────
  let pop = null, popFor = null;
  function closePop() {
    if (pop) pop.remove();
    if (popFor) popFor.classList.remove('active');
    pop = popFor = null;
  }
  function openPop(sup) {
    const note = document.getElementById(sup.dataset.fn);
    if (!note) return;
    closePop();
    pop = document.createElement('div');
    pop.className = 'fn-pop';
    pop.setAttribute('role', 'tooltip');
    pop.innerHTML = (note.querySelector('.note-t') || note).innerHTML;
    document.body.appendChild(pop);
    const r = sup.getBoundingClientRect();
    const w = pop.offsetWidth;
    let left = r.left + scrollX + r.width / 2 - w / 2;
    left = Math.max(12 + scrollX, Math.min(left, scrollX + document.documentElement.clientWidth - w - 12));
    let top = r.bottom + scrollY + 8;
    if (r.bottom + pop.offsetHeight + 16 > innerHeight && r.top > pop.offsetHeight + 16) top = r.top + scrollY - pop.offsetHeight - 8;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    popFor = sup;
    sup.classList.add('active');
  }
  document.addEventListener('click', (ev) => {
    const sup = ev.target.closest('sup.fn');
    if (sup) { ev.preventDefault(); popFor === sup ? closePop() : openPop(sup); return; }
    if (pop && !ev.target.closest('.fn-pop')) closePop();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closePop();
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('sup.fn')) { ev.preventDefault(); openPop(ev.target); }
  });
  addEventListener('resize', closePop);

  // ───── 答案：全部展开 / 收起 ─────
  $$('[data-answers-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const scope = btn.closest('[data-panel]') || document;
      const list = $$('details.answer', scope);
      const open = !list.every((d) => d.open);
      list.forEach((d) => (d.open = open));
      btn.textContent = open ? '收起全部答案' : '展开全部答案';
    });
  });

  // ───── 字号 ─────
  $$('[data-font]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const root = document.documentElement;
      const cur = parseFloat(getComputedStyle(root).getPropertyValue('--reading-scale')) || 1;
      const step = +btn.dataset.font;
      const next = step === 0 ? 1 : Math.min(1.5, Math.max(0.85, Math.round((cur + step * 0.08) * 100) / 100));
      root.style.setProperty('--reading-scale', String(next));
      store.set('readingScale', next === 1 ? null : String(next));
    });
  });

  // ───── 古诗文列表筛选（多册时每册一个网格，筛完没有篇目的册整组隐藏）─────
  const filterTargets = $$('[data-filter-target]');
  if (filterTargets.length) {
    const btns = $$('[data-filter]');
    btns.forEach((b) =>
      b.addEventListener('click', () => {
        btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        const f = b.dataset.filter;
        filterTargets.forEach((t) => {
          const cards = $$('[data-form]', t);
          cards.forEach((c) => (c.hidden = !!f && c.dataset.form !== f));
          const group = t.closest('[data-filter-group]');
          if (group) group.hidden = cards.every((c) => c.hidden);
        });
      }),
    );
  }

  // ───── 从搜索结果跳转：高亮关键词 ─────
  const hl = new URLSearchParams(location.search).get('hl');
  if (hl) {
    const terms = hl.trim().split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(terms.map(esc).join('|'), 'gi');
    const reTest = new RegExp(terms.map(esc).join('|'), 'i');
    const root = $('main');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('script,style,.tabs,.crumbs,.lesson-side,summary.no-hl') || !reTest.test(n.nodeValue) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const marks = [];
    for (const n of nodes) {
      const frag = document.createDocumentFragment();
      let last = 0;
      const s = n.nodeValue;
      s.replace(re, (m, i) => {
        frag.appendChild(document.createTextNode(s.slice(last, i)));
        const mk = document.createElement('mark');
        mk.className = 'hl';
        mk.textContent = m;
        frag.appendChild(mk);
        marks.push(mk);
        last = i + m.length;
      });
      frag.appendChild(document.createTextNode(s.slice(last)));
      n.parentNode.replaceChild(frag, n);
    }
    if (marks.length) {
      const activePanel = $('[data-panel].active');
      const hashTarget = location.hash && !location.hash.startsWith('#tab-') ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
      const first = (hashTarget && marks.find((m) => hashTarget.contains(m))) || (activePanel && marks.find((m) => activePanel.contains(m))) || marks[0];
      setTimeout(() => {
        showTarget(first);
        requestAnimationFrame(() => first.scrollIntoView({ block: 'center' }));
      }, 30);
      const bar = document.createElement('div');
      bar.className = 'hl-bar';
      bar.innerHTML = `<span>已高亮「${hl.replace(/[<>&"]/g, '')}」</span><button type="button" data-next>下一处</button><button type="button" data-clear>清除</button>`;
      document.body.appendChild(bar);
      let idx = marks.indexOf(first);
      bar.querySelector('[data-next]').addEventListener('click', () => {
        idx = (idx + 1) % marks.length;
        showTarget(marks[idx]);
        requestAnimationFrame(() => marks[idx].scrollIntoView({ block: 'center' }));
      });
      bar.querySelector('[data-clear]').addEventListener('click', () => {
        marks.forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
        bar.remove();
        history.replaceState(null, '', location.pathname + location.hash);
      });
    }
  }
})();
