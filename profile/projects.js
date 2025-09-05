// projects.js
// Dynamic Projects Gallery
// - Fetches repos from GitHub, normalizes, caches, and renders a premium grid
// - Usage: import initProjects from './projects.js'; initProjects({ profileUrl, exclude, pinnedFirst });

const CACHE_KEY = 'gw_projects_cache_v1';
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseGithubProfile(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] || null;
  } catch (e) {
    return null;
  }
}

function matchesPattern(name, patterns = []) {
  if (!patterns || !patterns.length) return false;
  return patterns.some(p => {
    // simple wildcard: draft-* => ^draft-.*$
    const rx = new RegExp('^' + p.replace(/\*/g, '.*') + '$', 'i');
    return rx.test(name);
  });
}

async function fetchJson(url, token) {
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers.Authorization = `token ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`GitHub API error ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchRepos(username, perPage = 100, token) {
  const url = `https://api.github.com/users/${username}/repos?per_page=${perPage}&type=owner&sort=updated`;
  return fetchJson(url, token);
}

async function fetchPinned(username, token) {
  // GitHub REST doesn't return pinned easily; try GraphQL for pinnedItems
  const endpoint = 'https://api.github.com/graphql';
  if (!token) return null; // GraphQL requires auth

  const q = `query($login:String!){
    user(login:$login){
      pinnedItems(first:6){
        nodes{ ... on Repository { name url description stargazerCount forks { totalCount } primaryLanguage { name } pushedAt repositoryTopics(first:10){nodes{topic{name}}} homepageUrl }
      }
    }
  }`;

  const body = JSON.stringify({ query: q, variables: { login: username } });
  const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' }, body });
  if (!res.ok) return null;
  const data = await res.json();
  const nodes = data?.data?.user?.pinnedItems?.nodes || null;
  if (!nodes) return null;
  return nodes.map(n => ({
    name: n.name,
    html_url: n.url,
    description: n.description,
    stargazers_count: n.stargazerCount,
    forks_count: n.forks?.totalCount || 0,
    pushed_at: n.pushedAt,
    language: n.primaryLanguage?.name || null,
    topics: (n.repositoryTopics?.nodes || []).map(x => x.topic.name),
    homepage: n.homepageUrl || null
  }));
}

function normalizeRepo(r) {
  return {
    name: r.name,
    description: r.description || '',
    html_url: r.html_url || r.url,
    homepage: r.homepage || r.homepageUrl || null,
    stars: r.stargazers_count || 0,
    forks: r.forks_count || 0,
    updated: r.pushed_at || r.updated_at || null,
    language: r.language || (r.primaryLanguage && r.primaryLanguage.name) || 'Unknown',
    topics: r.topics || (r.repository_topics && r.repository_topics.nodes && r.repository_topics.nodes.map(n=>n.topic.name)) || []
  };
}

function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  const diff = Date.now() - then.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  return `${years}y`;
}

function saveCache(obj) {
  try {
    const payload = { ts: Date.now(), data: obj };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (e) { /* ignore */ }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.ts || !parsed.data) return null;
    if (Date.now() - parsed.ts > CACHE_TTL) return null;
    return parsed.data;
  } catch (e) { return null; }
}

function createElementFromHTML(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstChild;
}

function truncate(str, n = 120) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n-1) + '…' : str;
}

// Render helpers
function renderChip(text) {
  const s = document.createElement('span');
  s.className = 'chip';
  s.textContent = text;
  return s;
}

function buildCard(repo) {
  const div = document.createElement('article');
  div.className = 'project-card';
  div.setAttribute('tabindex', '0');
  div.innerHTML = `
    <div class="card-body">
      <div class="card-head">
        <h3 class="project-title">${repo.name}</h3>
        <div class="project-topics"></div>
      </div>
      <p class="project-desc" title="${escapeHtml(repo.description || '')}">${escapeHtml(truncate(repo.description || '',120))}</p>
      <div class="project-meta">
        <span class="meta-item" title="Stars">⭐ ${repo.stars}</span>
        <span class="meta-item" title="Forks">🍴 ${repo.forks}</span>
        <span class="meta-item" title="Updated">🕒 ${relativeTime(repo.updated)}</span>
        <span class="meta-lang" title="Primary language">${escapeHtml(repo.language || '—')}</span>
      </div>
      <div class="project-actions">
        <a class="btn btn-primary" href="${repo.html_url}" target="_blank" rel="noopener">View Code</a>
        ${repo.homepage ? `<a class="btn btn-ghost" href="${repo.homepage}" target="_blank" rel="noopener">Live Demo</a>` : ''}
      </div>
    </div>
  `;

  const topicsWrap = div.querySelector('.project-topics');
  (repo.topics || []).slice(0,3).forEach(t => topicsWrap.appendChild(renderChip(t)));
  return div;
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function dedupeByName(arr) {
  const seen = new Set();
  return arr.filter(r => {
    if (seen.has(r.name)) return false;
    seen.add(r.name); return true;
  });
}

export default async function initProjects({ profileUrl, exclude = [], pinnedFirst = true, perPage = 100, githubToken = null } = {}) {
  const username = parseGithubProfile(profileUrl);
  if (!username) throw new Error('Invalid GitHub profile URL');

  const root = document.getElementById('projects-root');
  if (!root) throw new Error('projects-root element not found');

  const loader = document.createElement('div');
  loader.className = 'projects-loader';
  loader.textContent = 'Loading projects…';
  root.appendChild(loader);

  // try cache
  let repos = loadCache();
  if (repos) {
    console.info('Loaded projects from cache', repos.length);
  }

  // fetch remote
  try {
    const fetched = await fetchRepos(username, perPage, githubToken);
    let mapped = fetched.filter(r => !r.fork && !r.archived && !matchesPattern(r.name, exclude)).map(normalizeRepo);

    // try pinned via GraphQL if token present
    let pinned = null;
    try { pinned = await fetchPinned(username, githubToken); } catch (e) { pinned = null; }
    if (pinned && pinned.length) pinned = pinned.map(normalizeRepo);

    // dedupe & merge
    let merged = dedupeByName([...(pinned || []), ...mapped]);

    // sort: pinned first already, then stars desc, then updated
    merged.sort((a,b) => {
      if (pinnedFirst) {
        const ai = (pinned||[]).findIndex(p=>p.name===a.name) >= 0 ? 0 : 1;
        const bi = (pinned||[]).findIndex(p=>p.name===b.name) >= 0 ? 0 : 1;
        if (ai !== bi) return ai - bi;
      }
      if (b.stars !== a.stars) return b.stars - a.stars;
      return new Date(b.updated) - new Date(a.updated);
    });

    repos = merged;
    saveCache(repos);
  } catch (err) {
    console.warn('GitHub fetch failed, falling back to cache or local fallback', err);
    if (!repos) {
      // fallback minimal dataset
      repos = [
        { name: 'profile', description: 'Fallback sample project', html_url: '#', homepage: null, stars: 0, forks: 0, updated: new Date().toISOString(), language: 'JS', topics: ['fallback'] }
      ];
    }
  }

  // render UI
  root.innerHTML = '';

  // toolbar wiring
  const search = document.getElementById('projects-search');
  const langSel = document.getElementById('projects-language');
  const topicSel = document.getElementById('projects-topic');
  const sortSel = document.getElementById('projects-sort');
  const pinnedOnly = document.getElementById('projects-pinned-only');

  function buildFilters(data) {
    const langs = Array.from(new Set(data.map(r=>r.language).filter(Boolean))).sort();
    const topics = Array.from(new Set(data.flatMap(r=>r.topics || []))).sort();
    // fill selects
    langSel.innerHTML = '<option value="">All languages</option>' + langs.map(l=>`<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
    topicSel.innerHTML = '<option value="">All categories</option>' + topics.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  }

  buildFilters(repos);

  function applyFilters() {
    const q = (search.value || '').toLowerCase().trim();
    const lang = langSel.value;
    const topic = topicSel.value;
    const sort = sortSel.value;
    const pinnedOnlyFlag = pinnedOnly.checked;

    let out = repos.slice();
    if (pinnedFirst && pinnedOnlyFlag) {
      out = out.filter(r => (repos.slice(0,10).some(p=>p.name===r.name)) );
    }

    if (q) {
      out = out.filter(r => (r.name + ' ' + (r.description||'') + ' ' + (r.topics||[]).join(' ')).toLowerCase().includes(q));
    }
    if (lang) out = out.filter(r => (r.language||'').toLowerCase() === lang.toLowerCase());
    if (topic) out = out.filter(r => (r.topics||[]).map(t=>t.toLowerCase()).includes(topic.toLowerCase()));

    // sorting
    if (sort === 'stars') out.sort((a,b) => b.stars - a.stars);
    else if (sort === 'updated') out.sort((a,b) => new Date(b.updated) - new Date(a.updated));
    else if (sort === 'az') out.sort((a,b) => a.name.localeCompare(b.name));
    else if (sort === 'pinned') {
      // keep current order (pinned first already)
    }

    renderGrid(out);
  }

  function renderGrid(list) {
    root.innerHTML = '';
    if (!list.length) {
      const no = document.createElement('div');
      no.className = 'projects-empty';
      no.textContent = 'No projects match your filters.';
      root.appendChild(no);
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'projects-grid-inner';

    list.forEach(r => grid.appendChild(buildCard(r)));
    root.appendChild(grid);
  }

  // wire events
  [search, langSel, topicSel, sortSel, pinnedOnly].forEach(el => {
    if (!el) return;
    el.addEventListener('input', debounce(applyFilters, 220));
    el.addEventListener('change', applyFilters);
  });

  applyFilters();

  return { repos };
}

// small debounce
function debounce(fn, ms=120){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); } }
