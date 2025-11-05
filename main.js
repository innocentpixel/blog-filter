console.log('[BlogFilter] main.js načítaný');

// 🔧 Funkčná oprava pre všetky blog URL
(function () {
  const path = location.pathname;
  if (!path.includes('/blog')) {
    console.log('[BlogFilter] Nie je blogová stránka → stop');
    return;
  }

  console.log('[BlogFilter] Aktivovaný pre blog:', path);

  function extractTagsFromHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const tags = [];
    doc.querySelectorAll('.article-tags a[data-tag]').forEach(a => {
      const tag = a.getAttribute('data-tag')?.trim();
      if (tag && !tags.includes(tag)) tags.push(tag);
    });
    return tags;
  }

  function injectTagsIntoArticle(article, tags) {
    if (!tags.length || article.querySelector('.article-tags')) return;

    const div = document.createElement('div');
    div.className = 'article-tags';
    tags.forEach(tag => {
      const a = document.createElement('a');
      a.href = '/blog/?tag=' + encodeURIComponent(tag);
      a.className = 'tag';
      a.setAttribute('data-tag', tag);
      a.textContent = '#' + tag;
      div.appendChild(a);
    });

    const desc = article.querySelector('.description');
    if (desc) desc.insertAdjacentElement('afterend', div);
  }

  function buildFilters(allTags, articles) {
    if (document.querySelector('.blog-filters') || !allTags.size) return;

    const sectionDesc = document.querySelector('.sectionDescription');
    if (!sectionDesc) {
      console.log('[BlogFilter] Nenájdená sectionDescription');
      return;
    }

    const bar = document.createElement('div');
    bar.className = 'blog-filters';
    bar.innerHTML = '<button data-filter="all" class="active">Všetko</button>' +
      Array.from(allTags).map(tag =>
        `<button data-filter="${tag}">${tag}</button>`
      ).join('');

    sectionDesc.insertAdjacentElement('afterend', bar);

    const buttons = bar.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.getAttribute('data-filter');
        buttons.forEach(b => b.classList.toggle('active', b === btn));
        articles.forEach(article => {
          if (tag === 'all') {
            article.style.display = '';
          } else {
            const articleTags = Array.from(article.querySelectorAll('.article-tags a[data-tag]')).map(a => a.dataset.tag);
            article.style.display = articleTags.includes(tag) ? '' : 'none';
          }
        });
        const url = new URL(location.href);
        if (tag === 'all') url.searchParams.delete('tag');
        else url.searchParams.set('tag', tag);
        history.replaceState({}, '', url.toString());
      });
    });

    const param = new URL(location.href).searchParams.get('tag');
    if (param) {
      const btn = bar.querySelector(`[data-filter="${param}"]`);
      if (btn) btn.click();
    }

    console.log('[BlogFilter] Filtre pridané');
  }

  function init() {
    const articles = document.querySelectorAll('.news-item');
    if (!articles.length) {
      console.log('[BlogFilter] Čakám na články...');
      setTimeout(init, 300);
      return;
    }

    console.log('[BlogFilter] Načítavam články...');
    const allTags = new Set();
    let processed = 0;

    articles.forEach(article => {
      const link = article.querySelector('.title');
      if (!link) return;

      fetch(link.href)
        .then(r => r.text())
        .then(html => {
          const tags = extractTagsFromHTML(html);
          tags.forEach(t => allTags.add(t));
          injectTagsIntoArticle(article, tags);
        })
        .finally(() => {
          processed++;
          if (processed === articles.length) {
            buildFilters(allTags, Array.from(articles));
          }
        });
    });
  }

  init();
})();
