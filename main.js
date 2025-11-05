console.log('[BlogFilter] main.js načítaný');

(function(){
  if(!location.pathname.startsWith('/blog')) return;
  console.log('[BlogFilter] Aktivovaný na blogu');

  const SITEMAP_URL = '/sitemap.xml';
  const TAGS_CACHE_KEY = 'blogAllTags';
  const FILTER_KEY = 'blogFilterTag';

  async function fetchSitemapUrls() {
    try {
      const res = await fetch(SITEMAP_URL);
      const xmlText = await res.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlText, 'text/xml');
      const urls = Array.from(xml.querySelectorAll('url loc'))
        .map(el => el.textContent.trim())
        .filter(u => u.includes('/blog/') && !u.endsWith('/blog/'));
      console.log(`[BlogFilter] Načítaných článkov: ${urls.length}`);
      return urls;
    } catch (err) {
      console.error('[BlogFilter] Chyba pri čítaní sitemapu', err);
      return [];
    }
  }

  async function extractTagsFromArticle(url) {
    try {
      const res = await fetch(url);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const tags = Array.from(doc.querySelectorAll('.article-tags a[data-tag]'))
        .map(a => a.dataset.tag?.trim())
        .filter(Boolean);
      return tags;
    } catch {
      return [];
    }
  }

  function injectTagsIntoArticle(article, tags) {
    if (!tags.length || article.querySelector('.article-tags')) return;
    const div = document.createElement('div');
    div.className = 'article-tags';
    tags.forEach(tag => {
      const a = document.createElement('a');
      a.href = '/blog/?tag=' + encodeURIComponent(tag);
      a.className = 'tag';
      a.dataset.tag = tag;
      a.textContent = '#' + tag;
      div.appendChild(a);
    });
    const desc = article.querySelector('.description');
    if (desc) desc.insertAdjacentElement('afterend', div);
  }

  function buildFilters(allTags, articles) {
    if (document.querySelector('.blog-filters') || !allTags.size) return;

    const sectionDesc = document.querySelector('.sectionDescription');
    if (!sectionDesc) return;

    const bar = document.createElement('div');
    bar.className = 'blog-filters';
    bar.innerHTML =
      '<button data-filter="all" class="active">Všetko</button>' +
      Array.from(allTags)
        .map(tag => `<button data-filter="${tag}">${tag}</button>`)
        .join('');

    sectionDesc.insertAdjacentElement('afterend', bar);

    const buttons = bar.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.filter;
        buttons.forEach(b => b.classList.toggle('active', b === btn));
        if (tag === 'all') localStorage.removeItem(FILTER_KEY);
        else localStorage.setItem(FILTER_KEY, tag);

        const url = new URL(location.href);
        if (tag === 'all') url.searchParams.delete('tag');
        else url.searchParams.set('tag', tag);
        history.replaceState({}, '', url.toString());

        applyFilter(tag, articles);
      });
    });

    const savedTag = localStorage.getItem(FILTER_KEY) ||
      new URL(location.href).searchParams.get('tag');
    if (savedTag) {
      const btn = bar.querySelector(`[data-filter="${savedTag}"]`);
      if (btn) btn.click();
    }
  }

  function applyFilter(tag, articles) {
    articles.forEach(article => {
      if (tag === 'all') {
        article.style.display = '';
        return;
      }
      const articleTags = Array.from(article.querySelectorAll('.article-tags a[data-tag]'))
        .map(a => a.dataset.tag);
      article.style.display = articleTags.includes(tag) ? '' : 'none';
    });
  }

  async function init() {
    let allTags = new Set();
    const cached = localStorage.getItem(TAGS_CACHE_KEY);

    if (cached) {
      allTags = new Set(JSON.parse(cached));
      console.log(`[BlogFilter] Načítané tagy z cache: ${allTags.size}`);
    } else {
      const urls = await fetchSitemapUrls();
      for (const url of urls) {
        const tags = await extractTagsFromArticle(url);
        tags.forEach(t => allTags.add(t));
      }
      localStorage.setItem(TAGS_CACHE_KEY, JSON.stringify([...allTags]));
      console.log(`[BlogFilter] Tagy uložené do cache: ${allTags.size}`);
    }

    const articles = Array.from(document.querySelectorAll('.news-item'));
    if (articles.length) {
      buildFilters(allTags, articles);
      console.log('[BlogFilter] Filtre zobrazené.');
    }
  }

  init();
})();
