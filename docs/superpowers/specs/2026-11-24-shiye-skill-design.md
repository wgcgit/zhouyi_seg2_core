# zhouyi_seg2 事业择业 skill 知识库 — 设计规格

> 日期：2026-11-24
> 状态：已确认（用户批准）
> 上游参考：`zhouyi_seg1_v2/backend/skills/bazi-tuipan/`（19 个既有 skill）
> 原始资料：`zhouyi_seg2/参考资料/`（5 份 txt）

---

## 1. 目标

把 `参考资料/` 的 5 份事业择业方法论，蒸馏成一套**可被大模型按需加载**的 skill 知识库，
补上 v1/v2 缺失的「调候」与「择业决策链」两块，并给出一份可校验的事业专项 JSON 契约。

**成功标准**：
- 5 个新 skill 的 `Interpretation` 段能独立回答「这个命局该做什么行业、什么打法、什么时候动手」
- `shiye-master` 的输出严格符合 `docs/CAREER_SCHEMA.md` 的契约
- `事业推理结果.txt`（戊辰 己未 乙亥 乙酉 男命）作为基准用例可被复现

## 2. 非目标（本期明确不做）

- 不做 Web 应用、不做后端服务、不接入 v2 的 `career.*` 字段
- 不改动 v1/v2 既有 skill 的任何一个字节（基线逐字拷贝）
- 不做五行→行业的程序化映射表（属于后续接入阶段）

## 3. 仓结构

```
zhouyi_seg2/
├── 参考资料/                     # 原始 5 份 txt，纳入版本管理（蒸馏出处须可追溯）
├── docs/
│   ├── CAREER_SCHEMA.md          # 事业专项 JSON 契约
│   └── superpowers/
│       ├── specs/2026-11-24-shiye-skill-design.md
│       └── plans/2026-11-24-shiye-skill-plan.md
└── skills/bazi-tuipan/
    ├── <v2 基线 42 个文件，逐字拷贝>
    ├── BOOK_OVERVIEW.md  GLOSSARY.md  DIGEST.md
    ├── INDEX.md  PIPELINE_STATE.md  verified.md
    ├── candidates/{principles,frameworks,cases,counter-examples}.md
    ├── wuxing-shiye/SKILL.md  + test-prompts.json
    ├── geshi-shiye/SKILL.md    + test-prompts.json
    ├── tiaohou-shiye/SKILL.md  + test-prompts.json
    ├── suiyun-shiye/SKILL.md   + test-prompts.json
    └── shiye-master.skill.md   + shiye-master/test-prompts.json
```

## 4. 核心方法论：择业决策链

5 份资料不是并列的，是**一条自上而下的叠加链**。每层职责不同，互不越界：

```
调候（tiaohou-shiye）  全局气候？急药是谁？药真/藏/假？   → 决定「药」
        ↓
格局（geshi-shiye）    底盘是哪一格？成格还是破格？        → 决定「底盘」
        ↓
五行（wuxing-shiye）   载体落在哪个实体赛道 + 方位         → 决定「赛道载体」
        ↓
岁运（suiyun-shiye）   原局→大运→流年，何时重仓/轻试/守成  → 决定「时间表」
```

四层是**叠加**关系，不是四选一。这条分工必须写进各 skill 的 `Interpretation` 段首句。

关键约束：
- **调候是 v1/v2 的真空白**。`zhouyi/推盘材料.txt` 中「调候」出现 0 次（grep 计数为 0），
  v1/v2 的 19 个 skill 无对应内容。`tiaohou-shiye` 是全新领域。
- **资料 5（`事业推理结果.txt`）的段落顺序 = `shiye-master` 的推进顺序**，一一对应。

## 5. 五个新 skill

沿用 v2 三段式（`Interpretation` / `A2（Future Trigger）` / `Execution（执行步骤）`）。
运行时**只取 `Interpretation` 段** —— v2 的 `backend/src/llm/prompt.js` 已实现该提取逻辑
（`extractInterpretation()`：取 `## Interpretation（核心方法论）` 到下一个 `## ` 之间的内容），
seg2 产物可直接兼容该机制。

| skill | 来源 | 回答什么 | 依赖的既有 skill |
|---|---|---|---|
| `shiye-master` | 全部 | 决策链编排 + JSON 契约 | 下面 4 个 |
| `tiaohou-shiye` | 事业3.txt | 全局气候？急药是谁？药是真是假？ | `shengshuai-panbie`、`xi-ji-quyong` |
| `geshi-shiye` | 事业2.txt | 底盘是哪一格？成格/破格？七组配格怎么定行业？ | `geshi-dingxing` |
| `wuxing-shiye` | 事业1.txt | 载体落在哪个实体赛道 + 方位 + 复合行业叠加 | `wuxing-shengke` |
| `suiyun-shiye` | 事业4.txt | 原局→大运→流年；重仓/轻试/守成 + 出手窗口 | `dayun-fenxi`、`xi-ji-quyong` |

### 5.1 `shiye-master` 的固定推进顺序

与 `参考资料/事业推理结果.txt` 的段落顺序一一对应：

```
月令格局 → 调候与药真假 → 喜忌 → 忌神赛道边界 → 打法分档 → 大运时间表 → 交运过渡 → 策略总纲
```

## 6. JSON 契约（`docs/CAREER_SCHEMA.md`）

以 `事业推理结果.txt` 的实际结构为准。时间轴**运级为主 + 流年窗口子数组**。

```jsonc
{
  "case":    { "gender": "string", "pillars": { "year": "", "month": "", "day": "", "hour": "" } },
  "monthCommand": { "monthBranch": "", "dayMaster": "", "seasonClimate": "", "verdict": "" },
  "pattern": { "type": "", "verdict": "成格|破格|不清", "storeHouse": "", "reasoning": "" },
  "tiaoHou": { "climateType": "寒局|燥热局|湿重局|燥硬局|春木旺局|秋金肃局",
               "primaryDrug": "", "secondaryDrug": "",
               "drugStatus": "真药|藏药|假药", "drugReasoning": "", "gap": "" },
  "xiJi":    { "xi": [], "ciXi": [], "ji": [] },
  "boundaries": [ { "element": "", "why": "", "condition": "" } ],
  "playbooks":  [ { "scale": "早期|轻创业|重资产|合伙", "condition": "", "actions": [] } ],
  "timeline": [ { "ganZhi": "", "type": "水运|木运|火运|土运|金运",
                  "verdict": "重仓|轻试|守成",
                  "mainTrack": "", "playbook": "",
                  "liunianWindows": [ { "year": 0, "signal": "", "action": "宜|忌" } ] } ],
  "transition": { "risk": "", "advice": "" },
  "summary": { "strategy": "主业重仓|底盘待机|守成缓投", "notes": [] }
}
```

**`boundaries` 与 `playbooks` 是本契约区别于 v2 `career.*` 的关键。**
参考文件中「不是不能碰土金赛道…看着一块肥肉啃不动还沾一身泥」「轻创业/重资产操盘/合伙」
这类内容是资料的灵魂，扁平化成单个字符串会丢失信息，故用结构化数组承载。

枚举值必须严格取自上表 —— `climateType`、`drugStatus`、`verdict`、`scale`、`type`、
`action`、`strategy` 均为闭合集合。

**注意 `verdict` 在两个不同对象上复用且枚举不同**：
`pattern.verdict` ∈ {成格, 破格, 不清}（格局成败），
`timeline.verdict` ∈ {重仓, 轻试, 守成}（该运的策略）。
两处不可混用，`Execution` 段须按对象路径分别指明。

## 7. 用例与验证

- `参考资料/事业推理结果.txt` 整份转成 `candidates/cases.md` 的 `case-001`
  （戊辰 己未 乙亥 乙酉，男命），并在 `shiye-master/test-prompts.json` 配一条该命例压测 prompt。
- `docs/CAREER_SCHEMA.md` 给出必填字段与枚举值清单。
- `shiye-master/SKILL.md` 的 `Execution` 段**逐条对应 JSON 键名**，不允许自由发挥字段名。
- 沿用 v1/v2 的 `test-prompts.json` 约定：每 skill 至少 4 条 `应触发`
  + 1 条 `诱饵-边界模糊`（`should_fire: false`）。

## 8. 已知约束

- **`core.autocrlf=true`**：工作区文件检出为 CRLF，`diff -r` 会误报与源仓的差异。
  判定「基线逐字一致」必须用 `git hash-object` 比对 blob，不看工作区。
- **运行时只加载 `Interpretation` 段**：`A2` / `Execution` 是流程指令，与 JSON 契约冲突，
  不得拼进 system prompt。
