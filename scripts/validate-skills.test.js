'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
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

/**
 * 契约里必须声明 minItems >= 1 的 8 个数组路径。
 * 空数组 = 「只覆盖了半边」的样例（playbooks: [] / summary.notes: [] 都能蒙混过关），
 * 所以契约必须自己声明这些数组至少 1 项。
 * 唯一豁免：xiJi.ciXi（辅药，允许为空，且不得声明 minItems）。
 */
const EXPECTED_MIN_ITEMS_PATHS = [
  ['xiJi', 'xi'], ['xiJi', 'ji'],
  ['boundaries'], ['playbooks'], ['playbooks[]', 'actions'],
  ['timeline'], ['timeline[]', 'liunianWindows'], ['summary', 'notes'],
];

/** 允许为空、且不得声明 minItems >= 1 的路径（唯一豁免） */
const EXPECTED_OPTIONAL_PATHS = [['xiJi', 'ciXi']];

/**
 * 契约里 13 个对象节点的规范形状 —— 每个节点的「属性名集合」与「required 集合」。
 * 权威来源：docs/superpowers/plans/2026-11-24-shiye-skill-plan.md 的 Task 2 契约 ```json 块
 * （逐字抄，不凭记忆写）。路径写法沿用校验器的 'x[]' 约定（x[] = 数组 items）。
 */
const EXPECTED_OBJECT_SHAPE = [
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
 * 契约的规范形态 —— 这里就是「Task 2 必须落盘的东西」。
 * 与计划 Task 2 的契约 json 块**逐字一致**（下面有一条测试直接读计划文件核对）。
 */
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
          "minItems": 1,
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
          "minItems": 1,
          "items": {
            "type": "string"
          }
        }
      }
    },
    "boundaries": {
      "type": "array",
      "minItems": 1,
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
      "minItems": 1,
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
            "minItems": 1,
            "items": {
              "type": "string"
            }
          }
        }
      }
    },
    "timeline": {
      "type": "array",
      "minItems": 1,
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
            "minItems": 1,
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
          "minItems": 1,
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
    "verdict": "破格",
    "storeHouse": "辰为水库，未为燥土财库，双库夹局",
    "reasoning": "财星被双乙比劫夺财（用神被克），且财多身难独担、财库厚而闭"
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
      "scale": "早期",
      "condition": "财埋印、杀在后，宜借平台养印",
      "actions": [
        "优先平台与专业岗",
        "进大企业、规划院、设计或工程基建体系",
        "攒证书、人脉、报批确权套路"
      ]
    },
    {
      "scale": "轻创业",
      "condition": "水印流通之年可以启动，门槛低、风险可控",
      "actions": [
        "咨询工作室",
        "独立方案团队",
        "技术顾问"
      ]
    },
    {
      "scale": "重资产",
      "condition": "必须是「水印扶身、冲开财库、丙火通关」的大运流年窗口",
      "actions": [
        "厚积薄发，不是少年创业命",
        "等窗口期再开长线盘"
      ]
    },
    {
      "scale": "合伙",
      "condition": "双乙比劫，有同气帮扶，但财库重、容易争利确权纠纷",
      "actions": [
        "先定规则",
        "锁产权",
        "留风控"
      ]
    }
  ],
  "timeline": [
    {
      "ganZhi": "癸亥",
      "type": "水运",
      "verdict": "重仓",
      "mainTrack": "深耕专业、铺底盘",
      "playbook": "早期",
      "liunianWindows": [
        {
          "year": 2033,
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
  // 参考资料的 5 份原始素材也要进基线提交 —— 它们不在基线清单里，
  // 但「一字未改」是硬约束，校验器用基线提交单独给它们一条腿断言。
  const refNames = writeReferencePlaceholders(root);
  // 只把这 42 个占位文件放进这次提交
  // （stderr 丢掉：core.autocrlf=true 会让 git 对每个文件打一行 CRLF 警告，噪音太大）
  execFileSync('git', ['add', '--', ...names.map((n) => `skills/bazi-tuipan/${n}`), ...refNames], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
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

/** 参考资料的 5 份原始素材（和真实仓库同名）—— 进基线提交，供锚点单独断言 */
const REFERENCE_FILES = ['事业1.txt', '事业2.txt', '事业3.txt', '事业4.txt', '事业推理结果.txt'];

function writeReferencePlaceholders(root) {
  const names = [];
  for (const n of REFERENCE_FILES) {
    const rel = `参考资料/${n}`;
    fs.mkdirSync(path.join(root, '参考资料'), { recursive: true });
    fs.writeFileSync(path.join(root, ...rel.split('/')), `参考资料占位 ${n}\n`);
    names.push(rel);
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

/**
 * 按同样的路径写法改样例里的取值（'x[]' 表示数组）。
 * 数组的**每一项**都要改 —— 否则样例里会残留旧取值，
 * 「样例本身仍要合法」那条断言就会误报（样例比契约多了一档/多了一行）。
 */
function setSampleValue(sample, pathParts, value) {
  const clone = JSON.parse(JSON.stringify(sample));
  const segs = pathParts.map((s) => (s.endsWith('[]') ? s.slice(0, -2) : s));
  const apply = (node, idx) => {
    const seg = segs[idx];
    if (idx === segs.length - 1) {
      node[seg] = value;
      return;
    }
    const child = node[seg];
    if (Array.isArray(child)) child.forEach((el) => apply(el, idx + 1));
    else apply(child, idx + 1);
  };
  apply(clone, 0);
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

// ===========================================================================
// 第四轮：Important 1 —— 锚点不可被环境变量绕过
// ===========================================================================

/**
 * 校验器源码里不允许再有「从环境变量换锚点」的开关。
 * 断言两件事：
 *   1. 不读 SEG2_BASELINE_COMMIT；
 *   2. CLI 里根本不给 opts.baselineCommit 赋值 —— 锚只能是 BASELINE_COMMIT。
 * 测试要换锚点走函数参数 run(root, { baselineCommit })，那是唯一合法的换法。
 */
test('校验器源码里没有从环境变量换锚点的开关', () => {
  const src = fs.readFileSync(path.join(__dirname, 'validate-skills.js'), 'utf8');
  assert.ok(!/process\.env\.SEG2_BASELINE_COMMIT/.test(src), '源码里还在读 SEG2_BASELINE_COMMIT');
  assert.ok(!/baselineCommit\s*=\s*process\.env/.test(src), '源码里还在用环境变量赋 baselineCommit');
  assert.ok(!/opts\.baselineCommit\s*=/.test(src), 'CLI 里还在给 opts.baselineCommit 赋值');
});

/**
 * 端到端复现协调者实测过的攻破：
 *   篡改一个基线文件 → 把清单里对应的 sha 改成篡改后的 sha → 提交进历史 →
 *   SEG2_BASELINE_COMMIT=HEAD 想把锚点换成 HEAD。
 * 期望：锚点不理会这个环境变量，仍钉在 f7bd915，报出清单与基线提交不一致。
 *
 * 用真实仓库的临时克隆做，因为只有它才含 f7bd915 这个锚提交。
 */
test('SEG2_BASELINE_COMMIT=HEAD 不能把锚点换成 HEAD（端到端）', () => {
  // 源路径要用正斜杠：git 会把 "D:\..." 里的盘符冒号当成 URL 的 scheme，
  // 于是 --local 被忽略、仓库被当成远程。--no-hardlinks：源和临时目录可能不在一个盘上。
  const repoRoot = path.resolve(__dirname, '..').split(path.sep).join('/');
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'seg2-clone-'));
  try {
    execFileSync('git', ['clone', '--local', '--no-hardlinks', '--quiet', repoRoot, clone], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const bdir = path.join(clone, 'skills', 'bazi-tuipan');
    const victim = 'tuipan-master.skill.md';
    // 篡改一个受保护的基线文件（不是那 6 个可变文档）
    fs.appendFileSync(path.join(bdir, victim), '\n被篡改了一行\n');
    const newSha = execFileSync('git', ['hash-object', '--stdin-paths'], {
      cwd: clone, encoding: 'utf8', input: `skills/bazi-tuipan/${victim}\n`,
    }).trim();

    // 把清单里对应的 sha 换成篡改后的 sha —— 清单也被一起改掉，一起提交
    const mpath = path.join(bdir, '.baseline-manifest.txt');
    const lines = fs.readFileSync(mpath, 'utf8').split(/\r?\n/);
    const i = lines.findIndex((l) => l.endsWith(`  ${victim}`));
    assert.ok(i >= 0, '清单里找不到 ' + victim);
    lines[i] = `${newSha}  ${victim}`;
    fs.writeFileSync(mpath, lines.join('\n'));
    execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=测试', 'commit', '-qam', 'tamper'], { cwd: clone });

    // 用环境变量试图把锚点换成 HEAD
    const res = spawnSync(process.execPath, [path.join(__dirname, 'validate-skills.js'), clone], {
      cwd: clone, encoding: 'utf8',
      env: { ...process.env, SEG2_BASELINE_COMMIT: 'HEAD' },
    });
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    assert.strictEqual(res.status, 1, out);
    // 锚点必须仍然钉在 f7bd915
    assert.ok(out.includes(`（基线提交 ${validate.BASELINE_COMMIT}）`), '锚点被环境变量换掉了:\n' + out);
    assert.ok(!out.includes('（基线提交 HEAD）'), '锚点被环境变量换成了 HEAD:\n' + out);
    // 报错要指出是哪个文件
    assert.ok(out.includes(victim), '报错没指出是哪个文件:\n' + out);
    // 工作区那条腿看不出问题（清单与工作区是自洽的）—— 只有锚点能抓住
    assert.ok(!out.includes('基线文件被改动'), '不该由工作区那条腿来报:\n' + out);
  } finally {
    fs.rmSync(clone, { recursive: true, force: true });
  }
});

// ===========================================================================
// 第四轮：Minor A —— candidates 全删时 --expect-candidates 必须报 4 条缺失
// ===========================================================================

test('candidates 四份全删 + 显式要求 candidates 时报 4 条缺失', () => {
  const root = makeCompliantRepo({
    extraFiles: Object.fromEntries(validate.CANDIDATE_FILES.map((f) => [`candidates/${f}`, '内容\n'])),
  });
  const cdir = path.join(root, 'skills', 'bazi-tuipan', 'candidates');
  for (const f of validate.CANDIDATE_FILES) fs.rmSync(path.join(cdir, f));
  // 不带 --expect-candidates 时（Task 8 还没开工）不报
  assert.ok(!run(root).errors.some((e) => e.includes('candidates/ 缺少')), '不该报');
  // 带上 --expect-candidates 时四份全缺，必须报 4 条
  const r = run(root, { expectCandidates: true });
  const missing = r.errors.filter((e) => e.startsWith('candidates/ 缺少 '));
  assert.strictEqual(missing.length, 4, r.errors.join('\n'));
});

// ===========================================================================
// 第四轮：Minor B —— 参考资料的不可变性要有常驻断言
// ===========================================================================

test('参考资料原样时没有相关报错', () => {
  const root = makeRepo();
  const problems = baseline(root);
  assert.ok(!problems.some((e) => e.includes('参考资料')), problems.join('\n'));
});

test('参考资料被改动时报出是哪个文件', () => {
  const root = makeRepo();
  fs.appendFileSync(path.join(root, '参考资料', '事业2.txt'), '\n被改了\n');
  const problems = baseline(root);
  assert.ok(problems.some((e) => e.includes('参考资料被改动: 参考资料/事业2.txt')), problems.join('\n'));
});

test('参考资料被删掉时报出丢失', () => {
  const root = makeRepo();
  fs.rmSync(path.join(root, '参考资料', '事业3.txt'));
  const problems = baseline(root);
  assert.ok(problems.some((e) => e.includes('参考资料丢失: 参考资料/事业3.txt')), problems.join('\n'));
});

test('参考资料的锚点独立于基线清单（清单动不了它）', () => {
  const root = makeRepo();
  // 参考资料被改了，清单本身是好的 —— 这条腿照样要报
  fs.appendFileSync(path.join(root, '参考资料', '事业4.txt'), '\n被改了\n');
  const problems = baseline(root);
  assert.ok(problems.some((e) => e.includes('参考资料被改动: 参考资料/事业4.txt')), problems.join('\n'));
});

// ===========================================================================
// 第四轮：Minor C —— 契约的数组必须声明 minItems >= 1（第五轮起是 8 条，ciXi 豁免）
// ===========================================================================

test('契约 schema 的必非空数组都声明 minItems 时不报 minItems 错', () => {
  const root = makeCompliantRepo();
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('minItems')), r.errors.join('\n'));
});

test('契约 schema 的数组缺 minItems 时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  delete schema.properties.xiJi.properties.xi.minItems;
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('minItems') && e.includes('xiJi.xi')), r.errors.join('\n'));
});

test('契约 schema 的数组 minItems 写成 0 时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  schema.properties.summary.properties.notes.minItems = 0;
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('minItems') && e.includes('summary.notes')), r.errors.join('\n'));
});

test('契约 schema 的必非空数组路径都被检查到（逐个抽掉 minItems 都得报）', () => {
  for (const p of EXPECTED_MIN_ITEMS_PATHS) {
    const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
    let node = schema;
    for (const raw of p) {
      const isArray = raw.endsWith('[]');
      const name = isArray ? raw.slice(0, -2) : raw;
      node = node.properties[name];
      if (isArray) node = node.items;
    }
    delete node.minItems;
    const root = makeCompliantRepo({ schema });
    const r = run(root);
    const hits = r.errors.filter((e) => e.includes('minItems'));
    assert.strictEqual(hits.length, 1, `路径 ${p.join('.')} 没被检查到:\n${r.errors.join('\n')}`);
  }
});

test('样例里 playbooks 为空数组时报错（minItems 生效）', () => {
  const sample = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  sample.playbooks = [];
  const root = makeCompliantRepo({ sample });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('至少需要 1 项')), r.errors.join('\n'));
});

test('样例里 summary.notes 为空数组时报错（minItems 生效）', () => {
  const sample = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  sample.summary.notes = [];
  const root = makeCompliantRepo({ sample });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('至少需要 1 项')), r.errors.join('\n'));
});

// ===========================================================================
// 第五轮：ciXi 豁免（辅药允许为空）+ 样例顶层键集
// ===========================================================================

test('ciXi 豁免：契约里 ciXi 不声明 minItems 时不报 minItems 错', () => {
  const root = makeCompliantRepo();
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('minItems')), r.errors.join('\n'));
  assert.ok(!r.errors.some((e) => e.includes('ciXi')), r.errors.join('\n'));
});

test('ciXi 豁免：样例里 xiJi.ciXi 为空数组时不报错', () => {
  const sample = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  sample.xiJi.ciXi = [];
  const root = makeCompliantRepo({ sample });
  const r = run(root);
  assert.deepStrictEqual(r.errors, [], r.errors.join('\n'));
});

test('契约里给 ciXi 声明 minItems>=1 时报错（豁免不能被吃掉）', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  schema.properties.xiJi.properties.ciXi.minItems = 1;
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('ciXi') && e.includes('不得声明 minItems')), r.errors.join('\n'));
});

test('契约里给 ciXi 声明 minItems: 0 时不报错（0 等于没有约束）', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  schema.properties.xiJi.properties.ciXi.minItems = 0;
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('ciXi')), r.errors.join('\n'));
});

test('豁免路径只有 xiJi.ciXi 一条，且它不在必非空的 8 条里', () => {
  assert.deepStrictEqual(validate.CONTRACT_ARRAY_OPTIONAL, EXPECTED_OPTIONAL_PATHS);
  assert.deepStrictEqual(validate.CONTRACT_ARRAY_MIN_ITEMS, EXPECTED_MIN_ITEMS_PATHS);
  assert.strictEqual(EXPECTED_MIN_ITEMS_PATHS.length, 8);
});

test('样例多一个顶层键时报错', () => {
  const sample = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  sample.extraTopLevel = '不该出现';
  const root = makeCompliantRepo({ sample });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('顶层键集不对') && e.includes('多出 extraTopLevel')), r.errors.join('\n'));
});

test('样例少一个顶层键时报错', () => {
  const sample = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  delete sample.summary;
  const root = makeCompliantRepo({ sample });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('顶层键集不对') && e.includes('缺少 summary')), r.errors.join('\n'));
});

test('样例顶层键集恰好是规范那 10 个键时不报键集错', () => {
  const root = makeCompliantRepo();
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('顶层键集不对')), r.errors.join('\n'));
});

// ===========================================================================
// 第六轮：Important 1 —— 契约的嵌套形状必须可断言
// （做法 A：13 个对象节点的属性集 + required 集逐字钉死，样例键集随契约比对）
// ===========================================================================

/** 按路径取契约里的一个节点（'x[]' = 数组 items），取不到返回 null */
function schemaNodeAt(schema, path) {
  let node = schema;
  for (const raw of path) {
    const isArray = raw.endsWith('[]');
    const name = isArray ? raw.slice(0, -2) : raw;
    if (!node || !node.properties || !(name in node.properties)) return null;
    node = node.properties[name];
    if (isArray) {
      if (!node || !node.items) return null;
      node = node.items;
    }
  }
  return node;
}

test('校验器钉住的契约对象形状与规范一致', () => {
  const actual = validate.CONTRACT_OBJECT_SHAPE.map((e) => ({
    path: e.path.slice(),
    properties: e.properties.slice().sort(),
    required: e.required.slice().sort(),
  }));
  const expected = EXPECTED_OBJECT_SHAPE.map((e) => ({
    path: e.path.slice(),
    properties: e.properties.slice().sort(),
    required: e.required.slice().sort(),
  }));
  assert.deepStrictEqual(actual, expected);
});

test('规范形状常量本身自洽（每个节点的 properties 与 required 集合相等）', () => {
  for (const e of validate.CONTRACT_OBJECT_SHAPE) {
    assert.deepStrictEqual(
      e.properties.slice().sort(), e.required.slice().sort(),
      `节点 ${e.path.join('.')} 的 properties 与 required 不相等`,
    );
  }
});

test('规范契约本身不报形状错（13 个对象节点全部对得上）', () => {
  const root = makeCompliantRepo();
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('形状不对')), r.errors.join('\n'));
  assert.ok(!r.errors.some((e) => e.includes('规范之外的对象节点')), r.errors.join('\n'));
});

test('规范样例不报嵌套键集错（零误报）', () => {
  const root = makeCompliantRepo();
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('嵌套键集不对')), r.errors.join('\n'));
  assert.ok(!r.errors.some((e) => e.includes('CAREER_SCHEMA.sample.json')), r.errors.join('\n'));
});

// --- 终审实测的 S2~S8 七个场景 ---

test('S2 契约里删掉 pattern.required 时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  delete schema.properties.pattern.required;
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('形状不对') && e.includes('$.pattern') && e.includes('required')), r.errors.join('\n'));
});

test('S3 契约里 pattern.properties 多一个没进 required 的字段时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  schema.properties.pattern.properties.extraKey = { type: 'string' };
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('形状不对') && e.includes('$.pattern') && e.includes('extraKey')), r.errors.join('\n'));
});

test('S4 契约里 timeline[].required 置空时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  schema.properties.timeline.items.required = [];
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('形状不对') && e.includes('$.timeline[]') && e.includes('required')), r.errors.join('\n'));
});

test('S5 契约里删掉 summary.required 时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  delete schema.properties.summary.required;
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('形状不对') && e.includes('$.summary') && e.includes('required')), r.errors.join('\n'));
});

test('S6 契约里删掉 case.pillars.required（嵌套两层）时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  delete schema.properties.case.properties.pillars.required;
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('形状不对') && e.includes('$.case.pillars') && e.includes('required')), r.errors.join('\n'));
});

test('S7 样例里 pattern 多一个嵌套多余键时报错', () => {
  const sample = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  sample.pattern.extraKey = '不该出现';
  const root = makeCompliantRepo({ sample });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('嵌套键集不对') && e.includes('$.pattern') && e.includes('多出 extraKey')), r.errors.join('\n'));
});

test('S8 样例里 timeline[0] 多一个嵌套多余键时报错', () => {
  const sample = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  sample.timeline[0].note = '不该出现';
  const root = makeCompliantRepo({ sample });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('嵌套键集不对') && e.includes('$.timeline[0]') && e.includes('多出 note')), r.errors.join('\n'));
});

// --- 做法 A 相对做法 B 多抓的那一类 ---

test('properties 与 required 同时改名时也报错（做法 B 抓不住的那一类）', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  delete schema.properties.pattern.properties.storeHouse;
  delete schema.properties.pattern.properties.shuCang;
  schema.properties.pattern.properties.shuCang = { type: 'string' };
  schema.properties.pattern.required = schema.properties.pattern.required.map((k) => (k === 'storeHouse' ? 'shuCang' : k));
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('形状不对') && e.includes('$.pattern') && e.includes('storeHouse')), r.errors.join('\n'));
});

test('契约里多出一个规范之外的对象节点时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  schema.properties.pattern.properties.extra = {
    type: 'object',
    required: ['a'],
    properties: { a: { type: 'string' } },
  };
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('规范之外的对象节点') && e.includes('$.pattern.extra')), r.errors.join('\n'));
});

test('契约里对象节点整个被删掉时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  delete schema.properties.transition;
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('形状不对') && e.includes('$.transition')), r.errors.join('\n'));
});

// --- 样例那半的补充场景 ---

test('样例缺一个嵌套键时报错，且不与「必填字段缺失」重复报', () => {
  const sample = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  delete sample.pattern.verdict;
  const root = makeCompliantRepo({ sample });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('嵌套键集不对') && e.includes('$.pattern') && e.includes('缺少 verdict')), r.errors.join('\n'));
  assert.strictEqual(r.errors.filter((e) => e.includes('必填字段缺失')).length, 0, r.errors.join('\n'));
});

test('样例缺顶层键时只报一次（不重复报「必填字段缺失」）', () => {
  const sample = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  delete sample.summary;
  const root = makeCompliantRepo({ sample });
  const r = run(root);
  assert.strictEqual(r.errors.filter((e) => e.includes('缺少 summary')).length, 1, r.errors.join('\n'));
  assert.strictEqual(r.errors.filter((e) => e.includes('必填字段缺失')).length, 0, r.errors.join('\n'));
});

test('样例里 playbooks[0] 多一个嵌套多余键时报错', () => {
  const sample = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  sample.playbooks[0].extra = 1;
  const root = makeCompliantRepo({ sample });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('嵌套键集不对') && e.includes('$.playbooks[0]') && e.includes('多出 extra')), r.errors.join('\n'));
});

test('样例里 timeline[0].liunianWindows[0] 多一个嵌套多余键时报错', () => {
  const sample = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  sample.timeline[0].liunianWindows[0].extra = 1;
  const root = makeCompliantRepo({ sample });
  const r = run(root);
  assert.ok(r.errors.some((e) => e.includes('嵌套键集不对') && e.includes('$.timeline[0].liunianWindows[0]') && e.includes('多出 extra')), r.errors.join('\n'));
});

// ===========================================================================
// 第七轮（补丁）：N2 —— 「计划 json 块 ↔ 校验器常量 ↔ 测试副本」三处自动咬合
//
// 现状（补丁前）：测试只断言了「校验器常量 == 测试副本」（② == ③），
// **没有任何一条测试读计划文件**（①）。改了计划里的契约 json 块而忘了改 ②③，
// 测试不会红 —— 这正是实现者顾虑 ① 的实质。
// 现在补上第三种断言：直接读计划文件，自己遍历一遍，跟 ② 逐节点比对。
// ===========================================================================

/** 计划文件路径 —— 契约形状的权威来源 */
const PLAN_PATH = path.join(__dirname, '..', 'docs', 'superpowers', 'plans', '2026-11-24-shiye-skill-plan.md');

/**
 * 抠出计划里 Task 2 段的 ```json 块。
 * Task 2 段里有 2 个 json 块：块 0 = 契约，块 1 = 基准样例。
 *
 * 抠不到（文件不存在 / 没有 Task 2 段 / json 块不足 2 个）时返回 null ——
 * 调用方用 t.skip() 跳过而不是判红，避免在裁剪过的检出里误伤。
 */
function readPlanTask2JsonBlocks() {
  if (!fs.existsSync(PLAN_PATH)) return null;
  const text = fs.readFileSync(PLAN_PATH, 'utf8');
  const start = text.indexOf('### Task 2:');
  const end = text.indexOf('### Task 3:', start + 1);
  if (start < 0 || end < 0) return null;
  const section = text.slice(start, end);
  const blocks = [];
  const re = /```json[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
  let m;
  while ((m = re.exec(section)) !== null) blocks.push(JSON.parse(m[1]));
  return blocks.length >= 2 ? blocks : null;
}

/**
 * 自己写的遍历：算出契约里所有「有 properties 的对象节点」的
 * 路径 + 属性名集合 + required 集合。
 *
 * 刻意**不调用**校验器里的任何实现（collectObjectNodeLabels / resolveSchemaNode 都没碰）：
 * 否则就是「用被测对象验证被测对象」，测不出「常量抄错了」这种事。
 * 路径写法沿用 'x[]' = 数组 items 的约定。
 */
function collectObjectNodes(node, path, out) {
  if (!node || typeof node !== 'object') return out;
  const props = node.properties;
  if (!props || typeof props !== 'object') return out;
  out.push({
    path: path.slice(),
    properties: Object.keys(props).slice().sort(),
    required: (Array.isArray(node.required) ? node.required : []).slice().sort(),
  });
  for (const [key, sub] of Object.entries(props)) {
    if (!sub || typeof sub !== 'object') continue;
    if (sub.properties) collectObjectNodes(sub, path.concat(key), out);
    if (sub.items && typeof sub.items === 'object' && sub.items.properties) {
      collectObjectNodes(sub.items, path.concat(`${key}[]`), out);
    }
  }
  return out;
}

/** 路径数组 → 标签（自己写，不复用校验器的 shapeLabel） */
function planShapeLabel(pathParts) {
  return pathParts.length === 0 ? '$' : '$' + pathParts.map((p) => '.' + p).join('');
}

test('N2：计划 Task 2 的契约 json 块与校验器的形状常量逐节点一致', (t) => {
  const blocks = readPlanTask2JsonBlocks();
  if (!blocks) { t.skip('计划文件不存在或抠不出 Task 2 的两个 json 块'); return; }
  const fromPlan = collectObjectNodes(blocks[0], [], []);
  const fromConst = validate.CONTRACT_OBJECT_SHAPE.map((e) => ({
    path: e.path.slice(),
    properties: e.properties.slice().sort(),
    required: e.required.slice().sort(),
  }));
  assert.strictEqual(fromPlan.length, fromConst.length,
    `对象节点数不一致：计划 ${fromPlan.length} 个，校验器常量 ${fromConst.length} 个`);
  const planMap = new Map(fromPlan.map((e) => [planShapeLabel(e.path), e]));
  const constMap = new Map(fromConst.map((e) => [planShapeLabel(e.path), e]));
  assert.deepStrictEqual([...planMap.keys()].sort(), [...constMap.keys()].sort(),
    '对象节点的路径集合不一致');
  for (const label of [...planMap.keys()].sort()) {
    assert.deepStrictEqual(planMap.get(label).properties, constMap.get(label).properties,
      `${label} 的属性集与计划不一致`);
    assert.deepStrictEqual(planMap.get(label).required, constMap.get(label).required,
      `${label} 的 required 集与计划不一致`);
  }
});

test('N2：计划 Task 2 的契约 json 块与测试里的 CANONICAL_SCHEMA 副本一致', (t) => {
  const blocks = readPlanTask2JsonBlocks();
  if (!blocks) { t.skip('计划文件不存在或抠不出 Task 2 的两个 json 块'); return; }
  assert.deepStrictEqual(blocks[0], CANONICAL_SCHEMA);
});

test('N2：计划 Task 2 的样例 json 块与测试里的 CANONICAL_SAMPLE 副本一致', (t) => {
  const blocks = readPlanTask2JsonBlocks();
  if (!blocks) { t.skip('计划文件不存在或抠不出 Task 2 的两个 json 块'); return; }
  assert.deepStrictEqual(blocks[1], CANONICAL_SAMPLE);
});

// ===========================================================================
// 第七轮（补丁）：N1 —— 每个属性叶子都必须声明 type
//
// 现状（补丁前）：形状常量钉的是「属性名集合 + required 集合」，
// 叶子的 type 关键字不在其内 —— `type` 被删掉时静默通过（0 错）。
// 本轮加一条通用规则兜底；**完整的叶子类型表（约 40 条）明确不做**，
// 记为已知残留（见下面两条「已知残留」测试）。
// ===========================================================================

/** 契约里允许的 type 取值 —— 测试自己的真值来源 */
const EXPECTED_LEAF_TYPES = ['string', 'integer', 'number', 'boolean', 'array', 'object'];

/**
 * 自己写的叶子遍历：找出所有「不是对象节点」的属性节点，外加数组的 items 层。
 * 同样不调用校验器里的实现。
 */
function collectLeafNodes(node, label, out) {
  const props = node && node.properties;
  if (!props || typeof props !== 'object') return out;
  for (const [key, sub] of Object.entries(props)) {
    if (!sub || typeof sub !== 'object') continue;
    const childLabel = label === '$' ? `$.${key}` : `${label}.${key}`;
    if (sub.properties && typeof sub.properties === 'object') {
      collectLeafNodes(sub, childLabel, out);
      continue;
    }
    out.push({ label: childLabel, node: sub });
    if (sub.items && typeof sub.items === 'object') {
      out.push({ label: `${childLabel}[]`, node: sub.items });
      collectLeafNodes(sub.items, `${childLabel}[]`, out);
    }
  }
  return out;
}

test('N1：规范契约的每一个叶子都声明了合法的 type（自己遍历核对）', () => {
  const leaves = collectLeafNodes(CANONICAL_SCHEMA, '$', []);
  assert.ok(leaves.length > 0, '没找到任何叶子');
  for (const { label, node } of leaves) {
    assert.ok(Object.prototype.hasOwnProperty.call(node, 'type'), `${label} 没声明 type`);
    assert.ok(EXPECTED_LEAF_TYPES.includes(node.type), `${label} 的 type 非法：${JSON.stringify(node.type)}`);
  }
});

test('N1：校验器允许的 type 取值集合与规范一致', () => {
  assert.deepStrictEqual(validate.CONTRACT_LEAF_TYPES.slice().sort(), EXPECTED_LEAF_TYPES.slice().sort());
});

test('N1：规范契约本身不报「必须声明 type」的错（零误报）', () => {
  const root = makeCompliantRepo();
  const r = run(root);
  assert.ok(!r.errors.some((e) => e.includes('必须声明 type')), r.errors.join('\n'));
  assert.ok(!r.errors.some((e) => e.includes('type 取值不合法')), r.errors.join('\n'));
  assert.ok(!r.errors.some((e) => e.includes('必须声明 items')), r.errors.join('\n'));
});

test('N1：契约里叶子删掉 type 时报错（$.pattern.reasoning）', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  delete schema.properties.pattern.properties.reasoning.type;
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(
    r.errors.some((e) => e.includes('必须声明 type') && e.includes('$.pattern.reasoning')),
    r.errors.join('\n'),
  );
});

test('N1：契约里数组的 items 删掉 type 时报错（$.xiJi.xi[]）', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  delete schema.properties.xiJi.properties.xi.items.type;
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(
    r.errors.some((e) => e.includes('必须声明 type') && e.includes('$.xiJi.xi[]')),
    r.errors.join('\n'),
  );
});

test('N1：契约里叶子的 type 取值不合法时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  schema.properties.pattern.properties.storeHouse.type = 'strng';
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(
    r.errors.some((e) => e.includes('type 取值不合法') && e.includes('$.pattern.storeHouse')),
    r.errors.join('\n'),
  );
});

test('N1：契约里数组缺 items 时报错', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  delete schema.properties.xiJi.properties.xi.items;
  const root = makeCompliantRepo({ schema });
  const r = run(root);
  assert.ok(
    r.errors.some((e) => e.includes('必须声明 items') && e.includes('$.xiJi.xi')),
    r.errors.join('\n'),
  );
});

/**
 * 已知残留 ①：叶子的**具体**标量类型未钉。
 * 完整叶子类型表（约 40 条）明确不做 —— 那是第三处人工同步，代价大于收益。
 * 所以把 `storeHouse` 的 type 从 string 改成 integer（样例同步改）**仍然是静默的**。
 *
 * 这条测试把这个残留钉成「已知」：将来若补了叶子类型表，这条要改成期望报红。
 */
test('N1 已知残留：叶子 type 由 string 改成 integer 仍然静默（完整叶子类型表明确不做）', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  schema.properties.pattern.properties.storeHouse.type = 'integer';
  const sample = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  sample.pattern.storeHouse = 42;
  const root = makeCompliantRepo({ schema, sample });
  const r = run(root);
  assert.deepStrictEqual(r.errors, [], r.errors.join('\n'));
});

/**
 * 已知残留 ②：同上 —— 流年窗口的 `year` 由 integer 改成 string（样例同步改）仍然静默。
 */
test('N1 已知残留：叶子 type 由 integer 改成 string 仍然静默（完整叶子类型表明确不做）', () => {
  const schema = JSON.parse(JSON.stringify(CANONICAL_SCHEMA));
  schema.properties.timeline.items.properties.liunianWindows.items.properties.year.type = 'string';
  const sample = JSON.parse(JSON.stringify(CANONICAL_SAMPLE));
  sample.timeline[0].liunianWindows[0].year = '2030';
  const root = makeCompliantRepo({ schema, sample });
  const r = run(root);
  assert.deepStrictEqual(r.errors, [], r.errors.join('\n'));
});

// ===========================================================================
// 第八轮（补丁轮）：Task 2 Step 5 —— 两条机器断言
//
// 契约里有两处**靠人手抄、靠人口头约定**的地方，不变成机器断言就必然漂移：
//   ① `docs/CAREER_SCHEMA.md` 顶部「枚举速查」表 与 下方 ```json 块的 enum 是手抄的两份；
//   ② 基准样例的 `playbooks[]` 必须覆盖「早期/轻创业/重资产/合伙」四档，
//      且每个 `timeline[].playbook` 必须落在某个 `playbooks[].scale` 上。
//
// ⚠️ 这两条**只放在测试里**，绝不写进 `scripts/validate-skills.js` 的 `run()`：
// 测试夹具 `makeCompliantRepo()` 造出来的 `docs/CAREER_SCHEMA.md` 是由 `schemaMd()` 生成的，
// **它不含那张「枚举速查」表**；放进 `run()` 会让所有夹具用例集体报红。
//
// 两条都**直接读真实仓的文件**（不是夹具）；文件不存在时 `t.skip()` 而不是判红。
// 解析全部自己写 —— 不调用 `scripts/validate-skills.js` / `scripts/lib/schema-check.js`
// 里的任何实现（那是「用被测对象验证被测对象」，测不出抄错）。
// ===========================================================================

const REPO_ROOT = path.resolve(__dirname, '..');
const CAREER_SCHEMA_MD = path.join(REPO_ROOT, 'docs', 'CAREER_SCHEMA.md');
const CAREER_SCHEMA_SAMPLE = path.join(REPO_ROOT, 'docs', 'CAREER_SCHEMA.sample.json');

/** 打法四档 —— 契约规定的闭合集合 */
const EXPECTED_PLAYBOOK_SCALES = ['早期', '轻创业', '重资产', '合伙'];

/**
 * 从 `docs/CAREER_SCHEMA.md` 里抠出「枚举速查」表格。
 * 返回 [{ path, values }]，path 用契约里的写法（如 `playbooks[].scale`）。
 * 表格格式：`| \`字段路径\` | \`甲\` / \`乙\` |`
 */
function parseEnumQuickTable(mdText) {
  const lines = mdText.split(/\r?\n/);
  const rows = [];
  // 只抠「## 枚举速查」那一节里的表格 —— md 里别处将来再加表格也不该被算进来
  let inSection = false;
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s*(.*)$/);
    if (heading) {
      inSection = heading[1].includes('枚举速查');
      continue;
    }
    if (!inSection) continue;
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1);
    if (cells.length !== 2) continue;
    const rawPath = cells[0].trim();
    if (!rawPath.startsWith('`')) continue; // 表头 / 分隔行
    const path = rawPath.replace(/`/g, '').trim();
    const values = cells[1]
      .split('/')
      .map((v) => v.replace(/`/g, '').trim())
      .filter((v) => v.length > 0);
    if (path.length === 0 || values.length === 0) continue;
    rows.push({ path, values });
  }
  return rows;
}

/** 从 md 里抠出 ```json 块并解析 */
function parseContractJsonBlock(mdText) {
  const m = mdText.match(/```json[ \t]*\r?\n([\s\S]*?)\r?\n```/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    return null;
  }
}

/**
 * 按契约路径写法（如 `timeline[].liunianWindows[].action`）在 schema 里定位节点。
 * `x[]` 表示取数组的 items。找不到返回 null。
 */
function resolveSchemaNode(schema, pathStr) {
  let node = schema;
  for (const seg of pathStr.split('.')) {
    if (!node || typeof node !== 'object') return null;
    const isArraySeg = seg.endsWith('[]');
    const key = isArraySeg ? seg.slice(0, -2) : seg;
    if (!node.properties || !(key in node.properties)) return null;
    node = node.properties[key];
    if (isArraySeg) {
      if (!node || !node.items) return null;
      node = node.items;
    }
  }
  return node;
}

/** 列出 schema 里所有带 enum 的路径（契约写法） */
function collectEnumPaths(schema) {
  const out = [];
  const walk = (node, prefix) => {
    if (!node || typeof node !== 'object') return;
    const props = node.properties;
    if (!props || typeof props !== 'object') return;
    for (const [key, sub] of Object.entries(props)) {
      const childPath = prefix ? `${prefix}.${key}` : key;
      if (sub && Array.isArray(sub.enum)) out.push({ path: childPath, values: sub.enum });
      if (sub && sub.properties) walk(sub, childPath);
      if (sub && sub.items && sub.items.properties) walk(sub.items, `${childPath}[]`);
    }
  };
  walk(schema, '');
  return out;
}

test('N3：契约 md 的「枚举速查」表与机读契约块的 enum 完全一致（自己解析比对）', (t) => {
  if (!fs.existsSync(CAREER_SCHEMA_MD)) { t.skip('真实仓没有 docs/CAREER_SCHEMA.md'); return; }
  const mdText = fs.readFileSync(CAREER_SCHEMA_MD, 'utf8');
  const schema = parseContractJsonBlock(mdText);
  if (!schema) { t.skip('docs/CAREER_SCHEMA.md 里抠不出机读契约 json 块'); return; }

  const rows = parseEnumQuickTable(mdText);
  assert.ok(rows.length > 0, '「枚举速查」表里一行都没抠出来 —— 表格被删了或格式变了');

  // ① 表里每一行的取值 == json 块里对应路径的 enum
  for (const row of rows) {
    const node = resolveSchemaNode(schema, row.path);
    assert.ok(node, `表里的路径 ${row.path} 在机读契约块里找不到对应节点`);
    assert.ok(Array.isArray(node.enum), `${row.path} 在机读契约块里没有 enum`);
    assert.deepStrictEqual(
      row.values.slice().sort(),
      node.enum.slice().sort(),
      `${row.path} 的取值与机读契约块里的 enum 不一致`,
    );
  }

  // ② 反向：json 块里的每一个 enum 都必须在表里出现（防「只删表不改块」）
  const tablePaths = new Set(rows.map((r) => r.path));
  for (const e of collectEnumPaths(schema)) {
    assert.ok(tablePaths.has(e.path), `机读契约块里的 ${e.path} 没出现在「枚举速查」表里`);
  }
});

test('N3：基准样例的打法四档齐全，且 timeline[].playbook 引用闭合（自己解析比对）', (t) => {
  if (!fs.existsSync(CAREER_SCHEMA_SAMPLE)) { t.skip('真实仓没有 docs/CAREER_SCHEMA.sample.json'); return; }
  const sample = JSON.parse(fs.readFileSync(CAREER_SCHEMA_SAMPLE, 'utf8'));

  assert.ok(Array.isArray(sample.playbooks), '样例没有 playbooks 数组');
  const scales = sample.playbooks.map((p) => p.scale);
  assert.deepStrictEqual(
    scales.slice().sort(),
    EXPECTED_PLAYBOOK_SCALES.slice().sort(),
    '样例的 playbooks[].scale 没恰好覆盖「早期/轻创业/重资产/合伙」四档',
  );

  const scaleSet = new Set(scales);
  assert.ok(Array.isArray(sample.timeline), '样例没有 timeline 数组');
  for (const [i, step] of sample.timeline.entries()) {
    assert.ok(
      scaleSet.has(step.playbook),
      `timeline[${i}].playbook = ${JSON.stringify(step.playbook)} 不在 playbooks[].scale 里`,
    );
  }
});
