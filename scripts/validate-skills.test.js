'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const validate = require('./validate-skills');

// ---------------------------------------------------------------------------
// 独立于校验器的「规范」副本 —— 这里是测试自己的真值来源。
// 校验器里也有一份常量；两份必须一致，否则下面的行为测试会红。
// ---------------------------------------------------------------------------

const EXPECTED_TOP_KEYS = [
  'case', 'monthCommand', 'pattern', 'tiaoHou', 'xiJi',
  'boundaries', 'playbooks', 'timeline', 'transition', 'summary',
];

const EXPECTED_ENUMS = [
  { path: ['pattern', 'verdict'], values: ['成格', '破格', '不清'] },
  { path: ['tiaoHou', 'climateType'], values: ['寒局', '燥热局', '湿重局', '燥硬局', '春木旺局', '秋金肃局'] },
  { path: ['tiaoHou', 'drugStatus'], values: ['真药', '藏药', '假药'] },
  { path: ['playbooks[]', 'scale'], values: ['早期', '轻创业', '重资产', '合伙'] },
  { path: ['timeline[]', 'type'], values: ['水运', '木运', '火运', '土运', '金运'] },
  { path: ['timeline[]', 'verdict'], values: ['重仓', '轻试', '守成'] },
  { path: ['timeline[]', 'liunianWindows[]', 'action'], values: ['宜', '忌'] },
  { path: ['summary', 'strategy'], values: ['主业重仓', '底盘待机', '守成缓投'] },
];

const EXPECTED_BASELINE_COUNT = 42;

const CANONICAL_SCHEMA = {
  "type": "object",
  "required": [
    "case",
    "monthCommand",
    "pattern",
    "tiaoHou",
    "xiJi",
    "boundaries",
    "playbooks",
    "timeline",
    "transition",
    "summary"
  ],
  "properties": {
    "case": {
      "type": "object",
      "required": [
        "gender",
        "pillars"
      ],
      "properties": {
        "gender": {
          "type": "string"
        },
        "pillars": {
          "type": "object",
          "required": [
            "year",
            "month",
            "day",
            "hour"
          ],
          "properties": {
            "year": {
              "type": "string"
            },
            "month": {
              "type": "string"
            },
            "day": {
              "type": "string"
            },
            "hour": {
              "type": "string"
            }
          }
        }
      }
    },
    "monthCommand": {
      "type": "object",
      "required": [
        "monthBranch",
        "dayMaster",
        "seasonClimate",
        "verdict"
      ],
      "properties": {
        "monthBranch": {
          "type": "string"
        },
        "dayMaster": {
          "type": "string"
        },
        "seasonClimate": {
          "type": "string"
        },
        "verdict": {
          "type": "string"
        }
      }
    },
    "pattern": {
      "type": "object",
      "required": [
        "type",
        "verdict",
        "storeHouse",
        "reasoning"
      ],
      "properties": {
        "type": {
          "type": "string"
        },
        "verdict": {
          "type": "string",
          "enum": [
            "成格",
            "破格",
            "不清"
          ]
        },
        "storeHouse": {
          "type": "string"
        },
        "reasoning": {
          "type": "string"
        }
      }
    },
    "tiaoHou": {
      "type": "object",
      "required": [
        "climateType",
        "primaryDrug",
        "secondaryDrug",
        "drugStatus",
        "drugReasoning",
        "gap"
      ],
      "properties": {
        "climateType": {
          "type": "string",
          "enum": [
            "寒局",
            "燥热局",
            "湿重局",
            "燥硬局",
            "春木旺局",
            "秋金肃局"
          ]
        },
        "primaryDrug": {
          "type": "string"
        },
        "secondaryDrug": {
          "type": "string"
        },
        "drugStatus": {
          "type": "string",
          "enum": [
            "真药",
            "藏药",
            "假药"
          ]
        },
        "drugReasoning": {
          "type": "string"
        },
        "gap": {
          "type": "string"
        }
      }
    },
    "xiJi": {
      "type": "object",
      "required": [
        "xi",
        "ciXi",
        "ji"
      ],
      "properties": {
        "xi": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "ciXi": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "ji": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "boundaries": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "element",
          "why",
          "condition"
        ],
        "properties": {
          "element": {
            "type": "string"
          },
          "why": {
            "type": "string"
          },
          "condition": {
            "type": "string"
          }
        }
      }
    },
    "playbooks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "scale",
          "condition",
          "actions"
        ],
        "properties": {
          "scale": {
            "type": "string",
            "enum": [
              "早期",
              "轻创业",
              "重资产",
              "合伙"
            ]
          },
          "condition": {
            "type": "string"
          },
          "actions": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      }
    },
    "timeline": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "ganZhi",
          "type",
          "verdict",
          "mainTrack",
          "playbook",
          "liunianWindows"
        ],
        "properties": {
          "ganZhi": {
            "type": "string"
          },
          "type": {
            "type": "string",
            "enum": [
              "水运",
              "木运",
              "火运",
              "土运",
              "金运"
            ]
          },
          "verdict": {
            "type": "string",
            "enum": [
              "重仓",
              "轻试",
              "守成"
            ]
          },
          "mainTrack": {
            "type": "string"
          },
          "playbook": {
            "type": "string"
          },
          "liunianWindows": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "year",
                "signal",
                "action"
              ],
              "properties": {
                "year": {
                  "type": "integer"
                },
                "signal": {
                  "type": "string"
                },
                "action": {
                  "type": "string",
                  "enum": [
                    "宜",
                    "忌"
                  ]
                }
              }
            }
          }
        }
      }
    },
    "transition": {
      "type": "object",
      "required": [
        "risk",
        "advice"
      ],
      "properties": {
        "risk": {
          "type": "string"
        },
        "advice": {
          "type": "string"
        }
      }
    },
    "summary": {
      "type": "object",
      "required": [
        "strategy",
        "notes"
      ],
      "properties": {
        "strategy": {
          "type": "string",
          "enum": [
            "主业重仓",
            "底盘待机",
            "守成缓投"
          ]
        },
        "notes": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  }
};

const CANONICAL_SAMPLE = {
  "case": {
    "gender": "男",
    "pillars": {
      "year": "戊辰",
      "month": "己未",
      "day": "乙亥",
      "hour": "乙酉"
    }
  },
  "monthCommand": {
    "monthBranch": "未",
    "dayMaster": "乙木",
    "seasonClimate": "季夏燥土",
    "verdict": "财星当令，财多身难独担"
  },
  "pattern": {
    "type": "财格",
    "verdict": "成格",
    "storeHouse": "辰为水库，未为燥土财库，双库夹局",
    "reasoning": "财库厚而闭"
  },
  "tiaoHou": {
    "climateType": "燥热局",
    "primaryDrug": "癸水",
    "secondaryDrug": "丙火",
    "drugStatus": "藏药",
    "drugReasoning": "亥藏壬水有润根，戊己厚土克水",
    "gap": "原局无丙透，缺阳光泄秀通关"
  },
  "xiJi": {
    "xi": [
      "水（印）",
      "木（比劫）"
    ],
    "ciXi": [
      "丙火"
    ],
    "ji": [
      "叠土",
      "叠金"
    ]
  },
  "boundaries": [
    {
      "element": "土金赛道",
      "why": "财重压身、杀重克身",
      "condition": "须有水木通关，方可轻碰"
    }
  ],
  "playbooks": [
    {
      "scale": "轻创业",
      "condition": "水印流通之年",
      "actions": [
        "咨询工作室",
        "独立方案团队"
      ]
    }
  ],
  "timeline": [
    {
      "ganZhi": "亥子",
      "type": "水运",
      "verdict": "重仓",
      "mainTrack": "深耕专业、铺底盘",
      "playbook": "早期",
      "liunianWindows": [
        {
          "year": 2030,
          "signal": "透出调候用神",
          "action": "宜"
        }
      ]
    }
  ],
  "transition": {
    "risk": "藤萝根基未稳，见财心动、盲目重仓",
    "advice": "交运前后一两年不新开长线重资产盘"
  },
  "summary": {
    "strategy": "底盘待机",
    "notes": [
      "喜水木，忌叠土叠金"
    ]
  }
};

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

/**
 * 造一个临时 git 仓库：
 *  - skills/bazi-tuipan/ 下先放 42 个基线占位文件，**单独提交** —— 这就是「基线提交」，
 *    校验器拿它当信任锚（真实仓库里那个锚是 f7bd915）；
 *  - 再放新 skill / docs / 清单 —— 清单与新 skill 都不进基线提交，与真实仓库一致
 *    （真实仓库的 .baseline-manifest.txt 也不在 f7bd915 里）。
 *
 * 返回的 root 对应的基线提交 SHA 记在 BASELINE_COMMITS 里。
 */
function makeRepo(skillFiles = {}, opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seg2-'));
  const dir = path.join(root, 'skills', 'bazi-tuipan');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  for (const [rel, content] of Object.entries(skillFiles)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  gitInit(root);
  const names = writeBaselinePlaceholders(root, opts.baselineCount === undefined ? EXPECTED_BASELINE_COUNT : opts.baselineCount);
  // 只把这 42 个占位文件放进这次提交
  // （stderr 丢掉：core.autocrlf=true 会让 git 对每个文件打一行 CRLF 警告，噪音太大）
  execFileSync('git', ['add', '--', ...names.map((n) => `skills/bazi-tuipan/${n}`)], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
  execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=测试', 'commit', '-q', '-m', 'baseline'], { cwd: root });
  BASELINE_COMMITS.set(root, execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
  if (!opts.noManifest) {
    const shas = hashAll(root, names);
    writeManifest(root, opts.manifestEntries || names.map((file, i) => ({ file, sha: shas[i] })));
  }
  return root;
}

/** 临时目录必须先 git init，否则 git hash-object 在仓库外算出的 blob 与仓库内不同 */
function gitInit(root) {
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  return root;
}

/** 每个夹具仓库的「基线提交」SHA —— 校验器拿它当信任锚 */
const BASELINE_COMMITS = new Map();

/** 校验器默认锚在真实仓库的 f7bd915 上；测试里要锚到夹具自己的基线提交 */
function run(root, opts = {}) {
  return validate.run(root, { baselineCommit: BASELINE_COMMITS.get(root), ...opts });
}

function baseline(root, opts = {}) {
  return validate.baseline(root, { baselineCommit: BASELINE_COMMITS.get(root), ...opts });
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

/**
 * 造基线占位文件（含 6 个允许变动的顶层文档 + 若干普通文件），返回它们的相对路径。
 * 名字必须和真实仓库一样：那 6 个可变文档在清单里也占位置。
 */
function writeBaselinePlaceholders(root, count = EXPECTED_BASELINE_COUNT) {
  const names = [];
  for (const m of validate.MUTABLE_BASELINE) {
    fs.writeFileSync(path.join(root, 'skills', 'bazi-tuipan', m), `# ${m}\n\n基线占位\n`);
    names.push(m);
  }
  for (let i = 1; i <= count - validate.MUTABLE_BASELINE.size; i += 1) {
    const n = String(i).padStart(2, '0');
    const name = `base-${n}.md`;
    fs.writeFileSync(path.join(root, 'skills', 'bazi-tuipan', name), `基线占位 ${n}\n`);
    names.push(name);
  }
  return names;
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

function schemaMd(schema) {
  return '# 事业推理契约\n\n```json\n' + JSON.stringify(schema, null, 2) + '\n```\n';
}

/** 按 validate.REQUIRED_TERMS 自动生成合规的 skill 正文，术语表变了测试也不会失效 */
function skillDoc(name, execBody = '1. 做点事') {
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

${execBody}
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

/** master 的 Execution 段必须点名全部 10 个契约顶层键 */
const MASTER_EXEC = '2. 产出 case / monthCommand / pattern / tiaoHou / xiJi / boundaries / playbooks / timeline / transition / summary 十个顶层段';

/**
 * 造一个「完全合规」的仓库：
 * 5 个新 skill + 规范契约 + 契约样例 + 42 个基线占位文件 + 正确的 manifest。
 */
function makeCompliantRepo(overrides = {}) {
  const files = {};
  for (const name of validate.NEW_SKILLS) {
    if (name === 'shiye-master') {
      files['shiye-master.skill.md'] = skillDoc(name, overrides.masterExec === undefined ? MASTER_EXEC : overrides.masterExec);
    } else {
      files[`${name}/SKILL.md`] = skillDoc(name);
    }
    files[`${name}/test-prompts.json`] = promptsJson(name);
  }
  const root = makeRepo(files, {
    baselineCount: overrides.baselineCount === undefined ? EXPECTED_BASELINE_COUNT : overrides.baselineCount,
    manifestEntries: overrides.manifestEntries,
  });

  for (const [rel, content] of Object.entries(overrides.extraFiles || {})) {
    const full = path.join(root, 'skills', 'bazi-tuipan', rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  const schema = overrides.schema || CANONICAL_SCHEMA;
  if (!overrides.skipSchema) {
    fs.writeFileSync(path.join(root, 'docs', 'CAREER_SCHEMA.md'), overrides.schemaMd || schemaMd(schema));
  }
  if (!overrides.skipSample) {
    const sample = overrides.sample === undefined ? CANONICAL_SAMPLE : overrides.sample;
    // 字符串按原样写（用来造「JSON 解析失败」），其余按 JSON 写
    fs.writeFileSync(path.join(root, 'docs', 'CAREER_SCHEMA.sample.json'),
      typeof sample === 'string' ? sample : JSON.stringify(sample, null, 2));
  }
  return root;
}

/** 深拷贝一份 schema 并按路径改枚举（路径里的 'x[]' 表示数组 items） */
function withEnum(schema, pathParts, values) {
  const clone = JSON.parse(JSON.stringify(schema));
  let node = clone;
  for (const raw of pathParts) {
    const isArray = raw.endsWith('[]');
    const name = isArray ? raw.slice(0, -2) : raw;
    node = node.properties[name];
    if (isArray) node = node.items;
  }
  node.enum = values;
  return clone;
}

/** 按同样的路径写法改样例里的取值（'x[]' 表示取数组第一项） */
function setSampleValue(sample, pathParts, value) {
  const clone = JSON.parse(JSON.stringify(sample));
  const segs = pathParts.map((s) => (s.endsWith('[]') ? s.slice(0, -2) : s));
  let node = clone;
  for (let i = 0; i < segs.length - 1; i += 1) {
    node = Array.isArray(node[segs[i]]) ? node[segs[i]][0] : node[segs[i]];
  }
  node[segs[segs.length - 1]] = value;
  return clone;
}

// ---------------------------------------------------------------------------
// 原有 7 条（第一轮）
// ---------------------------------------------------------------------------

test('缺 Interpretation 段被报出', () => {
  const root = makeRepo({ 'tiaohou-shiye/SKILL.md': GOOD.replace('## Interpretation（核心方法论）', '## 其他') });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('缺少 ## Interpretation')));
});

test('Interpretation 段混入格式指令被报出', () => {
  const bad = GOOD.replace('生机赛道', '生机赛道 输出 JSON 字段名');
  const root = makeRepo({ 'tiaohou-shiye/SKILL.md': bad });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('流程/格式指令')));
});

test('缺必需术语被报出', () => {
  const root = makeRepo({ 'tiaohou-shiye/SKILL.md': GOOD.replace('寒局', '') });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('缺少必需术语 "寒局"')));
});

test('frontmatter name 与目录名不符被报出', () => {
  const root = makeRepo({ 'tiaohou-shiye/SKILL.md': GOOD.replace('name: tiaohou-shiye', 'name: 别的') });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('与目录名不一致')));
});

test('test-prompts 缺少诱饵条目被报出', () => {
  const root = makeRepo({
    'tiaohou-shiye/SKILL.md': GOOD,
    'tiaohou-shiye/test-prompts.json': JSON.stringify([
      { id: 'a', prompt: 'p', expected_skill: 'tiaohou-shiye', should_fire: true, category: '应触发', note: 'n' },
    ]),
  });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('缺少诱饵条目')));
});

test('test-prompts 的 id 重复被报出', () => {
  const item = { id: 'a', prompt: 'p', expected_skill: 'tiaohou-shiye', should_fire: true, category: '应触发', note: 'n' };
  const root = makeRepo({
    'tiaohou-shiye/SKILL.md': GOOD,
    'tiaohou-shiye/test-prompts.json': JSON.stringify([item, { ...item }]),
  });
  const r = run(root);
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
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('expected_skill')));
});

// ---------------------------------------------------------------------------
// 第一轮：Important 1 —— 契约对齐不许静默变成空断言
// ---------------------------------------------------------------------------

test('契约 schema 缺 required 数组被报出', () => {
  const root = makeCompliantRepo({ schema: { type: 'object', properties: {} } });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('契约 schema 缺少非空的 required 数组')), r.errors.join('\n'));
});

test('契约 schema 的 required 为空数组被报出', () => {
  const root = makeCompliantRepo({ schema: { type: 'object', required: [], properties: {} } });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('契约 schema 缺少非空的 required 数组')), r.errors.join('\n'));
});

test('契约 schema 的 required 键未在 properties 中定义被报出', () => {
  const root = makeCompliantRepo({
    schema: { type: 'object', required: ['case'], properties: { other: { type: 'string' } } },
  });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('required 顶层键 "case" 未在 properties 中定义')), r.errors.join('\n'));
});

test('契约 schema 的 properties 键未列入 required 被报出', () => {
  const root = makeCompliantRepo({
    schema: { type: 'object', required: ['case'], properties: { case: { type: 'string' }, extra: { type: 'string' } } },
  });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('properties 顶层键 "extra" 未列入 required')), r.errors.join('\n'));
});

// ---------------------------------------------------------------------------
// 第一轮：Important 2 —— 基线守卫不许静默失效
// ---------------------------------------------------------------------------

test('缺少基线清单被报出', () => {
  const root = makeRepo({ 'notes.md': 'x\n' }, { noManifest: true });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('缺少基线清单')), r.errors.join('\n'));
});

test('缺少基线清单时 baseline() 返回一条问题而不是空数组', () => {
  const root = makeRepo({ 'notes.md': 'x\n' }, { noManifest: true });
  const problems = baseline(root);
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /缺少基线清单/);
});

// ---------------------------------------------------------------------------
// 第一轮：Important 3 —— 畸形输入不许崩
// ---------------------------------------------------------------------------

test('test-prompts 条目不是对象时不崩且报错', () => {
  const root = makeRepo({
    'tiaohou-shiye/SKILL.md': GOOD,
    'tiaohou-shiye/test-prompts.json': JSON.stringify(['not-an-object']),
  });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('条目必须是对象')), r.errors.join('\n'));
});

test('test-prompts 条目是 null 时不崩且报错', () => {
  const root = makeRepo({
    'tiaohou-shiye/SKILL.md': GOOD,
    'tiaohou-shiye/test-prompts.json': JSON.stringify([null]),
  });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('条目必须是对象')), r.errors.join('\n'));
});

test('test-prompts 顶层不是数组时报错不崩', () => {
  const root = makeRepo({
    'tiaohou-shiye/SKILL.md': GOOD,
    'tiaohou-shiye/test-prompts.json': JSON.stringify({ a: 1 }),
  });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('顶层必须是数组')), r.errors.join('\n'));
});

// ---------------------------------------------------------------------------
// 第一轮：Important 4 —— 同一个缺陷不许被重复报
// ---------------------------------------------------------------------------

test('子 skill 缺 Interpretation 段只报一次', () => {
  const root = makeCompliantRepo();
  const p = path.join(root, 'skills', 'bazi-tuipan', 'geshi-shiye', 'SKILL.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('## Interpretation（核心方法论）', '## 其他'));
  const r = run(root);
  const hits = r.errors.filter((e) => e.includes('geshi-shiye: 缺少 ## Interpretation'));
  assert.strictEqual(hits.length, 1, r.errors.join('\n'));
});

test('子 skill 缺 Execution 段只报一次', () => {
  const root = makeCompliantRepo();
  const p = path.join(root, 'skills', 'bazi-tuipan', 'wuxing-shiye', 'SKILL.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('## Execution（执行步骤）', '## 其他'));
  const r = run(root);
  const hits = r.errors.filter((e) => e.includes('wuxing-shiye: 缺少 ## Execution'));
  assert.strictEqual(hits.length, 1, r.errors.join('\n'));
});

test('shiye-master 缺 Execution 段只报一次', () => {
  const root = makeCompliantRepo();
  const p = path.join(root, 'skills', 'bazi-tuipan', 'shiye-master.skill.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('## Execution（执行步骤）', '## 其他'));
  const r = run(root);
  const hits = r.errors.filter((e) => e.includes('shiye-master: 缺少 ## Execution'));
  assert.strictEqual(hits.length, 1, r.errors.join('\n'));
  assert.ok(!r.errors.some((e) => e.includes('未点名契约顶层键')), r.errors.join('\n'));
});

// ---------------------------------------------------------------------------
// 第一轮：Important 5 —— 契约样例校验
// ---------------------------------------------------------------------------

test('契约样例不符合契约时报错', () => {
  const bad = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  bad.pattern.verdict = '格局很好';
  const root = makeCompliantRepo({ sample: bad });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('CAREER_SCHEMA.sample.json') && e.includes('枚举')), r.errors.join('\n'));
});

test('契约样例文件不存在时报「缺少基准样例」（契约在、样例不在）', () => {
  const root = makeCompliantRepo({ skipSample: true });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('缺少基准样例')), r.errors.join('\n'));
});

// ---------------------------------------------------------------------------
// 第一轮：Minor —— 可变顶层文档、缺目录、批量 hash、基线守卫测试
// ---------------------------------------------------------------------------

test('可变顶层文档被删掉也报「基线文件丢失」', () => {
  const root = makeCompliantRepo();
  fs.rmSync(path.join(root, 'skills', 'bazi-tuipan', 'BOOK_OVERVIEW.md'));
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('基线文件丢失: BOOK_OVERVIEW.md')), r.errors.join('\n'));
});

test('可变顶层文档内容被改不报「基线文件被改动」', () => {
  const root = makeCompliantRepo();
  fs.writeFileSync(path.join(root, 'skills', 'bazi-tuipan', 'BOOK_OVERVIEW.md'), '随便改改\n');
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('基线文件被改动: BOOK_OVERVIEW.md')), r.errors.join('\n'));
});

test('缺少 skills/bazi-tuipan 目录时报错不崩', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seg2-'));
  gitInit(root);
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('缺少 skills/bazi-tuipan 目录')), r.errors.join('\n'));
});

test('基线文件被篡改时被报出', () => {
  const root = makeCompliantRepo();
  fs.writeFileSync(path.join(root, 'skills', 'bazi-tuipan', 'base-01.md'), '被改了！\n');
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('基线文件被改动: base-01.md')), r.errors.join('\n'));
});

test('基线文件丢失时被报出', () => {
  const root = makeCompliantRepo();
  fs.rmSync(path.join(root, 'skills', 'bazi-tuipan', 'base-01.md'));
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('基线文件丢失: base-01.md')), r.errors.join('\n'));
});

test('基线一致时不报任何基线问题', () => {
  const root = makeCompliantRepo();
  const problems = baseline(root);
  assert.deepStrictEqual(problems, []);
});

test('完全合规的仓库 run() 返回 ok === true', () => {
  const root = makeCompliantRepo();
  const r = run(root);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.ok, true);
});

// ---------------------------------------------------------------------------
// 第一轮：Minor —— 「字段名」收窄到列举语境
// ---------------------------------------------------------------------------

test('Interpretation 段写「字段名称」这类正当描述不误报', () => {
  const doc = GOOD.replace('生机赛道', '生机赛道 字段名称的定义');
  const root = makeRepo({ 'tiaohou-shiye/SKILL.md': doc });
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('流程/格式指令')), r.errors.join('\n'));
});

test('Interpretation 段写「字段名:」这种列举仍被报出', () => {
  const doc = GOOD.replace('生机赛道', '生机赛道 字段名: year');
  const root = makeRepo({ 'tiaohou-shiye/SKILL.md': doc });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('流程/格式指令')), r.errors.join('\n'));
});

// ===========================================================================
// 第二轮：Important 1 —— master 的 Execution 段「标题在但正文为空」
// ===========================================================================

test('master 的 Execution 段标题在但正文为空时报错', () => {
  const root = makeCompliantRepo({ masterExec: '' });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('Execution 段正文为空')), r.errors.join('\n'));
  assert.ok(r.errors.some((e) => e.includes('未点名')), r.errors.join('\n'));
});

test('master 的 Execution 段正文非空但没点名任何契约键时报错', () => {
  const root = makeCompliantRepo({ masterExec: '2. 做点别的事' });
  const r = run(root);
  const hits = r.errors.filter((e) => e.includes('未点名契约顶层键'));
  assert.strictEqual(hits.length, EXPECTED_TOP_KEYS.length, r.errors.join('\n'));
});

test('master 的 Execution 段正文为空时不被当成「缺 Execution 段」重复报', () => {
  const root = makeCompliantRepo({ masterExec: '' });
  const r = run(root);
  assert.strictEqual(r.errors.filter((e) => e.includes('shiye-master: 缺少 ## Execution')).length, 0, r.errors.join('\n'));
});

// ===========================================================================
// 第二轮：Important 2 —— manifest 被截断 / 写坏
// ===========================================================================

test('基线清单条目数不是 42 时报错', () => {
  const root = makeCompliantRepo();
  const p = path.join(root, 'skills', 'bazi-tuipan', '.baseline-manifest.txt');
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  fs.writeFileSync(p, lines.slice(0, 41).join('\n') + '\n');
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('条目数') && e.includes('42')), r.errors.join('\n'));
});

test('基线清单只剩注释行时报错', () => {
  const root = makeCompliantRepo();
  fs.writeFileSync(path.join(root, 'skills', 'bazi-tuipan', '.baseline-manifest.txt'),
    '# 基线文件 blob 清单\n# 格式: <sha1>  <路径>\n');
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('条目数')), r.errors.join('\n'));
});

test('基线清单内容全是垃圾行时报错', () => {
  const root = makeCompliantRepo();
  const junk = [];
  for (let i = 0; i < 42; i += 1) junk.push('<<<<<<< HEAD');
  fs.writeFileSync(path.join(root, 'skills', 'bazi-tuipan', '.baseline-manifest.txt'), junk.join('\n') + '\n');
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('条目数') || e.includes('无法解析')), r.errors.join('\n'));
});

test('基线清单有无法解析的行时报错', () => {
  const root = makeCompliantRepo();
  const p = path.join(root, 'skills', 'bazi-tuipan', '.baseline-manifest.txt');
  fs.appendFileSync(p, '这是一行垃圾\n');
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('无法解析')), r.errors.join('\n'));
});

test('基线清单有重复条目时报错', () => {
  const root = makeCompliantRepo();
  const p = path.join(root, 'skills', 'bazi-tuipan', '.baseline-manifest.txt');
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  lines[1] = lines[0];
  fs.writeFileSync(p, lines.join('\n') + '\n');
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('重复')), r.errors.join('\n'));
});

test('清单里多出的新文件不算「基线文件丢失」', () => {
  const root = makeCompliantRepo({
    extraFiles: { 'tiaohou-shiye-extra.md': '后来新建的文件\n' },
  });
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('基线文件丢失')), r.errors.join('\n'));
});

// ===========================================================================
// 第二轮：Important 3 —— 规范的 10 键与 8 组闭合枚举
// ===========================================================================

test('校验器钉住的契约顶层键与规范一致', () => {
  assert.deepStrictEqual(validate.CONTRACT_TOP_LEVEL_KEYS.slice().sort(), EXPECTED_TOP_KEYS.slice().sort());
});

test('契约顶层键集不是规范的 10 个键时报错', () => {
  const root = makeCompliantRepo({
    schema: { type: 'object', required: ['cas'], properties: { cas: { type: 'string' } } },
  });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('顶层键集')), r.errors.join('\n'));
});

test('契约顶层键少一个时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  schema.required = schema.required.filter((k) => k !== 'summary');
  delete schema.properties.summary;
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('顶层键集')), r.errors.join('\n'));
});

test('契约顶层键多一个时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  schema.required.push('extraKey');
  schema.properties.extraKey = { type: 'string' };
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('顶层键集')), r.errors.join('\n'));
});

for (const spec of EXPECTED_ENUMS) {
  const label = spec.path.join('.');
  test(`闭合枚举 ${label} 的取值被改时报错`, () => {
    const schema = withEnum(CANONICAL_SCHEMA, spec.path, ['完全跑偏的值']);
    const sample = setSampleValue(CANONICAL_SAMPLE, spec.path, '完全跑偏的值');
    const root = makeCompliantRepo({ schema, sample });
    const r = run(root);
    assert.ok(r.errors.some((e) => e.includes('枚举') && e.includes(label)), r.errors.join('\n'));
    // 样例本身仍要合法 —— 报错只能来自「枚举被钉死」这一条腿
    assert.ok(!r.errors.some((e) => e.includes('CAREER_SCHEMA.sample.json')), r.errors.join('\n'));
  });

  test(`闭合枚举 ${label} 少一个取值时报错`, () => {
    const shortened = spec.values.slice(1);
    const schema = withEnum(CANONICAL_SCHEMA, spec.path, shortened);
    const sample = setSampleValue(CANONICAL_SAMPLE, spec.path, shortened[0]);
    const root = makeCompliantRepo({ schema, sample });
    const r = run(root);
    assert.ok(r.errors.some((e) => e.includes('枚举') && e.includes(label)), r.errors.join('\n'));
    assert.ok(!r.errors.some((e) => e.includes('CAREER_SCHEMA.sample.json')), r.errors.join('\n'));
  });
}

test('两套 verdict 枚举被写成同一组时报错', () => {
  const schema = withEnum(CANONICAL_SCHEMA, ['timeline[]', 'verdict'], ['成格', '破格', '不清']);
  const sample = setSampleValue(CANONICAL_SAMPLE, ['timeline[]', 'verdict'], '成格');
  const root = makeCompliantRepo({ schema, sample });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('枚举') && e.includes('timeline[].verdict')), r.errors.join('\n'));
  assert.ok(!r.errors.some((e) => e.includes('CAREER_SCHEMA.sample.json')), r.errors.join('\n'));
});

test('规范契约本身不报枚举错', () => {
  const root = makeCompliantRepo();
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('枚举')), r.errors.join('\n'));
});

// ===========================================================================
// 第二轮：Minor 1 —— 「未点名契约顶层键」错误路径有测试
// ===========================================================================

test('master 的 Execution 少一个契约键时报「未点名契约顶层键」', () => {
  const exec = '2. 产出 case / monthCommand / pattern / tiaoHou / xiJi / boundaries / playbooks / timeline / transition 九个顶层段';
  const root = makeCompliantRepo({ masterExec: exec });
  const r = run(root);
  const hits = r.errors.filter((e) => e.includes('未点名契约顶层键 "summary"'));
  assert.strictEqual(hits.length, 1, r.errors.join('\n'));
  assert.strictEqual(r.errors.filter((e) => e.includes('未点名契约顶层键')).length, 1, r.errors.join('\n'));
});

test('master 的 Execution 点了全部 10 个键时不报未点名', () => {
  const root = makeCompliantRepo();
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('未点名契约顶层键')), r.errors.join('\n'));
});

// ===========================================================================
// 第二轮：Minor 2 —— 按标识符边界匹配，不许无边界子串命中
// ===========================================================================

function masterErrorsWithExec(exec) {
  const root = makeCompliantRepo({ masterExec: exec });
  return run(root).errors;
}

test('Execution 段写「use case study」不算点名 case', () => {
  const errs = masterErrorsWithExec('2. 见 use case study 一节');
  assert.ok(errs.some((e) => e.includes('未点名契约顶层键 "case"')), errs.join('\n'));
});

test('Execution 段写 patterns 不算点名 pattern', () => {
  const errs = masterErrorsWithExec('2. 产出 patterns');
  assert.ok(errs.some((e) => e.includes('未点名契约顶层键 "pattern"')), errs.join('\n'));
});

test('Execution 段写 summaryText 不算点名 summary', () => {
  const errs = masterErrorsWithExec('2. 产出 summaryText');
  assert.ok(errs.some((e) => e.includes('未点名契约顶层键 "summary"')), errs.join('\n'));
});

test('Execution 段写 CASE 不算点名 case（大小写敏感）', () => {
  const errs = masterErrorsWithExec('2. 产出 CASE');
  assert.ok(errs.some((e) => e.includes('未点名契约顶层键 "case"')), errs.join('\n'));
});

test('Execution 段反引号包裹的 `case` 算点名', () => {
  const errs = masterErrorsWithExec('2. 产出 `case`');
  assert.ok(!errs.some((e) => e.includes('未点名契约顶层键 "case"')), errs.join('\n'));
});

test('Execution 段顿号分隔的键名算点名', () => {
  const errs = masterErrorsWithExec('2. 产出 case、monthCommand、pattern、tiaoHou、xiJi、boundaries、playbooks、timeline、transition、summary');
  assert.ok(!errs.some((e) => e.includes('未点名契约顶层键')), errs.join('\n'));
});

// ===========================================================================
// 第二轮：Minor 3 —— 已有基线 skill 的结构检查有测试覆盖
// ===========================================================================

test('已有基线 skill 缺结构段时被报出', () => {
  const legacy = `---
name: legacy-skill
description: 老 skill
trigger: "老"
---

# legacy-skill

## Interpretation（核心方法论）

知识
`;
  const root = makeCompliantRepo({ extraFiles: { 'legacy-skill/SKILL.md': legacy } });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('legacy-skill: 缺少 ## Execution')), r.errors.join('\n'));
});

test('已有基线 skill frontmatter name 与目录名不符时被报出', () => {
  const legacy = `---
name: 别的东西
description: 老 skill
trigger: "老"
---

# legacy-skill

## Interpretation（核心方法论）

知识

## Execution（执行步骤）

做事
`;
  const root = makeCompliantRepo({ extraFiles: { 'legacy-skill/SKILL.md': legacy } });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('legacy-skill: frontmatter name=')), r.errors.join('\n'));
});
// ===========================================================================
// 第三轮：Important 1 —— 契约样例这条腿不许静默消失
// ===========================================================================

test('契约 md 在、样例不在时报「缺少基准样例」', () => {
  const root = makeCompliantRepo({ skipSample: true });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('缺少基准样例')), r.errors.join('\n'));
});

test('契约 md 与样例都不在时不报「缺少基准样例」', () => {
  const root = makeCompliantRepo({ skipSchema: true });
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('基准样例')), r.errors.join('\n'));
});

test('契约样例 JSON 解析失败时报错', () => {
  const root = makeCompliantRepo({ sample: '{ 这不是 JSON' });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('CAREER_SCHEMA.sample.json') && e.includes('JSON 解析失败')), r.errors.join('\n'));
});

// ===========================================================================
// 第三轮：Important 2 —— 基线清单必须锚定到基线提交
// ===========================================================================

test('基线清单与基线提交的 sha 不符时报出差异', () => {
  const root = makeCompliantRepo();
  const p = path.join(root, 'skills', 'bazi-tuipan', '.baseline-manifest.txt');
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const i = lines.findIndex((l) => l.endsWith('  base-01.md'));
  lines[i] = `${'0'.repeat(40)}  base-01.md`;
  fs.writeFileSync(p, lines.join('\n'));
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('基线清单与基线提交') && e.includes('base-01.md')), r.errors.join('\n'));
});

test('基线清单比基线提交少一个文件时报出差异', () => {
  const root = makeCompliantRepo();
  const p = path.join(root, 'skills', 'bazi-tuipan', '.baseline-manifest.txt');
  const lines = fs.readFileSync(p, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  const kept = lines.filter((l) => !l.endsWith('  base-01.md'));
  fs.writeFileSync(p, ['# 基线文件 blob 清单 —— 测试用', ...kept].join('\n') + '\n');
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('基线清单与基线提交') && e.includes('清单缺少 base-01.md')), r.errors.join('\n'));
});

test('基线清单比基线提交多一个文件时报出差异', () => {
  const root = makeCompliantRepo();
  const p = path.join(root, 'skills', 'bazi-tuipan', '.baseline-manifest.txt');
  fs.appendFileSync(p, `${'0'.repeat(40)}  凭空多出来的.md\n`);
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('基线清单与基线提交') && e.includes('清单多出 凭空多出来的.md')), r.errors.join('\n'));
});

test('基线提交不存在时报错（不许静默跳过）', () => {
  const root = makeCompliantRepo();
  const r = validate.run(root, { baselineCommit: 'deadbee' });
  assert.ok(r.errors.some((e) => e.includes('找不到基线提交')), r.errors.join('\n'));
});

test('攻破复现：交换两个基线文件的内容并对调清单条目时报出', () => {
  const root = makeCompliantRepo();
  const dir = path.join(root, 'skills', 'bazi-tuipan');
  const a = 'base-01.md';
  const b = 'base-02.md';
  const ca = fs.readFileSync(path.join(dir, a), 'utf8');
  const cb = fs.readFileSync(path.join(dir, b), 'utf8');
  fs.writeFileSync(path.join(dir, a), cb);
  fs.writeFileSync(path.join(dir, b), ca);
  // 对调清单里这两个文件的 sha —— 工作区的 blob 比对会通过，只有锚点能抓住
  const p = path.join(dir, '.baseline-manifest.txt');
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const ia = lines.findIndex((l) => l.endsWith(`  ${a}`));
  const ib = lines.findIndex((l) => l.endsWith(`  ${b}`));
  const shaA = lines[ia].split(/\s+/)[0];
  const shaB = lines[ib].split(/\s+/)[0];
  lines[ia] = `${shaB}  ${a}`;
  lines[ib] = `${shaA}  ${b}`;
  fs.writeFileSync(p, lines.join('\n'));
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('基线清单与基线提交') && e.includes(a)), r.errors.join('\n'));
  assert.ok(r.errors.some((e) => e.includes('基线清单与基线提交') && e.includes(b)), r.errors.join('\n'));
  // 工作区比对本身是通过的 —— 报错只能来自锚点
  assert.ok(!r.errors.some((e) => e.includes('基线文件被改动')), r.errors.join('\n'));
});

// ===========================================================================
// 第三轮：Minor 1 —— candidates/ 四份过程文档
// ===========================================================================

test('Task 1~7 阶段：candidates 目录不存在时不报', () => {
  const root = makeCompliantRepo();
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('candidates/')), r.errors.join('\n'));
});

test('Task 1~7 阶段：candidates 目录是空的占位目录时不报', () => {
  const root = makeCompliantRepo({ extraFiles: { 'candidates/.keep': '' } });
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('candidates/ 缺少')), r.errors.join('\n'));
});

test('candidates 只写了几份时报出缺的', () => {
  const root = makeCompliantRepo({
    extraFiles: { 'candidates/principles.md': '原则\n', 'candidates/cases.md': '案例\n' },
  });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('candidates/ 缺少 frameworks.md')), r.errors.join('\n'));
  assert.ok(r.errors.some((e) => e.includes('candidates/ 缺少 counter-examples.md')), r.errors.join('\n'));
  assert.ok(!r.errors.some((e) => e.includes('candidates/ 缺少 principles.md')), r.errors.join('\n'));
});

test('candidates 四份齐全且非空时不报', () => {
  const root = makeCompliantRepo({
    extraFiles: {
      'candidates/principles.md': '原则\n',
      'candidates/frameworks.md': '框架\n',
      'candidates/cases.md': '案例\n',
      'candidates/counter-examples.md': '反例\n',
    },
  });
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('candidates/')), r.errors.join('\n'));
});

test('candidates 某份为空时报出「内容为空」', () => {
  const root = makeCompliantRepo({
    extraFiles: {
      'candidates/principles.md': '原则\n',
      'candidates/frameworks.md': '   \n',
      'candidates/cases.md': '案例\n',
      'candidates/counter-examples.md': '反例\n',
    },
  });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('candidates/frameworks.md 内容为空')), r.errors.join('\n'));
});

test('显式要求 candidates 时目录不存在也报出四份缺失', () => {
  const root = makeCompliantRepo();
  const r = run(root, { expectCandidates: true });
  for (const f of ['principles.md', 'frameworks.md', 'cases.md', 'counter-examples.md']) {
    assert.ok(r.errors.some((e) => e.includes(`candidates/ 缺少 ${f}`)), r.errors.join('\n'));
  }
});

// ===========================================================================
// 第三轮：Minor 2 —— 键集不对时不报一堆方向相反的噪音
// ===========================================================================

test('契约键集不对时不再报「缺少闭合枚举定义」', () => {
  const root = makeCompliantRepo({
    schema: { type: 'object', required: ['cas'], properties: { cas: { type: 'string' } } },
  });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('顶层键集不对')), r.errors.join('\n'));
  assert.ok(!r.errors.some((e) => e.includes('缺少闭合枚举定义')), r.errors.join('\n'));
});

test('契约键集不对时不拿错的键集去对齐 master', () => {
  const root = makeCompliantRepo({
    schema: { type: 'object', required: ['cas'], properties: { cas: { type: 'string' } } },
  });
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('未点名契约顶层键 "cas"')), r.errors.join('\n'));
  assert.ok(!r.errors.some((e) => e.includes('Execution 段正文为空')), r.errors.join('\n'));
});

// ===========================================================================
// 第三轮：Minor 3 —— 契约顶层键的顺序也不可调换
// ===========================================================================

test('契约顶层键顺序不对时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  const req = schema.required.slice();
  schema.required = [req[1], req[0], ...req.slice(2)];
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('顶层键顺序不对')), r.errors.join('\n'));
});

test('契约顶层键顺序正确时不报顺序错', () => {
  const root = makeCompliantRepo();
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('顶层键顺序不对')), r.errors.join('\n'));
});

// ===========================================================================
// 第三轮：Minor 4 —— 补上两个没被测到的分支
// ===========================================================================

test('master 缺 Execution 段时不报「正文为空」也不报「未点名」', () => {
  const root = makeCompliantRepo();
  const p = path.join(root, 'skills', 'bazi-tuipan', 'shiye-master.skill.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('## Execution（执行步骤）', '## 其他'));
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('Execution 段正文为空')), r.errors.join('\n'));
  assert.ok(!r.errors.some((e) => e.includes('未点名')), r.errors.join('\n'));
  // 同一个缺陷只报一次
  assert.strictEqual(r.errors.filter((e) => e.includes('shiye-master: 缺少 ## Execution')).length, 1, r.errors.join('\n'));
  assert.strictEqual(r.errors.filter((e) => e.startsWith('shiye-master:')).length, 1, r.errors.join('\n'));
});
