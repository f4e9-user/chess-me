# chess-me 任务A：UI 布局改造计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 将 chess-me 的棋盘区与功能工作区重做为更清晰的左右/上下布局，减少信息拥挤，让分析、复盘、训练、画像等模块在同一页面内更易浏览与切换。

**Architecture:** 先把页面外壳抽成稳定的布局容器，再逐步把棋盘、控制区、结果区、历史区迁入新的工作区结构。布局改造只处理 UI 组织、响应式行为、区域折叠/切换和测试，不改动任务B已经完成的评价方归因逻辑。

**Tech Stack:** React + TypeScript，核心文件 `src/App.tsx`、`src/styles.css`、`src/App.test.ts`，验证命令 `npm test -- --run` 与 `npm run build`。

---

## 任务边界

- 只做 **任务A：UI 布局改造**。
- 不重做评价方逻辑，不回头修改任务B已完成的整盘分析/复盘报告/棋力画像归因。
- 不引入新的产品功能，只重排已有功能与交互结构。

## 期望效果

- 棋盘、分析、报告、训练、画像在视觉上分区清楚。
- 用户能更快找到当前正在看的模块。
- 小屏下能自然折叠/堆叠，不破坏现有功能。
- 不影响已有分析、训练、历史记录与导入流程。

---

## Task A1: 提炼页面布局外壳与主工作区结构

**Objective:** 把现有 App 页面抽成稳定的布局容器，为后续模块迁移提供清晰结构。

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `src/App.test.ts`

**Step 1: 写失败测试**

增加一组 UI 断言，验证页面有明确的主工作区容器、棋盘区、功能区与结果区语义结构。例如可通过 `aria-label`、标题或稳定测试 id 检查这些区域存在。

**Step 2: 跑测试确认失败**

Run: `npm test -- --run`
Expected: 新增断言失败，说明当前布局语义还不存在。

**Step 3: 最小实现**

在 `App.tsx` 中提炼布局壳：
- `app-shell`
- `main-workspace`
- `board-column`
- `panel-column`
- `results-area`

用现有组件内容填充，不改业务逻辑。

**Step 4: 复跑测试**

Run: `npm test -- --run`
Expected: 通过。

**Step 5: 提交**

```bash
git add src/App.tsx src/App.test.ts src/styles.css
git commit -m "feat: add chess-me layout shell"
```

---

## Task A2: 重排棋盘、分析、训练、历史入口的视觉层级

**Objective:** 将核心功能模块放入新的布局壳，提升页面可读性和区域分隔。

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `src/App.test.ts`

**Step 1: 写失败测试**

补充测试，验证以下区域在页面中有清晰位置或顺序：
- 棋盘/局面显示
- 当前分析结果
- 复盘报告
- 训练建议
- 棋力画像
- 历史/导入入口

**Step 2: 跑测试确认失败**

Run: `npm test -- --run`
Expected: 至少一项布局断言失败。

**Step 3: 最小实现**

调整 JSX 结构与 CSS：
- 把分析/报告/训练/画像拆成独立卡片或折叠面板
- 让当前对局和历史数据入口分离显示
- 保持已有按钮和内容不丢失

**Step 4: 复跑测试**

Run: `npm test -- --run`
Expected: 通过。

**Step 5: 提交**

```bash
git add src/App.tsx src/App.test.ts src/styles.css
git commit -m "feat: reorganize chess-me workspace panels"
```

---

## Task A3: 响应式布局与窄屏折叠

**Objective:** 确保布局在窄屏下自动转为可用的单列或折叠布局。

**Files:**
- Modify: `src/styles.css`
- Modify: `src/App.tsx`（如需添加折叠状态）
- Test: `src/App.test.ts`

**Step 1: 写失败测试**

补充测试，验证在窄屏模拟下布局不会挤坏，关键区域仍可访问。

**Step 2: 跑测试确认失败**

Run: `npm test -- --run`
Expected: 响应式断言失败。

**Step 3: 最小实现**

添加媒体查询或可折叠容器：
- 桌面：左右分栏
- 窄屏：单列堆叠
- 保持按钮、列表、结果内容可滚动可访问

**Step 4: 复跑测试**

Run: `npm test -- --run`
Expected: 通过。

**Step 5: 提交**

```bash
git add src/App.tsx src/App.test.ts src/styles.css
git commit -m "feat: make chess-me layout responsive"
```

---

## Task A4: 集成验证与回归审查

**Objective:** 对任务A整体做最终验证，确保未破坏任务B已有的评价方逻辑与训练/报告功能。

**Files:**
- Modify as needed: `src/App.tsx`, `src/styles.css`, `src/App.test.ts`

**Step 1: 写集成测试**

补充一条回归测试，确认：
- 评价方切换仍在
- 复盘报告/棋力画像/自然语言教练仍可打开
- 布局变化不影响关键功能输出

**Step 2: 跑全量验证**

Run:
```bash
npm test -- --run
npm run build
git diff --check
```
Expected: 全部通过。

**Step 3: 提交并推送**

```bash
git add -A
git commit -m "feat: complete chess-me ui layout refactor"
git push -u origin feat/ui-layout-refactor
```

**Step 4: 看板复核**

创建/更新 reviewer 任务，确认 UI 布局改造已完成且未引入回归。

---

## 推荐执行顺序

1. `Task A1`
2. `Task A2`
3. `Task A3`
4. `Task A4`

如果实现时发现某一块明显超出单卡循环，再继续拆分，不要把布局、响应式、历史侧栏、筛选抽屉塞进同一张卡。
