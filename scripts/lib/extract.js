'use strict';

/** 解析 markdown 文件头的 frontmatter（--- 包裹的 YAML 扁平键值对） */
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/** 取 `## <heading>` 到下一个 `## ` 之间的正文；不存在返回空串 */
function section(text, heading) {
  const start = text.indexOf(`## ${heading}`);
  if (start === -1) return '';
  const rest = text.slice(start + heading.length + 3);
  const end = rest.search(/\n##\s/);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

function hasSection(text, heading) {
  return text.includes(`## ${heading}`);
}

module.exports = { frontmatter, section, hasSection };
