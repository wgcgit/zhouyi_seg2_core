'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const validate = require('./validate-skills');

function makeRepo(skillFiles) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seg2-'));
  const dir = path.join(root, 'skills', 'bazi-tuipan');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  for (const [rel, content] of Object.entries(skillFiles)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

/** 临时目录必须先 git init，否则 git hash-object 在仓库外算出的 blob 与仓库内不同 */
function gitInit(root) {
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  return root;
}

/** 在 root 里批量算 blob hash（与校验器同样用 git hash-object） */
function hashAll(root, relPaths) {
  const out = execFileSync('git', ['hash-object', '--stdin-paths'], {
    cwd: root,
    encoding: 'utf8',
    input: relPaths.map((p) => `skills/bazi-tuipan/${p}`).join('\n') + '\n',
  });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function writeManifest(root, entries) {
  const lines = [
    '# 基线文件 blob 清单 —— 测试用',
    '# 格式: <sha1>  <相对 skills/bazi-tuipan/ 的路径>',
    ...entries.map((e) => `${e.sha}  ${e.file}`),
  ];
  fs.writeFileSync(path.join(root, 'skills', 'bazi-tuipan', '.baseline-manifest.txt'), lines.join('\n') + '\n');
}

const GOOD = `---
name: tiaohou-shiye
description: 测试用
trigger: "调候"
---

# tiaohou-shiye — 测试

## Interpretation（核心方法论）

寒局 燥热局 湿重局 燥硬局 春木旺局 秋金肃局 真药 藏药 假药 调候 生机赛道

## A2（Future Trigger）

触发条件

## Execution（执行步骤）

1. 做点事
`;

// ---------------------------------------------------------------------------
// 契约（Task 2 会补真实文件，这里用的是可运行的最小契约）
// ---------------------------------------------------------------------------

const SCHEMA = {
  type: 'object',
  required: ['case', 'pattern'],
  properties: {
    case: {
      type: 'object',
      required: ['gender'],
      properties: { gender: { type: 'string' } },
    },
    pattern: {
      type: 'object',
      required: ['verdict'],
      properties: { verdict: { type: 'string', enum: ['成格', '破格', '不清'] } },
    },
  },
};

const SAMPLE = { case: { gender: '男' }, pattern: { verdict: '成格' } };

function schemaMd(schema) {
  return '# 事业推理契约\n\n```json\n' + JSON.stringify(schema, null, 2) + '\n```\n';
}

/** 按 validate.REQUIRED_TERMS 自动生成合规的 skill 正文，术语表变了测试也不会失效 */
function skillDoc(name, extraExec = '') {
  const terms = validate.REQUIRED_TERMS[name].join(' ');
  return `---
name: ${name}
description: 测试用
trigger: "触发词"
---

# ${name} — 测试

## Interpretation（核心方法论）

${terms}

## A2（Future Trigger）

触发条件

## Execution（执行步骤）

1. 做点事
${extraExec}
`;
}

function promptsJson(name) {
  const arr = [];
  for (let i = 1; i <= 4; i += 1) {
    arr.push({ id: `t${i}`, prompt: `p${i}`, expected_skill: name, should_fire: true, category: '应触发', note: 'n' });
  }
  arr.push({ id: 'f1', prompt: 'q', expected_skill: 'other-skill', should_fire: false, category: '诱饵-应触发子skill', note: 'n' });
  return JSON.stringify(arr, null, 2);
}

/** 造一个「完全合规」的仓库：5 个新 skill + 契约 + 样例 + 正确的 manifest */
function makeCompliantRepo(overrides = {}) {
  const files = {};
  for (const name of validate.NEW_SKILLS) {
    if (name === 'shiye-master') {
      files['shiye-master.skill.md'] = skillDoc(name, '2. 产出 case / pattern 两段');
    } else {
      files[`${name}/SKILL.md`] = skillDoc(name);
    }
    files[`${name}/test-prompts.json`] = promptsJson(name);
  }
  files['notes.md'] = '这是一个基线占位文件。\n';
  const root = makeRepo(files);
  gitInit(root);

  const schema = overrides.schema || SCHEMA;
  fs.writeFileSync(path.join(root, 'docs', 'CAREER_SCHEMA.md'), overrides.schemaMd || schemaMd(schema));
  if (!overrides.skipSample) {
    fs.writeFileSync(path.join(root, 'docs', 'CAREER_SCHEMA.sample.json'),
      JSON.stringify(overrides.sample || SAMPLE, null, 2));
  }

  const entries = overrides.manifestEntries || [{ file: 'notes.md', sha: hashAll(root, ['notes.md'])[0] }];
  writeManifest(root, entries);
  return root;
}

// ---------------------------------------------------------------------------
// 原有 7 条
// ---------------------------------------------------------------------------

test('缺 Interpretation 段被报出', () => {
  const root = makeRepo({ 'tiaohou-shiye/SKILL.md': GOOD.replace('## Interpretation（核心方法论）', '## 其他') });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('缺少 ## Interpretation')));
});

test('Interpretation 段混入格式指令被报出', () => {
  const bad = GOOD.replace('生机赛道', '生机赛道 输出 JSON 字段名');
  const root = makeRepo({ 'tiaohou-shiye/SKILL.md': bad });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('流程/格式指令')));
});

test('缺必需术语被报出', () => {
  const root = makeRepo({ 'tiaohou-shiye/SKILL.md': GOOD.replace('寒局', '') });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('缺少必需术语 "寒局"')));
});

test('frontmatter name 与目录名不符被报出', () => {
  const root = makeRepo({ 'tiaohou-shiye/SKILL.md': GOOD.replace('name: tiaohou-shiye', 'name: 别的') });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('与目录名不一致')));
});

test('test-prompts 缺少诱饵条目被报出', () => {
  const root = makeRepo({
    'tiaohou-shiye/SKILL.md': GOOD,
    'tiaohou-shiye/test-prompts.json': JSON.stringify([
      { id: 'a', prompt: 'p', expected_skill: 'tiaohou-shiye', should_fire: true, category: '应触发', note: 'n' },
    ]),
  });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('缺少诱饵条目')));
});

test('test-prompts 的 id 重复被报出', () => {
  const item = { id: 'a', prompt: 'p', expected_skill: 'tiaohou-shiye', should_fire: true, category: '应触发', note: 'n' };
  const root = makeRepo({
    'tiaohou-shiye/SKILL.md': GOOD,
    'tiaohou-shiye/test-prompts.json': JSON.stringify([item, { ...item }]),
  });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('id 重复')));
});

test('诱饵条目指向别的 skill 不报错', () => {
  const root = makeRepo({
    'tiaohou-shiye/SKILL.md': GOOD,
    'tiaohou-shiye/test-prompts.json': JSON.stringify([
      { id: 'a', prompt: 'p', expected_skill: 'tiaohou-shiye', should_fire: true, category: '应触发', note: 'n' },
      { id: 'b', prompt: 'q', expected_skill: 'geshi-shiye', should_fire: false, category: '诱饵-应触发子skill', note: 'n' },
    ]),
  });
  const r = validate.run(root);
  assert.ok(!r.errors.some((e) => e.includes('expected_skill')));
});

// ---------------------------------------------------------------------------
// Important 1 —— 契约对齐不许静默变成空断言
// ---------------------------------------------------------------------------

test('契约 schema 缺 required 数组被报出', () => {
  const root = makeCompliantRepo({ schema: { type: 'object', properties: {} } });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('契约 schema 缺少非空的 required 数组')), r.errors.join('\n'));
});

test('契约 schema 的 required 为空数组被报出', () => {
  const root = makeCompliantRepo({ schema: { type: 'object', required: [], properties: {} } });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('契约 schema 缺少非空的 required 数组')), r.errors.join('\n'));
});

test('契约 schema 的 required 键未在 properties 中定义被报出', () => {
  const root = makeCompliantRepo({
    schema: { type: 'object', required: ['case'], properties: { other: { type: 'string' } } },
  });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('required 顶层键 "case" 未在 properties 中定义')), r.errors.join('\n'));
});

test('契约 schema 的 properties 键未列入 required 被报出', () => {
  const root = makeCompliantRepo({
    schema: { type: 'object', required: ['case'], properties: { case: { type: 'string' }, extra: { type: 'string' } } },
  });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('properties 顶层键 "extra" 未列入 required')), r.errors.join('\n'));
});

// ---------------------------------------------------------------------------
// Important 2 —— 基线守卫不许静默失效
// ---------------------------------------------------------------------------

test('缺少基线清单被报出', () => {
  const root = makeRepo({ 'notes.md': 'x\n' });
  gitInit(root);
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('缺少基线清单')), r.errors.join('\n'));
});

test('缺少基线清单时 baseline() 返回一条问题而不是空数组', () => {
  const root = makeRepo({ 'notes.md': 'x\n' });
  gitInit(root);
  const problems = validate.baseline(root);
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /缺少基线清单/);
});

// ---------------------------------------------------------------------------
// Important 3 —— 畸形输入不许崩
// ---------------------------------------------------------------------------

test('test-prompts 条目不是对象时不崩且报错', () => {
  const root = makeRepo({
    'tiaohou-shiye/SKILL.md': GOOD,
    'tiaohou-shiye/test-prompts.json': JSON.stringify(['not-an-object']),
  });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('条目必须是对象')), r.errors.join('\n'));
});

test('test-prompts 条目是 null 时不崩且报错', () => {
  const root = makeRepo({
    'tiaohou-shiye/SKILL.md': GOOD,
    'tiaohou-shiye/test-prompts.json': JSON.stringify([null]),
  });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('条目必须是对象')), r.errors.join('\n'));
});

test('test-prompts 顶层不是数组时报错不崩', () => {
  const root = makeRepo({
    'tiaohou-shiye/SKILL.md': GOOD,
    'tiaohou-shiye/test-prompts.json': JSON.stringify({ a: 1 }),
  });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('顶层必须是数组')), r.errors.join('\n'));
});

// ---------------------------------------------------------------------------
// Important 4 —— 同一个缺陷不许被重复报
// ---------------------------------------------------------------------------

test('子 skill 缺 Interpretation 段只报一次', () => {
  const root = makeCompliantRepo();
  const p = path.join(root, 'skills', 'bazi-tuipan', 'geshi-shiye', 'SKILL.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('## Interpretation（核心方法论）', '## 其他'));
  const r = validate.run(root);
  const hits = r.errors.filter((e) => e.includes('geshi-shiye: 缺少 ## Interpretation'));
  assert.strictEqual(hits.length, 1, r.errors.join('\n'));
});

test('子 skill 缺 Execution 段只报一次', () => {
  const root = makeCompliantRepo();
  const p = path.join(root, 'skills', 'bazi-tuipan', 'wuxing-shiye', 'SKILL.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('## Execution（执行步骤）', '## 其他'));
  const r = validate.run(root);
  const hits = r.errors.filter((e) => e.includes('wuxing-shiye: 缺少 ## Execution'));
  assert.strictEqual(hits.length, 1, r.errors.join('\n'));
});

test('shiye-master 缺 Execution 段只报一次', () => {
  const root = makeCompliantRepo();
  const p = path.join(root, 'skills', 'bazi-tuipan', 'shiye-master.skill.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('## Execution（执行步骤）', '## 其他'));
  const r = validate.run(root);
  const hits = r.errors.filter((e) => e.includes('shiye-master: 缺少 ## Execution'));
  assert.strictEqual(hits.length, 1, r.errors.join('\n'));
  // 缺 Execution 段时不再重复报「未点名契约顶层键」
  assert.ok(!r.errors.some((e) => e.includes('未点名契约顶层键')), r.errors.join('\n'));
});

// ---------------------------------------------------------------------------
// Important 5 —— 契约样例校验（sample 文件由 Task 2 创建）
// ---------------------------------------------------------------------------

test('契约样例不符合契约时报错', () => {
  const root = makeCompliantRepo({ sample: { case: { gender: '男' }, pattern: { verdict: '格局很好' } } });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('CAREER_SCHEMA.sample.json') && e.includes('枚举')), r.errors.join('\n'));
});

test('契约样例文件不存在时不报错', () => {
  const root = makeCompliantRepo({ skipSample: true });
  const r = validate.run(root);
  assert.ok(!r.errors.some((e) => e.includes('CAREER_SCHEMA.sample.json')), r.errors.join('\n'));
});

// ---------------------------------------------------------------------------
// Minor —— MUTABLE_BASELINE 的存在性检查、缺目录、批量 hash、基线守卫测试
// ---------------------------------------------------------------------------

test('可变顶层文档被删掉也报「基线文件丢失」', () => {
  const root = makeCompliantRepo();
  const entries = [{ file: 'BOOK_OVERVIEW.md', sha: '0'.repeat(40) }];
  writeManifest(root, entries);
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('基线文件丢失: BOOK_OVERVIEW.md')), r.errors.join('\n'));
});

test('可变顶层文档内容被改不报「基线文件被改动」', () => {
  const root = makeCompliantRepo();
  fs.writeFileSync(path.join(root, 'skills', 'bazi-tuipan', 'BOOK_OVERVIEW.md'), '随便改改\n');
  writeManifest(root, [{ file: 'BOOK_OVERVIEW.md', sha: '0'.repeat(40) }]);
  const r = validate.run(root);
  assert.ok(!r.errors.some((e) => e.includes('基线文件被改动: BOOK_OVERVIEW.md')), r.errors.join('\n'));
});

test('缺少 skills/bazi-tuipan 目录时报错不崩', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seg2-'));
  gitInit(root);
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('缺少 skills/bazi-tuipan 目录')), r.errors.join('\n'));
});

test('基线文件被篡改时被报出', () => {
  const root = makeCompliantRepo();
  fs.writeFileSync(path.join(root, 'skills', 'bazi-tuipan', 'notes.md'), '被改了！\n');
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('基线文件被改动: notes.md')), r.errors.join('\n'));
});

test('基线文件丢失时被报出', () => {
  const root = makeCompliantRepo();
  fs.rmSync(path.join(root, 'skills', 'bazi-tuipan', 'notes.md'));
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('基线文件丢失: notes.md')), r.errors.join('\n'));
});

test('基线一致时不报任何基线问题', () => {
  const root = makeCompliantRepo();
  const problems = validate.baseline(root);
  assert.deepStrictEqual(problems, []);
});

test('完全合规的仓库 run() 返回 ok === true', () => {
  const root = makeCompliantRepo();
  const r = validate.run(root);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.ok, true);
});

// ---------------------------------------------------------------------------
// Minor —— 「字段名」收窄到列举语境
// ---------------------------------------------------------------------------

test('Interpretation 段写「字段名称」这类正当描述不误报', () => {
  const doc = GOOD.replace('生机赛道', '生机赛道 字段名称的定义');
  const root = makeRepo({ 'tiaohou-shiye/SKILL.md': doc });
  const r = validate.run(root);
  assert.ok(!r.errors.some((e) => e.includes('流程/格式指令')), r.errors.join('\n'));
});

test('Interpretation 段写「字段名:」这种列举仍被报出', () => {
  const doc = GOOD.replace('生机赛道', '生机赛道 字段名: year');
  const root = makeRepo({ 'tiaohou-shiye/SKILL.md': doc });
  const r = validate.run(root);
  assert.ok(r.errors.some((e) => e.includes('流程/格式指令')), r.errors.join('\n'));
});
