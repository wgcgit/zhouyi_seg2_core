# 八字推盘 Skill 流水线状态

## 阶段 0 — 整书理解
- [x] 完成 BOOK_OVERVIEW.md

## 阶段 1 — 并行提取
- [x] candidates/ 目录已创建

## 阶段 1.5 — 三重验证筛选
- [x] verified.md 已创建，全部单元通过

## 阶段 2 — RIA++ 构造 Skill
- [x] 主 skill tuipan-master 已创建（13模块）
- [x] 17个子 skill 全部创建完成
- [x] 新增 shier-changsheng（十二长生）
- [x] 所有 test-prompts.json 已创建

## 阶段 3 — Zettelkasten 链接
- [x] INDEX.md 已生成（含引用图和调用关系）

## 阶段 4 — 压力测试
- [ ] 待实施（test-prompts.json 已就绪）

## 阶段 5 — 交付
- [x] DIGEST.md 已生成

---

## Skill 完整清单（18个子 skill + 2个顶级 + 1个规范）

| Skill | 状态 |
|---|---|
| tuipan-master（总入口） | ✅ |
| 八字完整推盘输出通用规范 | ✅ |
| paipan-jichu | ✅ |
| tiangan-wuhe | ✅ |
| dizhi-liuhe | ✅ |
| dizhi-liuchong | ✅ |
| dizhi-liuchuan | ✅ |
| dizhi-xiangxing | ✅ |
| dizhi-sanhe | ✅ |
| dizhi-sanhui | ✅ |
| dizhi-banhe | ✅ |
| shishen-jichu | ✅ |
| shishen-zuhe | ✅ |
| shengshuai-panbie | ✅ |
| wuxing-shengke | ✅ |
| geshi-dingxing | ✅ |
| xi-ji-quyong | ✅ |
| dayun-fenxi | ✅ |
| **shier-changsheng（新增）** | ✅ |

## 激活方式

用户输入以下任一关键词时，触发 tuipan-master：
- "测一下这个人的八字"
- "排一下这个人的八字"
- "看一下命盘"
- "算一下八字"

## 新增说明

- **2026-08-27**：新增 `shier-changsheng` skill（十二长生/生旺死绝）
- 规范从12模块升级为**13模块**，新增模块四"十二长生旺衰全解"
- 十二长生核心表、阴阳顺逆规则、12状态逐位详解均已蒸馏入 skill

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
