'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { frontmatter, section, hasSection } = require('./lib/extract');
const { checkValue } = require('./lib/schema-check');

const ROOT = path.resolve(__dirname, '..');

/** seg2 新增的 skill：结构性硬性要求（≥4 true + ≥1 false）只对它们生效 */
const NEW_SKILLS = ['tiaohou-shiye', 'geshi-shiye', 'wuxing-shiye', 'suiyun-shiye', 'shiye-master'];

/** 每个新 skill 必须覆盖的关键词 —— 取自各自参考资料的原文术语 */
const REQUIRED_TERMS = {
  'tiaohou-shiye': ['寒局', '燥热局', '湿重局', '燥硬局', '春木旺局', '秋金肃局',
    '真药', '藏药', '假药', '调候', '生机赛道'],
  'geshi-shiye': ['正财格', '偏财格', '正官格', '七杀格', '正印格', '偏印格',
    '食神格', '伤官格', '比肩格', '劫财格',
    '成格', '破格', '通关', '伤官制杀', '杀印相生', '食伤生财', '财生官', '官印相生', '用库成格'],
  'wuxing-shiye': ['木', '火', '土', '金', '水',
    '代表职业', '性格适配', '方位', '复合行业', '喜用神', '做功链条'],
  'suiyun-shiye': ['原局', '大运', '流年', '顺势重仓', '轻试待机', '守势收缩',
    '交运过渡期', '冲开财库', '透出调候用神', '合走调候药', '刑冲格局根基',
    '忌神扎堆', '机会流年', '坑流年'],
  'shiye-master': ['调候', '格局', '五行', '岁运'],
};

/** 顶层过程文档允许被 Task 9 修改，其余基线文件一律不可动 */
const MUTABLE_BASELINE = new Set([
  'BOOK_OVERVIEW.md', 'DIGEST.md', 'GLOSSARY.md',
  'INDEX.md', 'PIPELINE_STATE.md', 'verified.md',
]);

const MANIFEST_NAME = '.baseline-manifest.txt';
const SKILL_DIR = path.join('skills', 'bazi-tuipan');

/** 基线文件数（Task 1 建基线时的既定事实）—— 清单被截断/写坏时用它把「静默通过」变成报错 */
const BASELINE_FILE_COUNT = 42;

/**
 * 事业推理契约的规范顶层键集 —— 权威来源：docs/superpowers/plans/2026-11-24-shiye-skill-plan.md
 * 的 Global Constraints（commit a5c7d22）。契约必须恰好是这 10 个键，多一个少一个都算错。
 */
const CONTRACT_TOP_LEVEL_KEYS = [
  'case', 'monthCommand', 'pattern', 'tiaoHou', 'xiJi',
  'boundaries', 'playbooks', 'timeline', 'transition', 'summary',
];

/**
 * 契约里 8 组闭合枚举（固定取值集）。path 里的 'x[]' 表示数组 items。
 * 两处 verdict 各有各的枚举，不可互换 —— 这是「同名字段不同语义」最容易翻车的地方。
 */
const CONTRACT_ENUMS = [
  { path: ['pattern', 'verdict'], values: ['成格', '破格', '不清'] },
  { path: ['tiaoHou', 'climateType'], values: ['寒局', '燥热局', '湿重局', '燥硬局', '春木旺局', '秋金肃局'] },
  { path: ['tiaoHou', 'drugStatus'], values: ['真药', '藏药', '假药'] },
  { path: ['playbooks[]', 'scale'], values: ['早期', '轻创业', '重资产', '合伙'] },
  { path: ['timeline[]', 'type'], values: ['水运', '木运', '火运', '土运', '金运'] },
  { path: ['timeline[]', 'verdict'], values: ['重仓', '轻试', '守成'] },
  { path: ['timeline[]', 'liunianWindows[]', 'action'], values: ['宜', '忌'] },
  { path: ['summary', 'strategy'], values: ['主业重仓', '底盘待机', '守成缓投'] },
];

/**
 * 读基线清单。返回 { entries, malformed }：
 * malformed 是既不像注释、也不像「<sha1>  <路径>」的行 —— 清单被写坏/合并冲突截断的痕迹。
 */
function readManifest(dir) {
  const file = path.join(dir, MANIFEST_NAME);
  if (!fs.existsSync(file)) return { entries: [], malformed: [] };
  const entries = [];
  const malformed = [];
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([0-9a-f]{40})\s+(.+)$/.exec(line);
    if (m) entries.push({ sha: m[1], file: m[2].trim() });
    else malformed.push(line);
  }
  return { entries, malformed };
}

/**
 * 比对基线文件 blob，返回不一致清单。
 * 用 `git hash-object` 比 blob（会应用 clean filter 归一化 CRLF），不看工作区内容。
 */
function baseline(root) {
  const dir = path.join(root, SKILL_DIR);
  const problems = [];

  const manifestFile = path.join(dir, MANIFEST_NAME);
  if (!fs.existsSync(manifestFile)) {
    // 清单缺失/未提交 = 基线守卫静默失效，必须报红而不是一路绿灯
    problems.push(`缺少基线清单 ${SKILL_DIR.split(path.sep).join('/')}/${MANIFEST_NAME}`);
    return problems;
  }

  const { entries, malformed } = readManifest(dir);

  // 清单自身的完整性 —— 清单被截断/写坏时如果只按「读到的条目」检查，
  // 基线守卫会整条腿静默失效（0 条 → 0 错 → 绿灯）。
  if (entries.length !== BASELINE_FILE_COUNT) {
    problems.push(`基线清单条目数不对：应为 ${BASELINE_FILE_COUNT} 条，实际 ${entries.length} 条`);
  }
  if (malformed.length > 0) {
    problems.push(`基线清单有 ${malformed.length} 行无法解析（第一行：${malformed[0]}）`);
  }
  const seen = new Set();
  for (const { file } of entries) {
    if (seen.has(file)) problems.push(`基线清单有重复条目: ${file}`);
    seen.add(file);
  }

  // 存在性检查对全部条目都做（含那 6 个可变顶层文档）。
  // 方向是「清单 ⊆ 实际」：后来新建的 skill 目录、candidates/、清单自身都不在清单里，
  // 不能反过来要求「实际 ⊆ 清单」。
  const present = [];
  for (const { sha, file } of entries) {
    if (!fs.existsSync(path.join(dir, file))) {
      problems.push(`基线文件丢失: ${file}`);
      continue;
    }
    present.push({ sha, file });
  }

  // hash 比对只针对不可变的基线文件
  const toHash = present.filter((e) => !MUTABLE_BASELINE.has(e.file));
  if (toHash.length === 0) return problems;

  let out;
  try {
    // 一次 git 子进程算完整批（输出与逐个算完全一致）
    out = execFileSync('git', ['hash-object', '--stdin-paths'], {
      cwd: root,
      encoding: 'utf8',
      input: toHash.map((e) => `${SKILL_DIR.split(path.sep).join('/')}/${e.file}`).join('\n') + '\n',
    });
  } catch (e) {
    problems.push(`无法执行 git hash-object 比对基线 —— ${e.message}`);
    return problems;
  }

  const hashes = out.split('\n').map((s) => s.trim()).filter(Boolean);
  if (hashes.length !== toHash.length) {
    problems.push(`git hash-object 输出条数不符（期望 ${toHash.length} 条，实际 ${hashes.length} 条）`);
    return problems;
  }
  toHash.forEach((e, i) => {
    if (hashes[i] !== e.sha) problems.push(`基线文件被改动: ${e.file}`);
  });
  return problems;
}

function checkSkillStructure(errors, skillName, text, requireA2) {
  const fm = frontmatter(text);
  if (!fm) {
    errors.push(`${skillName}: 缺少 frontmatter`);
    return;
  }
  for (const key of ['name', 'description', 'trigger']) {
    if (!fm[key]) errors.push(`${skillName}: frontmatter 缺少 ${key}`);
  }
  if (fm.name && fm.name !== skillName) {
    errors.push(`${skillName}: frontmatter name="${fm.name}" 与目录名不一致`);
  }
  if (!hasSection(text, 'Interpretation（核心方法论）')) {
    errors.push(`${skillName}: 缺少 ## Interpretation（核心方法论）段`);
  }
  if (!hasSection(text, 'Execution（执行步骤）')) {
    errors.push(`${skillName}: 缺少 ## Execution（执行步骤）段`);
  }
  // A2 段只对新 skill 强制：基线的 tuipan-master.skill.md 用的是 ## Boundary 而非 ## A2，
  // 而基线文件是不可修改的，对它强制 A2 会产生无法修复的报错。
  if (requireA2 && !hasSection(text, 'A2（Future Trigger）')) {
    errors.push(`${skillName}: 缺少 ## A2（Future Trigger）段`);
  }
  const interp = section(text, 'Interpretation（核心方法论）');
  // 「字段名」只在列举语境（后跟冒号）时才算格式指令，正当的「字段名称」不误伤
  if (interp && /输出\s*JSON|JSON\s*输出|字段名\s*[:：]/.test(interp)) {
    errors.push(`${skillName}: Interpretation 段混入了流程/格式指令（应只放知识）`);
  }
}

function checkTestPrompts(errors, skillName, file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push(`${skillName}/test-prompts.json: JSON 解析失败 —— ${e.message}`);
    return;
  }
  if (!Array.isArray(data)) {
    errors.push(`${skillName}/test-prompts.json: 顶层必须是数组`);
    return;
  }
  const ids = new Set();
  let trues = 0;
  let falses = 0;
  for (const [i, item] of data.entries()) {
    // 畸形条目（不是普通对象）不能崩：报错并跳过这一条，继续查其余条目
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      errors.push(`${skillName}/test-prompts.json[${i}]: 条目必须是对象（实际 ${item === null ? 'null' : JSON.stringify(item)}）`);
      continue;
    }
    for (const key of ['id', 'prompt', 'expected_skill', 'should_fire', 'category', 'note']) {
      if (!(key in item)) errors.push(`${skillName}/test-prompts.json[${i}]: 缺少字段 ${key}`);
    }
    if (item.id !== undefined) {
      if (ids.has(item.id)) errors.push(`${skillName}/test-prompts.json: id 重复 "${item.id}"`);
      ids.add(item.id);
    }
    // 只有「应触发」条目的 expected_skill 才必须等于本 skill；
    // 诱饵条目（should_fire: false）指向的是另一个 skill，基线的 tuipan-master 就是这么写的。
    if (item.should_fire === true && item.expected_skill !== undefined && item.expected_skill !== skillName) {
      errors.push(`${skillName}/test-prompts.json[${i}]: 应触发条目的 expected_skill="${item.expected_skill}" 与 skill 名不符`);
    }
    if (item.should_fire === true) trues += 1;
    if (item.should_fire === false) falses += 1;
  }
  if (NEW_SKILLS.includes(skillName)) {
    if (trues < 4) errors.push(`${skillName}/test-prompts.json: 应触发条目不足 4 条（实际 ${trues}）`);
    if (falses < 1) errors.push(`${skillName}/test-prompts.json: 缺少诱饵条目（should_fire: false）`);
  }
}

/** 从 CAREER_SCHEMA.md 里抠出 ```json 代码块并解析 */
function readSchema(root, errors) {
  const schemaMd = path.join(root, 'docs', 'CAREER_SCHEMA.md');
  if (!fs.existsSync(schemaMd)) {
    errors.push('缺少 docs/CAREER_SCHEMA.md');
    return null;
  }
  const text = fs.readFileSync(schemaMd, 'utf8');
  const m = /```json\s*\n([\s\S]*?)\n```/.exec(text);
  if (!m) {
    errors.push('docs/CAREER_SCHEMA.md: 找不到 ```json 代码块');
    return null;
  }
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    errors.push(`docs/CAREER_SCHEMA.md: JSON 解析失败 —— ${e.message}`);
    return null;
  }
}

/** 按 'x[]' 写法在 schema 里定位一个节点；定位不到返回 null */
function resolveSchemaNode(schema, pathParts) {
  let node = schema;
  for (const raw of pathParts) {
    if (!node || typeof node !== 'object') return null;
    const isArray = raw.endsWith('[]');
    const name = isArray ? raw.slice(0, -2) : raw;
    const props = node.properties;
    if (!props || typeof props !== 'object' || !Object.prototype.hasOwnProperty.call(props, name)) return null;
    node = props[name];
    if (isArray) {
      if (!node || typeof node !== 'object' || !node.items) return null;
      node = node.items;
    }
  }
  return node;
}

/**
 * 契约自身的形状检查：required 必须是非空数组，required 与 properties 的键集合一致，
 * 顶层键集必须恰好是规范的 10 个键，8 组闭合枚举的取值必须与规范完全一致。
 * 否则「契约和总入口对不对得上」这条检查会退化成无错即过的空断言。
 */
function checkSchemaShape(errors, schema) {
  if (!schema) return false;
  const required = Array.isArray(schema.required) ? schema.required : [];
  if (required.length === 0) {
    errors.push('契约 schema 缺少非空的 required 数组');
    return false;
  }
  const props = (schema.properties && typeof schema.properties === 'object') ? schema.properties : {};
  let ok = true;
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) {
      errors.push(`契约 schema: required 顶层键 "${key}" 未在 properties 中定义`);
      ok = false;
    }
  }
  for (const key of Object.keys(props)) {
    if (!required.includes(key)) {
      errors.push(`契约 schema: properties 顶层键 "${key}" 未列入 required`);
      ok = false;
    }
  }

  // 顶层键集必须恰好是规范的 10 个键（多一个少一个都算契约走样）
  const actualKeys = required.slice().sort();
  const wantedKeys = CONTRACT_TOP_LEVEL_KEYS.slice().sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(wantedKeys)) {
    errors.push(`契约 schema 顶层键集不对：应为 [${CONTRACT_TOP_LEVEL_KEYS.join(' / ')}]，实际 [${required.join(' / ')}]`);
    ok = false;
  }

  // 8 组闭合枚举必须与规范完全一致（两处 verdict 的枚举各自独立，不可混用）
  for (const spec of CONTRACT_ENUMS) {
    const label = spec.path.join('.');
    const node = resolveSchemaNode(schema, spec.path);
    if (!node || !Array.isArray(node.enum)) {
      errors.push(`契约 schema 缺少闭合枚举定义：${label} 应为 [${spec.values.join(' / ')}]`);
      ok = false;
      continue;
    }
    const actual = node.enum.slice().sort();
    const wanted = spec.values.slice().sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      errors.push(`契约 schema 闭合枚举取值不对：${label} 应为 [${spec.values.join(' / ')}]，实际 [${node.enum.join(' / ')}]`);
      ok = false;
    }
  }
  return ok;
}

/**
 * 契约顶层键是否在文本里被「点名」。
 * 按标识符边界匹配，而不是无边界子串：
 *   - `patterns` / `summaryText` 不算点名 `pattern` / `summary`；
 *   - `use case study` 里的 case 只是英文散文里的普通词，不算点名；
 *   - 反引号包裹（`case`）或中文标点分隔（case、monthCommand）算点名；
 *   - 大小写敏感：CASE 不算命中 case。
 */
function mentionsKey(text, key) {
  if (typeof text !== 'string' || !text) return false;
  if (text.includes('`' + key + '`')) return true;
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![A-Za-z0-9_$])${esc}(?![A-Za-z0-9_$])`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + key.length);
    // 紧挨着英文单词 → 是散文里的普通词，不是对契约键的引用
    if (/[A-Za-z][ \t]*$/.test(before)) continue;
    if (/^[ \t]*[A-Za-z]/.test(after)) continue;
    return true;
  }
  return false;
}

/** 总入口的 Execution 段必须点名契约的每一个顶层键 */
function checkMasterAlignment(errors, schema, masterText) {
  if (!schema) return;
  const required = Array.isArray(schema.required) ? schema.required : [];
  if (required.length === 0) return; // 形状问题已由 checkSchemaShape 报过
  // 缺 Execution 段本身已由 checkSkillStructure 报过，这里不重复报
  if (!hasSection(masterText, 'Execution（执行步骤）')) return;
  const exec = section(masterText, 'Execution（执行步骤）');
  if (!exec) {
    // 标题在、正文为空 —— 契约对齐整条腿本来会在这里静默失效，必须报红
    errors.push(`shiye-master: Execution 段正文为空，契约顶层键一个都未点名：${required.join(' / ')}`);
    return;
  }
  for (const key of required) {
    if (!mentionsKey(exec, key)) {
      errors.push(`shiye-master: Execution 段未点名契约顶层键 "${key}"`);
    }
  }
}

/**
 * 契约样例校验：docs/CAREER_SCHEMA.sample.json 若存在，就按 docs/CAREER_SCHEMA.md 的
 * schema 校验一遍（样例文件由 Task 2 创建；不存在时不报错）。
 */
function checkSchemaSample(root, schema, errors) {
  if (!schema) return;
  const sampleFile = path.join(root, 'docs', 'CAREER_SCHEMA.sample.json');
  if (!fs.existsSync(sampleFile)) return;
  let sample;
  try {
    sample = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));
  } catch (e) {
    errors.push(`契约样例 docs/CAREER_SCHEMA.sample.json: JSON 解析失败 —— ${e.message}`);
    return;
  }
  const sub = [];
  checkValue(sample, schema, '$', sub);
  for (const e of sub) {
    errors.push(`契约样例 docs/CAREER_SCHEMA.sample.json 不符合契约: ${e}`);
  }
}

function run(root) {
  const errors = [];
  const dir = path.join(root, SKILL_DIR);

  errors.push(...baseline(root));

  const schema = readSchema(root, errors);
  checkSchemaShape(errors, schema);
  checkSchemaSample(root, schema, errors);

  // 已有基线 skill：结构检查（规范文件不在此列；A2 不对基线强制）
  // 新 skill 由下面的 NEW_SKILLS 循环统一负责（那一轮 requireA2=true 更严），
  // 这里必须跳过，否则同一个缺陷会被报 2~3 次。
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    errors.push(`缺少 ${SKILL_DIR.split(path.sep).join('/')} 目录 —— ${e.message}`);
    entries = [];
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (NEW_SKILLS.includes(entry.name)) continue;
      const skillFile = path.join(dir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        checkSkillStructure(errors, entry.name, fs.readFileSync(skillFile, 'utf8'), false);
      }
    } else if (entry.name.endsWith('.skill.md') && entry.name !== '八字完整推盘输出通用规范.skill.md') {
      const skillName = entry.name.replace(/\.skill\.md$/, '');
      if (NEW_SKILLS.includes(skillName)) continue;
      const text = fs.readFileSync(path.join(dir, entry.name), 'utf8');
      checkSkillStructure(errors, skillName, text, false);
    }
  }

  // 新 skill：结构 + 关键词 + test-prompts
  for (const skillName of NEW_SKILLS) {
    const sub = path.join(dir, skillName);
    const skillFile = path.join(sub, 'SKILL.md');
    const masterFile = path.join(dir, `${skillName}.skill.md`);
    const isMaster = skillName === 'shiye-master';
    const target = isMaster ? masterFile : skillFile;

    if (!fs.existsSync(target)) {
      errors.push(`${skillName}: 缺少 ${isMaster ? `${skillName}.skill.md` : `${skillName}/SKILL.md`}`);
      continue;
    }
    const text = fs.readFileSync(target, 'utf8');
    checkSkillStructure(errors, skillName, text, true);

    const interp = section(text, 'Interpretation（核心方法论）');
    for (const term of REQUIRED_TERMS[skillName] || []) {
      if (!interp.includes(term)) {
        errors.push(`${skillName}: Interpretation 段缺少必需术语 "${term}"`);
      }
    }

    const prompts = path.join(sub, 'test-prompts.json');
    if (!fs.existsSync(prompts)) {
      errors.push(`${skillName}: 缺少 test-prompts.json`);
    } else {
      checkTestPrompts(errors, skillName, prompts);
    }

    if (isMaster) checkMasterAlignment(errors, schema, text);
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  run, baseline, NEW_SKILLS, REQUIRED_TERMS, MUTABLE_BASELINE,
  BASELINE_FILE_COUNT, CONTRACT_TOP_LEVEL_KEYS, CONTRACT_ENUMS, mentionsKey,
};

if (require.main === module) {
  const result = run(ROOT);
  if (result.ok) {
    console.log('✓ 全部校验通过');
  } else {
    console.error(`✗ ${result.errors.length} 项校验失败：`);
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exitCode = 1;
  }
}
