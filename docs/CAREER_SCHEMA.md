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
  成败**一律按 `参考资料/事业2.txt:85-88` 重新判定**，不得照抄任何既有样例：
  **成格** = 格局清、有护卫、有去路（可以直接走对应赛道当主业，放大格局优势）；
  **破格** = 用神被冲、被合、被克（不是完全不能做，是不能重仓押这条线，要找通关赛道或换一条做功链条）；
  成格那三条（格局清、有护卫、有去路）凑不齐、又说不上破在哪一处，就填 `不清`。
  注意「破格」说的是**不能重仓押这条线**，不等于「什么都不能做」——
  重仓 / 轻试 / 守成是岁运层对**赛道**的取舍（`timeline[].verdict`），两处不可互相推导。
- `tiaoHou` —— 调候：全局气候类型、主药（第一调候用神）、次药、药的真假状态、判断理由、还缺什么。
  `primaryDrug` / `secondaryDrug` 是**调候层**的主药与次药（`参考资料/事业3.txt` 六大气机各给一对，**必填**）。
- `xiJi` —— 喜忌：喜用五行、次喜五行、忌神五行。
  其中 `xi`（喜用）与 `ji`（忌神）**必非空**（忌神由喜用关系派生，即使该五行不在原局仍是忌）；
  `ciXi`（次喜）**允许为空数组** —— 它是**喜忌层的第三档加分项**，本次命例若没有明显次喜就留空，
  **不得为凑满而编一个次喜**。
  ⚠️ `xiJi.ciXi`（喜忌层次喜）与 `tiaoHou.secondaryDrug`（调候层次药）**分属两层，不得互相顶替**；
  本命例两层恰好都是丙火，那是巧合。
- `boundaries` —— **忌神赛道的边界**：某五行不是不能碰，而是缺了通关条件会怎样。每条三要素：五行、为什么、有条件时怎么碰。
- `playbooks` —— **打法分档**：按体量分四档（早期借平台 / 轻创业 / 重资产操盘 / 合伙），每档给适用条件与具体动作。
  **四档齐全**：四档都要给出；某档在本命例确实不适用，也要保留该档并写明不适用及理由，不许省略该档。
  `timeline[].playbook` 指向的档位**必须**是 `playbooks[].scale` 里的某一项。
- `timeline` —— 大运时间表：**每步大运一条**，干支、五行类型、策略定性（重仓/轻试/守成）、主赛道、对应打法档位，以及该运内的流年窗口。
  `ganZhi` 是**单步**大运的干支（如 `癸亥`）；资料里的「水运（亥、子）」是**五行分组**的口语说法
  （该组含 `癸亥`、`甲子` 两步），落到本字段时**逐步拆开、各填各的干支**。
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