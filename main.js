console.log('[BlogFilter] main.js načítaný');
(function(){
  if (!location.pathname.startsWith('/blog')) return;

  // Pomocná funkcia – načítanie HTML
  async function fetchHTML(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      console.warn('[BlogFilter] Fetch error', url, e);
      return '';
    }
  }

  // Extrahuje články z HTML
  function extractArticlesFromHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return Array.from(doc.querySelectorAll('.news-item')).map(item => ({
      html: item.outerHTML,
      url: item.querySelector('.title')?.href || ''
    }));
  }

  // Extrahuje tagy z článku
  function extractTagsFromHTML(html){
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const tags = [];
    doc.querySelectorAll('.article-tags a[data-tag]').forEach(a=>{
      const value = a.getAttribute('data-tag') || '';
      const text = a.textContent.replace('#','').trim();
      if(value && !tags.find(t => t.value.toLowerCase() === value.toLowerCase())){
        tags.push({ value, text });
      }
    });
    return tags;
  }

  // Hlavná inicializácia
  async function init(){
    const wrapper = document.querySelector('#newsWrapper');
    const sectionDesc = document.querySelector('.sectionDescription');
    if (!wrapper || !sectionDesc) {
      console.warn('[BlogFilter] Nenájdený wrapper alebo sectionDescription.');
      return;
    }

    // Loading text
    const loading = document.createElement('p');
    loading.textContent = 'Načítavam články...';
    loading.style.textAlign = 'center';
    loading.style.margin = '20px 0';
    sectionDesc.insertAdjacentElement('afterend', loading);

    // Zisti počet strán
    const pagination = document.querySelector('.pagination');
    let lastPage = 1;
    if (pagination) {
      const last = pagination.querySelector('.pagination__link--last');
      if (last) {
        const match = last.href.match(/strana-(\d+)/);
        if (match) lastPage = parseInt(match[1]);
      }
    }

    const baseURL = location.origin + '/blog/';
    let allArticles = [];

    // 🔹 Načíta všetky stránky blogu
    for (let i=1; i<=lastPage; i++) {
      const url = i===1 ? baseURL : `${baseURL}strana-${i}/`;
      const html = await fetchHTML(url);
      if (html) {
        const extracted = extractArticlesFromHTML(html);
        allArticles = allArticles.concat(extracted);
      }
    }

    if (!allArticles.length) {
      loading.textContent = 'Nepodarilo sa načítať žiadne články.';
      return;
    }

    // 🔹 Získaj všetky tagy
    const allTags = [];
    for (let art of allArticles) {
      if (!art.url) continue;
      const html = await fetchHTML(art.url);
      const tags = extractTagsFromHTML(html);
      art.tags = tags;
      tags.forEach(t=>{
        if(!allTags.find(x => x.value.toLowerCase() === t.value.toLowerCase())){
          allTags.push(t);
        }
      });
    }

    // 🔹 Vytvor toolbar
    const bar = document.createElement('div');
    bar.className = 'blog-filters';
    bar.style.margin = '24px 0';
    bar.innerHTML = '<button data-filter="all" class="active">Všetko</button>' +
      allTags.map(t => `<button data-filter="${t.value}">${t.text}</button>`).join('');
    sectionDesc.insertAdjacentElement('afterend', bar);

    // 🔹 Nahrad wrapper všetkými článkami
    wrapper.innerHTML = allArticles.map(a => a.html).join('');

    // 🔹 Filtrovanie
    const buttons = bar.querySelectorAll('button');
    const articlesDOM = Array.from(wrapper.querySelectorAll('.news-item'));

    buttons.forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const tag = btn.getAttribute('data-filter').toLowerCase();
        buttons.forEach(b=>b.classList.toggle('active', b===btn));
        articlesDOM.forEach((article,i)=>{
          const art = allArticles[i];
          if(tag==='all'){ article.style.display=''; return; }
          const hasTag = art.tags?.some(t => t.value.toLowerCase() === tag);
          article.style.display = hasTag ? '' : 'none';
        });
        const url = new URL(location.href);
        if(tag==='all') url.searchParams.delete('tag'); else url.searchParams.set('tag', tag);
        history.replaceState({}, '', url.toString());
      });
    });

    // Aktivácia podľa URL parametra
    const param = new URL(location.href).searchParams.get('tag');
    if(param){
      const btn = bar.querySelector(`[data-filter="${param}"]`);
      if(btn) btn.click();
    }

    // Skry stránkovanie
    if (pagination) pagination.style.display = 'none';
    loading.remove();
  }

  // Čaká, kým Shoptet vykreslí blog
  function waitForBlog(){
    const ready = document.querySelector('#newsWrapper') && document.querySelector('.sectionDescription');
    if (ready) init();
    else setTimeout(waitForBlog, 800);
  }

  document.addEventListener('DOMContentLoaded', waitForBlog);
})();
