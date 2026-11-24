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

/**
 * 参考资料目录 —— 5 份原始素材，基线提交里就有，一字未改。
 * 它们**不在** .baseline-manifest.txt 里（清单只管 skills/bazi-tuipan/），
 * 所以要有独立的一条腿：拿基线提交里的 blob 跟工作区比。
 */
const REFERENCE_DIR = '参考资料';

/** git 里用的正斜杠路径（Windows 上 path.join 给的是反斜杠，git 不认） */
function gitPath(p) {
  return p.split(path.sep).join('/');
}

/** 基线文件数（Task 1 建基线时的既定事实）—— 清单被截断/写坏时用它把「静默通过」变成报错 */
const BASELINE_FILE_COUNT = 42;

/**
 * 基线提交 —— 清单的信任锚。
 * 清单自己也是工作区里的一个文件，只信它等于「清单说谁没变谁就没变」，
 * 所以清单必须与这个提交里的树逐条比对（路径集合 + blob sha 集合双向相等）。
 * 权威来源：docs/superpowers/plans/2026-11-24-shiye-skill-plan.md 的 Global Constraints，
 * 以及 Task 9 / Task 10 引用的那个建仓提交 `chore: 建仓 —— 拷入 v2 推盘 skill 基线 + 事业择业设计规格`。
 * 基线提交不可改（改了就换 SHA），短 SHA 够用（git ls-tree 接受）。
 */
const BASELINE_COMMIT = 'f7bd915';

/** Task 8 的四份过程文档 */
const CANDIDATE_FILES = ['principles.md', 'frameworks.md', 'cases.md', 'counter-examples.md'];

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
 * 契约里必须声明 minItems >= 1 的 8 个数组路径。
 * 空数组 = 「只覆盖了半边」的样例（playbooks: [] / summary.notes: [] 都能蒙混过关），
 * 所以契约必须自己声明这些数组至少 1 项。schema-check.js 认 minItems（样例那条腿查得出来），
 * 这里只补一句「契约有没有声明 minItems」的断言，不用改 scripts/lib/。
 *
 * 唯一豁免是 xiJi.ciXi（次喜 / 辅助用神）：
 *   - `参考资料/事业3.txt:78` 区分「必须救的急药」与「锦上添花的辅药」——
 *     辅助用神本质可选，强行要求非空等于**逼模型编一个不存在的次喜**；
 *   - 对照 `参考资料/事业1.txt:56`「缺但为忌，补了反而压力大」——
 *     忌神（xiJi.ji）由喜用关系派生，不因该五行不在原局就消失，所以它必须非空。
 * 豁免由 CONTRACT_ARRAY_OPTIONAL 单独断言（见下），防止日后被误加回去。
 */
const CONTRACT_ARRAY_MIN_ITEMS = [
  ['xiJi', 'xi'], ['xiJi', 'ji'],
  ['boundaries'], ['playbooks'], ['playbooks[]', 'actions'],
  ['timeline'], ['timeline[]', 'liunianWindows'], ['summary', 'notes'],
];

/** 允许为空、且**不得**声明 minItems >= 1 的数组路径（唯一豁免：xiJi.ciXi = 次喜） */
const CONTRACT_ARRAY_OPTIONAL = [['xiJi', 'ciXi']];

/**
 * 契约里 13 个对象节点的规范形状 —— 每个节点的「属性名集合」与「required 集合」。
 *
 * 权威来源：docs/superpowers/plans/2026-11-24-shiye-skill-plan.md 的 Task 2 契约 ```json 块
 * （逐字抄，不凭记忆写）。路径写法沿用 resolveSchemaNode 的 'x[]' 约定（x[] = 数组 items）。
 *
 * 为什么要有它：Task 2 的产出**就是**这份契约，它是「契约 = 规范」这件事的唯一载体。
 * 只断言顶层（required ⇄ properties 双向相等）的话，嵌套层那 ~40 个字段名与
 * 全部嵌套 required 列表都是裸的 —— 契约能被静默削弱，而校验器一个字都不会说。
 * 把 13 个对象节点的形状钉死之后，「删 required / 空 required / 字段改名 / 加野字段」
 * 一律报红。
 *
 * 维护说明：契约要改形状时，**先**改计划文件 Task 2 的契约 json 块，**再**同步改这里 ——
 * 两处必须一致，否则「契约 = 规范」就不成立了。测试文件里有一份独立副本
 * （EXPECTED_OBJECT_SHAPE），两份不一致会直接测红。
 * 现在还有第三条腿：测试里有一条测试**直接读计划文件**，把计划 json 块抠出来
 * 自己遍历一遍，跟这里的常量逐节点比对 —— 三处（计划 / 常量 / 测试副本）自动咬合，
 * 改了一处忘了另外两处，测试会红。
 *
 * **已知残留**：本轮钉的是**属性名集合**与 **required 集合**；
 * 叶子的**具体标量类型**（string 还是 integer）**未钉** ——
 * 例如把 `storeHouse` 的 type 从 string 改成 integer，形状断言一个字都不会说。
 * 补一张约 40 条的叶子类型表能盖住，但那是第三处人工同步，代价大于收益，
 * 明确不做，记为已知残留。本轮只加了一条通用规则兜底：
 * 「每个属性叶子都必须声明 type，且 type 取值合法」（见 CONTRACT_LEAF_TYPES）。
 */
const CONTRACT_OBJECT_SHAPE = [
  {
    path: [],
    properties: ['case', 'monthCommand', 'pattern', 'tiaoHou', 'xiJi', 'boundaries', 'playbooks', 'timeline', 'transition', 'summary'],
    required: ['case', 'monthCommand', 'pattern', 'tiaoHou', 'xiJi', 'boundaries', 'playbooks', 'timeline', 'transition', 'summary'],
  },
  { path: ['case'], properties: ['gender', 'pillars'], required: ['gender', 'pillars'] },
  { path: ['case', 'pillars'], properties: ['year', 'month', 'day', 'hour'], required: ['year', 'month', 'day', 'hour'] },
  {
    path: ['monthCommand'],
    properties: ['monthBranch', 'dayMaster', 'seasonClimate', 'verdict'],
    required: ['monthBranch', 'dayMaster', 'seasonClimate', 'verdict'],
  },
  { path: ['pattern'], properties: ['type', 'verdict', 'storeHouse', 'reasoning'], required: ['type', 'verdict', 'storeHouse', 'reasoning'] },
  {
    path: ['tiaoHou'],
    properties: ['climateType', 'primaryDrug', 'secondaryDrug', 'drugStatus', 'drugReasoning', 'gap'],
    required: ['climateType', 'primaryDrug', 'secondaryDrug', 'drugStatus', 'drugReasoning', 'gap'],
  },
  { path: ['xiJi'], properties: ['xi', 'ciXi', 'ji'], required: ['xi', 'ciXi', 'ji'] },
  { path: ['boundaries[]'], properties: ['element', 'why', 'condition'], required: ['element', 'why', 'condition'] },
  { path: ['playbooks[]'], properties: ['scale', 'condition', 'actions'], required: ['scale', 'condition', 'actions'] },
  {
    path: ['timeline[]'],
    properties: ['ganZhi', 'type', 'verdict', 'mainTrack', 'playbook', 'liunianWindows'],
    required: ['ganZhi', 'type', 'verdict', 'mainTrack', 'playbook', 'liunianWindows'],
  },
  {
    path: ['timeline[]', 'liunianWindows[]'],
    properties: ['year', 'signal', 'action'],
    required: ['year', 'signal', 'action'],
  },
  { path: ['transition'], properties: ['risk', 'advice'], required: ['risk', 'advice'] },
  { path: ['summary'], properties: ['strategy', 'notes'], required: ['strategy', 'notes'] },
];

/**
 * 契约里允许的 type 取值（JSON Schema 常用子集）。
 * 只认这 6 个 —— 出现别的值（比如 "strng"）说明契约写坏了。
 */
const CONTRACT_LEAF_TYPES = ['string', 'integer', 'number', 'boolean', 'array', 'object'];

/** 契约里一个对象节点的路径标签（'$' / '$.case.pillars' / '$.timeline[].liunianWindows[]'） */
function shapeLabel(pathParts) {
  if (!pathParts || pathParts.length === 0) return '$';
  return '$' + pathParts.map((p) => '.' + p).join('');
}

/** 路径标签 → 常量条目 */
const CONTRACT_SHAPE_BY_LABEL = new Map(CONTRACT_OBJECT_SHAPE.map((e) => [shapeLabel(e.path), e]));

/**
 * 递归收集契约里所有「有 properties 的对象节点」的路径标签。
 * 数组的 items 层也算一个对象节点（标签带 '[]'）。
 * 用来反向检查：契约里不得出现规范之外的对象节点。
 *
 * 注意：这条反向检查是**冗余保险**，不是独立的一道防线 ——
 * 正向的属性集断言已经能覆盖全部节点增删（见 checkContractObjectShape 的注释）。
 */
function collectObjectNodeLabels(node, label, out) {
  if (!node || typeof node !== 'object') return out;
  const props = node.properties;
  if (!props || typeof props !== 'object') return out;
  out.push(label);
  for (const [key, sub] of Object.entries(props)) {
    if (!sub || typeof sub !== 'object') continue;
    if (sub.properties) collectObjectNodeLabels(sub, `${label}.${key}`, out);
    if (sub.items && typeof sub.items === 'object' && sub.items.properties) {
      collectObjectNodeLabels(sub.items, `${label}.${key}[]`, out);
    }
  }
  return out;
}

/**
 * 契约嵌套形状检查：13 个对象节点的属性集与 required 集必须与规范逐字相等，
 * 且契约里不得多出规范之外的对象节点。
 *
 *   - **主腿**：按常量逐个定位 + 比对属性集 / required 集。
 *     这一条已经能覆盖**全部**节点增删改：
 *       · 新增一个野节点 —— 它必然要先挂到某个已被钉死的父节点的 properties 下，
 *         父节点的「属性集不对」会先响；
 *       · 整个节点被删 —— 按常量定位不到，报「缺少对象定义」；
 *       · 改名 —— 属性集与 required 集都比不上。
 *   - **冗余保险**：按契约反向遍历，找出「规范之外的对象节点」。
 *     它**不是**独立的一道防线（主腿已经覆盖了节点增删），
 *     它防的是将来有人放宽正向断言时无声退化。
 *
 * 返回是否全对（false 时已经报过错）。
 */
function checkContractObjectShape(errors, schema) {
  let ok = true;
  for (const spec of CONTRACT_OBJECT_SHAPE) {
    const label = shapeLabel(spec.path);
    const node = resolveSchemaNode(schema, spec.path);
    if (!node || typeof node !== 'object' || !node.properties || typeof node.properties !== 'object') {
      errors.push(`契约 schema 形状不对：${label} 缺少对象定义（应有 properties 与 required）`);
      ok = false;
      continue;
    }
    const actualProps = Object.keys(node.properties);
    if (JSON.stringify(actualProps.slice().sort()) !== JSON.stringify(spec.properties.slice().sort())) {
      errors.push(`契约 schema 形状不对：${label} 的属性集不对：应为 [${spec.properties.join(' / ')}]，实际 [${actualProps.join(' / ')}]`);
      ok = false;
    }
    if (!Array.isArray(node.required) || node.required.length === 0) {
      errors.push(`契约 schema 形状不对：${label} 缺少非空的 required 数组`);
      ok = false;
    } else if (JSON.stringify(node.required.slice().sort()) !== JSON.stringify(spec.required.slice().sort())) {
      errors.push(`契约 schema 形状不对：${label} 的 required 集不对：应为 [${spec.required.join(' / ')}]，实际 [${node.required.join(' / ')}]`);
      ok = false;
    }
  }
  for (const label of collectObjectNodeLabels(schema, '$', [])) {
    if (!CONTRACT_SHAPE_BY_LABEL.has(label)) {
      errors.push(`契约 schema 形状不对：${label} 是规范之外的对象节点`);
      ok = false;
    }
  }
  return ok;
}

/**
 * 契约的叶子必须声明 type —— 且 type 取值合法；数组的 items 也必须有 type。
 *
 * 为什么要有它：形状常量钉的是「属性名集合 + required 集合」，
 * **叶子的 type 关键字不在其内** —— 契约里把 `pattern.properties.reasoning` 的
 * `type` 整个删掉、把 `xiJi.properties.xi.items` 的 `type` 删掉，
 * 形状断言一个字都不会说（静默通过）。
 *
 * 本条只要求「声明了 type 且取值合法」，**不钉**「每个叶子具体是哪个标量类型」
 * （string 还是 integer）—— 那要另加一张约 40 条的叶子类型表，
 * 是第三处人工同步，代价大于收益，**明确不做**，记为已知残留。
 *
 * 「叶子」= 不带 properties 的属性节点（标量 / 数组）；
 * 数组的 items 层单独要求声明 type（items 本身是对象节点时，
 * 它下面的属性再按叶子规则递归检查）。
 */
function checkContractLeafTypes(errors, schema) {
  let ok = true;
  const allowed = new Set(CONTRACT_LEAF_TYPES);

  function report(msg) {
    errors.push(msg);
    ok = false;
  }

  /** 检查一个节点的 type：必须声明，且取值必须在允许集合里 */
  function checkType(node, label) {
    if (!Object.prototype.hasOwnProperty.call(node, 'type')) {
      report(`契约 schema 的属性必须声明 type：${label}（未声明 type）`);
      return;
    }
    if (!allowed.has(node.type)) {
      report(`契约 schema 的 type 取值不合法：${label}（实际 ${JSON.stringify(node.type)}，应为 ${CONTRACT_LEAF_TYPES.join(' / ')}）`);
    }
  }

  /** 递归走属性；label 是给人看的路径（'$' / '$.timeline[].liunianWindows[]'） */
  function visit(node, label) {
    const props = node && node.properties;
    if (!props || typeof props !== 'object') return;
    for (const [key, sub] of Object.entries(props)) {
      if (!sub || typeof sub !== 'object') continue;
      const childLabel = label === '$' ? `$.${key}` : `${label}.${key}`;
      const isObjectNode = Boolean(sub.properties && typeof sub.properties === 'object');
      if (!isObjectNode) {
        // 叶子（标量 / 数组）：必须声明 type
        checkType(sub, childLabel);
      }
      // 数组的 items 也必须有 type
      if (sub.type === 'array' || (sub.items && typeof sub.items === 'object')) {
        if (!sub.items || typeof sub.items !== 'object') {
          report(`契约 schema 的数组必须声明 items：${childLabel}`);
        } else {
          checkType(sub.items, `${childLabel}[]`);
          visit(sub.items, `${childLabel}[]`);
        }
      }
      if (isObjectNode) visit(sub, childLabel);
    }
  }

  visit(schema, '$');
  return ok;
}

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
 * 读基线提交里的文件树（路径 → blob sha，路径相对仓库根）。
 * 必须带 `-c core.quotepath=false`：否则 git 会把中文文件名转义成八进制，
 * 路径就跟清单里的原文对不上。用 -z 做 NUL 分隔，避免引号转义。
 * 提交不存在时返回 { error }（绝不静默跳过 —— 那等于把锚点关掉）。
 *
 * 读的是**整棵树**（不给 pathspec）：清单要比 skills/bazi-tuipan/ 子树，
 * 参考资料要比 参考资料/ 子树，一次读全树省得开两个 git 进程。
 */
function readBaselineTree(root, commit) {
  let out;
  try {
    out = execFileSync('git', [
      '-c', 'core.quotepath=false', 'ls-tree', '-r', '-z', commit,
    ], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return { error: e };
  }
  const tree = new Map();
  for (const rec of out.split('\0')) {
    if (!rec) continue;
    const m = /^(\d+) (\w+) ([0-9a-f]{40})\t(.*)$/.exec(rec);
    if (!m || m[2] !== 'blob') continue;
    tree.set(m[4], m[3]);
  }
  return { tree };
}

/** 从整棵树里切出某个前缀的子树（键变成相对该前缀的路径） */
function subtree(tree, prefix) {
  const p = `${prefix}/`;
  const out = new Map();
  for (const [k, v] of tree) if (k.startsWith(p)) out.set(k.slice(p.length), v);
  return out;
}

/**
 * 参考资料的不可变性：基线提交里的每一份，都必须还在工作区、且 blob 未变。
 * 这是一条**独立于基线清单**的腿 —— 参考资料不在清单里，清单被改也管不到它。
 * 报错必须指出是哪个文件。
 */
function checkReferenceFiles(root, tree, commit) {
  const problems = [];
  const prefix = `${REFERENCE_DIR}/`;
  const refs = [...tree.entries()].filter(([p]) => p.startsWith(prefix)).sort();
  if (refs.length === 0) {
    problems.push(`基线提交 ${commit} 里没有 ${prefix} —— 参考资料的不可变性无法被断言`);
    return problems;
  }
  const existing = [];
  for (const [p, sha] of refs) {
    const full = path.join(root, ...p.split('/'));
    if (!fs.existsSync(full)) {
      problems.push(`参考资料丢失: ${p}`);
      continue;
    }
    existing.push({ p, sha });
  }
  if (existing.length === 0) return problems;
  let out;
  try {
    out = execFileSync('git', ['hash-object', '--stdin-paths'], {
      cwd: root,
      encoding: 'utf8',
      input: existing.map((e) => e.p).join('\n') + '\n',
    });
  } catch (e) {
    problems.push(`无法执行 git hash-object 比对参考资料 —— ${e.message}`);
    return problems;
  }
  const hashes = out.split('\n').map((s) => s.trim()).filter(Boolean);
  if (hashes.length !== existing.length) {
    problems.push(`参考资料 blob 比对条数不符（期望 ${existing.length} 条，实际 ${hashes.length} 条）`);
    return problems;
  }
  existing.forEach((e, i) => {
    if (hashes[i] !== e.sha) problems.push(`参考资料被改动: ${e.p}`);
  });
  return problems;
}

/**
 * 比对基线文件 blob，返回不一致清单。
 * 用 `git hash-object` 比 blob（会应用 clean filter 归一化 CRLF），不看工作区内容。
 *
 * 三条腿：
 *   1. 锚定：清单必须与基线提交的树逐条一致（路径集合 + blob sha 集合双向相等）；
 *   2. 工作区：清单里的每个文件都必须还在，且（不可变的那 36 个）blob 未变；
 *   3. 参考资料：基线提交里的每一份参考资料都必须还在，且 blob 未变（它不在清单里）。
 */
function baseline(root, opts = {}) {
  const dir = path.join(root, SKILL_DIR);
  const problems = [];
  const commit = opts.baselineCommit || BASELINE_COMMIT;

  const manifestFile = path.join(dir, MANIFEST_NAME);
  if (!fs.existsSync(manifestFile)) {
    // 清单缺失/未提交 = 基线守卫静默失效，必须报红而不是一路绿灯
    problems.push(`缺少基线清单 ${gitPath(SKILL_DIR)}/${MANIFEST_NAME}`);
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

  // 锚定：清单 vs 基线提交的树。清单自己也是工作区里的一个文件，
  // 只信它等于「清单说谁没变谁就没变」—— 交换两个文件的内容再对调清单条目即可攻破。
  const anchor = readBaselineTree(root, commit);
  if (anchor.error) {
    const detail = anchor.error.stderr ? String(anchor.error.stderr).trim().split('\n')[0] : anchor.error.message;
    problems.push(`找不到基线提交 ${commit} —— 基线清单无法被锚定（${detail}）`);
  } else {
    const tree = subtree(anchor.tree, gitPath(SKILL_DIR));
    const man = new Map(entries.map((e) => [e.file, e.sha]));
    const onlyTree = [...tree.keys()].filter((p) => !man.has(p)).sort();
    const onlyMan = [...man.keys()].filter((p) => !tree.has(p)).sort();
    const shaDiff = [...man.keys()].filter((p) => tree.has(p) && tree.get(p) !== man.get(p)).sort();
    for (const p of onlyTree) problems.push(`基线清单与基线提交不一致（基线提交 ${commit}）：清单缺少 ${p}`);
    for (const p of onlyMan) problems.push(`基线清单与基线提交不一致（基线提交 ${commit}）：清单多出 ${p}`);
    for (const p of shaDiff) {
      problems.push(`基线清单与基线提交不一致（基线提交 ${commit}）：${p} 的 blob sha 不符（清单 ${man.get(p).slice(0, 8)} ≠ 基线 ${tree.get(p).slice(0, 8)}）`);
    }
    // 参考资料：独立的一条腿（它不在基线清单里，清单被改也管不到它）
    problems.push(...checkReferenceFiles(root, anchor.tree, commit));
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
      input: toHash.map((e) => `${gitPath(SKILL_DIR)}/${e.file}`).join('\n') + '\n',
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
 * 顶层键集必须恰好是规范的 10 个键（且顺序不可调换），8 组闭合枚举的取值必须与规范完全一致。
 * 否则「契约和总入口对不对得上」这条检查会退化成无错即过的空断言。
 *
 * 返回 { keySetOk }：键集不对时，枚举检查与 master 对齐检查都不该跑 ——
 * 拿一个错的键集去核对别的，会报出一堆方向相反的噪音。
 */
function checkSchemaShape(errors, schema) {
  if (!schema) return { keySetOk: false };
  const required = Array.isArray(schema.required) ? schema.required : [];
  if (required.length === 0) {
    errors.push('契约 schema 缺少非空的 required 数组');
    return { keySetOk: false };
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
  const keySetOk = JSON.stringify(actualKeys) === JSON.stringify(wantedKeys);
  if (!keySetOk) {
    errors.push(`契约 schema 顶层键集不对：应为 [${CONTRACT_TOP_LEVEL_KEYS.join(' / ')}]，实际 [${required.join(' / ')}]`);
    ok = false;
    // 键集不对 → 下面那些「某枚举在哪」的报错全是噪音，不再报
    return { keySetOk: false };
  }

  // 顶层键的顺序也是规范的一部分（推进顺序不可调换，顺序即输出顺序）
  if (JSON.stringify(required) !== JSON.stringify(CONTRACT_TOP_LEVEL_KEYS)) {
    errors.push(`契约 schema 顶层键顺序不对：应为 [${CONTRACT_TOP_LEVEL_KEYS.join(' / ')}]，实际 [${required.join(' / ')}]`);
    ok = false;
  }

  // 嵌套形状：13 个对象节点的属性集 + required 集必须与规范逐字相等，
  // 且不得多出规范之外的对象节点（顶层键集已对上了才跑，否则下面的报错全是噪音）
  if (!checkContractObjectShape(errors, schema)) ok = false;

  // 每个属性叶子都必须声明 type（数组的 items 也必须有）——
  // 形状常量只钉属性名与 required，叶子的 type 关键字被删掉时它是静默的
  if (!checkContractLeafTypes(errors, schema)) ok = false;

  // 8 个数组必须声明 minItems >= 1 —— 空数组的样例只覆盖了半边
  for (const spec of CONTRACT_ARRAY_MIN_ITEMS) {
    const label = spec.join('.');
    const node = resolveSchemaNode(schema, spec);
    if (!node || node.type !== 'array') {
      errors.push(`契约 schema 缺少数组定义：${label}`);
      ok = false;
      continue;
    }
    if (!(typeof node.minItems === 'number' && node.minItems >= 1)) {
      const actual = node.minItems === undefined ? '未声明' : node.minItems;
      errors.push(`契约 schema 的数组必须声明 minItems >= 1：${label}（实际 ${actual}）`);
      ok = false;
    }
  }

  // 豁免路径：ciXi（辅药）允许为空，且**不得**声明 minItems >= 1 ——
  // 一旦被加回去，就等于逼模型为本没有次喜的命例编一个次喜出来。
  for (const spec of CONTRACT_ARRAY_OPTIONAL) {
    const label = spec.join('.');
    const node = resolveSchemaNode(schema, spec);
    if (!node || node.type !== 'array') {
      errors.push(`契约 schema 缺少数组定义：${label}`);
      ok = false;
      continue;
    }
    if (typeof node.minItems === 'number' && node.minItems >= 1) {
      errors.push(`契约 schema 的数组不得声明 minItems >= 1：${label}（实际 ${node.minItems}）—— ciXi 是次喜（辅助用神，可选），允许为空；声明 minItems>=1 会逼模型编造次喜`);
      ok = false;
    }
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
  return { keySetOk: true, ok };
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
 * schema 校验一遍。
 *
 * 「契约 md 在、样例不在」= 报红：契约出来了却没有基准样例，
 * 「契约能校验一份真实输出」这条腿就静默消失了（样例文件不存在时静默返回 = 0 错）。
 * 「两者都不在」（Task 1 阶段）= 不报：那时样例本来就不该存在。
 */
function checkSchemaSample(root, schema, errors) {
  const schemaMd = path.join(root, 'docs', 'CAREER_SCHEMA.md');
  const sampleFile = path.join(root, 'docs', 'CAREER_SCHEMA.sample.json');
  const schemaMdExists = fs.existsSync(schemaMd);
  const sampleExists = fs.existsSync(sampleFile);

  if (!schemaMdExists) {
    // 契约 md 都没有 —— readSchema 已经报过「缺少 docs/CAREER_SCHEMA.md」；样例先放着不管
    return;
  }
  if (!sampleExists) {
    errors.push('缺少基准样例 docs/CAREER_SCHEMA.sample.json（契约已存在，基准样例必须同时存在）');
    return;
  }
  if (!schema) return; // 契约 md 有问题（解析失败/没有 json 块），已经报过了

  let sample;
  try {
    sample = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));
  } catch (e) {
    errors.push(`契约样例 docs/CAREER_SCHEMA.sample.json: JSON 解析失败 —— ${e.message}`);
    return;
  }
  // 样例的顶层键集必须恰好是规范那 10 个键：少一个 = 只覆盖了半边，
  // 多一个 = 契约管不住它（样例里有契约不认的东西，等于没人管）。
  // 这一条补上「多余顶层键能蒙混过关」那一半 —— 它是评审提的那半，schema-check.js 没有 additionalProperties。
  //
  // missingPaths 记下「已经报过的缺字段」的全路径，末尾用来把 checkValue 的
  // 同一条「必填字段缺失」去掉（Minor 2：同一个问题不许报两条错）。
  const missingPaths = new Set();
  if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
    const sampleKeys = Object.keys(sample).sort();
    const wantedKeys = CONTRACT_TOP_LEVEL_KEYS.slice().sort();
    for (const k of wantedKeys) {
      if (!sampleKeys.includes(k)) {
        errors.push(`契约样例 docs/CAREER_SCHEMA.sample.json 顶层键集不对：缺少 ${k}`);
        missingPaths.add(`$.${k}`);
      }
    }
    for (const k of sampleKeys) {
      if (!wantedKeys.includes(k)) {
        errors.push(`契约样例 docs/CAREER_SCHEMA.sample.json 顶层键集不对：多出 ${k}`);
      }
    }
  }
  // 嵌套层：每一级对象的键必须恰好是契约该节点定义的键。
  // 「多」的那一半 schema-check.js 查不出来（它没有 additionalProperties），这里补上；
  // 「少」的那一半由 checkValue 的「必填字段缺失」兜着 —— 契约的嵌套 required
  // 已经被 checkContractObjectShape 钉死，所以那一半不会被削弱掉。
  const schemaProps = (schema.properties && typeof schema.properties === 'object') ? schema.properties : {};
  if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
    for (const [key, sub] of Object.entries(schemaProps)) {
      if (Object.prototype.hasOwnProperty.call(sample, key)) {
        checkSampleShape(errors, sub, sample[key], `$.${key}`, missingPaths);
      }
    }
  }
  const sub = [];
  checkValue(sample, schema, '$', sub);
  for (const e of sub) {
    // 同一个「缺字段」问题上面已经报过了 —— 别再报一遍（Minor 2）
    const m = /^(.+): 必填字段缺失$/.exec(e);
    if (m && missingPaths.has(m[1])) continue;
    errors.push(`契约样例 docs/CAREER_SCHEMA.sample.json 不符合契约: ${e}`);
  }
}

/**
 * 递归比对样例与契约的键集（每一级对象）。
 * 路径标签与 schema-check.js 的路径写法一致（'$' / '$.case' / '$.timeline[0]'），
 * 这样「缺字段」的路径能一一对上，重复报错才能被消掉。
 */
function checkSampleShape(errors, schemaNode, sampleNode, label, missingPaths) {
  if (!schemaNode || typeof schemaNode !== 'object') return;
  if (schemaNode.type === 'object' || schemaNode.properties) {
    // 类型不对（不是对象）由 checkValue 报「期望 object」—— 这里不重复报
    if (!sampleNode || typeof sampleNode !== 'object' || Array.isArray(sampleNode)) return;
    const props = (schemaNode.properties && typeof schemaNode.properties === 'object') ? schemaNode.properties : {};
    const propKeys = Object.keys(props);
    for (const key of Object.keys(sampleNode)) {
      if (!propKeys.includes(key)) {
        errors.push(`契约样例 docs/CAREER_SCHEMA.sample.json 嵌套键集不对：${label} 多出 ${key}`);
      }
    }
    for (const key of (Array.isArray(schemaNode.required) ? schemaNode.required : [])) {
      if (!Object.prototype.hasOwnProperty.call(sampleNode, key)) {
        errors.push(`契约样例 docs/CAREER_SCHEMA.sample.json 嵌套键集不对：${label} 缺少 ${key}`);
        missingPaths.add(`${label}.${key}`);
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (Object.prototype.hasOwnProperty.call(sampleNode, key)) {
        checkSampleShape(errors, sub, sampleNode[key], `${label}.${key}`, missingPaths);
      }
    }
    return;
  }
  if (schemaNode.type === 'array') {
    if (!Array.isArray(sampleNode)) return;
    sampleNode.forEach((item, i) => checkSampleShape(errors, schemaNode.items, item, `${label}[${i}]`, missingPaths));
  }
}

/**
 * Task 8 的四份过程文档。
 * Task 8 之前它们不存在（仓库里只有一个空的 candidates/ 占位目录），所以「该不该报」要看阶段：
 *   - 四份里至少有一份已经出现（Task 8 开工了）→ 四份必须齐全且非空；
 *   - opts.expectCandidates 为真（收尾核验时显式要求）→ 同上；
 *   - 否则（Task 1~7 阶段）→ 不报。
 */
function checkCandidates(errors, dir, opts) {
  const cdir = path.join(dir, 'candidates');
  // 「Task 8 开工了」的判据：这四份里**至少有一份**已经出现。
  // （目录本身在 Task 1 阶段就是个空的占位目录，不能拿目录存在与否当判据。）
  const started = CANDIDATE_FILES.some((f) => fs.existsSync(path.join(cdir, f)));
  if (!started && opts.expectCandidates !== true) return;
  for (const f of CANDIDATE_FILES) {
    const p = path.join(cdir, f);
    if (!fs.existsSync(p)) {
      errors.push(`candidates/ 缺少 ${f}`);
      continue;
    }
    if (!fs.readFileSync(p, 'utf8').trim()) {
      errors.push(`candidates/${f} 内容为空`);
    }
  }
}

function run(root, opts = {}) {
  const errors = [];
  const dir = path.join(root, SKILL_DIR);

  errors.push(...baseline(root, opts));

  const schema = readSchema(root, errors);
  const shape = checkSchemaShape(errors, schema);
  checkSchemaSample(root, schema, errors);

  // 已有基线 skill：结构检查（规范文件不在此列；A2 不对基线强制）
  // 新 skill 由下面的 NEW_SKILLS 循环统一负责（那一轮 requireA2=true 更严），
  // 这里必须跳过，否则同一个缺陷会被报 2~3 次。
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    errors.push(`缺少 ${gitPath(SKILL_DIR)} 目录 —— ${e.message}`);
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

    // 键集不对时不做对齐 —— 拿错的键集去核对 master，只会报出一堆方向相反的噪音
    if (isMaster && shape.keySetOk) checkMasterAlignment(errors, schema, text);
  }

  // Task 8 的四份过程文档（阶段判定见 checkCandidates）
  checkCandidates(errors, dir, opts);

  return { ok: errors.length === 0, errors };
}

module.exports = {
  run, baseline, NEW_SKILLS, REQUIRED_TERMS, MUTABLE_BASELINE,
  BASELINE_FILE_COUNT, BASELINE_COMMIT, CANDIDATE_FILES,
  CONTRACT_TOP_LEVEL_KEYS, CONTRACT_ENUMS, CONTRACT_ARRAY_MIN_ITEMS,
  CONTRACT_ARRAY_OPTIONAL, CONTRACT_OBJECT_SHAPE, CONTRACT_LEAF_TYPES, REFERENCE_DIR, mentionsKey,
};

if (require.main === module) {
  const opts = {};
  // 收尾核验时显式要求 Task 8 的四份过程文档（Task 8 之前不该存在，不该报）
  if (process.argv.includes('--expect-candidates') || process.env.SEG2_EXPECT_CANDIDATES === '1') {
    opts.expectCandidates = true;
  }
  // 锚点不再能被任何环境变量换掉：唯一的锚是 BASELINE_COMMIT，
  // 换锚点只能走函数参数 run(root, { baselineCommit })（测试专用）。
  // 可选的位置参数 = 要校验的仓库根（测试用：让端到端测试能指向一个被篡改的临时克隆）。
  // 它只决定「校验哪棵树」，不决定「锚在哪」—— 锚永远固定为 BASELINE_COMMIT。
  const rootArg = process.argv.slice(2).find((a) => !a.startsWith('-'));
  const result = run(rootArg ? path.resolve(rootArg) : ROOT, opts);
  if (result.ok) {
    console.log('✓ 全部校验通过');
  } else {
    console.error(`✗ ${result.errors.length} 项校验失败：`);
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exitCode = 1;
  }
}
