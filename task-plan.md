# workflow_bugfix 任务规划文档

## 1. 任务分解原则

1. **按模块分解**：插件结构、工具层、Agent 定义、测试
2. **识别依赖**：基础设施 → 工具层 → Agent 层 → 集成
3. **并行优先**：无依赖任务并行执行
4. **增量交付**：每个任务产出可独立验证

---

## 2. 任务列表

### Phase 1: 基础设施（Foundation）

#### T1.1: 项目初始化
**描述**：创建项目目录结构、package.json、依赖安装
**产出**：
- `package.json`
- `tsconfig.json` 或 `jsconfig.json`
- 目录结构（agents/, skills/, lib/, bin/, schemas/, templates/）
**依赖**：无
**并行度**：1
**预计耗时**：30 分钟

#### T1.2: Schema 定义
**描述**：定义所有 JSON Schema（workflow, analysis, context, test-result, acceptance, fix-result, verify-report, output）
**产出**：
- `schemas/workflow.schema.json`
- `schemas/analysis.schema.json`
- `schemas/context.schema.json`
- `schemas/test-result.schema.json`
- `schemas/acceptance.schema.json`
- `schemas/fix-result.schema.json`
- `schemas/verify-report.schema.json`
- `schemas/output.schema.json`
**依赖**：T1.1
**并行度**：1（可拆分为 8 个子任务并行）
**预计耗时**：1 小时

#### T1.3: 模板文件
**描述**：创建模板文件（workflow.json, repos.json, log-patterns.json, report.md）
**产出**：
- `templates/workflow.json.template`
- `templates/repos.json.template`
- `templates/log-patterns.json.template`
- `templates/report.md.template`
**依赖**：T1.2
**并行度**：1（可拆分为 4 个子任务并行）
**预计耗时**：30 分钟

---

### Phase 2: 工具层（Tools Layer）

#### T2.1: 状态管理模块
**描述**：实现 `lib/state-manager.js`（init, load, advance, rollback）
**产出**：
- `lib/state-manager.js`
- 单元测试
**依赖**：T1.2
**并行度**：1
**预计耗时**：2 小时

#### T2.2: 索引构建模块
**描述**：实现 `lib/index-builder.js`（Tree-sitter 解析、符号提取、哈希计算、增量更新）
**产出**：
- `lib/index-builder.js`
- Tree-sitter 集成
- 单元测试
**依赖**：T1.1
**并行度**：1
**预计耗时**：4 小时

#### T2.3: 多仓库管理模块
**描述**：实现 `lib/repo-manager.js`（list, sync-branches, sync-commits）
**产出**：
- `lib/repo-manager.js`
- 单元测试
**依赖**：T1.1
**并行度**：1
**预计耗时**：2 小时

#### T2.4: 测试执行模块
**描述**：实现 `lib/test-runner.js`（discover, run, parse-result）
**产出**：
- `lib/test-runner.js`
- 支持 gtest/jest/pytest
- 单元测试
**依赖**：T1.1
**并行度**：1
**预计耗时**：3 小时

#### T2.5: Git 操作模块
**描述**：实现 `lib/git-ops.js`（create-branch, commit, tag-checkpoint, rewind）
**产出**：
- `lib/git-ops.js`
- 单元测试
**依赖**：T1.1
**并行度**：1
**预计耗时**：2 小时

#### T2.6: 日志解析模块
**描述**：实现 `lib/log-parser.js`（parse, extract-clues）
**产出**：
- `lib/log-parser.js`
- 单元测试
**依赖**：T1.3
**并行度**：1
**预计耗时**：2 小时

#### T2.7: 上下文检索模块
**描述**：实现 `lib/context-retriever.js`（search-files, search-symbols, trace-calls, analyze-impact, blast-radius, find-hubs, find-bridges）
**产出**：
- `lib/context-retriever.js`
- 单元测试
**依赖**：T2.2
**并行度**：1
**预计耗时**：4 小时

#### T2.8: CLI 工具入口
**描述**：实现 `bin/bugfix-cli`（Commander.js 入口，调用各模块）
**产出**：
- `bin/bugfix-cli`
- 命令行帮助文档
**依赖**：T2.1, T2.2, T2.3, T2.4, T2.5, T2.6, T2.7
**并行度**：1
**预计耗时**：2 小时

#### T2.9: MCP 服务器配置
**描述**：实现 `mcp/bugfix-server.json`（暴露所有工具）
**产出**：
- `mcp/bugfix-server.json`
- MCP 工具映射
**依赖**：T2.8
**并行度**：1
**预计耗时**：1 小时

---

### Phase 3: Agent 定义（Agent Layer）

#### T3.1: bugfix-lead Agent
**描述**：定义 `agents/bugfix-lead.md`（主协调 Agent）
**产出**：
- `agents/bugfix-lead.md`
**依赖**：T2.9
**并行度**：1
**预计耗时**：1 小时

#### T3.2: analyzer Agent
**描述**：定义 `agents/analyzer.md`（输入分析 Agent）
**产出**：
- `agents/analyzer.md`
**依赖**：T2.9
**并行度**：1
**预计耗时**：1 小时

#### T3.3: locator Agent（含 sub-agents）
**描述**：定义 `agents/locator.md` 及 3 个 sub-agents（locator-file, locator-symbol, locator-graph）
**产出**：
- `agents/locator.md`
- `agents/locator-file.md`
- `agents/locator-symbol.md`
- `agents/locator-graph.md`
**依赖**：T2.9
**并行度**：1（可拆分为 4 个子任务并行）
**预计耗时**：2 小时

#### T3.4: tester Agent
**描述**：定义 `agents/tester.md`（测试编写 Agent）
**产出**：
- `agents/tester.md`
**依赖**：T2.9
**并行度**：1
**预计耗时**：1 小时

#### T3.5: fixer Agent
**描述**：定义 `agents/fixer.md`（修复实现 Agent）
**产出**：
- `agents/fixer.md`
**依赖**：T2.9
**并行度**：1
**预计耗时**：1 小时

#### T3.6: verifier Agent（含 sub-agents）
**描述**：定义 `agents/verifier.md` 及 3 个 sub-agents（verifier-unit, verifier-integration, verifier-impact）
**产出**：
- `agents/verifier.md`
- `agents/verifier-unit.md`
- `agents/verifier-integration.md`
- `agents/verifier-impact.md`
**依赖**：T2.9
**并行度**：1（可拆分为 4 个子任务并行）
**预计耗时**：2 小时

---

### Phase 4: 技能入口（Skills Layer）

#### T4.1: bugfix-start Skill
**描述**：实现 `skills/bugfix-start/SKILL.md`
**产出**：
- `skills/bugfix-start/SKILL.md`
**依赖**：T3.1
**并行度**：1
**预计耗时**：30 分钟

#### T4.2: feature-start Skill
**描述**：实现 `skills/feature-start/SKILL.md`
**产出**：
- `skills/feature-start/SKILL.md`
**依赖**：T3.1
**并行度**：1
**预计耗时**：30 分钟

#### T4.3: resume-workflow Skill
**描述**：实现 `skills/resume-workflow/SKILL.md`
**产出**：
- `skills/resume-workflow/SKILL.md`
**依赖**：T3.1
**并行度**：1
**预计耗时**：30 分钟

#### T4.4: workflow-status Skill
**描述**：实现 `skills/workflow-status/SKILL.md`
**产出**：
- `skills/workflow-status/SKILL.md`
**依赖**：T3.1
**并行度**：1
**预计耗时**：30 分钟

#### T4.5: rewind Skill
**描述**：实现 `skills/rewind/SKILL.md`
**产出**：
- `skills/rewind/SKILL.md`
**依赖**：T3.1
**并行度**：1
**预计耗时**：30 分钟

#### T4.6: rebuild-index Skill
**描述**：实现 `skills/rebuild-index/SKILL.md`
**产出**：
- `skills/rebuild-index/SKILL.md`
**依赖**：T3.1
**并行度**：1
**预计耗时**：30 分钟

---

### Phase 5: Hooks 与集成（Hooks & Integration）

#### T5.1: Hooks 定义
**描述**：实现 `hooks/hooks.json`（阶段门控）
**产出**：
- `hooks/hooks.json`
**依赖**：T4.1, T4.2, T4.3, T4.4, T4.5, T4.6
**并行度**：1
**预计耗时**：1 小时

#### T5.2: 插件元数据
**描述**：实现 `.claude-plugin/plugin.json`
**产出**：
- `.claude-plugin/plugin.json`
**依赖**：T5.1
**并行度**：1
**预计耗时**：30 分钟

---

### Phase 6: 测试与文档（Testing & Documentation）

#### T6.1: 单元测试
**描述**：为所有 lib/ 模块编写单元测试
**产出**：
- `test/state-manager.test.js`
- `test/index-builder.test.js`
- `test/repo-manager.test.js`
- `test/test-runner.test.js`
- `test/git-ops.test.js`
- `test/log-parser.test.js`
- `test/context-retriever.test.js`
**依赖**：T2.1, T2.2, T2.3, T2.4, T2.5, T2.6, T2.7
**并行度**：7（每个模块独立测试）
**预计耗时**：4 小时

#### T6.2: 集成测试
**描述**：端到端测试（bugfix 流程、feature 流程）
**产出**：
- `test/integration/bugfix-flow.test.js`
- `test/integration/feature-flow.test.js`
**依赖**：T5.2
**并行度**：2
**预计耗时**：3 小时

#### T6.3: README 文档
**描述**：编写 README.md（安装、使用、示例）
**产出**：
- `README.md`
**依赖**：T5.2
**并行度**：1
**预计耗时**：1 小时

---

## 3. 任务依赖 DAG

```
                    ┌─────────┐
                    │  T1.1   │ 项目初始化
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┬───────────────┐
         │               │               │               │
    ┌────▼────┐     ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
    │  T1.2   │     │  T2.2   │     │  T2.3   │     │  T2.4   │
    │ Schema  │     │  索引   │     │ 多仓库  │     │  测试   │
    └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
         │               │               │               │
    ┌────▼────┐     ┌────▼────┐         │               │
    │  T1.3   │     │  T2.7   │         │               │
    │ 模板    │     │ 上下文  │         │               │
    └────┬────┘     └────┬────┘         │               │
         │               │               │               │
    ┌────▼────┐          │               │          ┌────▼────┐
    │  T2.1   │          │               │          │  T2.5   │
    │ 状态管理│          │               │          │  Git    │
    └────┬────┘          │               │          └────┬────┘
         │               │               │               │
    ┌────▼────┐     ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
    │  T2.6   │     │         │     │         │     │         │
    │ 日志解析│     │         │     │         │     │         │
    └────┬────┘     │         │     │         │     │         │
         │          │         │     │         │     │         │
         └──────────┴─────────┴─────┴─────────┴─────┘
                         │
                    ┌────▼────┐
                    │  T2.8   │ CLI 工具
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │  T2.9   │ MCP 配置
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┬───────────────┐
         │               │               │               │
    ┌────▼────┐     ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
    │  T3.1   │     │  T3.2   │     │  T3.3   │     │  T3.4   │
    │  lead   │     │analyzer │     │ locator │     │ tester  │
    └────┬────┘     └─────────┘     └─────────┘     └─────────┘
         │
    ┌────▼────┐     ┌─────────┐
    │  T3.5   │     │  T3.6   │
    │  fixer  │     │verifier │
    └────┬────┘     └────┬────┘
         │               │
         └───────┬───────┘
                 │
         ┌───────┴───────┬───────────────┬───────────────┐
         │               │               │               │
    ┌────▼────┐     ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
    │  T4.1   │     │  T4.2   │     │  T4.3   │     │  T4.4   │
    │ bugfix  │     │ feature │     │ resume  │     │ status  │
    └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
         │               │               │               │
    ┌────▼────┐     ┌────▼────┐         │               │
    │  T4.5   │     │  T4.6   │         │               │
    │ rewind  │     │rebuild  │         │               │
    └────┬────┘     └────┬────┘         │               │
         │               │               │               │
         └───────────────┴───────────────┴───────────────┘
                         │
                    ┌────▼────┐
                    │  T5.1   │ Hooks
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │  T5.2   │ 插件元数据
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
    │  T6.1   │     │  T6.2   │     │  T6.3   │
    │单元测试 │     │集成测试 │     │ README  │
    └─────────┘     └─────────┘     └─────────┘
```

---

## 4. 并行执行批次

### Batch 1（并行度 1）
- T1.1: 项目初始化

### Batch 2（并行度 8）
- T1.2: Schema 定义（可拆分为 8 个子任务）
  - T1.2.1: workflow.schema.json
  - T1.2.2: analysis.schema.json
  - T1.2.3: context.schema.json
  - T1.2.4: test-result.schema.json
  - T1.2.5: acceptance.schema.json
  - T1.2.6: fix-result.schema.json
  - T1.2.7: verify-report.schema.json
  - T1.2.8: output.schema.json
- T2.2: 索引构建模块
- T2.3: 多仓库管理模块
- T2.4: 测试执行模块

### Batch 3（并行度 4）
- T1.3: 模板文件（可拆分为 4 个子任务）
  - T1.3.1: workflow.json.template
  - T1.3.2: repos.json.template
  - T1.3.3: log-patterns.json.template
  - T1.3.4: report.md.template
- T2.5: Git 操作模块
- T2.7: 上下文检索模块

### Batch 4（并行度 2）
- T2.1: 状态管理模块
- T2.6: 日志解析模块

### Batch 5（并行度 1）
- T2.8: CLI 工具入口

### Batch 6（并行度 1）
- T2.9: MCP 服务器配置

### Batch 7（并行度 6）
- T3.1: bugfix-lead Agent
- T3.2: analyzer Agent
- T3.3: locator Agent（可拆分为 4 个子任务）
  - T3.3.1: locator.md
  - T3.3.2: locator-file.md
  - T3.3.3: locator-symbol.md
  - T3.3.4: locator-graph.md
- T3.4: tester Agent
- T3.5: fixer Agent
- T3.6: verifier Agent（可拆分为 4 个子任务）
  - T3.6.1: verifier.md
  - T3.6.2: verifier-unit.md
  - T3.6.3: verifier-integration.md
  - T3.6.4: verifier-impact.md

### Batch 8（并行度 6）
- T4.1: bugfix-start Skill
- T4.2: feature-start Skill
- T4.3: resume-workflow Skill
- T4.4: workflow-status Skill
- T4.5: rewind Skill
- T4.6: rebuild-index Skill

### Batch 9（并行度 1）
- T5.1: Hooks 定义

### Batch 10（并行度 1）
- T5.2: 插件元数据

### Batch 11（并行度 9）
- T6.1: 单元测试（7 个模块并行）
  - T6.1.1: state-manager.test.js
  - T6.1.2: index-builder.test.js
  - T6.1.3: repo-manager.test.js
  - T6.1.4: test-runner.test.js
  - T6.1.5: git-ops.test.js
  - T6.1.6: log-parser.test.js
  - T6.1.7: context-retriever.test.js
- T6.2: 集成测试（2 个流程并行）
  - T6.2.1: bugfix-flow.test.js
  - T6.2.2: feature-flow.test.js

### Batch 12（并行度 1）
- T6.3: README 文档

---

## 5. 关键路径（Critical Path）

```
T1.1 → T1.2 → T1.3 → T2.1 → T2.8 → T2.9 → T3.1 → T4.1 → T5.1 → T5.2 → T6.2 → T6.3
```

**关键路径耗时**：
- T1.1: 0.5h
- T1.2: 1h
- T1.3: 0.5h
- T2.1: 2h
- T2.8: 2h
- T2.9: 1h
- T3.1: 1h
- T4.1: 0.5h
- T5.1: 1h
- T5.2: 0.5h
- T6.2: 3h
- T6.3: 1h

**总计**：14.5 小时（串行）

**并行优化后**：约 8-10 小时（考虑并行批次）

---

## 6. 资源分配建议

### 高优先级任务（关键路径）
- T1.1, T1.2, T1.3, T2.1, T2.8, T2.9, T3.1, T4.1, T5.1, T5.2, T6.2, T6.3
- 分配最强 sub-agent（Opus 4.7）

### 中优先级任务（并行批次）
- T2.2, T2.3, T2.4, T2.5, T2.6, T2.7
- T3.2, T3.3, T3.4, T3.5, T3.6
- T4.2, T4.3, T4.4, T4.5, T4.6
- 分配中等 sub-agent（Sonnet 4.6）

### 低优先级任务（测试与文档）
- T6.1, T6.3
- 分配轻量 sub-agent（Haiku 4.5）

---

## 7. 风险与缓解

### 风险 1：Tree-sitter 集成复杂度高
**缓解**：
- T2.2 预留 4 小时
- 参考 token-savior 和 code-review-graph 实现
- 优先支持 C/C++，其他语言后续补充

### 风险 2：多仓库 Git 操作复杂
**缓解**：
- T2.3 和 T2.5 充分测试
- 使用 simple-git 库简化操作
- 增加错误处理和回滚机制

### 风险 3：Agent 定义不明确
**缓解**：
- 参考 workflow_dev 的 Agent 定义
- 明确 Handoff 结构
- 增加示例和注释

### 风险 4：测试覆盖不足
**缓解**：
- T6.1 为每个模块编写单元测试
- T6.2 覆盖端到端流程
- 目标：80% 代码覆盖率

---

## 8. 交付里程碑

### Milestone 1: 工具层完成（Batch 1-5）
**时间**：Day 1-2
**产出**：
- 所有 lib/ 模块实现
- CLI 工具可用
- MCP 配置完成

### Milestone 2: Agent 层完成（Batch 6-8）
**时间**：Day 3
**产出**：
- 所有 Agent 定义完成
- 所有 Skill 定义完成

### Milestone 3: 集成完成（Batch 9-10）
**时间**：Day 4
**产出**：
- Hooks 配置完成
- 插件元数据完成
- 插件可安装

### Milestone 4: 测试与文档完成（Batch 11-12）
**时间**：Day 5
**产出**：
- 单元测试通过
- 集成测试通过
- README 文档完成

---

## 9. 执行建议

### 使用 Claude Code 多 Agent 机制
1. **主 Agent**：负责任务派发和进度跟踪
2. **Sub-agents**：每个任务分配一个 sub-agent
3. **并行批次**：同一批次内的任务并行执行
4. **状态同步**：每个任务完成后更新 `task-status.json`

### 任务派发示例
```javascript
// Batch 2: 并行执行 8 个任务
const batch2Tasks = [
  { id: 'T1.2.1', agent: 'schema-writer', task: 'workflow.schema.json' },
  { id: 'T1.2.2', agent: 'schema-writer', task: 'analysis.schema.json' },
  { id: 'T1.2.3', agent: 'schema-writer', task: 'context.schema.json' },
  { id: 'T1.2.4', agent: 'schema-writer', task: 'test-result.schema.json' },
  { id: 'T1.2.5', agent: 'schema-writer', task: 'acceptance.schema.json' },
  { id: 'T1.2.6', agent: 'schema-writer', task: 'fix-result.schema.json' },
  { id: 'T1.2.7', agent: 'schema-writer', task: 'verify-report.schema.json' },
  { id: 'T1.2.8', agent: 'schema-writer', task: 'output.schema.json' }
];

// 并行派发
await Promise.all(batch2Tasks.map(task => dispatchAgent(task)));
```

---

## 10. 总结

- **总任务数**：47 个（含子任务）
- **关键路径**：12 个任务，14.5 小时
- **并行优化后**：8-10 小时
- **最大并行度**：9（Batch 11）
- **预计完成时间**：5 个工作日

**下一步**：开始执行 Batch 1（T1.1: 项目初始化）
