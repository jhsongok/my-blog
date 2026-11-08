// 마크다운 → HTML 변환기 (외부 의존성 없음)
//
// 구조: 1) front matter 분리 → 2) 줄 단위 블록 파싱 → 3) 블록 안 인라인 파싱
// 보안: 원문의 HTML은 모두 이스케이프하며, 링크/이미지 URL은 안전한 스킴만 허용합니다.

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

// 허용: http(s), mailto, 상대 경로, #앵커. 그 외 스킴(javascript:, data: 등)은 차단합니다.
function safeUrl(url) {
  const trimmed = url.trim();
  const compact = trimmed.replace(/[\s\u0000-\u001f]/g, '');
  if (/^(https?:|mailto:)/i.test(compact)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(compact)) return '#';
  return trimmed;
}

function isExternal(url) {
  return /^https?:\/\//i.test(url);
}

// ----------------------------------------------------------
// front matter
// ----------------------------------------------------------

function unquote(value) {
  const m = value.match(/^(["'])(.*)\1$/);
  return m ? m[2] : value;
}

export function parseFrontMatter(src) {
  const match = src.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return { meta: {}, body: src.replace(/^﻿/, '') };

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();
    if (/^\[.*\]$/.test(raw)) {
      meta[key] = raw.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
    } else {
      meta[key] = unquote(raw);
    }
  }
  return { meta, body: src.slice(match[0].length) };
}

// ----------------------------------------------------------
// 인라인
// ----------------------------------------------------------

const TOKEN_RE = /\u0000(\d+)\u0000/g;

function emphasis(s) {
  return s
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, '$1<strong>$2</strong>')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([\s\S]*?\S)_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
}

function linkAttrs(url, title) {
  const href = safeUrl(url);
  let attrs = `href="${escapeHtml(href)}"`;
  if (title) attrs += ` title="${escapeHtml(title)}"`;
  if (isExternal(href)) attrs += ' target="_blank" rel="noopener noreferrer"';
  return attrs;
}

// URL 안에 괄호 한 단계까지 허용: https://ko.wikipedia.org/wiki/Foo_(bar)
const URL_PART = '((?:[^\\s()]|\\([^\\s()]*\\))+)';
const TITLE_PART = '(?:\\s+"([^"]*)")?';
const IMAGE_RE = new RegExp(`!\\[([^\\]]*)\\]\\(\\s*${URL_PART}${TITLE_PART}\\s*\\)`, 'g');
const LINK_RE = new RegExp(`\\[((?:[^\\[\\]]|\\[[^\\]]*\\])*)\\]\\(\\s*${URL_PART}${TITLE_PART}\\s*\\)`, 'g');

export function inline(src) {
  const tokens = [];
  const stash = (html) => `\u0000${tokens.push(html) - 1}\u0000`;
  const stripTokens = (s) => s.replace(TOKEN_RE, '');

  // 1) 백슬래시 이스케이프
  let s = src.replace(/\\([\\`*_{}\[\]()#+\-.!~|>])/g, (_, c) => stash(escapeHtml(c)));

  // 2) 인라인 코드 (안쪽은 다른 문법을 처리하지 않음)
  s = s.replace(/(`+)(.+?)\1(?!`)/g, (_, __, code) =>
    stash(`<code>${escapeHtml(code.replace(/^ (.*) $/, '$1'))}</code>`));

  // 3) 이미지
  s = s.replace(IMAGE_RE, (_, alt, url, title) =>
    stash(`<img src="${escapeHtml(safeUrl(url))}" alt="${escapeHtml(stripTokens(alt))}"` +
      `${title ? ` title="${escapeHtml(title)}"` : ''} loading="lazy">`));

  // 4) 링크 (링크 텍스트에는 강조 문법 허용)
  s = s.replace(LINK_RE, (_, text, url, title) =>
    stash(`<a ${linkAttrs(url, title)}>${emphasis(escapeHtml(text))}</a>`));

  // 5) 자동 링크: <https://...> 및 맨 URL
  s = s.replace(/<(https?:\/\/[^\s<>]+)>/g, (_, url) =>
    stash(`<a ${linkAttrs(url)}>${escapeHtml(url)}</a>`));
  s = s.replace(/(^|[^\w/"'=])(https?:\/\/[^\s<>]*[^\s<>.,:;!?"')\]])/g, (_, pre, url) =>
    pre + stash(`<a ${linkAttrs(url)}>${escapeHtml(url)}</a>`));

  // 6) 나머지 텍스트 이스케이프 후 강조, 강제 줄바꿈
  s = emphasis(escapeHtml(s));
  s = s.replace(/(?: {2,}|\\)\n/g, '<br>\n');

  // 7) 자리표시자 복원 (중첩된 토큰까지)
  while (/\u0000\d+\u0000/.test(s)) {
    s = s.replace(TOKEN_RE, (_, n) => tokens[Number(n)]);
  }
  return s;
}

// ----------------------------------------------------------
// 블록
// ----------------------------------------------------------

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING_RE = /^ {0,3}(#{1,6})(?:[ ]+(.*?))?(?:[ ]+#+)?[ ]*$/;
const HR_RE = /^ {0,3}([-*_])(?:[ ]*\1){2,}[ ]*$/;
const QUOTE_RE = /^ {0,3}>/;
const LIST_RE = /^( *)([-*+]|\d{1,9}[.)])(?:[ ]+(.*)|$)/;
const TABLE_SEP_RE = /^ {0,3}\|?[ ]*:?-+:?[ ]*(?:\|[ ]*:?-+:?[ ]*)*\|?[ ]*$/;
const BLANK_RE = /^\s*$/;

function isBlockStart(line) {
  return FENCE_RE.test(line) || HEADING_RE.test(line) || HR_RE.test(line) ||
    QUOTE_RE.test(line) || LIST_RE.test(line);
}

function leadingSpaces(line) {
  return line.match(/^ */)[0].length;
}

function slugify(text, ctx) {
  const base = text
    .replace(/[`*_~[\]()!#\\]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-') || 'section';
  const count = ctx.slugs.get(base) || 0;
  ctx.slugs.set(base, count + 1);
  return count ? `${base}-${count}` : base;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function parseTable(lines, i) {
  const header = splitRow(lines[i]);
  const aligns = splitRow(lines[i + 1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
  });
  const cols = header.length;
  const cell = (tag, text, c) => {
    const align = aligns[c] ? ` style="text-align:${aligns[c]}"` : '';
    return `<${tag}${align}>${inline(text || '')}</${tag}>`;
  };

  let html = '<div class="table-wrap"><table>\n<thead><tr>';
  html += header.map((text, c) => cell('th', text, c)).join('');
  html += '</tr></thead>\n';

  i += 2;
  const rows = [];
  while (i < lines.length && !BLANK_RE.test(lines[i]) && lines[i].includes('|')) {
    const cells = splitRow(lines[i]);
    let row = '<tr>';
    for (let c = 0; c < cols; c++) row += cell('td', cells[c], c);
    rows.push(row + '</tr>');
    i++;
  }
  if (rows.length) html += `<tbody>\n${rows.join('\n')}\n</tbody>\n`;
  html += '</table></div>';
  return { html, next: i };
}

function parseList(lines, i, ctx) {
  const first = lines[i].match(LIST_RE);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const start = ordered ? parseInt(first[2], 10) : 1;
  const sameKind = (m) => m && m[1].length === baseIndent && /\d/.test(m[2]) === ordered;

  const items = [];
  let cur = null;
  let loose = false;

  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(LIST_RE);

    if (sameKind(m)) {
      cur = { lines: [m[3] || ''], contentIndent: m[1].length + m[2].length + 1 };
      items.push(cur);
      i++;
      continue;
    }

    if (BLANK_RE.test(line)) {
      let j = i + 1;
      while (j < lines.length && BLANK_RE.test(lines[j])) j++;
      if (j < lines.length) {
        if (sameKind(lines[j].match(LIST_RE))) {
          loose = true;
          i = j;
          continue;
        }
        if (leadingSpaces(lines[j]) > baseIndent) {
          cur.lines.push('');
          i++;
          continue;
        }
      }
      break;
    }

    const indent = leadingSpaces(line);
    if (indent > baseIndent) {
      cur.lines.push(line.slice(Math.min(indent, cur.contentIndent)));
      i++;
      continue;
    }

    // 게으른 연속 줄: 들여쓰기 없이 이어지는 문단 텍스트
    if (!isBlockStart(line) && !BLANK_RE.test(cur.lines[cur.lines.length - 1])) {
      cur.lines.push(line.trim());
      i++;
      continue;
    }
    break;
  }

  for (const item of items) {
    while (item.lines.length && BLANK_RE.test(item.lines[item.lines.length - 1])) item.lines.pop();
    if (item.lines.some((l) => BLANK_RE.test(l))) loose = true;
  }

  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
  const body = items
    .map((item) => `<li>${parseBlocks(item.lines, ctx, !loose).trim()}</li>`)
    .join('\n');
  return { html: `<${tag}${startAttr}>\n${body}\n</${tag}>`, next: i };
}

function parseBlocks(lines, ctx, tight = false) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (BLANK_RE.test(line)) {
      i++;
      continue;
    }

    // 코드 블록
    let m = line.match(FENCE_RE);
    if (m) {
      const fence = m[1];
      const lang = m[2];
      const closeRe = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
      const buf = [];
      i++;
      while (i < lines.length && !closeRe.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 닫는 펜스 건너뛰기
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      out.push(`<pre><code${cls}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 제목
    m = line.match(HEADING_RE);
    if (m) {
      const level = m[1].length;
      const text = m[2] || '';
      out.push(`<h${level} id="${escapeHtml(slugify(text, ctx))}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    // 수평선 (목록보다 먼저 검사: "* * *")
    if (HR_RE.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // 인용문 (재귀)
    if (QUOTE_RE.test(line)) {
      const buf = [];
      while (i < lines.length && !BLANK_RE.test(lines[i])) {
        if (QUOTE_RE.test(lines[i])) {
          buf.push(lines[i].replace(/^ {0,3}> ?/, ''));
        } else if (!isBlockStart(lines[i])) {
          buf.push(lines[i]); // 게으른 연속 줄
        } else {
          break;
        }
        i++;
      }
      out.push(`<blockquote>\n${parseBlocks(buf, ctx)}\n</blockquote>`);
      continue;
    }

    // 표
    if (line.includes('|') && i + 1 < lines.length &&
        lines[i + 1].includes('|') && TABLE_SEP_RE.test(lines[i + 1])) {
      const { html, next } = parseTable(lines, i);
      out.push(html);
      i = next;
      continue;
    }

    // 목록
    if (LIST_RE.test(line)) {
      const { html, next } = parseList(lines, i, ctx);
      out.push(html);
      i = next;
      continue;
    }

    // 문단
    const buf = [line.replace(/^ +/, '')]; // 끝 공백은 강제 줄바꿈 표시이므로 유지
    i++;
    while (i < lines.length && !BLANK_RE.test(lines[i]) && !isBlockStart(lines[i])) {
      buf.push(lines[i].replace(/^ +/, ''));
      i++;
    }
    const text = inline(buf.join('\n'));
    out.push(tight ? text : `<p>${text}</p>`);
  }

  return out.join('\n');
}

// ----------------------------------------------------------
// 공개 API
// ----------------------------------------------------------

/**
 * 마크다운 문서를 파싱합니다.
 * @param {string} src 마크다운 원문 (front matter 포함 가능)
 * @returns {{ meta: Record<string, string | string[]>, html: string }}
 */
export function parse(src) {
  const { meta, body } = parseFrontMatter(src);
  const lines = body
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/\t/g, '    ')
    .split('\n');
  const ctx = { slugs: new Map() };
  return { meta, html: parseBlocks(lines, ctx) };
}
