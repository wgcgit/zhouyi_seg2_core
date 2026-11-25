# 八字推盘 Skill 系统 — INDEX

## 总入口（顶级 Skill）

| 文件名 | name | 描述 |
|---|---|---|
| `tuipan-master.skill.md` | `tuipan-master` | **总入口**，按13模块固定格式输出 |
| `八字完整推盘输出通用规范.skill.md` | `八字完整推盘输出通用规范` | **格式标准**，含13模块定义 |
| `xi-ji-quyong.skill.md` | `xi-ji-quyong` | 喜忌取用 |

---

## Skill 调用关系图

```
用户输入 → "tuipan-master"
                │
                ├── paipan-jichu ──→ shishen-jichu
                ├── tiangan-wuhe
                ├── dizhi-liuhe
                ├── dizhi-liuchong
                ├── dizhi-liuchuan
                ├── dizhi-xiangxing
                ├── dizhi-sanhe
                ├── dizhi-sanhui
                ├── dizhi-banhe
                ├── shengshuai-panbie ──→ geshi-dingxing ──→ xi-ji-quyong
                │                               ↓
                │                         wuxing-shengke
                │
                ├── shier-changsheng  ←【新增：模块四，十二长生】
                ├── shishen-zuhe
                └── dayun-fenxi
```

---

## Skill 完整清单（17个 + 1个规范 + 1个总入口）

| # | name | 文件路径 | 核心功能 |
|---|---|---|---|
| 1 | **tuipan-master** | `tuipan-master.skill.md` | **总入口**，13模块固定格式 |
| 2 | **八字完整推盘输出通用规范** | `八字完整推盘输出通用规范.skill.md` | **格式标准** |
| 3 | paipan-jichu | `paipan-jichu/SKILL.md` | 排四柱/藏干/十神 |
| 4 | tiangan-wuhe | `tiangan-wuhe/SKILL.md` | 天干五合 |
| 5 | dizhi-liuhe | `dizhi-liuhe/SKILL.md` | 地支六合 |
| 6 | dizhi-liuchong | `dizhi-liuchong/SKILL.md` | 地支六冲 |
| 7 | dizhi-liuchuan | `dizhi-liuchuan/SKILL.md` | 地支六穿 |
| 8 | dizhi-xiangxing | `dizhi-xiangxing/SKILL.md` | 地支相刑 |
| 9 | dizhi-sanhe | `dizhi-sanhe/SKILL.md` | 地支三合局 |
| 10 | dizhi-sanhui | `dizhi-sanhui/SKILL.md` | 地支三会局 |
| 11 | dizhi-banhe | `dizhi-banhe/SKILL.md` | 地支半合局 |
| 12 | shishen-jichu | `shishen-jichu/SKILL.md` | 十神基础 |
| 13 | shishen-zuhe | `shishen-zuhe/SKILL.md` | 十神组合象法 |
| 14 | shengshuai-panbie | `shengshuai-panbie/SKILL.md` | 旺衰判断 |
| 15 | wuxing-shengke | `wuxing-shengke/SKILL.md` | 五行生克制化 |
| 16 | geshi-dingxing | `geshi-dingxing/SKILL.md` | 格局定性 |
| 17 | xi-ji-quyong | `xi-ji-quyong.skill.md` | 喜忌取用 |
| 18 | **shier-changsheng** | `shier-changsheng/SKILL.md` | **十二长生（生旺死绝）** |
| 19 | dayun-fenxi | `dayun-fenxi/SKILL.md` | 大运分析 |

---

## 13模块固定顺序（与 tuipan-master 对应）

| 顺序 | 模块 | 对应 skill |
|---|---|---|
| 模块一 | 四柱、藏干、十神 | paipan-jichu |
| 模块二 | 地支刑冲合害拆解 | tiangan-wuhe + dizhi-* |
| 模块三 | 旺衰+格局+喜忌 | shengshuai-panbie + geshi-dingxing + xi-ji-quyong |
| **模块四** | **十二长生旺衰全解** | **shier-changsheng** |
| 模块五 | 性格心性 | shishen-zuhe |
| 模块六 | 事业财运 | shishen-zuhe |
| 模块七 | 婚姻感情 | paipan-jichu |
| 模块八 | 身体健康 | wuxing-shengke |
| 模块九 | 大运分析 | dayun-fenxi |
| 模块十 | 全局总结建议 | — |
| 模块十一 | 父母六亲 | paipan-jichu |
| 模块十二 | 子女六亲 | paipan-jichu |
| 模块十三 | 格局深度复盘 | geshi-dingxing |

---

## 激活方式

用户输入以下任一关键词时，触发 `tuipan-master`：

- "测一下这个人的八字"
- "排一下这个人的八字"
- "看一下命盘"
- "算一下八字"

---

## 支撑文件

| 文件 | 说明 |
|---|---|
| `INDEX.md` | 本文件 |
| `GLOSSARY.md` | 八字术语词典 |
| `verified.md` | 三重验证结果 |
| `DIGEST.md` | 精华摘要 |
| `BOOK_OVERVIEW.md` | 阶段0整书理解 |
| `PIPELINE_STATE.md` | 流水线状态 |

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
