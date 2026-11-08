// posts/*.md의 front matter를 읽어 posts/index.json을 다시 만듭니다.
// 사용법: node scripts/build-index.mjs
// 외부 의존성 없이 Node 내장 모듈과 js/markdown.js의 front matter 파서만 사용합니다.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseFrontMatter } from '../js/markdown.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const postsDir = path.join(root, 'posts');
const indexPath = path.join(postsDir, 'index.json');

const SLUG_RE = /^[a-z0-9-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toTags(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) return [value];
  return [];
}

async function main() {
  const files = (await readdir(postsDir)).filter((f) => f.endsWith('.md')).sort();
  const posts = [];
  const errors = [];

  for (const file of files) {
    const slug = file.slice(0, -3);
    const { meta } = parseFrontMatter(await readFile(path.join(postsDir, file), 'utf8'));

    if (meta.draft === 'true') {
      console.log(`  건너뜀 (draft): ${file}`);
      continue;
    }

    const problems = [];
    if (!SLUG_RE.test(slug)) problems.push('파일 이름은 영문 소문자, 숫자, 하이픈만 쓸 수 있습니다');
    if (!meta.title) problems.push('title이 없습니다');
    if (!DATE_RE.test(meta.date || '')) problems.push('date는 YYYY-MM-DD 형식이어야 합니다');
    if (problems.length) {
      errors.push(`${file}: ${problems.join(', ')}`);
      continue;
    }

    const post = { slug, title: meta.title, date: meta.date, tags: toTags(meta.tags) };
    if (meta.description) post.description = meta.description;
    posts.push(post);
  }

  if (errors.length) {
    console.error('다음 글에 문제가 있어 index.json을 만들지 않았습니다:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  await writeFile(indexPath, `${JSON.stringify(posts, null, 2)}\n`, 'utf8');
  console.log(`posts/index.json 생성 완료: 글 ${posts.length}개`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
