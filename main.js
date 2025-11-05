<script>
(function(){
  if(!location.pathname.startsWith('/blog')) return;

  const SITEMAP_URL = '/sitemap.xml';
  const CACHE_KEY = 'blogArticlesCacheV2';         // verzovaný kľúč (zmenou vynútiš refresh)
  const TAGS_KEY  = 'blogAllTagsV2';
  const FILTER_KEY = 'blogFilterTag';
  const CACHE_DAYS = 7;                            // po koľkých dňoch obnoviť cache
  const PAGE_SIZE = 12;                            // koľko článkov naraz zobraziť v client-mode
  const CONCURRENCY = 4;                           // koľko fetchov naraz pri indexovaní

  // --- Pomocné ---
  const byDateDesc = (a,b) => (b.dateTs||0) - (a.dateTs||0);
  const cut = (str, n=160) => str.length>n ? str.slice(0,n-1)+'…' : str;

  function parseDateToTs(s){
    // podporí ISO v datetime aj formát „D.M.YYYY“
    if(!s) return 0;
    const iso = Date.parse(s);
    if(!isNaN(iso)) return iso;
    const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if(m){
      const [_,d,mo,y] = m;
      return new Date(+y, +mo-1, +d).getTime();
    }
    return 0;
  }

  // --- Získanie URL z mapy stránok (iba /blog/… články) ---
  async function fetchSitemapUrls() {
    const res = await fetch(SITEMAP_URL, {cache:'no-store'});
    const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
    return Array.from(xml.querySelectorAll('url loc'))
      .map(el => el.textContent.trim())
      .filter(u => u.includes('/blog/') && !u.endsWith('/blog/'));
  }

  // --- Parsovanie článku ---
  async function fetchArticle(url){
    const res = await fetch(url, {cache:'no-store'});
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = doc.querySelector('h1')?.textContent.trim() || '';
    const timeEl = doc.querySelector('time[datetime]') || doc.querySelector('.text time');
    const dateRaw = timeEl?.getAttribute('datetime') || timeEl?.textContent?.trim() || '';
    const dateTs = parseDateToTs(dateRaw);

    // obrázok: skúsiť og:image, inak prvý obrázok v článku
    let img = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    if(!img){
      img = doc.querySelector('.article-detail img, .content-inner img')?.getAttribute('src') || '';
    }

    // popis: prvý rozumný odstavec
    let desc = doc.querySelector('.article-detail p, article p, .content-inner p')?.textContent?.trim() || '';
    desc = cut(desc, 220);

    // tagy
    const tags = Array.from(doc.querySelectorAll('.article-tags a[data-tag]'))
      .map(a => (a.getAttribute('data-tag')||'').trim())
      .filter(Boolean);

    return {url, title, dateRaw, dateTs, img, desc, tags};
  }

  // --- Paralelné načítanie s obmedzenou súbežnosťou ---
  async function fetchAllArticles(urls){
    const out = [];
    let i = 0;
    async function worker(){
      while(i < urls.length){
        const my = i++;
        const url = urls[my];
        try{
          const a = await fetchArticle(url);
          out.push(a);
        }catch(e){
          // prežijeme chybu jedného článku
        }
      }
    }
    const workers = Array.from({length:CONCURRENCY}, worker);
    await Promise.all(workers);
    return out.sort(byDateDesc);
  }

  // --- Cache helpers ---
  function loadCache(){
    try{
      const obj = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      const ageDays = (Date.now() - (obj._ts||0)) / 86400000;
      if(ageDays > CACHE_DAYS) return null;
      return obj;
    }catch{ return null; }
  }
  function saveCache(articles){
    const allTags = Array.from(new Set(articles.flatMap(a => a.tags)));
    localStorage.setItem(CACHE_KEY, JSON.stringify({_ts:Date.now(), articles}));
    localStorage.setItem(TAGS_KEY, JSON.stringify(allTags));
    return allTags;
  }
  function loadTags(){ try{ return JSON.parse(localStorage.getItem(TAGS_KEY)||'[]'); }catch{ return []; } }

  // --- UI: vloženie filtrov pod sekciu popisu ---
  function renderFilters(tags){
    if(document.querySelector('.blog-filters')) return;
    const host = document.querySelector('.sectionDescription');
    if(!host) return;
    const bar = document.createElement('div');
    bar.className = 'blog-filters';
    bar.innerHTML = [
      `<button data-filter="all">Všetko</button>`,
      ...tags.map(t => `<button data-filter="${t}">${t}</button>`)
    ].join('');
    host.insertAdjacentElement('afterend', bar);
    return bar;
  }

  // --- UI: prerender výpisu (client-mode) ---
  function renderList(articles, mount, limit){
    mount.innerHTML = '';
    const frag = document.createDocumentFragment();
    articles.slice(0, limit).forEach(a => {
      const item = document.createElement('div');
      item.className = 'news-item';
      item.innerHTML = `
        <div class="image">
          <a href="${a.url}" title="${a.title}">
            <img src="${a.img || ''}" alt="${a.title}">
          </a>
        </div>
        <div class="text">
          <time>${a.dateRaw || ''}</time>
          <a href="${a.url}" class="title">${a.title}</a>
          <div class="description"><p>${a.desc || ''}</p></div>
          ${a.tags?.length ? `<div class="article-tags">${
            a.tags.map(t=>`<a href="/blog/?tag=${encodeURIComponent(t)}" class="tag" data-tag="${t}">#${t}</a>`).join('')
          }</div>`:''}
        </div>
        <a href="${a.url}" class="cely-clanek">Celý článok</a>
      `;
      frag.appendChild(item);
    });
    mount.appendChild(frag);
  }

  // --- UI: aktivácia filtrov + client-mode ---
  function attachFilterLogic(bar, allArticles){
    const list = document.querySelector('#newsWrapper .news-wrapper') || document.querySelector('.news-wrapper') || document.querySelector('#newsWrapper');
    if(!list) return;

    const btns = bar.querySelectorAll('button');
    let current = localStorage.getItem(FILTER_KEY) || new URL(location.href).searchParams.get('tag') || 'all';
    let shown = PAGE_SIZE;

    function apply(tag){
      current = tag;
      shown = PAGE_SIZE;

      // do URL & storage
      const u = new URL(location.href);
      if(tag==='all'){ u.searchParams.delete('tag'); localStorage.removeItem(FILTER_KEY); }
      else { u.searchParams.set('tag', tag); localStorage.setItem(FILTER_KEY, tag); }
      history.replaceState({}, '', u.toString());

      // vybrať zdroj dát
      const filtered = (tag==='all') ? allArticles : allArticles.filter(a => a.tags?.includes(tag));

      // client-mode: nahradíme pôvodný výpis naším renderom
      renderList(filtered, list, shown);

      // „Načítať viac“ (ak je treba)
      addLoadMore(list, filtered);

      // active class
      btns.forEach(b => b.classList.toggle('active', b.dataset.filter===tag));
    }

    function addLoadMore(mount, data){
      // zmaž staré tlačidlo
      mount.parentElement.querySelector('.clientLoadMore')?.remove();
      if(data.length <= shown) return;
      const more = document.createElement('div');
      more.className = 'clientLoadMore';
      more.style.textAlign = 'center';
      more.style.margin = '20px 0';
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary';
      btn.textContent = 'Načítať viac';
      btn.addEventListener('click', ()=>{
        shown += PAGE_SIZE;
        renderList(data, mount, shown);
        if(data.length <= shown) more.remove();
      });
      more.appendChild(btn);
      mount.parentElement.appendChild(more);
    }

    // clicky
    btns.forEach(b => b.addEventListener('click', ()=>apply(b.dataset.filter)));

    // auto-apply po načítaní
    // skryť pôvodné stránkovanie (v client-mode nedáva zmysel)
    const listingControls = document.querySelector('.listingControls');
    if(listingControls) listingControls.style.display = 'none';

    // spusti
    // ak náhodou current nie je v set-e tagov (napr. vymazaný), prepni na all
    if(current!=='all' && !allArticles.some(a => a.tags?.includes(current))) current='all';
    apply(current);
  }

  // --- Štart ---
  (async function start(){
    try{
      // 1) priprav miesto pre filtre (aj keby cache nebola)
      const cached = loadCache();
      const tagsFromCache = loadTags();
      if(tagsFromCache.length){
        const bar = renderFilters(tagsFromCache);
        if(cached?.articles?.length && bar){
          attachFilterLogic(bar, cached.articles);
        }
      }

      // 2) ak cache chýba/exp., postav index zo sitemapu (all pages -> full blog)
      if(!cached){
        const urls = await fetchSitemapUrls();
        const articles = await fetchAllArticles(urls);
        const allTags = saveCache(articles);

        // ak filtre ešte nie sú, pridaj a aktivuj
        let bar = document.querySelector('.blog-filters');
        if(!bar) bar = renderFilters(allTags);
        if(bar) attachFilterLogic(bar, articles);
      }
    }catch(e){
      console.warn('[BlogFilter] Chyba inicializácie', e);
    }
  })();
})();
</script>
