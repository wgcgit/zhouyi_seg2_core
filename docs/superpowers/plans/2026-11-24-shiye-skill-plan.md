# 八字事业择业 skill 知识库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `zhouyi_seg2/参考资料/` 的 5 份事业择业方法论蒸馏成 4 个子 skill + 1 个总入口，并给出一份可机器校验的事业专项 JSON 契约。

**Architecture:** 知识库型项目，无运行时服务。产物是 `skills/bazi-tuipan/` 下的 markdown skill（沿用 v2 的 `Interpretation` / `A2` / `Execution` 三段式）+ `docs/CAREER_SCHEMA.md` JSON 契约 + 一套零依赖 Node 校验脚本，把「skill 结构合规」「契约与总入口键名对齐」「基线未被改动」三件事变成可跑的断言。

**Tech Stack:** Node.js v24（内置 `node:test` + `node:assert`，零依赖）；Markdown；JSON。

## Global Constraints

- **基线不可改动**：`skills/bazi-tuipan/` 下从 v2 拷贝来的 42 个文件必须逐字保持原样。其中 36 个是「运行时知识库文件」（19 个 skill 的 `SKILL.md` / `*.skill.md` 定义文件 + 17 份 `test-prompts.json`），另外 6 个是顶层过程文档（`BOOK_OVERVIEW.md`、`DIGEST.md`、`GLOSSARY.md`、`INDEX.md`、`PIPELINE_STATE.md`、`verified.md`）——**这 6 个允许在 Task 9 追加/修改**，其余 36 个任何任务都不得触碰。
- **判定基线一致必须比 git blob，不看工作区**：`core.autocrlf=true` 会把检出文件转成 CRLF，`diff -r` 会误报差异。用 `git hash-object`。
- **基线清单本身必须被锚定到基线提交**：`skills/bazi-tuipan/.baseline-manifest.txt` 是 42 个基线文件的 blob 清单，
  但它自己也是工作区里的一个文件 —— 只信它，等于「清单说谁没变谁就没变」，清单被改一次即可放行任何篡改。
  因此清单必须与**基线提交 `f7bd915`** 的树（`git ls-tree -r f7bd915 -- skills/bazi-tuipan`）逐条比对：
  路径集合与 blob sha 集合双向相等才算通过。基线提交不可改（改了就换 SHA），
  故这是**不可自证**的锚点。
- **锚点不可被环境变量绕过**：不得提供能把锚点换成任意提交（尤其 `HEAD`）的开关。
  `HEAD` 会让「基线提交里的 blob」变成被篡改后的内容，锚定自我循环、篡改完全隐身。
  测试要换锚点，走函数参数（`run(root, { baselineCommit })`），不走环境变量。
- **`参考资料/` 5 份原始 txt 同样不可改**：它们是蒸馏出处的追溯依据，自首提交 `f7bd915` 起一字未改。
  校验器必须对它们做常驻的工作区 blob 比对（同样用 `git hash-object`），
  而不是只在收尾时人工 `git diff` 一次。
  注意 `git ls-tree` 的 pathspec 要覆盖 `参考资料/`，且必须加 `-c core.quotepath=false`
  （中文路径会被 git 转义成八进制）。
- **运行时只加载 `Interpretation` 段**：`A2` / `Execution` 是流程指令，不进 system prompt。新 skill 的 `Interpretation` 段内不得出现「输出 JSON」「输出字段名」这类流程/格式指令。
- **每个新 skill 必须有 `test-prompts.json`**：至少 4 条 `should_fire: true` + 至少 1 条 `should_fire: false`（此规则**只对新 skill 生效**，不作为全局 lint —— 基线的 `paipan-jichu` 是 3/3、`dizhi-banhe` 是 5/0，本来就不满足）。
- **`test-prompts.json` 字段**：`id` / `prompt` / `expected_skill` / `should_fire` / `category` / `note`，六项齐全，`id` 在文件内唯一。
- **闭合枚举**：JSON 契约里 `climateType`、`drugStatus`、`pattern.verdict`、`timeline.verdict`、`scale`、`type`、`action`、`strategy` 均为闭合集合，取值见 Task 2。
- **JSON 契约顶层 10 个键**：`case`、`monthCommand`、`pattern`、`tiaoHou`、`xiJi`、`boundaries`、`playbooks`、`timeline`、`transition`、`summary`。
  这 10 个键名与 8 组枚举的取值**必须由 `scripts/validate-skills.js` 里的常量钉住并断言** ——
  契约 md 与校验器任一方写错都必须报错，不能靠「文档里写着」当约束。
  两处 `verdict` 的枚举**不可混用**：`pattern.verdict` ∈ {成格, 破格, 不清}，
  `timeline[].verdict` ∈ {重仓, 轻试, 守成}。
- **契约里多数数组必须声明 `minItems >= 1`**：`xiJi.xi`、`xiJi.ji`、`boundaries`、`playbooks`、
  `playbooks[].actions`、`timeline`、`timeline[].liunianWindows`、`summary.notes` 这 **8 个数组必须非空** ——
  空数组等于「样例只覆盖了半边」（`playbooks: []`、`summary.notes: []` 都能蒙混过关）。
  `scripts/validate-skills.js` 对这 8 条路径做常驻断言（契约有没有声明 `minItems`）。
  **唯一豁免是 `xiJi.ciXi`（次喜 / 辅助用神）**：`参考资料/事业3.txt:78` 明确区分
  「必须救的急药」与「锦上添花的辅药」—— 辅助用神本质可选，强行要求非空等于**逼模型编一个不存在的次喜**。
  故 `xiJi.ciXi` 允许为空数组，且校验器额外断言它**不得**声明 `minItems >= 1`（防止日后被误加回去）。
  对照：`xiJi.ji`（忌神）**必须非空** —— `参考资料/事业1.txt:56`「缺但为忌，补了反而压力大」
  说明忌神是由喜用神关系**派生**出来的，不因该五行不在原局就消失，因此不存在「无忌神」的情形。
- **提交信息用中文**，格式 `<type>: <简述>`，type 取 `feat` / `fix` / `docs` / `chore` / `test`。

## File Structure

```
zhouyi_seg2/
├── 参考资料/                                  # 已提交，5 份原始 txt，不得修改
├── docs/
│   ├── CAREER_SCHEMA.md                       # Task 2 新建：JSON 契约（人读 + 机读）
│   ├── CAREER_SCHEMA.sample.json              # Task 2 新建：基准样例输出（契约的持久断言对象）
│   └── superpowers/
│       ├── specs/2026-11-24-shiye-skill-design.md   # 已提交
│       └── plans/2026-11-24-shiye-skill-plan.md      # 本文件
├── scripts/
│   ├── lib/schema-check.js                    # Task 1 新建：递归契约校验器
│   ├── lib/schema-check.test.js               # Task 1 新建：校验器单测
│   ├── lib/extract.js                         # Task 1 新建：从 md 里抠 section / frontmatter
│   ├── validate-skills.js                     # Task 1 新建：主校验入口
│   └── validate-skills.test.js                # Task 1 新建：主校验入口单测
├── skills/bazi-tuipan/
│   ├── <基线 42 个文件>                         # Task 0 已提交（f7bd915），Task 9 只改 6 个顶层文档
│   ├── .baseline-manifest.txt                 # Task 1 新建：42 个基线文件的 blob 清单
│   ├── candidates/                            # Task 8 新建 4 份过程文档
│   │   ├── principles.md
│   │   ├── frameworks.md
│   │   ├── cases.md
│   │   └── counter-examples.md
│   ├── tiaohou-shiye/{SKILL.md,test-prompts.json}   # Task 3
│   ├── geshi-shiye/{SKILL.md,test-prompts.json}     # Task 4
│   ├── wuxing-shiye/{SKILL.md,test-prompts.json}    # Task 5
│   ├── suiyun-shiye/{SKILL.md,test-prompts.json}    # Task 6
│   └── shiye-master.skill.md + shiye-master/test-prompts.json   # Task 7
└── package.json                               # Task 1 新建：npm test 入口
```

---

### Task 1: 校验工具链 —— 把「skill 合规」变成可跑断言

知识库项目没有运行时，但「结构对不对」「契约和总入口对不对得上」「基线有没有被误改」这三件事完全可以断言。先把工具建起来，后面的每个 skill 写完都能立刻自检。

**Files:**
- Create: `scripts/lib/extract.js`
- Create: `scripts/lib/schema-check.js`
- Create: `scripts/lib/schema-check.test.js`
- Create: `scripts/validate-skills.js`
- Create: `scripts/validate-skills.test.js`
- Create: `skills/bazi-tuipan/.baseline-manifest.txt`
- Create: `package.json`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces:
  - `extract.frontmatter(text) -> { name, description, trigger }` — 解析文件头 `---` 块
  - `extract.section(text, heading) -> string` — 取 `## <heading>` 到下一个 `## ` 之间的正文；不存在返回 `''`
  - `extract.hasSection(text, heading) -> boolean`
  - `checkValue(value, schema, path, errors) -> void` — 递归校验，向 `errors` 数组 push 人类可读的错误串
  - `validate.run(root) -> { ok: boolean, errors: string[] }` — 跑全部检查
  - `validate.baseline(root) -> string[]` — 比对基线 blob，返回不一致清单

- [ ] **Step 1: 写 `scripts/lib/extract.js`**

```js
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
```

- [ ] **Step 2: 写 `scripts/lib/schema-check.js`**

```js
'use strict';

function typeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * 递归校验一个值是否符合 schema（子集：object/array/string/number/integer/enum/required/minItems）。
 * 错误以 `path: 说明` 的形式 push 进 errors。
 */
function checkValue(value, schema, path, errors) {
  if (!schema) return;

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: 值 "${value}" 不在枚举 [${schema.enum.join(' / ')}] 内`);
    return;
  }

  switch (schema.type) {
    case 'object': {
      if (typeName(value) !== 'object') {
        errors.push(`${path}: 期望 object，实际 ${typeName(value)}`);
        return;
      }
      for (const key of schema.required || []) {
        if (!(key in value)) errors.push(`${path}.${key}: 必填字段缺失`);
      }
      for (const [key, sub] of Object.entries(schema.properties || {})) {
        if (key in value) checkValue(value[key], sub, `${path}.${key}`, errors);
      }
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push(`${path}: 期望 array，实际 ${typeName(value)}`);
        return;
      }
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push(`${path}: 至少需要 ${schema.minItems} 项，实际 ${value.length} 项`);
      }
      if (schema.items) {
        value.forEach((item, i) => checkValue(item, schema.items, `${path}[${i}]`, errors));
      }
      return;
    }
    case 'string': {
      if (typeof value !== 'string') {
        errors.push(`${path}: 期望 string，实际 ${typeName(value)}`);
      }
      return;
    }
    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push(`${path}: 期望 integer，实际 ${JSON.stringify(value)}`);
      }
      return;
    }
    case 'number': {
      if (typeof value !== 'number') {
        errors.push(`${path}: 期望 number，实际 ${typeName(value)}`);
      }
      return;
    }
    default:
      return;
  }
}

module.exports = { checkValue, typeName };
```

- [ ] **Step 3: 写 `scripts/lib/schema-check.test.js`**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { checkValue } = require('./schema-check');

const schema = {
  type: 'object',
  required: ['kind', 'score'],
  properties: {
    kind: { type: 'string', enum: ['a', 'b'] },
    score: { type: 'integer' },
    tags: { type: 'array', items: { type: 'string' } },
    child: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
  },
};

function errorsFor(value) {
  const errors = [];
  checkValue(value, schema, '$', errors);
  return errors;
}

test('合法对象通过', () => {
  assert.deepStrictEqual(errorsFor({ kind: 'a', score: 3 }), []);
});

test('缺必填字段报错', () => {
  assert.match(errorsFor({ kind: 'a' }).join('\n'), /\$\.score: 必填字段缺失/);
});

test('枚举外的值报错', () => {
  assert.match(errorsFor({ kind: 'z', score: 1 }).join('\n'), /枚举/);
});

test('类型不符报错', () => {
  assert.match(errorsFor({ kind: 'a', score: 'x' }).join('\n'), /期望 integer/);
});

test('数组元素逐个校验', () => {
  assert.match(errorsFor({ kind: 'a', score: 1, tags: [1] }).join('\n'), /\$\.tags\[0\]: 期望 string/);
});

test('minItems 生效', () => {
  const s = { type: 'array', items: { type: 'string' }, minItems: 2 };
  const errors = [];
  checkValue(['x'], s, '$.a', errors);
  assert.match(errors.join('\n'), /至少需要 2 项/);
});

test('嵌套 object 必填下钻', () => {
  assert.match(errorsFor({ kind: 'a', score: 1, child: {} }).join('\n'), /\$\.child\.id: 必填字段缺失/);
});

test('顶层类型不符不继续下钻', () => {
  const errors = [];
  checkValue([], schema, '$', errors);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /期望 object/);
});
```

- [ ] **Step 4: 跑单测确认通过**

Run: `node --test scripts/lib/schema-check.test.js`
Expected: 8 个 test 全部 PASS，输出 `# pass 8`

若失败，先修实现再往下走。

- [ ] **Step 5: 生成基线清单 `skills/bazi-tuipan/.baseline-manifest.txt`**

清单记录 42 个基线文件的 git blob hash，用来日后证明「基线一个字节都没动」。

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
{
  echo "# 基线文件 blob 清单 —— 由 git hash-object 生成，Task 9 校验用"
  echo "# 格式: <sha1>  <相对 skills/bazi-tuipan/ 的路径>"
  cd skills/bazi-tuipan
  find . -type f ! -name '.baseline-manifest.txt' | sed 's|^\./||' | sort | while read -r f; do
    printf '%s  %s\n' "$(git hash-object "$f")" "$f"
  done
} > /tmp/baseline-manifest.tmp
mv /tmp/baseline-manifest.tmp .baseline-manifest.txt
wc -l .baseline-manifest.txt
```

Expected: 输出 `44 .baseline-manifest.txt`（42 个文件 + 2 行注释头）

- [ ] **Step 6: 写 `scripts/validate-skills.js`**

```js
'use strict';

const fs = require('fs');
const path = require('path');
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

function readManifest(dir) {
  const file = path.join(dir, '.baseline-manifest.txt');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const m = /^([0-9a-f]{40})\s+(.+)$/.exec(l.trim());
      return m ? { sha: m[1], file: m[2] } : null;
    })
    .filter(Boolean);
}

/** 比对基线文件 blob，返回不一致清单 */
function baseline(root) {
  const dir = path.join(root, 'skills', 'bazi-tuipan');
  const problems = [];
  for (const { sha, file } of readManifest(dir)) {
    if (MUTABLE_BASELINE.has(file)) continue;
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) {
      problems.push(`基线文件丢失: ${file}`);
      continue;
    }
    const actual = require('child_process')
      .execFileSync('git', ['hash-object', full], { cwd: root, encoding: 'utf8' })
      .trim();
    if (actual !== sha) problems.push(`基线文件被改动: ${file}`);
  }
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
  if (interp && /输出\s*JSON|JSON\s*输出|字段名/.test(interp)) {
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

/** 总入口的 Execution 段必须点名契约的每一个顶层键 */
function checkMasterAlignment(errors, schema, masterText) {
  if (!schema) return;
  const exec = section(masterText, 'Execution（执行步骤）');
  if (!exec) {
    errors.push('shiye-master: 缺少 ## Execution（执行步骤）段');
    return;
  }
  for (const key of schema.required || []) {
    if (!exec.includes(key)) {
      errors.push(`shiye-master: Execution 段未点名契约顶层键 "${key}"`);
    }
  }
}

function run(root) {
  const errors = [];
  const dir = path.join(root, 'skills', 'bazi-tuipan');

  errors.push(...baseline(root));

  const schema = readSchema(root, errors);

  // 已有基线 skill：结构检查（规范文件不在此列；A2 不对基线强制）
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const skillFile = path.join(dir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        checkSkillStructure(errors, entry.name, fs.readFileSync(skillFile, 'utf8'), false);
      }
    } else if (entry.name.endsWith('.skill.md') && entry.name !== '八字完整推盘输出通用规范.skill.md') {
      const skillName = entry.name.replace(/\.skill\.md$/, '');
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

module.exports = { run, baseline, NEW_SKILLS, REQUIRED_TERMS, MUTABLE_BASELINE };

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
```

- [ ] **Step 7: 写 `scripts/validate-skills.test.js`**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
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
```

- [ ] **Step 8: 跑全部单测**

Run: `node --test scripts/lib/schema-check.test.js scripts/validate-skills.test.js`
Expected: 全部 PASS（8 + 7 = 15 个 test）

- [ ] **Step 9: 写 `package.json`**

```json
{
  "name": "zhouyi-seg2-skills",
  "version": "0.1.0",
  "private": true,
  "description": "八字事业择业 skill 知识库（zhouyi_seg2）",
  "scripts": {
    "test": "node --test scripts/lib/schema-check.test.js scripts/validate-skills.test.js && node scripts/validate-skills.js",
    "validate": "node scripts/validate-skills.js"
  }
}
```

- [ ] **Step 10: 跑主校验，确认当前状态是「缺新 skill」而非「有 bug」**

Run: `node scripts/validate-skills.js`
Expected: 退出码 1，输出里**只有**关于 `tiaohou-shiye` / `geshi-shiye` / `wuxing-shiye` / `suiyun-shiye` / `shiye-master` 缺失、`docs/CAREER_SCHEMA.md` 缺失的报错，**没有**任何基线文件的报错。

若出现基线报错（例如「基线文件被改动」），说明 Step 5 的清单生成有误，回 Step 5 修。

- [ ] **Step 11: 提交**

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
git add package.json scripts skills/bazi-tuipan/.baseline-manifest.txt
git commit -m "test: 加校验工具链 —— skill 结构 / 契约 / 基线完整性三合一"
```

---

### Task 2: `docs/CAREER_SCHEMA.md` —— 事业专项 JSON 契约

契约是 `shiye-master` 的输出依据，必须先定死，后面的总入口才有着落。

**Files:**
- Create: `docs/CAREER_SCHEMA.md`
- Create: `docs/CAREER_SCHEMA.sample.json`

**Interfaces:**
- Consumes: Task 1 的 `readSchema()`（从 md 的 ```json 块解析）、`checkValue()`、
  `validate-skills.js` 的「契约样例校验」路径（`docs/CAREER_SCHEMA.sample.json` 存在即按 schema 校验）
- Produces: `docs/CAREER_SCHEMA.md`，其 ```json 块是契约的机读形式，顶层 `required` 数组即 10 个顶层键名；
  `docs/CAREER_SCHEMA.sample.json` 是基准样例输出（戊辰 己未 乙亥 乙酉 男命），
  供 `checkValue` 持久断言「契约能校验一份真实输出」—— 每次 `npm test` 都会跑。

- [ ] **Step 1: 写 `docs/CAREER_SCHEMA.md`**

````markdown
# 事业专项 JSON 契约（CAREER_SCHEMA）

`shiye-master` 的唯一输出格式。顶层 10 个键，顺序即输出顺序：
`case` → `monthCommand` → `pattern` → `tiaoHou` → `xiJi` → `boundaries` → `playbooks` → `timeline` → `transition` → `summary`

其中 `pattern` 在 `tiaoHou` 之前：先定月令与格局底盘，再定气候与药。

## 枚举速查（闭合集合，不得自造）

| 字段路径 | 取值 |
|---|---|
| `pattern.verdict` | `成格` / `破格` / `不清` |
| `tiaoHou.climateType` | `寒局` / `燥热局` / `湿重局` / `燥硬局` / `春木旺局` / `秋金肃局` |
| `tiaoHou.drugStatus` | `真药` / `藏药` / `假药` |
| `playbooks[].scale` | `早期` / `轻创业` / `重资产` / `合伙` |
| `timeline[].type` | `水运` / `木运` / `火运` / `土运` / `金运` |
| `timeline[].verdict` | `重仓` / `轻试` / `守成` |
| `timeline[].liunianWindows[].action` | `宜` / `忌` |
| `summary.strategy` | `主业重仓` / `底盘待机` / `守成缓投` |

> **`verdict` 在两处复用且枚举不同**：`pattern.verdict` 说的是格局成败（成格/破格/不清），
> `timeline[].verdict` 说的是该步大运的策略（重仓/轻试/守成）。两处不可混用。

## 字段语义

- `case` —— 命例基本盘：性别与四柱。
- `monthCommand` —— 月令（提纲）给出的开局：月支、日主、季夏/隆冬等季节气候、一句话定性。
- `pattern` —— 格局底盘：格局类型、成格还是破格、财库等核心结构、成败理由。
- `tiaoHou` —— 调候：全局气候类型、主药（第一调候用神）、次药、药的真假状态、判断理由、还缺什么。
- `xiJi` —— 喜忌：喜用五行、次喜五行、忌神五行。
  其中 `xi`（喜用）与 `ji`（忌神）**必非空**（忌神由喜用关系派生，即使该五行不在原局仍是忌）；
  `ciXi`（次喜 / 辅助用神）**允许为空数组** —— 它是「锦上添花的辅药」，本次命例若没有明显次喜就留空，
  **不得为凑满而编一个次喜**。
- `boundaries` —— **忌神赛道的边界**：某五行不是不能碰，而是缺了通关条件会怎样。每条三要素：五行、为什么、有条件时怎么碰。
- `playbooks` —— **打法分档**：按体量分四档（早期借平台 / 轻创业 / 重资产操盘 / 合伙），每档给适用条件与具体动作。
- `timeline` —— 大运时间表：每步大运的干支、五行类型、策略定性（重仓/轻试/守成）、主赛道、对应打法档位，以及该运内的流年窗口。
  其中 `liunianWindows` 的「窗口」定义是：**该运内值得单列的机会年或坑年，至少一个** ——
  机会类如「透出调候用神」「合走调候药」，坑类如「刑冲格局根基」「忌神扎堆」；
  `action` 枚举的 `宜` / `忌` 两类都装得下，所以**哪怕一步大运全是坑年，也照样列出坑窗口**，
  不存在「这运没有任何值得标注的流年」的情形。
- `transition` —— 交运过渡期：换运前后一两年的风险与对策。
- `summary` —— 策略总纲：整体走哪条路（主业重仓/底盘待机/守成缓投）+ 若干条要点。

## 机读契约

```json
{
  "type": "object",
  "required": ["case", "monthCommand", "pattern", "tiaoHou", "xiJi", "boundaries", "playbooks", "timeline", "transition", "summary"],
  "properties": {
    "case": {
      "type": "object",
      "required": ["gender", "pillars"],
      "properties": {
        "gender": { "type": "string" },
        "pillars": {
          "type": "object",
          "required": ["year", "month", "day", "hour"],
          "properties": {
            "year": { "type": "string" },
            "month": { "type": "string" },
            "day": { "type": "string" },
            "hour": { "type": "string" }
          }
        }
      }
    },
    "monthCommand": {
      "type": "object",
      "required": ["monthBranch", "dayMaster", "seasonClimate", "verdict"],
      "properties": {
        "monthBranch": { "type": "string" },
        "dayMaster": { "type": "string" },
        "seasonClimate": { "type": "string" },
        "verdict": { "type": "string" }
      }
    },
    "pattern": {
      "type": "object",
      "required": ["type", "verdict", "storeHouse", "reasoning"],
      "properties": {
        "type": { "type": "string" },
        "verdict": { "type": "string", "enum": ["成格", "破格", "不清"] },
        "storeHouse": { "type": "string" },
        "reasoning": { "type": "string" }
      }
    },
    "tiaoHou": {
      "type": "object",
      "required": ["climateType", "primaryDrug", "secondaryDrug", "drugStatus", "drugReasoning", "gap"],
      "properties": {
        "climateType": { "type": "string", "enum": ["寒局", "燥热局", "湿重局", "燥硬局", "春木旺局", "秋金肃局"] },
        "primaryDrug": { "type": "string" },
        "secondaryDrug": { "type": "string" },
        "drugStatus": { "type": "string", "enum": ["真药", "藏药", "假药"] },
        "drugReasoning": { "type": "string" },
        "gap": { "type": "string" }
      }
    },
    "xiJi": {
      "type": "object",
      "required": ["xi", "ciXi", "ji"],
      "properties": {
        "xi": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
        "ciXi": { "type": "array", "items": { "type": "string" } },
        "ji": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
      }
    },
    "boundaries": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["element", "why", "condition"],
        "properties": {
          "element": { "type": "string" },
          "why": { "type": "string" },
          "condition": { "type": "string" }
        }
      }
    },
    "playbooks": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["scale", "condition", "actions"],
        "properties": {
          "scale": { "type": "string", "enum": ["早期", "轻创业", "重资产", "合伙"] },
          "condition": { "type": "string" },
          "actions": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
        }
      }
    },
    "timeline": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["ganZhi", "type", "verdict", "mainTrack", "playbook", "liunianWindows"],
        "properties": {
          "ganZhi": { "type": "string" },
          "type": { "type": "string", "enum": ["水运", "木运", "火运", "土运", "金运"] },
          "verdict": { "type": "string", "enum": ["重仓", "轻试", "守成"] },
          "mainTrack": { "type": "string" },
          "playbook": { "type": "string" },
          "liunianWindows": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["year", "signal", "action"],
              "properties": {
                "year": { "type": "integer" },
                "signal": { "type": "string" },
                "action": { "type": "string", "enum": ["宜", "忌"] }
              }
            }
          }
        }
      }
    },
    "transition": {
      "type": "object",
      "required": ["risk", "advice"],
      "properties": {
        "risk": { "type": "string" },
        "advice": { "type": "string" }
      }
    },
    "summary": {
      "type": "object",
      "required": ["strategy", "notes"],
      "properties": {
        "strategy": { "type": "string", "enum": ["主业重仓", "底盘待机", "守成缓投"] },
        "notes": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
      }
    }
  }
}
```

## 校验

```bash
node scripts/validate-skills.js
```

契约文件本身由该脚本读取并解析；Task 7 之后会额外校验 `shiye-master` 的 `Execution` 段
是否点名了上面每一个顶层键。
````

- [ ] **Step 2: 写基准样例 `docs/CAREER_SCHEMA.sample.json`**

这份样例是**契约的持久断言对象** —— 校验器每次跑都会用 `checkValue` 按 schema 校验它。
所以它不是一次性脚本里的临时数据，而是一个入库的基准用例：戊辰 己未 乙亥 乙酉 男命
（来自 `参考资料/事业推理结果.txt`，设计规格 §7 要求的「基准用例可被复现」）。

```json
{
  "case": { "gender": "男", "pillars": { "year": "戊辰", "month": "己未", "day": "乙亥", "hour": "乙酉" } },
  "monthCommand": { "monthBranch": "未", "dayMaster": "乙木", "seasonClimate": "季夏燥土", "verdict": "财星当令，财多身难独担" },
  "pattern": { "type": "财格", "verdict": "成格", "storeHouse": "辰为水库，未为燥土财库，双库夹局", "reasoning": "财库厚而闭" },
  "tiaoHou": { "climateType": "燥热局", "primaryDrug": "癸水", "secondaryDrug": "丙火", "drugStatus": "藏药", "drugReasoning": "亥藏壬水有润根，戊己厚土克水", "gap": "原局无丙透，缺阳光泄秀通关" },
  "xiJi": { "xi": ["水（印）", "木（比劫）"], "ciXi": ["丙火"], "ji": ["叠土", "叠金"] },
  "boundaries": [{ "element": "土金赛道", "why": "财重压身、杀重克身", "condition": "须有水木通关，方可轻碰" }],
  "playbooks": [{ "scale": "轻创业", "condition": "水印流通之年", "actions": ["咨询工作室", "独立方案团队"] }],
  "timeline": [{ "ganZhi": "亥子", "type": "水运", "verdict": "重仓", "mainTrack": "深耕专业、铺底盘", "playbook": "早期", "liunianWindows": [{ "year": 2030, "signal": "透出调候用神", "action": "宜" }] }],
  "transition": { "risk": "藤萝根基未稳，见财心动、盲目重仓", "advice": "交运前后一两年不新开长线重资产盘" },
  "summary": { "strategy": "底盘待机", "notes": ["喜水木，忌叠土叠金"] }
}
```

- [ ] **Step 3: 跑校验，确认契约与样例都被认可**

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
node scripts/validate-skills.js
```

Expected:
- **不再报** `缺少 docs/CAREER_SCHEMA.md`
- **不报**任何 `契约样例 docs/CAREER_SCHEMA.sample.json ...` 的错 —— 说明样例按契约校验通过
- 仍报 5 个新 skill 缺失（`tiaohou-shiye` / `geshi-shiye` / `wuxing-shiye` / `suiyun-shiye` / `shiye-master`）——
  这是**正常的**，它们由 Task 3–7 建
- **零基线报错**

若出现 `契约样例 ... 不符合契约: ...`，说明 Step 2 的样例与 Step 1 的 schema 对不上，
按报错逐条改样例（不要改 schema 去迁就样例）。

- [ ] **Step 4: 反向验证 —— 故意造一个非法值，确认校验器能拦住**

临时把样例里 `pattern.verdict` 改成 `'格局很好'`：

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
node scripts/validate-skills.js
```

Expected: 退出码 1，输出 `契约样例 docs/CAREER_SCHEMA.sample.json 不符合契约: $.pattern.verdict: 值 "格局很好" 不在枚举 [成格 / 破格 / 不清] 内`

确认拦住后，**改回 `"成格"`**（不要用 git checkout —— 样例是本任务新建的、未入库）：

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
node scripts/validate-skills.js
```

Expected: 退出码 1，但**不再有** `契约样例` 相关的错（其余 5 个新 skill 缺失的错仍在）

- [ ] **Step 5: 提交**

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
git add docs/CAREER_SCHEMA.md docs/CAREER_SCHEMA.sample.json
git commit -m "docs: 定事业专项 JSON 契约 —— 10 个顶层键与闭合枚举"
```

---

### Task 3: `tiaohou-shiye` —— 调候择业

资料 3 是本项目真正的空白（v1/v2 从未覆盖），也是四层里最上层，放第一个做。

**Files:**
- Create: `skills/bazi-tuipan/tiaohou-shiye/SKILL.md`
- Create: `skills/bazi-tuipan/tiaohou-shiye/test-prompts.json`

**Interfaces:**
- Consumes: `参考资料/事业3.txt`；既有 skill `shengshuai-panbie`（旺衰）、`xi-ji-quyong`（喜忌）
- Produces: `skills/bazi-tuipan/tiaohou-shiye/SKILL.md`（`name: tiaohou-shiye`）、`skills/bazi-tuipan/tiaohou-shiye/test-prompts.json`

- [ ] **Step 1: 写 `SKILL.md`**

内容必须覆盖 `REQUIRED_TERMS['tiaohou-shiye']` 全部 11 个词：
`寒局` `燥热局` `湿重局` `燥硬局` `春木旺局` `秋金肃局` `真药` `藏药` `假药` `调候` `生机赛道`

````markdown
---
name: tiaohou-shiye
description: 八字调候择业——全局气候六型判定、调候真药/藏药/假药辨别，以及按调候气机选择行业赛道的三种择业策略
trigger: "调候/寒局/燥热局/湿重局/燥硬局/春木旺局/秋金肃局/调候用神/真药/藏药/假药/调候择业"
---

# tiaohou-shiye — 调候择业

## Interpretation（核心方法论）

调候管的是命局的「气温与土壤」。格局管底盘，十神管手法，调候管命局能不能活。

> 寒要解冻、燥要甘霖、湿要收水、干要柔润；调候到位，事业才有生机；药被合、被埋、被克，赛道再好也容易卡壳拖耗。

调候在择业链上的位置：**它决定「药」，药决定通关五行，进而决定哪些赛道是活路。**
格局定底盘、五行定赛道载体、岁运定时间表，四层叠加，不是四选一。

---

### 一、调候与喜忌不是一回事

| | 喜忌 | 调候 |
|---|---|---|
| 解决什么 | 五行缺什么、旺什么 | 局里的「气温土壤」对不对 |
| 判断依据 | 日主旺衰 + 失衡点 | 月令 + 全局干支的组合气候 |
| 产出 | 第一用神 / 第二用神 / 忌神 | 主药 / 次药 / 忌神 |

喜忌回答「补什么」，调候回答「这盆土现在是什么气候、需要什么药」。两者常常不同向：
燥热命局里土是忌神，但土也可能是「承载资产」的底盘；调候要的是水（润），不是土。

---

### 二、六大气机与调候真药

先看全局组合（不只看出生月份）：月令 + 全局干支，定出整体气机属于哪一型。

| 气机 | 判断特征 | 调候主药 | 调候次药 | 局象 |
|---|---|---|---|---|
| **寒局** | 水冷金寒，多亥子丑，全局水旺无暖 | **火** | 燥土 | 冻土冰封，机会看得见、落地慢、容易冻结项目、资金卡住 |
| **燥热局** | 火旺干燥，多巳午未，火多水枯 | **水** | 柔金 | 大地干裂，爆发力强、透支快、容易冲动扩盘、踩政策坑、崩盘快 |
| **湿重泥泞局** | 辰丑多、水土混杂、湿气弥漫 | **燥土** | 火烘干 | 满地泥沼，手续卡、周期拉长、包袱重、项目悬而不决、确权慢、扯皮多 |
| **燥硬局** | 戌未多、土干金燥、缺雨露 | **清水** | 柔金打磨 | 土地干涩，摩擦不断、硬冲硬顶、处处卡壳、内耗冲突多 |
| **春木旺局** | 寅卯辰、木气泛滥 | **金修剪** | 火暖成材 | 春木疯长、枝蔓遍地、摊子铺太大、主线抓不住、精力分散、项目多而不精 |
| **秋金肃局** | 申酉戌、金刚冷硬 | **火淬炼** | 水淘洗 | 金刚硬冷；无火则寒硬无情、硬碰硬受伤；无水则干涩卡壳、缺少流通转化 |

**急药优先于一般格局喜忌** —— 调候为急。先分清「必须救的急药」还是「锦上添花的辅药」。

---

### 三、药的真假（能不能送到手上）

| 状态 | 判据 | 择业含义 |
|---|---|---|
| **真药** | 透干、有根、不被紧合重克、不在死墓 | 能入局做功，可以作为事业主线生机，赛道里要保留这条气机通道 |
| **藏药** | 藏在库、拱、暗合 | 要等流年大运冲库、引动才兑现；平时看着机会却抓不住，适合储备、待机布局 |
| **假药** | 虚浮无根、被合、被克、埋死 | 赛道五行再好看也是画饼；不宜重仓，只能副业体验 |

---

### 四、按调候选赛道（生机赛道）

每种气机有对应的**生机赛道**（带主药或次药通关的行业）：

| 气机 | 主药对应的生机赛道 | 次药对应的生机赛道 |
|---|---|---|
| 寒局 | 火：品牌营销、广告传媒、直播、培训演说、餐饮烘焙、能源热力、文旅体验、美业 | 燥土：整地开发、囤地储备、基建、仓储物业、资产长期运营 |
| 燥热局 | 水：跨境贸易、航运物流、水务环保、酒水饮品、旅游、策略咨询、信息调研 | 金：审计风控、精密检测、鉴定评估、法务合规、金融风控 |
| 湿重局 | 燥土：土地分割开发、囤地、大型仓储、建材基地、不动产运营、项目总包、整地确权 | 火：运营体系、品牌、资质报批、培训管理 |
| 燥硬局 | 水：规划咨询、方案设计、生态绿化、水利工程、资源中介 | 金：精密技术、鉴定评估、规范审核、产权确权打磨 |
| 春木旺局 | 金：审核筛选、规划定型、法务审计、精密加工、品牌定型 | 火：教育培训、文创出版、品牌传播、设计创意 |
| 秋金肃局 | 火：冶炼制造、精密工程、外科医疗、项目攻坚、品牌淬炼、技术突破 | 水：资源淘洗、大宗商品贸易、流通渠道、情报调研 |

---

### 五、调候 × 格局 × 十神 × 五行 的叠合

四层各管一件事，叠起来才是完整答案：

- **调候**：要什么气机（暖 / 润 / 收湿 / 修剪 / 淬炼）
- **格局**：底盘是什么（资产囤库 / 平台官印 / 创意食伤 / 竞争劫财）
- **十神**：用什么手法（上班平台 / 独立操盘 / 合伙 / 资源中介）
- **五行赛道**：落在哪块实体（地产 / 跨境 / 传媒 / 医疗 / 工程 / 文创）

叠合示例（湿重局 + 偏财开库 + 伤官制杀 + 土底盘）：
适合囤地、土地分割开发、复杂审批地块操盘；燥土收泥泞，火打通报批运营，
伤官制杀啃关卡，偏财开库拿资产红利。

> **常见误区**：不是「缺火就全部去做火行业」。调候是「生机药」，不等于赛道唯一五行。
> 很多时候底盘是土（地产开发），调候药是火（品牌、运营、审批通路）——
> 药负责打通气机，土负责拿资产底盘。

---

### 六、三种择业策略

| 条件 | 策略 | 做法 |
|---|---|---|
| 药真、有做功、运扶 | **主业重仓** | 可以把带调候气机的赛道当主业，甚至重资产创业、囤地开发 |
| 药藏、做功弱 | **底盘待机** | 「底盘赛道 + 调候通道」组合；主业土地储备，副业做品牌咨询、营销通路；边做边等开库窗口 |
| 药假、药被制 | **守成缓投** | 不要硬冲纯调候赛道；优先选格局底盘稳、风险低的路线；上班攒资质、攒底盘，等换运 |

---

### 七、七步操作顺序

1. **观气候**：全局是寒 / 燥 / 湿 / 干 / 春旺 / 秋肃
2. **定急药**：谁是第一调候用神、辅助用神
3. **辨真假**：药有没有根、有没有被合克墓藏
4. **查做功**：药能不能引动财官库、宾主交换
5. **叠底盘**：搭配格局、十神、实体赛道
6. **看岁运**：当下运是扶药还是坏药，标记启动窗口
7. **定策略**：主业重仓 / 底盘待机 / 守成缓投

---

## A2（Future Trigger）

用户问「我该做什么行业」「这个八字适合干什么」「什么时候适合创业」「我的命局缺什么」，
或需要判断命局气候类型、调候用神真假时，此 skill 被调用，
为事业择业链提供最上层的「药」。

## Execution（执行步骤）

1. 列出月令与全局干支，定出气机类型（寒局 / 燥热局 / 湿重泥泞局 / 燥硬局 / 春木旺局 / 秋金肃局）
2. 定调候主药与次药，并区分急药与辅药
3. 验药真假：透干、有根、不被合克墓藏 → 真药；藏而不露 → 藏药；虚浮被制 → 假药
4. 查做功：药能否引动财官库、能否通关
5. 叠加格局底盘、十神手法、五行实体赛道
6. 结合当下大运判断扶药还是坏药
7. 给出择业策略：主业重仓 / 底盘待机 / 守成缓投
````

- [ ] **Step 2: 写 `test-prompts.json`**

```json
[
  {
    "id": "ths-001",
    "prompt": "我的八字属于什么气候？需要什么调候用神？",
    "expected_skill": "tiaohou-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问全局气候与调候药"
  },
  {
    "id": "ths-002",
    "prompt": "调候用神是真药还是假药？怎么判断？",
    "expected_skill": "tiaohou-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问药的真假辨别"
  },
  {
    "id": "ths-003",
    "prompt": "湿重泥泞的命局适合做什么行业？",
    "expected_skill": "tiaohou-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问气机对应的生机赛道"
  },
  {
    "id": "ths-004",
    "prompt": "燥热局和秋金肃局的择业策略有什么不同？",
    "expected_skill": "tiaohou-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "比较两种气机的择业"
  },
  {
    "id": "ths-005",
    "prompt": "缺火是不是就一定该去做火的行业？",
    "expected_skill": "tiaohou-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问调候误区"
  },
  {
    "id": "ths-006",
    "prompt": "帮我看看八字适合做什么行业",
    "expected_skill": "tiaohou-shiye",
    "should_fire": false,
    "category": "诱饵-边界模糊",
    "note": "没有给出具体八字，缺调候判断所需的命局信息"
  }
]
```

- [ ] **Step 3: 跑校验**

Run: `node scripts/validate-skills.js`
Expected: 仍失败，但 `tiaohou-shiye` 相关的报错**全部消失**（`geshi-shiye` / `wuxing-shiye` / `suiyun-shiye` / `shiye-master` / `CAREER_SCHEMA` 的缺失报错仍在 —— `CAREER_SCHEMA.md` 已在 Task 2 建好，其报错也应消失）

- [ ] **Step 4: 提交**

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
git add skills/bazi-tuipan/tiaohou-shiye
git commit -m "feat(skills): 加 tiaohou-shiye —— 调候六气机与药真假"
```

---

### Task 4: `geshi-shiye` —— 格局择业

**Files:**
- Create: `skills/bazi-tuipan/geshi-shiye/SKILL.md`
- Create: `skills/bazi-tuipan/geshi-shiye/test-prompts.json`

**Interfaces:**
- Consumes: `参考资料/事业2.txt`；既有 skill `geshi-dingxing`
- Produces: `skills/bazi-tuipan/geshi-shiye/SKILL.md`（`name: geshi-shiye`）、对应 `test-prompts.json`

- [ ] **Step 1: 写 `SKILL.md`**

必须覆盖 19 个词：`正财格` `偏财格` `正官格` `七杀格` `正印格` `偏印格` `食神格` `伤官格` `比肩格` `劫财格` `成格` `破格` `通关` `伤官制杀` `杀印相生` `食伤生财` `财生官` `官印相生` `用库成格`

````markdown
---
name: geshi-shiye
description: 八字格局择业——十种正八格与七组经典配格的行业定向、成格破格的取舍，以及格局作为事业底盘的三条心法
trigger: "格局择业/财格/官格/杀格/印格/食伤格/比劫格/成格/破格/配格/行业定向"
---

# geshi-shiye — 格局择业

## Interpretation（核心方法论）

格局是命局的「吃饭底盘」：你天生靠哪一类结构吃饭，决定了适合进入哪一类赛道。
格局管底盘，十神管玩法，五行是场地。

> 正财守底盘，偏财抓风口。正官顺梯而上，七杀闯关夺旗。
> 正印大道传经典，偏印深山藏绝活。食神养人留余味，伤官破局立新天。
> 比肩结伴铺大路，劫财冲锋抢地盘。

---

### 一、十种格局的赛道定向

| 格局 | 底盘 | 适合赛道 | 特质 |
|---|---|---|---|
| **正财格** | 财星当令、根气足，财气踏实绵长 | 不动产长期持有、连锁零售、实体门店、稳定供应链、会计财务、物业运营、传统商贸、工程总包慢周转项目 | 细水长流，忌一把梭投机；成格则越守越厚，破格则分红纠纷、被人分利、资金被套 |
| **偏财格** | 财星得令、气势流动，财来自机会、资源、转手 | 大宗贸易、地产开发倒手、项目投资、中介渠道、大宗商品、保险经纪、资源整合、机会型创业、跨境套利 | 靠眼光和窗口期赚钱，不是天天有；成格则一波厚利，破格则追高被套、虚耗本金 |
| **正官格** | 官星清透、有印护、有财生，不杂杀混 | 公职体系、监管合规、法务、大型企业管理、资质认证、教育行政、医院体制、产权审批、规划管理 | 重名分、流程、背书，适合平台登顶；破格则受制度捆绑、责任背锅、升迁卡壳 |
| **七杀格** | 七杀当令，有印化、有食伤制为成格；无制为凶 | 工程攻坚、危机项目、风控审计、外科医疗、军警安保、竞争性操盘、高门槛审批项目、特种技术、谈判攻坚 | 适合啃硬骨头；有制化＝大权大利，无制＝高压背灾 |
| **正印格** | 印星当令，根厚流通，有财有官搭配最佳 | 正统教育、出版、知识产权、传统医疗、档案法务、智库顾问、体制后台、设计研发、资质培训 | 靠积累、背书、贵人、证书；破格则学一堆用不上、证书多变现少 |
| **偏印格**（枭神格） | 偏印当令，气偏、冷、深；有制有泄为佳，无制易枭神夺食 | 冷门技术、精密研发、五术玄学、独立咨询、特种医疗、小众文创、情报调研、独门手艺、特殊材料研发 | 走别人不走的小路，靠独家信息、绝活吃饭；破格则钻牛角尖、想得多落地少 |
| **食神格** | 食神当令，泄秀从容，有财承接最佳 | 美食康养、理疗保健、体验服务、花艺园艺、休闲文旅、育儿照料、美食品牌、心理咨询、慢节奏文创 | 靠口碑、体验、手艺慢慢发酵；破格则安逸过头、没有进取心 |
| **伤官格** | 伤官当令，气势奔放；伤尽、有制、有财生为成格 | 独立设计、广告营销、自媒体爆破、编程技术、创意策划、独立律所、发明创新、自由工作室、项目方案操盘 | 擅长打破旧规则、出新方案；很多独立创业、自主操盘、啃审批方案的命局都是伤官做功；破格则恃才惹是非 |
| **比肩格** | 比劫成势，有财有食伤流通，不是一片无制 | 合伙工程、班组技术、连锁门店、同行渠道、健身体能、手工实业、团队运营、共享平台 | 适合搭伙做事、靠实干出力；成格则人多力量大，破格则互相拖累、内耗扯皮 |
| **劫财格** | 劫财旺相，要有制、要有去路；无制则争夺一片 | 竞争性拿项目、拓荒开发、矿产建材、竞技行业、渠道抢滩、危机攻坚销售 | 适合抢地盘、抢指标、抢窗口期；破格则财被人抢、合作反目 |

---

### 二、经典配格 · 行业定向

| 配格 | 行业 |
|---|---|
| **财生官格** | 地产项目管理、产权开发、商业合规、资本运营 —— 一边资产交易，一边啃审批资质 |
| **官印相生格** | 体制教育、法务、规划审批、正规咨询 —— 资质与平台互相托举 |
| **杀印相生格** | 硬核技术、特种医疗、工程高危项目、风控体系 —— 压力转化成本事与资质 |
| **伤官制杀格** | 高门槛项目操盘、复杂审批开发、技术攻坚、危机咨询 —— 用方案、智慧、变通去啃硬关卡 |
| **食伤生财格** | 创意变现、手艺品牌、电商服务、文旅文创 —— 输出本事换现金流 |
| **财破印格** | 弃学从商、信息生意、资源倒卖、知识产权交易 —— 拿信息资质换钱 |
| **用库成格**（墓库做功） | 土地储备、仓储、收藏、囤货、长期资产开发 —— 核心就是「开库取宝」，适合囤地慢慢开发 |

---

### 三、成格还是破格（先看这个，再谈行业）

| | 成格 | 破格 |
|---|---|---|
| 状态 | 格局清、有护卫、有去路 | 用神被冲、被合、被克 |
| 择业 | 可以直接走对应赛道当主业，放大格局优势 | 不是完全不能做，但不能重仓押这条线；找通关赛道，或换一条做功链条 |

**通关救应**是破格时的主要出路：用第三种五行化解交战（如财破印时以通关救之）。

---

### 四、三条心法

1. **先看成格还是破格** —— 决定投入强度，不决定能不能碰。
2. **格局是底盘，十神是玩法，五行是场地**
   - 格局：命里「吃饭底盘」是什么类型
   - 十神：靠打工、合伙、独立操盘、资源整合哪一种方式
   - 五行：落在地产、互联网、文教、金融、跨境哪一块实体赛道

   同是伤官格：火伤官多传媒创意；金伤官多精密法务；土伤官多地产工程开发。
3. **格局会被大运引动、转换**
   原局是底子；一步大运可能「转格」：原本印格读书深耕，后面走到财地转成财格做资产开发。
   不是一辈子锁死一个格局一条路。

**另须留意**：不要死套月令格局。有些命局月令普通，但全局合成财局、杀局、食伤局，
全局做功，照样按全局格局取行业，不能只盯着月令一个字定终身。

---

## A2（Future Trigger）

用户问「我的八字是什么格局」「适合做什么行业」「这个格局成还是破」「格局对行业有什么影响」，
或需要把格局映射到行业定向时，此 skill 被调用，为事业择业链提供「底盘」层判断。

## Execution（执行步骤）

1. 取月令提纲定格（可参照 `geshi-dingxing`），标出正八格中的哪一种
2. 判成格还是破格：格局是否清、有护卫、有去路；若有破损，指出被冲被合被克的用神
3. 有破格则找出通关救应
4. 查七组经典配格是否成立（财生官 / 官印相生 / 杀印相生 / 伤官制杀 / 食伤生财 / 财破印 / 用库成格）
5. 按格局给出对应赛道候选
6. 叠加十神玩法（打工 / 合伙 / 独立操盘 / 资源中介）与五行实体载体
7. 结合大运判断格局是否会被引动转换，标注当前是主攻还是储备
````

- [ ] **Step 2: 写 `test-prompts.json`**

```json
[
  {
    "id": "gsh-001",
    "prompt": "正财格和偏财格适合的行业有什么不同？",
    "expected_skill": "geshi-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问两种财格的行业定向"
  },
  {
    "id": "gsh-002",
    "prompt": "伤官制杀格适合做什么？",
    "expected_skill": "geshi-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问经典配格的行业定向"
  },
  {
    "id": "gsh-003",
    "prompt": "格局成格和破格怎么区分？破格了还能做这行吗？",
    "expected_skill": "geshi-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问成破与投入强度"
  },
  {
    "id": "gsh-004",
    "prompt": "枭神夺食是不是就是偏印格？",
    "expected_skill": "geshi-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问偏印格与破格信号"
  },
  {
    "id": "gsh-005",
    "prompt": "用库成格是什么意思？适合囤地吗？",
    "expected_skill": "geshi-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问墓库做功"
  },
  {
    "id": "gsh-006",
    "prompt": "我这个格局适合创业吗",
    "expected_skill": "geshi-shiye",
    "should_fire": false,
    "category": "诱饵-边界模糊",
    "note": "没有给出具体八字，无法定格"
  }
]
```

- [ ] **Step 3: 跑校验** — `node scripts/validate-skills.js`，`geshi-shiye` 相关报错应全部消失

- [ ] **Step 4: 提交**

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
git add skills/bazi-tuipan/geshi-shiye
git commit -m "feat(skills): 加 geshi-shiye —— 十格与七组配格的行业定向"
```

---

### Task 5: `wuxing-shiye` —— 五行择业

**Files:**
- Create: `skills/bazi-tuipan/wuxing-shiye/SKILL.md`
- Create: `skills/bazi-tuipan/wuxing-shiye/test-prompts.json`

**Interfaces:**
- Consumes: `参考资料/事业1.txt`；既有 skill `wuxing-shengke`、`xi-ji-quyong`
- Produces: `skills/bazi-tuipan/wuxing-shiye/SKILL.md`（`name: wuxing-shiye`）、对应 `test-prompts.json`

- [ ] **Step 1: 写 `SKILL.md`**

必须覆盖 11 个词：`木` `火` `土` `金` `水` `代表职业` `性格适配` `方位` `复合行业` `喜用神` `做功链条`

````markdown
---
name: wuxing-shiye
description: 八字五行择业——木火土金水五行的核心象义、代表职业、性格适配与发展方位，以及复合行业的五行叠加
trigger: "五行择业/木/火/土/金/水/代表职业/方位/复合行业/行业五行"
---

# wuxing-shiye — 五行择业

## Interpretation（核心方法论）

五行是**载体**：格局定底盘、十神定手法，调候定药，五行决定这套本事落在哪块实体赛道上。

> 看「喜用神」；缺但为忌，补了反而压力大；优先调候，寒命要火暖、燥命要水润。
> 看做功链条；哪怕五行不多，只要这个行业能引动功神、打通合冲刑害、开库，就是好赛道；
> 五行只是载体，能不能「出功」才是根本。

---

### 一、五行象义与代表职业

| 五行 | 核心象 | 代表职业 | 性格适配 | 方位参考 |
|---|---|---|---|---|
| **木** | 生发、成长、舒展 | 教育、培训、出版、文案策划、设计、花艺园林、农林种植、中药养生、纺织服装、家具木作、文创、绿植、文旅策划、心理咨询、法务顾问、生物生态 | 擅长学习、表达、共情、长期耕耘；不适合机械硬决断、高压杀伐类岗位 | 宜向东发展 |
| **火** | 光明、外放、热能 | 自媒体、传媒影视、演艺、广告营销、直播、互联网、光电通信、餐饮烘焙、美容美妆、灯光舞台、能源热力、培训演说、心理咨询、文创视觉设计 | 感染力强、擅长展示、敢冲；忌长期沉闷封闭、不见光的地下仓储、冷硬金属重决断赛道 | 宜向南发展 |
| **土** | 承载、根基、收纳 | 房地产、建筑工程、装修、物业、仓储物流、农业畜牧、古董收藏、会计审计、中介代理、行政后勤、土地开发、殡葬礼仪、建材石材、项目管理 | 稳重、扛事、耐得住长期投入；适合「囤、守、运营底盘」，拿地开发、基建项目多是土做功 | 宜本地、中原、出生地附近发展 |
| **金** | 决断、精密、肃杀 | 银行证券、保险投资、财务审计、法律司法、军警安保、精密工程、机械五金、汽车制造、珠宝鉴定、电子硬件、科研检测、外科医疗、拍卖评估 | 理性果断、重标准、擅长取舍；适合需要「一刀定结果、严格风控」的赛道 | 宜向西发展 |
| **水** | 流动、变通、智慧 | 跨境贸易、航运物流、旅游、水产、酒水饮品、媒体资讯、咨询策划、投资交易、运输、潜水、涉外业务、市场调研、策略规划 | 灵活、适应力强、懂变通；不适合长期卡死一套规则、一成不变的固化岗位（若无土金制水，容易飘、难扎根） | 宜向北发展 |

---

### 二、两条关键心法

1. **看喜用神** —— 缺但为忌，补了反而压力大；优先调候，寒命要火暖、燥命要水润。
2. **看做功链条** —— 哪怕五行不多，只要这个行业能引动功神、打通合冲刑害、开库，就是好赛道。
   五行只是载体，能不能「出功」才是根本。

---

### 三、复合行业（现代职业大多不是单一五行）

| 行业 | 五行构成 |
|---|---|
| 电商 | 水（流动交易）+ 火（曝光流量）+ 金（系统风控） |
| 地产开发 | 土（地块基建）+ 水（资金流转）+ 金（审批审计） |

复合行业按**权重最高的那个五行**定主线，其余五行定辅线与打法。

---

### 四、与调候、格局的关系

- 五行是**场地**，不是**地基**：五行选对但格局破、调候药假，赛道再好也卡壳。
- 调候是**药**，五行是**载体**：燥热局里水是药，跨境贸易是载体；土可能同时是忌神与底盘。
- 方位是五行的空间延伸，与行业五行同源：宜东的木行业与宜东的发展方向一致。

---

## A2（Future Trigger）

用户问「我这个五行适合做什么行业」「木命适合干什么」「往哪个方向发展」「这个行业属于什么五行」，
或需要把赛道落到具体实体行业时，此 skill 被调用，为事业择业链提供「赛道载体」层判断。

## Execution（执行步骤）

1. 列出命局五行分布与喜用神（参照 `xi-ji-quyong`）
2. 按喜用神筛出可用五行，注意「缺但为忌」的反例
3. 对每个候选五行取出核心象义、代表职业、性格适配、方位参考
4. 核对性格适配与命局性格是否冲突
5. 识别目标行业属于单一五行还是复合行业，按权重定主线五行
6. 检查该行业能否引动功神、打通合冲刑害、开库（做功链条）
7. 结合调候药判断该五行赛道是否为活路
````

- [ ] **Step 2: 写 `test-prompts.json`**

```json
[
  {
    "id": "wsh-001",
    "prompt": "木属性的八字适合做什么行业？",
    "expected_skill": "wuxing-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问单一五行的代表职业"
  },
  {
    "id": "wsh-002",
    "prompt": "土命的人适合往哪个方向发展？",
    "expected_skill": "wuxing-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问五行对应的方位"
  },
  {
    "id": "wsh-003",
    "prompt": "房地产行业分别带哪些五行？",
    "expected_skill": "wuxing-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问复合行业的五行构成"
  },
  {
    "id": "wsh-004",
    "prompt": "五行缺了是不是就该去补这一行？",
    "expected_skill": "wuxing-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问喜用神与缺的误区"
  },
  {
    "id": "wsh-005",
    "prompt": "火命的人性格上适合什么工作？",
    "expected_skill": "wuxing-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问性格适配"
  },
  {
    "id": "wsh-006",
    "prompt": "五行和行业的关系",
    "expected_skill": "wuxing-shiye",
    "should_fire": false,
    "category": "诱饵-边界模糊",
    "note": "纯概念提问，未落到具体命局，无可执行结论"
  }
]
```

- [ ] **Step 3: 跑校验** — `node scripts/validate-skills.js`，`wuxing-shiye` 相关报错应全部消失

- [ ] **Step 4: 提交**

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
git add skills/bazi-tuipan/wuxing-shiye
git commit -m "feat(skills): 加 wuxing-shiye —— 五行载体与复合行业"
```

---

### Task 6: `suiyun-shiye` —— 大运流年择业

**Files:**
- Create: `skills/bazi-tuipan/suiyun-shiye/SKILL.md`
- Create: `skills/bazi-tuipan/suiyun-shiye/test-prompts.json`

**Interfaces:**
- Consumes: `参考资料/事业4.txt`；既有 skill `dayun-fenxi`、`xi-ji-quyong`
- Produces: `skills/bazi-tuipan/suiyun-shiye/SKILL.md`（`name: suiyun-shiye`）、对应 `test-prompts.json`

- [ ] **Step 1: 写 `SKILL.md`**

必须覆盖 14 个词：`原局` `大运` `流年` `顺势重仓` `轻试待机` `守势收缩` `交运过渡期` `冲开财库` `透出调候用神` `合走调候药` `刑冲格局根基` `忌神扎堆` `机会流年` `坑流年`

````markdown
---
name: suiyun-shiye
description: 八字大运流年择业——原局大运流年三层定位、大运引动做功与破局坏药的分野、顺势重仓轻试待机守势收缩三策略，以及流年出手窗口与宜守信号
trigger: "大运择业/流年择业/交运/顺势重仓/轻试待机/守势收缩/流年窗口/什么时候动手"
---

# suiyun-shiye — 大运流年择业

## Interpretation（核心方法论）

择业链的最后一层：原局定底子，大运定十年舞台与节奏，流年定当年路况与引爆开关。

> 原局是车，大运是公路（高速 / 泥路 / 盘山路），流年是当天天气（晴、雨、大雾）。
> 不是「大运五行是什么就硬做什么行业」，重在「运能不能引动做功」。

---

### 一、三层定位

| 层级 | 作用域 | 决定什么 |
|---|---|---|
| **原局** | 一生 | 自带一套做功链条、调候药、格局底色；命里没有的核心做功，运再好也只是沾光 |
| **大运** | 十年 | 大气候、舞台、赛道底盘；天干主象、地支主根基环境 |
| **流年** | 一年 | 当年路况、引爆开关；先跟大运互动，再联动原局 |

流年不能单独定终身赛道，只能在大运框架内抓机会、踩坑、落地项目。

---

### 二、大运怎么选赛道

**（1）大运引调候真药**
一步运把调候用神透干、得根、冲开墓库，这十年生机全开，适合切入对应赛道，甚至重仓布局长期资产（囤地、开发、基建）。
若调候药只是虚浮一现又被合克，看着好抓不住，只适合轻试、观望，不宜重投。

**（2）大运换格局、换做功链条**

| 大运 | 适合 | 前提 |
|---|---|---|
| 正财运 | 长期资产运营、稳定现金流底盘 | 身能担财、财有库、不是比劫一片夺财 |
| 偏财运 | 资源整合、项目机会、拿地倒手、渠道开发 | 同上 |
| 正官运 | 平台、资质、审批、管理体系 | — |
| 七杀运（有制化） | 攻坚、高门槛项目操盘 | 无制则多压力、背锅、审批卡壳，不适合硬闯重投 |
| 正印运 | 考证、资质、平台沉淀、顾问 | — |
| 偏印运 | 独门技术、小众赛道、独立咨询 | 枭神夺食则投入多变现少、方案悬而不落 |
| 食神运 | 体验、服务、品牌慢慢发酵 | — |
| 伤官运 | 破局、方案、创意、啃审批关卡 | 无制则冲动扩盘、踩政策坑 |
| 比肩运 | 合伙、班组、团队实干 | — |
| 劫财运 | 抢标、拓荒、拿机会 | 无制则被分利、合作反目、资金被抽走 |

**（3）大运破局、坏药**
大运合走调候用神、冲坏格局根基、把功神埋入库墓 —— 不是不能做事，
策略改成「守底盘、控杠杆、少重投」；适合打磨内功、攒资质、等换运窗口。

---

### 三、换运时间点

换运一般有**交运过渡期**（前后一两年）：旧赛道松动、新赛道还没站稳；
很多人这时冲动跳槽、盲目创业、高价拿地，容易踩坑。

- **吉换运**：新运引动喜用、调候、做功 → 适合在运稳之后择流年窗口切入新赛道、重投布局。
- **凶换运**：新运破局坏药 → 适合收缩杠杆、锁定已有资产、减少长线冒险项目。

---

### 四、大运三策略

| 策略 | 条件 | 做法 |
|---|---|---|
| **顺势重仓** | 大运引动原局核心做功、调候到位、格局护卫完好 | 加大投入、开长线盘、囤资产、啃高门槛项目 |
| **轻试待机** | 大运有药但不纯、有合有绊 | 试点、调研、签预留方案、看指标，不要一把梭 |
| **守势收缩** | 大运坏调候、破格局、功神被制 | 保现金流、控负债、不新开重大长线项目 |

---

### 五、流年：抓兑现窗口，控风险时点

**（1）适合出手的流年信号**

| 信号 | 含义 |
|---|---|
| 冲开财库、地库、库中做功神 | 囤地、资产开发最经典应期；库不开，看着地再好也难确权、难分割变现 |
| 透出调候用神、引动做功链条 | 审批、指标、贵人、窗口期一起到位；适合签约、报批、拿证、启动分割开发 |
| 三合、六合引动财官食伤 | 资源聚合、贵人到位、方案落地；适合谈大合同、锁定地块指标 |
| 身能担财官 | 不是财官旺就一定发；身弱流年再添压力，容易机会拿到手扛不住、被套 |

**（2）宜守不宜冲的流年信号**

| 信号 | 含义 |
|---|---|
| 合走调候药、功神 | 机会被绊、审批卡、承诺落空；不宜签远期承诺、重投 |
| 刑冲格局根基、原局核心 | 产权纠纷、政策突变、资金断裂、项目中途改规划；适合暂缓签约、留大额尾款、锁合同风控 |
| 忌神扎堆 | 看着项目热闹，实则隐性成本极高、坑多；适合观望，不适合重仓落地 |

**（3）流年的两种角色**
- **机会流年**：在好大运里是「加速兑现点」；在一般大运里只是「短暂窗口期」，不能当成长期大势。
- **坑流年**：再好大运也会踩坑；好比高速路遇暴雨大雾，不是路坏了，是当年路况差，要减速慢行。

---

### 六、五步顺序

1. **原局打底**：找到命局核心做功、调候药、格局底盘
2. **定大势大运**：看这步运打开哪一条做功通道，决定这十年主赛道与基调（重仓 / 轻试 / 守成）
3. **看运中气机**：大运干支有没有合冲刑害原局；是把调候药埋掉，还是把功神引出来
4. **流年择窗口**：冲库、透药、合功之年落地签约、报批、启动；合走用神、冲坏根基之年暂缓、风控、留退路
5. **跨运规划**：预判下一步大运；当前运适合囤地储备、后面运适合开发兑现，就提前布局；后面运破局，则不宜铺太长线重投

---

### 七、四条禁忌

- 一个好流年落在坏大运里，往往是诱饵；看着机会好，进去之后十年被套。
- 不要一步大运定终身：运有转换。
- 不要把「引动」等于「稳成」：岁运引动只是天时窗口；现实还要看政策、产权、资金、团队。命理只是时机参考，不是保证书。
- 交运过渡期慎重大动作：换运前后容易心态躁动、判断偏差。

---

## A2（Future Trigger）

用户问「什么时候适合创业」「这步大运适合做什么」「今年能不能动手」「换运了要注意什么」，
或需要把赛道落到时间表上时，此 skill 被调用，为事业择业链提供「时间表」层判断。

## Execution（执行步骤）

1. 排出大运序列与每步起止（参照 `dayun-fenxi`），标注每步大运的干支与五行类型
2. 判断该运是引动原局做功（引调候真药 / 换格局）还是破局坏药
3. 定该运的基调：顺势重仓 / 轻试待机 / 守势收缩
4. 在该运内逐个流年找信号：冲开财库 / 透出调候用神 / 三合六合引动 → 出手窗口；合走调候药 / 刑冲格局根基 / 忌神扎堆 → 宜守
5. 标出交运过渡期及其风险
6. 跨运规划下一步，避免铺太长线重投
````

- [ ] **Step 2: 写 `test-prompts.json`**

```json
[
  {
    "id": "ssh-001",
    "prompt": "这步大运适合重仓还是保守？",
    "expected_skill": "suiyun-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问大运三策略"
  },
  {
    "id": "ssh-002",
    "prompt": "什么样的流年适合出手拿项目？",
    "expected_skill": "suiyun-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问流年出手信号"
  },
  {
    "id": "ssh-003",
    "prompt": "换运的时候要注意什么？",
    "expected_skill": "suiyun-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问交运过渡期"
  },
  {
    "id": "ssh-004",
    "prompt": "冲开财库的那一年是不是一定发财？",
    "expected_skill": "suiyun-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问引动不等于稳成"
  },
  {
    "id": "ssh-005",
    "prompt": "大运和流年哪个更能决定事业方向？",
    "expected_skill": "suiyun-shiye",
    "should_fire": true,
    "category": "应触发",
    "note": "问三层定位关系"
  },
  {
    "id": "ssh-006",
    "prompt": "我什么时候开始做比较好",
    "expected_skill": "suiyun-shiye",
    "should_fire": false,
    "category": "诱饵-边界模糊",
    "note": "没有给出具体八字与出生信息，无法排大运"
  }
]
```

- [ ] **Step 3: 跑校验** — `node scripts/validate-skills.js`，`suiyun-shiye` 相关报错应全部消失

- [ ] **Step 4: 提交**

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
git add skills/bazi-tuipan/suiyun-shiye
git commit -m "feat(skills): 加 suiyun-shiye —— 岁运时间表与出手窗口"
```

---

### Task 7: `shiye-master` —— 总入口与决策链编排

**Files:**
- Create: `skills/bazi-tuipan/shiye-master.skill.md`
- Create: `skills/bazi-tuipan/shiye-master/test-prompts.json`

**Interfaces:**
- Consumes: Task 2 的 `docs/CAREER_SCHEMA.md`；Task 3–6 的四个子 skill
- Produces: `skills/bazi-tuipan/shiye-master.skill.md`（`name: shiye-master`）、`skills/bazi-tuipan/shiye-master/test-prompts.json`

**关键约束**：校验脚本要求 `Execution（执行步骤）` 段**逐字出现契约的全部 10 个顶层键名** —— `case`、`monthCommand`、`pattern`、`tiaoHou`、`xiJi`、`boundaries`、`playbooks`、`timeline`、`transition`、`summary`。少一个就报错。

- [ ] **Step 1: 写 `shiye-master.skill.md`**

````markdown
---
name: shiye-master
description: 事业择业总入口——把原局、大运流年与调候、格局、五行四层叠加，输出赛道、打法与时间表的完整事业方案
trigger: "事业/择业/做什么行业/适合创业吗/事业方向/职业规划/适合做什么"
---

# shiye-master — 事业择业大师（总入口）

## 输出规范（固化在此文件，必须严格遵守）

**核心输出原则：先定盘、再定气候药、再定格局底盘、再定赛道载体、最后定时间表；调候为急，格局为体，五行为场，岁运为时。**

**推进顺序（不可调换，与 `docs/CAREER_SCHEMA.md` 的键顺序一致）**：

```
case → monthCommand → pattern → tiaoHou → xiJi → boundaries → playbooks → timeline → transition → summary
```

**硬性规则**：
1. 输出必须严格符合 `docs/CAREER_SCHEMA.md` 的键名与枚举，不得自造字段
2. 顺序固定，10 个顶层键一个不少
3. `pattern` 在 `tiaoHou` 之前 —— 先定月令格局底盘，再定气候与药
4. `boundaries` 与 `playbooks` 是本总入口的特色字段，不可省略、不可压平成字符串
5. 命理结论只作时机参考，不是保证书；涉及现实决策须提示结合政策、产权、资金、团队

---

## Interpretation（核心方法论）

### 一、择业决策链：四层叠加，不是四选一

| 层 | 回答什么 | 由哪个 skill 提供 |
|---|---|---|
| **调候** | 全局什么气候？急药是谁？药真不真？ | `tiaohou-shiye` |
| **格局** | 底盘是哪一格？成格还是破格？ | `geshi-shiye` |
| **五行** | 载体落在哪块实体赛道？往哪发展？ | `wuxing-shiye` |
| **岁运** | 何时重仓、何时轻试、何时守成？ | `suiyun-shiye` |

四层的产出互相修正：调候定的药会改变格局的成败判断；格局定的底盘决定五行载体能不能出功；岁运引动哪一层，就在那层上兑现。

### 二、一句话总纲

> 格局管底盘，十神管手法，调候管命局的气温土壤；药被合、被埋、被克，赛道再好也容易卡壳拖耗。

### 三、四层的分工边界

- **调候定「药」**：全局气候 → 主药/次药 → 药的真假。产出的结论是「哪种气机是活路」。
- **格局定「底盘」**：月令提纲 → 正八格/配格 → 成格/破格。产出的结论是「靠哪类结构吃饭」。
- **五行定「赛道载体」**：喜用神 → 五行象义 → 代表职业与方位。产出的结论是「落在哪块实体地上」。
- **岁运定「时间表」**：原局 → 大运 → 流年。产出的结论是「什么时候动手、动多大力」。

### 四、三种择业策略的总纲

调候与岁运共同决定策略档位：

| 策略 | 何时适用 | 现实含义 |
|---|---|---|
| **主业重仓** | 药真、有做功、运扶 | 带调候气机的赛道当主业，可重资产创业、囤地开发 |
| **底盘待机** | 药藏、做功弱 | 「底盘赛道 + 调候通道」组合，主业稳、副业探路，边做边等开库窗口 |
| **守成缓投** | 药假、药被制 | 优先选格局底盘稳、风险低的路线，上班攒资质、攒底盘，等换运 |

### 五、忌神赛道的写法

忌神不是「绝对不能碰」。正确写法是三要素：

- **五行** —— 哪个五行
- **为什么** —— 没有通关时会怎样（资源、压力、克制的具体表现）
- **有条件时怎么碰** —— 补上哪个通关条件、走到什么程度是安全的

例：土财是机会底盘、金杀是关卡门槛 —— 必须有水木通关，否则「看着一块肥肉，啃不动还沾一身泥」。

### 六、常见误区

1. **不是「缺什么就做什么行业」** —— 缺但为忌，补了反而压力大。
2. **不是「调候药是唯一赛道」** —— 药负责打通气机，底盘负责拿资产，常常是「土底盘 + 火通路」的组合。
3. **不是「一步大运定终身」** —— 运会转换格局，前一步适合打工攒资质，后一步适合操盘开发。
4. **不是「引动就稳成」** —— 岁运给的是窗口，现实还要看政策、产权、资金、团队。
5. **不是「格局只认月令」** —— 全局合成财局、杀局、食伤局，按全局做功取行业。

---

## 子 Skill 清单

| `name` | 文件路径 | 核心功能 |
|---|---|---|
| `tiaohou-shiye` | `tiaohou-shiye/SKILL.md` | 调候六气机、真药/藏药/假药、生机赛道 |
| `geshi-shiye` | `geshi-shiye/SKILL.md` | 十格与七组配格的行业定向、成格破格 |
| `wuxing-shiye` | `wuxing-shiye/SKILL.md` | 五行载体、代表职业、方位、复合行业 |
| `suiyun-shiye` | `suiyun-shiye/SKILL.md` | 大运三策略、流年出手与宜守信号 |

---

## Execution（执行步骤）

按顺序执行下列步骤，每一步的结论填入括号内标注的契约键：

1. **接收命例**，整理性别与四柱 → 填 `case`（`gender`、`pillars.year/month/day/hour`）
2. **定月令开局**：月支、日主、季节气候、一句话定性 → 填 `monthCommand`
3. **定格局底盘**：月令提纲取格，判成格/破格/不清，指认财库等核心结构与成败理由 → 填 `pattern`
4. **定调候与药**：判气机类型（寒局/燥热局/湿重局/燥硬局/春木旺局/秋金肃局），定主药次药，辨药的真/藏/假，指出还缺什么 → 填 `tiaoHou`
5. **定喜忌**：喜用五行、次喜五行、忌神五行 → 填 `xiJi`
6. **写忌神赛道边界**：每条给出行、为什么、有条件时怎么碰 → 填 `boundaries`（数组）
7. **分档打法**：早期借平台 / 轻创业 / 重资产操盘 / 合伙，各给适用条件与具体动作 → 填 `playbooks`（数组，`scale` 取「早期/轻创业/重资产/合伙」）
8. **排时间表**：每步大运的干支、五行类型、策略定性（重仓/轻试/守成）、主赛道、对应打法档位，并列出该运内的流年窗口（年份、信号、宜/忌） → 填 `timeline`（数组）
9. **写交运过渡期**：换运前后一两年的风险与对策 → 填 `transition`
10. **写策略总纲**：整体走主业重仓 / 底盘待机 / 守成缓投，加若干条要点 → 填 `summary`

**产出校验**：输出前逐条核对 `docs/CAREER_SCHEMA.md` 的 10 个顶层键是否齐全、枚举值是否取自闭合集合。

---

## A2（Future Trigger）

用户问「我适合做什么行业」「这个八字适合创业吗」「帮我规划一下事业方向」「什么时候该动」，
或提供了完整四柱需要一套完整的择业方案时，此 skill 被调用，调度四个子 skill 完成全链推理。

## Boundary（边界）

- 本 skill 是事业专项总调度，不重排四柱、不重算旺衰喜忌 —— 那由 `paipan-jichu`、`shengshuai-panbie`、`xi-ji-quyong` 负责
- 只做事业择业，不越界做婚姻、健康、六亲
- 命理结论是时机参考，不是决策保证；不得输出「必然」「注定」这类断言
- 若四个子 skill 结论冲突，以调候（`tiaohou-shiye`）的气机判断为最优先，格局（`geshi-shiye`）次之
````

- [ ] **Step 2: 写 `shiye-master/test-prompts.json`**

```json
[
  {
    "id": "sm-001",
    "prompt": "测一下这个人的事业方向：男命戊辰年 己未月 乙亥日 乙酉时",
    "expected_skill": "shiye-master",
    "should_fire": true,
    "category": "应触发",
    "note": "给出完整四柱，触发事业择业总入口"
  },
  {
    "id": "sm-002",
    "prompt": "这个八字适合做什么行业？戊辰 己未 乙亥 乙酉，男",
    "expected_skill": "shiye-master",
    "should_fire": true,
    "category": "应触发",
    "note": "问整体赛道与打法"
  },
  {
    "id": "sm-003",
    "prompt": "命盘出来了，帮我看看事业该往哪个方向走",
    "expected_skill": "shiye-master",
    "should_fire": true,
    "category": "应触发",
    "note": "通用事业规划请求"
  },
  {
    "id": "sm-004",
    "prompt": "这个八字适合创业还是上班？戊辰年己未月乙亥日乙酉时",
    "expected_skill": "shiye-master",
    "should_fire": true,
    "category": "应触发",
    "note": "问打法分档"
  },
  {
    "id": "sm-005",
    "prompt": "这个八字适合做什么行业",
    "expected_skill": "shiye-master",
    "should_fire": false,
    "category": "诱饵-边界模糊",
    "note": "没有给出具体八字，无法出完整方案"
  },
  {
    "id": "sm-006",
    "prompt": "调候用神怎么辨真假？",
    "expected_skill": "tiaohou-shiye",
    "should_fire": false,
    "category": "诱饵-应触发子skill",
    "note": "问单个知识点，不是完整择业方案"
  }
]
```

- [ ] **Step 3: 跑校验**

Run: `node scripts/validate-skills.js`
Expected: 退出码 0，输出 `✓ 全部校验通过`

若报 `shiye-master: Execution 段未点名契约顶层键 "xxx"`，说明 Execution 段漏了那个键名 —— 补上再跑。

- [ ] **Step 4: 提交**

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
git add skills/bazi-tuipan/shiye-master.skill.md skills/bazi-tuipan/shiye-master
git commit -m "feat(skills): 加 shiye-master —— 事业择业决策链总入口"
```

---

### Task 8: `candidates/` —— 四份过程文档

这四份是蒸馏过程的中间产物，记录「从原文里提取了什么」，是知识库的溯源凭证。

**Files:**
- Create: `skills/bazi-tuipan/candidates/principles.md`
- Create: `skills/bazi-tuipan/candidates/frameworks.md`
- Create: `skills/bazi-tuipan/candidates/cases.md`
- Create: `skills/bazi-tuipan/candidates/counter-examples.md`

**Interfaces:**
- Consumes: `参考资料/事业1~4.txt`、`参考资料/事业推理结果.txt`
- Produces: `skills/bazi-tuipan/candidates/*.md`

- [ ] **Step 1: 写 `principles.md`**

逐条收录可独立成立的原则性结论，每条给出原文引用。

```markdown
# Principles — 事业择业原则

每条：`- summary:` 一句话结论 / `source_file:` 出处 / `source_quote:` 原文引用 / `tags:` 标签

---

- summary: "五行只是载体，能不能「出功」才是根本"
  source_file: 事业1.txt
  source_quote: "五行只是载体，能不能"出功"才是根本。"
  tags: [五行, 做功链条, 择业心法]

- summary: "缺但为忌，补了反而压力大"
  source_file: 事业1.txt
  source_quote: "看「喜用神」；缺但为忌，补了反而压力大；优先调候，寒命要火暖、燥命要水润。"
  tags: [喜用神, 误区]

- summary: "调候为急，急药优先级高于一般格局喜忌"
  source_file: 事业3.txt
  source_quote: "区分：必须救的急药，还是锦上添花的辅药；急药优先级高于一般格局喜忌（调候为急）。"
  tags: [调候, 优先级]

- summary: "正财守底盘，偏财抓风口"
  source_file: 事业2.txt
  source_quote: "一句话：正财守底盘，偏财抓风口。"
  tags: [格局, 财格]

- summary: "成格可直接走对应赛道当主业，破格不能重仓押这条线"
  source_file: 事业2.txt
  source_quote: "成格：格局清、有护卫、有去路；可以直接走对应赛道当主业，放大格局优势。破格：用神被冲、被合、被克；不是完全不能做，不能重仓押这条线；要找通关赛道，或者换一条做功链条。"
  tags: [格局, 成破, 投入强度]

- summary: "原局是车，大运是公路，流年是当天天气"
  source_file: 事业4.txt
  source_quote: "简单比方：原局是车，大运是公路（高速 / 泥路 / 盘山路），流年是当天天气（晴、雨、大雾）。"
  tags: [岁运, 三层定位]

- summary: "不是「大运五行是什么就硬做什么行业」，重在运能不能引动做功"
  source_file: 事业4.txt
  source_quote: "不是「大运五行是什么就硬做什么行业」，重喜忌调候「运能不能引动做功」。"
  tags: [岁运, 做功]

- summary: "一个好运落在坏大运里往往是诱饵"
  source_file: 事业4.txt
  source_quote: "一个好流年落在坏大运里，往往是诱饵；看着机会好，进去之后十年被套。"
  tags: [岁运, 坑流年]

- summary: "命理只是时机参考，不是保证书"
  source_file: 事业4.txt
  source_quote: "不要把「引动」等于「稳成」：岁运引动只是天时窗口；现实还要看政策、产权、资金、团队；命理只是时机参考，不是保证书。"
  tags: [岁运, 边界]
```

- [ ] **Step 2: 写 `frameworks.md`**

收录可整体复用的框架结构。

```markdown
# Frameworks — 事业择业框架

---

- quote: |
    格局管底盘，十神管手法，调候管命局的「气温土壤」；寒要解冻、燥要甘霖、湿要收水、干要柔润；调候到位，事业才有生机；药被合、被埋、被克，赛道再好也容易卡壳拖耗。
  summary: |
    四层分工总纲：格局定底盘、十神定手法、调候定气温土壤、岁运定时间表。四层叠加而非四选一，这是 seg2 全部 skill 的组织骨架。
  source_file: 事业3.txt
  tags: [总纲, 四层分工]

- quote: |
    六大气机 · 调候择业
    寒局（水冷金寒，多亥子丑、全局水旺无暖）调候主药：火；次药：燥土
    燥热局（火旺干燥，多巳午未、火多水枯）调候主药：水；次药：柔金
    湿重泥泞局（辰丑多、水土混杂、湿气弥漫）调候主药：燥土；次药：火烘干
    燥硬局（戌未多、土干金燥、缺雨露）调候主药：清水；次药：柔金打磨
    春木旺局（寅卯辰、木气泛滥）调候主药：金修剪；次药：火暖成材
    秋金肃局（申酉戌、金刚冷硬）调候主药：火淬炼；次药：水淘洗
  summary: |
    六气机 × 主药/次药 × 局象 × 生机赛道 的完整映射表，是 tiaohou-shiye 的核心结构。
  source_file: 事业3.txt
  tags: [调候, 六气机, 映射表]

- quote: |
    真药：调候用神透干、有根、不被紧合重克、不在死墓；可以作为事业主线生机。
    藏药：藏在库、拱、暗合；要等流年大运冲库、引动才兑现。
    假药：虚浮无根、被合、被克、埋死；赛道五行再好看，也是画饼；不宜重仓，只能副业体验。
  summary: |
    药的三态判据与对应的择业强度（重仓 / 待机 / 不碰），是 tiaohou-shiye 的第二种核心结构。
  source_file: 事业3.txt
  tags: [调候, 药真假, 择业强度]

- quote: |
    一、财格（正财格、偏财格）… 二、官杀格（正官格、七杀格）… 三、印格… 四、食伤格… 五、比劫格…
    六、经典配格 · 行业定向：财生官格、官印相生格、杀印相生格、伤官制杀格、食伤生财格、财破印格、用库成格
  summary: |
    十正八格 + 七组经典配格，每格给「底盘 / 适合赛道 / 特质」三段式，是 geshi-shiye 的完整映射表。
  source_file: 事业2.txt
  tags: [格局, 正八格, 配格, 映射表]

- quote: |
    顺势重仓：大运引动原局核心做功、调候到位、格局护卫完好；可以加大投入、开长线盘、囤资产、啃高门槛项目。
    轻试待机：大运有药但不纯、有合有绊；适合试点、调研、签预留方案、看指标，不要一把梭。
    守势收缩：大运坏调候、破格局、功神被制；适合保现金流、控负债、不新开重大长线项目。
  summary: |
    大运层面的三档投入强度，与调候三策略（药真/药藏/药假）构成同构的两级判断。
  source_file: 事业4.txt
  tags: [岁运, 三策略]

- quote: |
    1. 观气候 2. 定急药 3. 辨真假 4. 查做功 5. 叠底盘 6. 看岁运 7. 定策略
  summary: |
    调候择业的七步执行顺序，是 tiaohou-shiye 的 Execution 段依据。
  source_file: 事业3.txt
  tags: [调候, 执行顺序]

- quote: |
    木 · 生发、成长、舒展 … 火 · 光明、外放、热能 … 土 · 承载、根基、收纳 … 金 · 决断、精密、肃杀 … 水 · 流动、变通、智慧
  summary: |
    五行 × 核心象义 × 代表职业 × 性格适配 × 方位 的五列映射表，是 wuxing-shiye 的核心结构。
  source_file: 事业1.txt
  tags: [五行, 映射表]

- quote: |
    1. 原局打底 2. 定大势大运 3. 看运中气机 4. 流年择窗口 5. 跨运规划
  summary: |
    岁运择业的五步顺序，是 suiyun-shiye 的 Execution 段依据。
  source_file: 事业4.txt
  tags: [岁运, 执行顺序]
```

- [ ] **Step 3: 写 `cases.md`**

把 `参考资料/事业推理结果.txt` 整份转成基准用例。

```markdown
# Cases — 事业择业案例

## 案例一：男命戊辰 己未 乙亥 乙酉（事业全链推理基准）

- id: case-001
  title: 男命戊辰年 己未月 乙亥日 乙酉时 —— 调候定药、格局定底盘、岁运定时间表的完整推理
  type: 实盘案例
  source_file: 事业推理结果.txt
  source_quote: "戊辰年 己未月 乙亥日   乙酉时"
  summary: |
    双库夹局的财格燥土命。未月季夏，财星当令，辰为水库财库、未为燥土财库，财库厚而闭，
    财多身难独担。日主乙木枯燥，调候第一要癸水润局、次要丙火阳光；亥藏壬水有润根，
    但戊己厚土克水，调候用神藏而不清；原局无丙透，缺阳光泄秀通关。
    喜水（印）、木（比劫），次喜丙火；忌叠土、叠金。
    早年财杀混杂多奔波换赛道，中年后若大运引水印则家资成就。
  outcome: |
    结论为「底盘待机」型：土财是机会底盘、金杀是关卡门槛，须有水木通关方可轻碰，
    否则「看着一块肥肉，啃不动还沾一身泥」。水运为深耕专业铺底盘的黄金期，
    木运适合组队合伙但要防分利，火运适合把沉淀的方案与资产兑现，厚土叠金运宜守不宜攻。
  bound_to: |
    tiaohou-shiye（燥热局 / 藏药）+ geshi-shiye（财格 / 双库夹局 / 破格风险）
    + wuxing-shiye（土为底盘、金为门槛）+ suiyun-shiye（水运重仓 / 厚土叠金守成）
  tags:
    - 男命
    - 燥热局
    - 财格
    - 双库夹局
    - 藏药
    - 基准用例
```

- [ ] **Step 4: 写 `counter-examples.md`**

收录误用与陷阱。

```markdown
# Counter-examples — 事业择业的误用与陷阱

- failure_mode: 把「缺什么」直接等同于「该做什么行业」
  mechanism: 八字缺某五行不等于该五行为喜用；缺而当忌者，补了反而加大压力
  warning_signs: 看到命局缺水就直接推荐水相关行业，完全不看旺衰喜忌
  bound_to: 必须先定喜用神，再谈五行载体；见 wuxing-shiye 的两条关键心法

- failure_mode: 把调候药当成唯一赛道
  mechanism: 调候是「生机药」，负责打通气机；底盘往往由另一行承担（如土拿资产、火做通路）
  warning_signs: 命局燥热就只列出水相关行业，不提底盘行业的价值
  bound_to: 调候是药不是赛道；应给出「底盘赛道 + 调候通道」的组合

- failure_mode: 缺火就断言「必须做火行业」
  mechanism: 原文明确「不是缺火就全部去做火行业」；调候要看全局组合，不只看月令
  warning_signs: 只按出生月份定气候类型，不看全局干支
  bound_to: 见 tiaohou-shiye 第一节与第五节的误区提示

- failure_mode: 见冲就断凶
  mechanism: 冲忌神则吉、破旧立新；冲用神则凶、破损损失
  warning_signs: 把所有六冲一律判为破损
  bound_to: 须先判断被冲者是喜是忌

- failure_mode: 死套月令格局
  mechanism: 全局合成财局、杀局、食伤局时，全局做功优先于月令一字
  warning_signs: 只看月令一个字就定终身行业，不看全局合局
  bound_to: 见 geshi-shiye 第三节的补充提示

- failure_mode: 把岁运「引动」等同于「稳成」
  mechanism: 岁运给的是天时窗口，现实还要看政策、产权、资金、团队
  warning_signs: 见到冲开财库就断言必然发财
  bound_to: 见 suiyun-shiye 第七节的四条禁忌

- failure_mode: 一步大运定终身
  mechanism: 运会转换格局；前一步适合打工攒资质，后一步适合操盘开发
  warning_signs: 把当前十年的定性写成人终身结论
  bound_to: 见 geshi-shiye 心法三与 suiyun-shiye 第六节第 5 步跨运规划

- failure_mode: 交运过渡期大动作
  mechanism: 换运前后一两年旧赛道松动、新赛道未稳，此时冲动跳槽、盲目创业、高价拿地容易踩坑
  warning_signs: 在交运当年就启动长线重资产项目
  bound_to: 见 suiyun-shiye 第三节与第七节

- failure_mode: 枭神夺食当成偏印格正常特征
  mechanism: 偏印格需有制有泄为佳；无制则枭神夺食，投入多变现少
  warning_signs: 看到偏印就直接说「适合独立咨询」，不看是否有食神制或财制
  bound_to: 见 geshi-shiye 正八格表中偏印格一行

- failure_mode: 用库成格时不等库开就下注
  mechanism: 库不开，看着地再好也难确权、难分割变现
  warning_signs: 看到有财库就直接推荐囤地开发，不看流年是否冲开
  bound_to: 见 geshi-shiye 用库成格一行与 suiyun-shiye 流年出手信号表
```

- [ ] **Step 5: 跑校验并提交**

Run: `node scripts/validate-skills.js --expect-candidates`
Expected: 退出码 0，输出 `✓ 全部校验通过`

> `--expect-candidates` 让校验器**显式要求** `candidates/` 下 4 份过程文档齐全且非空。
> 不带这个参数时，校验器的判据是「四份里至少出现一份」——
> 因为 Task 8 之前这四份根本不存在，不能让常规校验一直报错。
> 但正因如此，**一份都没写**这种情况只有加了这个参数才查得出来，
> 所以 Task 8 的收尾与 Task 10 的总复验都必须带上它。

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
git add skills/bazi-tuipan/candidates
git commit -m "docs(skills): 补 candidates 四份 —— 原则/框架/案例/反例"
```

---

### Task 9: 更新顶层过程文档与索引

基线 42 个文件里有 6 个是顶层过程文档，允许改。其余 36 个一律不动。

**Files:**
- Modify: `skills/bazi-tuipan/INDEX.md`
- Modify: `skills/bazi-tuipan/PIPELINE_STATE.md`
- Modify: `skills/bazi-tuipan/verified.md`
- Modify: `skills/bazi-tuipan/GLOSSARY.md`
- Modify: `skills/bazi-tuipan/BOOK_OVERVIEW.md`
- Modify: `skills/bazi-tuipan/DIGEST.md`

**Interfaces:**
- Consumes: Task 2–8 的全部产物
- Produces: 更新后的 6 个顶层文档

- [ ] **Step 1: 改 `INDEX.md`**

在「Skill 完整清单」表格后追加新表，并把新的调用关系补进去。

追加到 `skills/bazi-tuipan/INDEX.md` 末尾：

````markdown
---

## 事业择业链（seg2 新增）

```
用户问「适合做什么行业 / 什么时候动手」
                │
                ▼
        ┌─────────────────────────┐
        │      shiye-master       │ ← 总入口，输出 CAREER_SCHEMA 的 10 键
        └──────────┬──────────────┘
                   │ 依次调用
    ┌──────────────┼──────────────┬──────────────┐
    ▼              ▼              ▼              ▼
tiaohou-shiye   geshi-shiye    wuxing-shiye   suiyun-shiye
  调候定药       格局定底盘      五行定载体      岁运定时间表
    │              │              │              │
    └──────────────┴──────┬───────┴──────────────┘
                          ▼
                    （叠加后出赛道）
```

| # | name | 文件路径 | 核心功能 |
|---|---|---|---|
| 20 | **shiye-master** | `shiye-master.skill.md` | **事业择业总入口，输出 CAREER_SCHEMA 契约** |
| 21 | tiaohou-shiye | `tiaohou-shiye/SKILL.md` | 调候六气机、真药/藏药/假药、生机赛道 |
| 22 | geshi-shiye | `geshi-shiye/SKILL.md` | 十格与七组配格的行业定向、成格破格 |
| 23 | wuxing-shiye | `wuxing-shiye/SKILL.md` | 五行载体、代表职业、方位、复合行业 |
| 24 | suiyun-shiye | `suiyun-shiye/SKILL.md` | 大运三策略、流年出手与宜守信号 |

**依赖**：tiaohou-shiye → `shengshuai-panbie` + `xi-ji-quyong`；
geshi-shiye → `geshi-dingxing`；wuxing-shiye → `wuxing-shengke` + `xi-ji-quyong`；
suiyun-shiye → `dayun-fenxi` + `xi-ji-quyong`。

**输出契约**：`docs/CAREER_SCHEMA.md`（10 个顶层键，闭合枚举）。

**校验**：`npm test`（结构 + 契约 + 基线完整性）。
````

- [ ] **Step 2: 改 `PIPELINE_STATE.md`**

追加：

```markdown
---

## 阶段 6 — 事业择业链（seg2）

- [x] 阶段 0-5：v1 推盘 13 模块体系（基线，逐字拷贝自 zhouyi_seg1_v2）
- [x] candidates 四份（principles / frameworks / cases / counter-examples）
- [x] docs/CAREER_SCHEMA.md（10 键 JSON 契约）
- [x] tiaohou-shiye（调候六气机 + 药真假 + 生机赛道 + 三策略）
- [x] geshi-shiye（十正八格 + 七组配格 + 成破 + 三心法）
- [x] wuxing-shiye（五行载体 + 代表职业 + 方位 + 复合行业）
- [x] suiyun-shiye（岁运三层 + 大运三策略 + 流年窗口）
- [x] shiye-master（决策链编排 + 契约输出）
- [x] 校验工具链（scripts/，零依赖）

### seg2 流水线状态

| Skill | 状态 |
|---|---|
| shiye-master（总入口） | ✅ |
| tiaohou-shiye | ✅ |
| geshi-shiye | ✅ |
| wuxing-shiye | ✅ |
| suiyun-shiye | ✅ |

**激活方式**：用户问「适合做什么行业」「什么时候适合创业」「事业方向」「职业规划」时触发 `shiye-master`。

**新增说明**
- **2026-11-24**：seg2 新增事业择业链 5 个 skill + JSON 契约 + 校验工具链。
- 本次只做知识库，**未接入 v2 运行时**。接入方式：把 4 个子 skill 的 `Interpretation` 段加进
  `backend/src/llm/prompt.js` 的 `SKILL_CALL_ORDER`，并新增 `shiye-master` 的契约输出字段。
```

- [ ] **Step 3: 改 `verified.md`**

追加：

```markdown
---

## 阶段 1.5 — seg2 事业择业链验证（2026-11-24）

| # | Skill | 验证结果 | 理由 |
|---|---|---|---|
| 19 | **shiye-master** | ✅ V1+V2+V3 | 编排链与契约逐项对应 `docs/CAREER_SCHEMA.md`，`Execution` 段点名全部 10 个顶层键 |
| 20 | **tiaohou-shiye** | ✅ V1+V2+V3 | 原文有完整六气机体系与药真假三态；V1 跨域（资料3 独有）、V2 可直接回答「适合做什么行业」、V3 属命理专业内容 |
| 21 | **geshi-shiye** | ✅ V1+V2+V3 | 原文十正八格 + 七组配格有完整行业映射与成破判据 |
| 22 | **wuxing-shiye** | ✅ V1+V2+V3 | 原文五行五列映射表（象义/职业/性格/方位）完整，且给出复合行业叠加 |
| 23 | **suiyun-shiye** | ✅ V1+V2+V3 | 原文三层定位 + 大运三策略 + 流年出手与宜守信号成体系 |

### 独有性说明

`调候`（六大气机、真药/藏药/假药、生机赛道）在 v1/v2 的 19 个基线 skill 中**完全没有覆盖**
（原始材料 `推盘材料.txt` 中「调候」出现 0 次）。本次新增的 5 个 skill 是对基线的**增量**，不是重复。

### 无淘汰单元

5 个新单元全部通过三重验证。
```

- [ ] **Step 4: 改 `GLOSSARY.md`**

追加：

```markdown
## 事业择业类

| 术语 | 定义 |
|---|---|
| 调候 | 调理命局的「气温与土壤」：寒要解冻、燥要甘霖、湿要收水、干要柔润 |
| 六大气机 | 寒局 / 燥热局 / 湿重泥泞局 / 燥硬局 / 春木旺局 / 秋金肃局，是调候判定的六种全局气候 |
| 调候真药 | 透干、有根、不被紧合重克、不在死墓的调候用神，可作事业主线生机 |
| 调候藏药 | 藏在库、拱或暗合的调候用神，须待流年大运冲库引动才兑现 |
| 调候假药 | 虚浮无根、被合被克被埋死的调候用神，对应赛道只是画饼，不宜重仓 |
| 生机赛道 | 带调候主药或次药通关、能打通该局气机的行业 |
| 急药 / 辅药 | 必须救的第一调候用神 / 锦上添花的第二调候用神；急药优先级高于一般格局喜忌 |
| 做功链条 | 行业能引动功神、打通合冲刑害、开库的程度；五行只是载体，出功才是根本 |
| 顺势重仓 | 大运引动原局核心做功、调候到位、格局护卫完好时的加大投入策略 |
| 轻试待机 | 大运有药但不纯、有合有绊时的试点观望策略，不一把梭 |
| 守势收缩 | 大运坏调候、破格局、功神被制时的保现金流、控杠杆策略 |
| 交运过渡期 | 换运前后一两年，旧赛道松动、新赛道未稳的扰动期，此时忌重大动作 |
| 机会流年 | 在好大运里是加速兑现点；在一般大运里只是短暂窗口期 |
| 坑流年 | 再好大运也会踩坑的年份；不是路坏了，是当年路况差 |
| 事业择业链 | 调候定药 → 格局定底盘 → 五行定赛道载体 → 岁运定时间表，四层叠加的决策链 |
```

- [ ] **Step 5: 改 `BOOK_OVERVIEW.md`**

追加：

```markdown
---

## 第二本书：事业择业方法论（seg2）

### 主旨

在已有推盘体系之上，回答「这个命局该做什么行业、什么打法、什么时候动手」。

### 骨架

- **五行择业**（资料1）：五行核心象义 → 代表职业 → 性格适配 → 方位；复合行业叠加
- **格局择业**（资料2）：十正八格 + 七组经典配格 → 行业定向；成格/破格与三条心法
- **调候择业**（资料3）：六大气机 → 主药/次药 → 药的真假 → 生机赛道 → 三种择业策略
- **大运流年择业**（资料4）：原局→大运→流年三层；大运三策略；流年出手与宜守信号

### 与第一本书的关系

第一本书产出「命盘是什么」，第二本书产出「命盘意味着该怎么做」。
第二本书的调候部分是第一本书完全没有的增量。

### 应用方向

用户问「适合做什么行业」「什么时候适合创业」时，`shiye-master` 按
`调候 → 格局 → 五行 → 岁运` 的顺序推进，输出符合 `docs/CAREER_SCHEMA.md` 的事业方案。
```

- [ ] **Step 6: 改 `DIGEST.md`**

追加：

````markdown
---

## 八、事业择业链（seg2）

### 四层叠加

```
调候定药  →  格局定底盘  →  五行定赛道载体  →  岁运定时间表
```

### 调候六气机（主药 / 次药）

| 气机 | 主药 | 次药 |
|---|---|---|
| 寒局 | 火 | 燥土 |
| 燥热局 | 水 | 柔金 |
| 湿重泥泞局 | 燥土 | 火烘干 |
| 燥硬局 | 清水 | 柔金打磨 |
| 春木旺局 | 金修剪 | 火暖成材 |
| 秋金肃局 | 火淬炼 | 水淘洗 |

### 药的三态 → 择业强度

| 药 | 判据 | 策略 |
|---|---|---|
| 真药 | 透干、有根、不被合克墓藏 | 主业重仓 |
| 藏药 | 藏在库、拱、暗合 | 底盘待机 |
| 假药 | 虚浮无根、被合被克埋死 | 守成缓投 |

### 格局一句话

> 正财守底盘，偏财抓风口。正官顺梯而上，七杀闯关夺旗。正印大道传经典，偏印深山藏绝活。食神养人留余味，伤官破局立新天。比肩结伴铺大路，劫财冲锋抢地盘。

### 岁运三策略

顺势重仓 / 轻试待机 / 守势收缩 —— 与调候三策略同构。

### 四条心法

1. 缺但为忌，补了反而压力大
2. 五行只是载体，能不能「出功」才是根本
3. 一个好流年落在坏大运里，往往是诱饵
4. 不要把「引动」等于「稳成」—— 命理只是时机参考，不是保证书

详见 [CAREER_SCHEMA.md](../../../docs/CAREER_SCHEMA.md)
````

- [ ] **Step 7: 跑校验 —— 确认基线 36 个文件仍逐字未动**

Run: `node scripts/validate-skills.js --expect-candidates`
Expected: 退出码 0，输出 `✓ 全部校验通过`

若报「基线文件被改动」，说明误改了 36 个受保护文件之一 —— `git checkout` 恢复那一个文件再查。

> `--expect-candidates` 让校验器显式要求 `candidates/` 下 4 份过程文档齐全且非空 ——
> 这是「Task 8 整个被跳过」的唯一检出手段（不带该参数时判据是「至少出现一份」）。

- [ ] **Step 8: 单独核对 36 个受保护文件的 blob**

先跑主校验器 —— 它会核对基线清单是否仍与基线提交 `f7bd915` 的树一致
（清单被改过就会报「基线清单与基线提交不一致」）：

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
node scripts/validate-skills.js --expect-candidates
```

Expected: 退出码 0，输出 `✓ 全部校验通过`（此时 5 个新 skill、契约、candidates 四份都已建好）

再单独核对 36 个受保护文件：

```bash
node -e "
const fs=require('fs'),path=require('path'),cp=require('child_process');
const dir='skills/bazi-tuipan';
const mut=new Set(['BOOK_OVERVIEW.md','DIGEST.md','GLOSSARY.md','INDEX.md','PIPELINE_STATE.md','verified.md']);
const lines=fs.readFileSync(path.join(dir,'.baseline-manifest.txt'),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#'));
let bad=0,checked=0;
for(const l of lines){const m=/^([0-9a-f]{40})\s+(.+)\$/.exec(l.trim());if(!m)continue;
  const [,sha,file]=m; if(mut.has(file))continue;
  checked++;
  const actual=cp.execFileSync('git',['hash-object',path.join(dir,file)],{encoding:'utf8'}).trim();
  if(actual!==sha){console.log('CHANGED: '+file);bad++;}
}
console.log('受保护文件 '+checked+' 个，被改动 '+bad+' 个');
process.exit(bad?1:0);
"
```

Expected: 输出 `受保护文件 36 个，被改动 0 个`，退出码 0

- [ ] **Step 9: 提交**

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
git add skills/bazi-tuipan/INDEX.md skills/bazi-tuipan/PIPELINE_STATE.md skills/bazi-tuipan/verified.md skills/bazi-tuipan/GLOSSARY.md skills/bazi-tuipan/BOOK_OVERVIEW.md skills/bazi-tuipan/DIGEST.md
git commit -m "docs(skills): 更新索引与过程文档 —— 收录事业择业链 5 个 skill"
```

---

### Task 10: 全量复验与收尾

**Files:**
- 无新增文件（只跑验证与提交收尾）

**Interfaces:**
- Consumes: Task 1–9 的全部产物
- Produces: 干净的最终状态

- [ ] **Step 1: 跑完整测试**

Run: `npm test`
Expected: 单测全部 PASS（test 数以实际输出为准）+ `✓ 全部校验通过`

再单独跑一次带 `--expect-candidates` 的收尾核验 —— 这是「Task 8 被整个跳过」的唯一检出手段
（不带该参数时，校验器的判据是「四份里至少出现一份」，
四份全删就退化成「没开工」而静默）：

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
node scripts/validate-skills.js --expect-candidates
```

Expected: 退出码 0，输出 `✓ 全部校验通过`

- [ ] **Step 2: 核对最终文件清单**

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
echo "=== seg2 全量文件 ==="
git ls-files | sort
echo "=== 文件总数 ==="
git ls-files | wc -l
```

Expected 包含：
- `skills/bazi-tuipan/` 下 5 个新 skill 的 `SKILL.md` / `shiye-master.skill.md` 与 5 份 `test-prompts.json`
- `skills/bazi-tuipan/candidates/` 下 4 份 md
- `docs/CAREER_SCHEMA.md`
- `scripts/` 下 5 个 js
- `package.json`、`skills/bazi-tuipan/.baseline-manifest.txt`

- [ ] **Step 3: 确认基线 36 个受保护文件仍未动**

重复 Task 9 Step 8 的命令。

Expected: `受保护文件 36 个，被改动 0 个`

- [ ] **Step 4: 确认参考资料未被修改**

主校验器已对 `参考资料/` 5 份 txt 做常驻的 blob 比对（改了会报「参考资料文件被改动」）。
这里再人工核对一次，作为双重确认：

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
git diff f7bd915 --stat -- 参考资料/
```

Expected: 无输出（参考资料自首提交起一字未改）

- [ ] **Step 5: 确认工作区干净**

Run: `git status --short`
Expected: 无输出

- [ ] **Step 6: 若有未提交改动则提交收尾**

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
git add -A
git commit -m "chore: 收尾 —— 事业择业 skill 知识库交付"
```

若 `git status --short` 本就无输出，跳过本步。

- [ ] **Step 7: 输出最终交付摘要**

```bash
cd D:/Software/ClaudeCodeProject/zhouyi_seg2
git log --oneline
echo "--- 新增文件数（相对基线提交 f7bd915）---"
git diff --name-status f7bd915 HEAD | grep -c '^A'
```

Expected: 提交历史连贯，基线提交 `f7bd915` 在最下面，新增文件数 ≥ 17（5 skill 定义 + 5 test-prompts + 4 candidates + CAREER_SCHEMA + CAREER_SCHEMA.sample.json + 5 scripts + package.json + baseline-manifest）
