# Chess Me 全局评价方与多局棋力画像改造计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 把“评价方=白棋/黑棋/双方”提升为整盘分析、自然语言教练、复盘报告、中局训练、开局训练、残局训练、个人棋力画像共享的一等上下文，并让个人棋力画像支持跨多个对局累计统计。

**Architecture:** 新增统一的 evaluation side controller/helper，所有消费分析结果的模块都必须显式接收 `evaluatedColor` 或 `evaluationSide`，不能再隐式依赖“当前棋盘视角”或混用双方行动。个人棋力画像拆成“当前对局画像”和“多局累计画像”两层：当前分析结果进入每局快照，快照可累计到历史库并按评价方/范围筛选统计。

**Tech Stack:** React + TypeScript，核心文件 `src/App.tsx`，测试 `src/App.test.ts`，验证命令 `npm test -- --run` 与 `npm run build`。

---

## 当前用户反馈对应的产品问题

1. 个人棋力画像缺少白/黑评价方切换；不能只隐式跟随刚上传 PGN 或棋盘视角。
2. 个人棋力画像只统计当前导入对局，价值不足；应支持多对局累计，让用户感知棋力进步。
3. 自然语言教练也必须支持黑/白与关键时刻组合过滤，不能在用户执白时列出黑棋败着当成用户问题。
4. 复盘报告、中局计划训练缺少评价方切换。
5. 需要全面检查开局训练、残局训练等是否同样混用双方行动或隐式依赖视角。

## 全局验收标准

- 所有“评价/归因/训练建议”类功能都有明确评价方：白方、黑方、双方。
- 用户能在相关模块内切换评价方，而不是只能通过棋盘翻转或默认视角间接影响。
- 默认评价方可以从当前棋盘/白方视角推导，但 UI 必须可见且可改。
- 自然语言教练、复盘报告、棋力画像、中局训练、开局训练、残局训练不得把对手败着/失误归因给被评价方。
- 个人棋力画像能按当前对局、最近 N 局、全部已保存对局统计，并按白/黑筛选。
- 所有改动必须有回归测试，且 `npm test -- --run`、`npm run build` 通过。

---

## Task 1: 全局评价方控制器与共享筛选 helper

**Objective:** 建立统一评价方状态、标签、过滤函数，供所有模块复用。

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.ts`

**Steps:**
1. 添加/完善类型：`EvaluationSide = 'white' | 'black' | 'both'`，并保留必要的 `Color = 'w' | 'b'` 映射。
2. 新增 helper：
   - `evaluationSideToColor(side): Color | undefined`
   - `getEvaluationSideLabel(side): string`
   - `filterAnalysesByEvaluationSide(analyses, side)`
   - `filterKeyAnalysesByEvaluationSide(analyses, side)`
3. 新增测试覆盖：白方只返回白棋行动，黑方只返回黑棋行动，双方返回全部。
4. 在 `App` 顶层增加统一状态，例如 `const [evaluationSide, setEvaluationSide] = useState<EvaluationSide>('white')`；默认值可继续沿用现有白方/棋盘下方逻辑，但必须暴露给模块 UI。
5. 验证：`npm test -- --run`。

**Acceptance:** 任何模块都能通过同一 helper 获取“被评价方行动集合”。

---

## Task 2: 个人棋力画像评价方切换 + 当前对局统计修正

**Objective:** 个人棋力画像显式支持白/黑/双方切换，不再隐式跟随棋盘视角。

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.ts`

**Steps:**
1. 定位个人棋力画像渲染组件/区域。
2. 添加评价方切换按钮：白方、黑方、双方。
3. 将 `buildStrengthProfile` 的入参从可选 `evaluatedColor` 迁移或适配为 `evaluationSide`。
4. 所有 phase breakdown、mistakeTypes、weakAreas、summary 都基于 `filterAnalysesByEvaluationSide` 后的数据。
5. 测试：同一组分析数据中，白方画像不包含黑方败着损失；黑方画像不包含白方失误；双方画像包含两边。
6. 验证：`npm test -- --run`。

**Acceptance:** 用户在个人棋力画像模块里可以直接切换白/黑/双方，并看到统计变化。

---

## Task 3: 多对局累计棋力画像数据模型与 UI

**Objective:** 个人棋力画像支持多个对局累计统计，提供当前对局/最近 N 局/全部对局视图。

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.ts`

**Steps:**
1. 复用或扩展现有 review/history/bulk PGN 数据结构，定义 `StrengthProfileGameSnapshot`：
   - game id / source title
   - date or importedAt
   - analyses summary
   - per-color total moves, key moments, total loss, mistake counts
2. 当前对局完成整盘分析后，可生成当前快照。
3. 支持把当前快照加入累计样本；如果已有批量 PGN/历史库，则优先从现有历史数据生成快照，避免重复存储。
4. 个人棋力画像 UI 增加范围切换：当前对局、最近 5 局、最近 20 局、全部已保存对局。
5. `buildStrengthProfile` 支持输入多个 snapshot 或多局 analyses 后聚合。
6. 测试：两局样本累计后总损失/错误数等于两局之和；切换最近 1/全部结果不同；按白方/黑方仍正确隔离。
7. 验证：`npm test -- --run`。

**Acceptance:** 多局累计画像不是只看当前导入 PGN，用户能看到长期累计指标。

**Scope note:** 如果现有代码没有稳定的持久化机制，本任务先实现“当前会话内多局累计 + 复用已有历史库”；localStorage/后端持久化可拆为后续独立任务。

---

## Task 4: 自然语言教练按评价方 + 关键时刻过滤

**Objective:** 自然语言教练支持与整盘分析相同的白/黑/关键组合过滤，避免列出对手败着作为用户问题。

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.ts`

**Steps:**
1. 定位 `buildNaturalLanguageCoachReport` 与自然语言教练 UI。
2. 添加过滤状态，复用 `GlobalAnalysisMomentFilter` 或抽象为共享 filter。
3. 过滤项至少支持：全部、关键时刻、白棋行动、黑棋行动、白棋关键、黑棋关键。
4. 若自然语言教练是给“玩家”的建议，默认使用当前 `evaluationSide`；但仍允许手动切换。
5. 测试：用户选择白棋关键时，报告不包含黑棋败着；选择黑棋关键时不包含白棋失误。
6. 验证：`npm test -- --run`。

**Acceptance:** 自然语言教练输出与筛选 UI 一致，所有建议都标注评价方/走棋方。

---

## Task 5: 复盘报告与中局计划训练评价方切换

**Objective:** 复盘报告、中局计划训练都有独立可见的评价方切换，并按评价方生成建议。

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.ts`

**Steps:**
1. 复盘报告区域添加评价方切换控件，默认同步全局 `evaluationSide`。
2. 中局计划训练区域添加评价方切换控件或复用同一控件。
3. `buildReviewReport` 改为接收 `evaluationSide`，并过滤 `analyses`。
4. `buildMiddlegamePlanTraining` 或相关中局 helper 必须接收评价方并过滤，只给被评价方生成训练卡。
5. 测试：白方报告/中局训练不包含黑方败着卡；黑方报告/中局训练不包含白方失误卡。
6. 验证：`npm test -- --run`。

**Acceptance:** 复盘报告与中局训练不再依赖隐式棋盘视角，用户可直接切换评价方。

---

## Task 6: 开局训练、残局训练及其他功能归因审计

**Objective:** 系统性检查所有训练/报告功能是否有同类“双方混用/对手归因”问题，并修复发现的问题。

**Files:**
- Modify: `src/App.tsx` and relevant files if split exists
- Test: `src/App.test.ts`

**Steps:**
1. 搜索以下关键词定位所有相关模块：`Opening`, `Endgame`, `Training`, `Report`, `Coach`, `Profile`, `Mistake`, `Plan`, `关键`, `失误`, `败着`, `训练`。
2. 列出每个模块的数据来源与是否按评价方过滤。
3. 对开局训练：确认是否按用户执色判断“偏离开局库”的一方；若当前是双方视角，要在 UI 标注“双方开局偏离”，不能归因用户。
4. 对残局训练：残局 missedChance/recommendedMove 卡必须标注走棋方，并支持评价方过滤。
5. 对错题卡/候选着训练等：确认是否只收集被评价方错误，或明确标注对手错误。
6. 为每个修复点补测试。
7. 验证：`npm test -- --run` 与 `npm run build`。

**Acceptance:** 审计结果形成清单；发现的同类归因问题均已修复或明确拆出后续任务。

---

## Task 7: 集成验证、推送与回归说明

**Objective:** 汇总所有改动，验证并推送 reviewable feature branch。

**Files:**
- Modify as needed: README or release note if project已有说明区。

**Steps:**
1. Run: `npm test -- --run`，expected PASS。
2. Run: `npm run build`，expected PASS。
3. Run: `git diff --check`，expected no whitespace errors。
4. Commit with message: `feat: add product-wide evaluation side controls`。
5. Push branch: `git push -u origin feat/evaluation-side-product-wide`。
6. 如果需要，创建 PR 或给出 PR 创建链接。

**Acceptance:** 分支可审查、可回归，Dev 已作为基线，功能分支独立。
