// 해시 라우터와 화면 렌더링
//   #/             글 목록
//   #/post/<slug>  글 본문
//   #/tag/<태그>    태그별 글 목록

import { parse } from './markdown.js';

const SITE_NAME = 'My Blog';
const app = document.getElementById('app');

let postsPromise = null;
let renderId = 0;
let isFirstRender = true;

// ----------------------------------------------------------
// 데이터
// ----------------------------------------------------------

function loadPosts() {
  if (!postsPromise) {
    postsPromise = fetch('posts/index.json')
      .then((res) => {
        if (!res.ok) throw new Error(`index.json 응답 오류: ${res.status}`);
        return res.json();
      })
      .then((list) => list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))))
      .catch((err) => {
        postsPromise = null; // 다음 이동 때 다시 시도
        throw err;
      });
  }
  return postsPromise;
}

async function loadPostSource(slug) {
  const res = await fetch(`posts/${encodeURIComponent(slug)}.md`);
  if (!res.ok) return null;
  return res.text();
}

// ----------------------------------------------------------
// DOM 도우미 (사용자 콘텐츠는 항상 textContent로)
// ----------------------------------------------------------

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function formatDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso || '');
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

function postHref(slug) {
  return `#/post/${encodeURIComponent(slug)}`;
}

function tagHref(tag) {
  return `#/tag/${encodeURIComponent(tag)}`;
}

function toList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) return [value];
  return [];
}

function tagList(tags) {
  const list = toList(tags);
  if (!list.length) return null;
  return el('ul', { class: 'tags', 'aria-label': '태그' },
    list.map((tag) => el('li', {}, el('a', { class: 'tag', href: tagHref(tag), text: `#${tag}` }))));
}

function dateNode(date) {
  if (!date) return null;
  return el('time', { datetime: date, text: formatDate(date) });
}

function setTitle(title) {
  document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
}

// ----------------------------------------------------------
// 화면
// ----------------------------------------------------------

function postCard(post) {
  return el('li', { class: 'post-card' }, [
    el('h2', { class: 'post-card-title' }, el('a', { href: postHref(post.slug), text: post.title })),
    el('div', { class: 'post-meta' }, dateNode(post.date)),
    post.description ? el('p', { class: 'post-card-desc', text: post.description }) : null,
    tagList(post.tags),
  ]);
}

function renderList(posts, heading, sub) {
  const nodes = [
    el('h1', { class: 'page-heading', text: heading }),
    el('p', { class: 'page-sub', text: sub }),
  ];
  if (posts.length) {
    nodes.push(el('ul', { class: 'post-list' }, posts.map(postCard)));
  } else {
    nodes.push(el('p', { class: 'empty', text: '아직 글이 없습니다.' }));
  }
  return nodes;
}

async function viewHome() {
  const posts = await loadPosts();
  setTitle('');
  return renderList(posts, '최근 글', `총 ${posts.length}개의 글`);
}

async function viewTag(tag) {
  const posts = (await loadPosts()).filter((p) => toList(p.tags).includes(tag));
  if (!posts.length) return viewNotFound('해당 태그의 글이 없습니다.');
  setTitle(`#${tag}`);
  const nodes = renderList(posts, `#${tag}`, `${posts.length}개의 글`);
  nodes.unshift(el('a', { class: 'back-link', href: '#/', text: '← 전체 글' }));
  return nodes;
}

async function viewPost(slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) return viewNotFound();

  const posts = await loadPosts();
  const info = posts.find((p) => p.slug === slug);
  if (!info) return viewNotFound();

  const source = await loadPostSource(slug);
  if (source == null) return viewNotFound();

  const { meta, html } = parse(source);
  const title = meta.title || info.title;
  const date = meta.date || info.date;
  const tags = meta.tags || info.tags;

  const body = el('div', { class: 'prose' });
  body.innerHTML = html; // markdown.js가 이스케이프한 결과만 innerHTML 사용

  setTitle(title);
  return [
    el('a', { class: 'back-link', href: '#/', text: '← 목록으로' }),
    el('article', {}, [
      el('header', { class: 'post-header' }, [
        el('h1', { class: 'post-title', text: title }),
        el('div', { class: 'post-meta' }, dateNode(date)),
        tagList(tags),
      ]),
      body,
      el('footer', { class: 'post-footer' },
        el('a', { class: 'back-link', href: '#/', text: '← 목록으로 돌아가기' })),
    ]),
  ];
}

function viewNotFound(message = '주소가 바뀌었거나 삭제된 글일 수 있습니다.') {
  setTitle('찾을 수 없음');
  return [
    el('div', { class: 'not-found' }, [
      el('h1', { text: '글을 찾을 수 없습니다' }),
      el('p', { text: message }),
      el('a', { class: 'button', href: '#/', text: '홈으로 가기' }),
    ]),
  ];
}

function viewError(err) {
  console.error(err);
  setTitle('오류');
  const hint = location.protocol === 'file:'
    ? '파일을 직접 열면 글을 불러올 수 없습니다. 로컬 서버(예: python -m http.server)로 실행해 주세요.'
    : '잠시 후 다시 시도해 주세요.';
  return [
    el('div', { class: 'not-found' }, [
      el('h1', { text: '글을 불러오지 못했습니다' }),
      el('p', { text: hint }),
      el('a', { class: 'button', href: '#/', text: '다시 시도' }),
    ]),
  ];
}

// ----------------------------------------------------------
// 라우터
// ----------------------------------------------------------

function parseRoute() {
  const hash = location.hash;
  if (!hash.startsWith('#/')) return { name: 'home' };
  const [name, ...rest] = hash.slice(2).split('/');
  let param = '';
  try {
    param = decodeURIComponent(rest.join('/'));
  } catch {
    return { name: 'notfound' };
  }
  if (name === '') return { name: 'home' };
  if (name === 'post' && param) return { name: 'post', param };
  if (name === 'tag' && param) return { name: 'tag', param };
  return { name: 'notfound' };
}

async function render() {
  const id = ++renderId;
  const route = parseRoute();
  app.setAttribute('aria-busy', 'true');

  let nodes;
  try {
    if (route.name === 'home') nodes = await viewHome();
    else if (route.name === 'post') nodes = await viewPost(route.param);
    else if (route.name === 'tag') nodes = await viewTag(route.param);
    else nodes = viewNotFound();
  } catch (err) {
    nodes = viewError(err);
  }

  if (id !== renderId) return; // 그사이 다른 페이지로 이동함

  app.replaceChildren(...nodes);
  app.removeAttribute('aria-busy');

  if (!isFirstRender) {
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true }); // 화면 낭독기가 새 내용을 읽도록
  }
  isFirstRender = false;
}

// 본문 안 앵커 링크(#제목)와 건너뛰기 링크는 라우트를 바꾸지 않고 스크롤만 합니다.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (href.startsWith('#/')) return;

  event.preventDefault();
  let id = href.slice(1);
  try { id = decodeURIComponent(id); } catch { /* 원래 값 사용 */ }
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ block: 'start' });
  if (target.hasAttribute('tabindex')) target.focus({ preventScroll: true });
});

window.addEventListener('hashchange', render);

const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

render();
