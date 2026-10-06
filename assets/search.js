// 全站搜索：索引在浏览器里做子串匹配（中文不需要分词，短语也能精确命中）。
// 排序：标题完全相同 > 标题开头 > 标题包含 > 作者/主题等关键词 > 正文出现次数。
// 索引分两层：打开页面先下「索引头」（每条的标题、关键词、册次、链接），标题和关键词立刻能搜；
// 正文按「册 × 类别」分片，有搜索词时才下，只下当前筛选类别用得到的，小的类别先下，下完一类就重排一次。
(function () {
  'use strict';
  const form = document.querySelector('[data-search-form]');
  if (!form) return;
  const input = form.querySelector('input');
  const catBtns = Array.from(document.querySelectorAll('[data-search-cats] [data-cat]'));
  const statusEl = document.querySelector('[data-search-status]');
  const listEl = document.querySelector('[data-search-results]');
  const moreBtn = document.querySelector('[data-search-more]');
  const PAGE = 40;

  const params = new URLSearchParams(location.search);
  let q = (params.get('q') || '').trim();
  let cat = params.get('cat') || '';
  let docs = null;
  let shards = []; // { c, url, state: 0 未下载 | 1 下载中 | 2 已下载 | -1 失败, docs }
  let results = [];
  let shown = 0;
  const LOAD_ORDER = ['课文', '古诗文', '文学常识', '虚词', '实词', '作文', '教师用书', '练习']; // 小的先下

  input.value = q;
  setCat(cat);

  const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const getJson = (url) => fetch(url).then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });

  getJson(form.dataset.index)
    .then((head) => {
      docs = head.docs.map((d, i) => ({ ...d, i, tl: d.t.toLowerCase(), kl: (d.k || '').toLowerCase(), x: '', xl: '' }));
      shards = head.shards.map((sh, k) => ({ ...sh, state: 0, docs: docs.filter((d) => d.h === k) }));
      run();
      loadBodies();
    })
    .catch(() => (statusEl.textContent = '索引载入失败，请先运行 npm run build。'));

  const needed = (sh) => !cat || sh.c === cat;
  const pending = () => shards.filter((sh) => needed(sh) && sh.state >= 0 && sh.state < 2);

  // 按类别逐批下载正文分片；每下完一批重排一次（保留已展开的条数）
  let loading = false;
  async function loadBodies() {
    if (loading || !docs) return;
    loading = true;
    try {
      for (;;) {
        if (!q.trim()) break;
        const todo = shards.filter((sh) => needed(sh) && sh.state === 0);
        if (!todo.length) break;
        const c = LOAD_ORDER.find((x) => todo.some((sh) => sh.c === x)) || todo[0].c;
        const batch = todo.filter((sh) => sh.c === c);
        batch.forEach((sh) => (sh.state = 1));
        run(true);
        await Promise.all(batch.map((sh) => getJson(sh.url)
          .then((xs) => {
            sh.docs.forEach((d, j) => { d.x = xs[j] || ''; d.xl = d.x.toLowerCase(); });
            sh.state = 2;
          })
          .catch(() => (sh.state = -1))));
      }
    } finally {
      loading = false;
      run(true);
    }
  }

  function setCat(c) {
    cat = c;
    catBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === c)));
  }

  function count(hay, needle, cap) {
    let n = 0, i = hay.indexOf(needle);
    while (i !== -1 && n < cap) { n++; i = hay.indexOf(needle, i + needle.length); }
    return n;
  }

  function score(d, terms) {
    let s = 0;
    for (const t of terms) {
      const inTitle = d.tl.includes(t);
      const inKey = d.kl.includes(t);
      const n = count(d.xl, t, 60);
      if (!inTitle && !inKey && !n) return 0;
      if (d.tl === t) s += 1000;
      else if (d.tl.startsWith(t) && !(/\d$/.test(t) && /\d/.test(d.tl[t.length]))) s += 500; // 数字要整段对上：搜 C1 时 C10–C19 只算标题包含
      else if (inTitle) s += 300;
      if (inKey) s += 120;
      if (n) s += 20 + Math.min(n, 60) * 2;
    }
    // 课文正文优先于注释、赏析等衍生资料
    if (d.p) s += 40; // 课文正文本身
    else if (d.c === '古诗文') s += 5;
    return s;
  }

  function snippets(d, terms) {
    const x = d.x;
    const xl = d.xl;
    const out = [];
    const used = [];
    for (const t of terms) {
      let i = xl.indexOf(t);
      while (i !== -1 && out.length < 2) {
        if (!used.some((u) => Math.abs(u - i) < 60)) {
          used.push(i);
          const a = Math.max(0, i - 36);
          const b = Math.min(x.length, i + t.length + 64);
          out.push((a > 0 ? '……' : '') + x.slice(a, b).replace(/\s+/g, ' ') + (b < x.length ? '……' : ''));
        }
        i = xl.indexOf(t, i + t.length);
        if (out.length >= 2) break;
      }
      if (out.length >= 2) break;
    }
    if (!out.length && x) out.push(x.slice(0, 90).replace(/\s+/g, ' ') + (x.length > 90 ? '……' : ''));
    return out;
  }

  function highlight(text, terms) {
    const re = new RegExp('(' + terms.map(escRe).join('|') + ')', 'gi');
    return escHtml(text).replace(re, '<mark>$1</mark>');
  }

  function linkFor(d) {
    const [path, hash] = d.u.split('#');
    return path + '?hl=' + encodeURIComponent(q) + (hash ? '#' + hash : '');
  }

  function render() {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean).map(escHtml);
    const slice = results.slice(shown, shown + PAGE);
    const html = slice
      .map(({ d }) => {
        const snips = snippets(d, q.toLowerCase().split(/\s+/).filter(Boolean));
        return `<li class="hit">
  <a class="hit-title" href="${linkFor(d)}">${highlight(d.t, terms)}</a>
  <div class="hit-meta"><span class="cat cat-${d.c}">${d.c}</span><span>${escHtml(d.s)}</span></div>
  ${snips.map((s) => `<p class="hit-snip">${highlight(s, terms)}</p>`).join('')}
</li>`;
      })
      .join('');
    listEl.insertAdjacentHTML('beforeend', html);
    shown += slice.length;
    moreBtn.hidden = shown >= results.length;
  }

  function run(keep = false) {
    if (!docs) return;
    const t0 = performance.now();
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const keepShown = keep ? shown : 0;
    listEl.innerHTML = '';
    shown = 0;
    const counts = {};
    let all = [];
    if (terms.length) {
      for (const d of docs) {
        const s = score(d, terms);
        if (s) { all.push({ d, s }); counts[d.c] = (counts[d.c] || 0) + 1; }
      }
      all.sort((a, b) => b.s - a.s || a.d.i - b.d.i);
    }
    catBtns.forEach((b) => {
      const n = b.dataset.cat ? counts[b.dataset.cat] || 0 : all.length;
      b.querySelector('small').textContent = terms.length ? n : '';
    });
    results = cat ? all.filter((r) => r.d.c === cat) : all;
    const ms = Math.round(performance.now() - t0);
    const wait = terms.length ? pending() : [];
    const loadingCats = LOAD_ORDER.filter((c) => wait.some((sh) => sh.c === c));
    const failed = shards.some((sh) => needed(sh) && sh.state === -1);
    const tail = (loadingCats.length ? `，正在载入${loadingCats.join('、')}全文，结果会陆续补充` : '') + (failed ? '。部分全文索引载入失败，结果可能不全，可稍后重新搜索' : '');
    if (!terms.length) statusEl.textContent = `共 ${docs.length} 条资料可搜索。输入篇名、作者、名句或任意词语；多个词用空格隔开表示同时包含。`;
    else if (!results.length && loadingCats.length) statusEl.textContent = `正在载入${loadingCats.join('、')}全文……`;
    else if (!results.length) statusEl.textContent = `没有找到包含「${q}」的${cat || ''}资料。试试更短的词，或切换到「全部」。${failed ? '（部分全文索引载入失败，可稍后重新搜索）' : ''}`;
    else statusEl.textContent = `找到 ${results.length} 条${cat ? '「' + cat + '」' : ''}结果（${ms} 毫秒）${tail}`;
    render();
    while (shown < keepShown && shown < results.length) render();
  }

  // 下载失败的分片，换了搜索词或类别时再试一次
  const retryFailed = () => shards.forEach((sh) => { if (sh.state === -1) sh.state = 0; });

  function syncUrl() {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (cat) p.set('cat', cat);
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
    document.title = (q ? `${q} · 搜索` : '搜索') + ' · 语文备课室';
  }

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { q = input.value.trim(); syncUrl(); retryFailed(); run(); loadBodies(); }, 160);
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    q = input.value.trim();
    syncUrl();
    retryFailed();
    run();
    loadBodies();
  });
  catBtns.forEach((b) => b.addEventListener('click', () => { setCat(b.dataset.cat); syncUrl(); retryFailed(); run(); loadBodies(); }));
  moreBtn.addEventListener('click', render);
})();
