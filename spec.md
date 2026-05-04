# workflow_bugfix - Claude Code 代码库自动修复/开发插件规格说明书

## 1. 项目定位

基于 Claude Code 插件机制实现的**既有代码库 Bug 修复与小功能开发工作流**。

核心场景：
- **Bug 修复优先**：从模糊输入（现象+日志）到根因定位、TDD 修复、回归验证的闭环
- **老项目小功能开发**：在已有架构约束下，最小改动实现新需求

关键原则：
- 严格 TDD：先复现/测试，再修复，再验证
- 最小改动：局部修复，避免无关重构
- 可回退：每阶段 git checkpoint，支持 rewind
- 自动执行：执行阶段尽量不打扰用户
- 用户确认：需求、架构、验收标准必须用户确认

## 2. 插件架构

```
用户
  │
  ▼
Claude Code
  ├── 插件 skills (bugfix-start, feature-start, resume, status, rewind)
  ├── bugfix-lead (主协调 Agent)
  ├── 专业 Agents (analyzer, locator, tester, fixer, verifier)
  ├── hooks (阶段门控)
  └── MCP/CLI 工具 (状态、上下文检索、测试执行、git checkpoint)
```

**不自建运行时**：多 Agent 协作由 Claude Code 原生 sub-agents 承担，插件只定义结构和工具。

## 3. 核心工作流

### 3.1 Bug 修复流程

```
Phase 1: 输入分析（交互式）
    │  输入：现象 + 日志 + 失败输出 + 崩溃栈
    │  analyzer agent 结构化分析
    │  产出：问题分类、关键线索、候选根因、复现策略
    │  ✅ 用户确认 → state/analysis/confirmed.json
    ▼
Phase 2: 上下文定位
    │  locator agent 四层检索（文件→符号→路径→图谱）
    │  产出：相关文件、符号、调用链、测试、影响面
    │  ✅ 用户确认 → state/context/scope.json
    ▼
Phase 3: 复现测试
    │  tester agent 基于分析结果编写复现测试
    │  产出：failing test + 执行日志
    │  ✅ 测试失败（符合预期）→ state/reproduce/test-result.json
    ▼
Phase 4: 验收标准确认
    │  bugfix-lead 基于分析+上下文生成验收标准
    │  ✅ 用户确认 → state/acceptance/confirmed.json
    ▼
Phase 5: 修复实现（TDD Loop）
    │  fixer agent 修改代码使测试通过
    │  Loop: 修改 → 测试 → 失败则分析 → 重试（最多 5 轮）
    │  产出：修复代码 + 通过的测试
    │  ✅ 测试通过 → state/fix/success.json + git commit
    ▼
Phase 6: 回归验证
    │  verifier agent 运行相关测试套件
    │  产出：回归测试报告 + 影响面分析
    │  ✅ 无回归 → state/verify/report.json
    ▼
Phase 7: 输出报告
    │  生成人类可读报告 + 结构化 JSON
    │  产出：REPORT.md + result.json
```

### 3.2 Feature 开发流程

```
Phase 1: 需求分析（交互式）
    │  输入：功能描述 + 约束条件
    │  analyzer agent 澄清需求
    │  产出：结构化需求 + 改动边界
    │  ✅ 用户确认 → state/requirements/confirmed.json
    ▼
Phase 2: 上下文定位
    │  locator agent 找相似实现、识别改动边界
    │  产出：参考实现、改动范围、依赖关系
    │  ✅ 用户确认 → state/context/scope.json
    ▼
Phase 3: 测试先行
    │  tester agent 基于需求编写测试
    │  产出：failing test（功能未实现）
    │  ✅ 测试失败（符合预期）→ state/test/test-result.json
    ▼
Phase 4: 验收标准确认
    │  bugfix-lead 生成验收标准
    │  ✅ 用户确认 → state/acceptance/confirmed.json
    ▼
Phase 5: 功能实现（TDD Loop）
    │  fixer agent 实现功能使测试通过
    │  Loop: 实现 → 测试 → 失败则分析 → 重试（最多 5 轮）
    │  产出：功能代码 + 通过的测试
    │  ✅ 测试通过 → state/impl/success.json + git commit
    ▼
Phase 6: 回归验证
    │  verifier agent 运行相关测试套件
    │  产出：回归测试报告
    │  ✅ 无回归 → state/verify/report.json
    ▼
Phase 7: 输出报告
    │  生成报告 + JSON
    │  产出：REPORT.md + result.json
```

## 4. Agent 角色定义

| 角色 | 单一职责 | 输入 → 输出 |
|------|---------|------------|
| bugfix-lead | 阶段转换、任务派发、状态管理 | workflow.json → 阶段推进、agent 派发 |
| analyzer | Bug 输入分析 / Feature 需求澄清 | 原始输入 → confirmed.json + 关键线索 |
| locator | 四层上下文检索（文件/符号/路径/图谱） | 分析结果 → scope.json + 相关代码 |
| tester | 编写复现测试 / 功能测试 | 分析+上下文 → failing test + 执行日志 |
| fixer | TDD 修复实现 | test + 上下文 → 修复代码 + 通过测试 |
| verifier | 回归验证 + 影响面分析 | 修复代码 → 回归报告 + 影响面 |

## 5. 上下文检索四层策略

locator agent 执行四层检索，从点到线到面：

### 5.1 文件级
- **工具**：ripgrep（文本搜索）+ tree-sitter（语法解析）
- **目标**：找到与任务相关的文件
- **输出**：文件列表 + 关键片段

### 5.2 符号级
- **工具**：tree-sitter（符号提取）+ ctags（索引）
- **目标**：定位具体函数/类/接口/方法
- **输出**：符号列表 + 定义位置 + 引用位置

### 5.3 路径级
- **工具**：静态分析（调用链追踪）
- **目标**：追踪调用链、数据流、错误传播链
- **输出**：调用路径 + 数据流图

### 5.4 图谱级
- **工具**：SQLite 存储的依赖图
- **目标**：模块依赖、业务链路、测试覆盖
- **输出**：影响面 + 候选根因位置 + 相关验证点

### 5.5 多仓库检索

**仓库拓扑**：
- 主目录下包含多个独立仓库目录
- 每个仓库独立 git 管理
- 配置文件：`.bugfix/repos.json`

**跨仓库索引**：
- 符号索引跨仓库构建（函数调用可能跨仓库）
- 依赖关系图包含跨仓库依赖
- 影响面分析覆盖所有相关仓库

**跨仓库修复**：
- 每个仓库创建独立分支，统一命名：`bugfix/{workflow-id}` 或 `feature/{workflow-id}`
- 修复涉及多仓库时，同步创建分支、同步 commit
- 最终输出包含所有仓库的改动清单

**增量更新策略**：
- 首次运行：全量构建图谱（存入 SQLite）
- 后续运行：基于 git diff 增量更新
- 图谱数据存储在 `.bugfix/index.db`

## 6. TDD Loop 机制

### 6.1 Bug 场景
1. 先复现失败（tester agent 编写 failing test）
2. 再修复（fixer agent 修改代码）
3. 再验证（运行测试，失败则重试）

### 6.2 Feature 场景
1. 先补测试（tester agent 编写 failing test）
2. 再实现（fixer agent 实现功能）
3. 再验证（运行测试，失败则重试）

### 6.3 Loop 控制
- **最大轮数**：5 轮（可配置）
- **每轮记录**：修改内容 + 测试结果 + 失败原因
- **终止条件**：
  - 测试通过 → 成功
  - 达到最大轮数 → 失败，标记需人工介入
  - 检测到重复修改 → 失败，标记陷入循环
  - 检测到无进展（连续 2 轮相同错误）→ 失败

### 6.4 非必现 Bug 处理

**三级复现策略**：

**L1: 代码级复现（优先）**
- 基于日志/栈信息定位可疑代码路径
- 编写单元测试 + 打桩模拟触发条件
- 例如：内存泄漏 → 构造特定调用序列 + valgrind
- 例如：竞态条件 → 多线程测试 + sleep/barrier 控制时序

**L2: 条件推断复现**
- 分析日志中的时序、并发、资源状态
- 推断触发条件（竞态、边界值、资源耗尽）
- 编写测试模拟这些条件
- 如果测试能稳定触发问题 → 进入正常 TDD Loop

**L3: 无法复现（推测性修复）**
- 如果无法构造代码级复现
- analyzer 基于日志和代码分析，输出：
  - 最可能的根因（按概率排序）
  - 推荐的修复方案
  - 风险评估
- **用户决策点**：
  - 展示分析结果，由用户决定是否继续
  - 用户确认后，fixer 实施修复
  - 标记为"推测性修复"，需真机验证
- 输出报告中明确标注：
  - 无代码级复现
  - 修复基于推测
  - 需真机验证

**日志分析支持**：
- 自动搜索代码中的日志定义（log 函数、宏定义）
- 识别日志格式（时间戳、级别标识：error/info/warn/debug）
- 提取关键信息：错误码、线程 ID、函数名、变量值
- 构建时序图辅助分析

## 7. Git Checkpoint 策略

### 7.1 Checkpoint 时机
每个关键阶段自动 commit：
- 输入分析完成
- 上下文定位完成
- 复现测试完成
- 修复实现完成（每轮 loop）
- 验证完成

### 7.2 分支策略
- **Bug 修复**：每个仓库创建 `bugfix/{workflow-id}` 分支
- **Feature 开发**：每个仓库创建 `feature/{workflow-id}` 分支
- 多仓库修复时，所有涉及仓库使用统一命名
- 成功后可选择合并到主分支

**多仓库分支管理**：
```
主目录/
├── firmware-core/          (git repo)
│   └── bugfix/BUG-123     ← 创建分支
├── driver-usb/             (git repo)
│   └── bugfix/BUG-123     ← 同名分支
└── protocol-lib/           (git repo)
    └── bugfix/BUG-123     ← 同名分支
```

### 7.3 Commit 消息格式
```
fix({bug-id}): {阶段} - {简要描述}

例如：
fix(BUG-123): 输入分析完成 - 定位到内存泄漏
fix(BUG-123): 复现测试完成 - 测试失败符合预期
fix(BUG-123): 修复实现完成 - 修复内存泄漏

多仓库修复时，每个仓库独立 commit，消息格式相同
```

### 7.4 Rewind 机制
- 支持回退到任意 checkpoint
- 回退操作：`git reset --hard <checkpoint-tag>`
- 回退后状态文件同步更新

## 8. 测试执行支持

### 8.1 支持的测试框架
- **C/C++**：gtest, catch2, 自定义脚本
- **TypeScript**：jest, vitest, mocha
- **Python**：pytest, unittest
- **JavaScript**：jest, mocha

### 8.2 测试发现策略
- 扫描构建文件（CMakeLists.txt, package.json, setup.py）
- 扫描测试目录（test/, tests/, __tests__/）
- 识别测试文件命名模式（*_test.*, test_*.*, *.test.*, *.spec.*）

### 8.3 测试执行
- 支持指定测试目标（单个测试、测试套件、全量测试）
- 捕获 stdout/stderr
- 解析测试结果（通过/失败/跳过）
- 提取失败摘要（断言失败、异常栈）

### 8.4 测试结果归档
- 每轮 loop 的测试结果存入 `state/test-history/`
- 格式：`{timestamp}-{round}-{result}.json`

## 9. 状态与数据存储

### 9.1 状态目录结构
```
state/
├── workflow.json              # 当前阶段、状态、loop 次数
├── analysis/                  # 输入分析结果
│   ├── confirmed.json
│   └── qa-history.json
├── context/                   # 上下文定位结果
│   ├── scope.json
│   └── files/                 # 相关文件快照
├── reproduce/                 # 复现测试（Bug）
│   ├── test-result.json
│   └── test-code/
├── test/                      # 功能测试（Feature）
│   ├── test-result.json
│   └── test-code/
├── acceptance/                # 验收标准
│   └── confirmed.json
├── fix/                       # 修复实现（Bug）
│   ├── success.json
│   └── loop-history/
├── impl/                      # 功能实现（Feature）
│   ├── success.json
│   └── loop-history/
├── verify/                    # 回归验证
│   └── report.json
└── checkpoints/               # 阶段快照
```

### 9.2 SQLite 数据库
存储在 `.bugfix/index.db`：

**表结构**：
- `files`：文件索引（路径、语言、最后修改时间）
- `symbols`：符号索引（名称、类型、定义位置、引用位置）
- `calls`：调用关系（caller → callee）
- `dependencies`：依赖关系（模块 → 模块）
- `tests`：测试覆盖（测试 → 被测代码）
- `history`：历史任务（workflow-id、类型、状态、结果）

## 10. 技能入口定义

| Skill | 触发命令 | 用途 |
|-------|---------|------|
| bugfix-start | `/bugfix` | 启动 Bug 修复流程 |
| feature-start | `/feature` | 启动 Feature 开发流程 |
| resume-workflow | `/resume` | 恢复中断的 workflow |
| workflow-status | `/status` | 查询当前状态 |
| rewind | `/rewind` | 回退到指定 checkpoint |
| rebuild-index | `/rebuild-index` | 重建代码索引 |

## 11. 配置文件

### 11.1 主配置文件

`bugfix.config.json`（工作区根目录）：

```json
{
  "maxConcurrency": 1,
  "tddMaxRounds": 5,
  "workflowMaxRetries": 3,
  "requireUserApproval": {
    "afterAnalysis": true,
    "afterContext": true,
    "afterTest": false,
    "afterAcceptance": true,
    "afterFix": false,
    "afterVerify": true
  },
  "models": {
    "bugfixLead": { "tier": "high" },
    "analyzer": { "tier": "high" },
    "locator": { "tier": "medium" },
    "tester": { "tier": "medium" },
    "fixer": { "tier": "high" },
    "verifier": { "tier": "medium" }
  },
  "git": {
    "branchPrefix": "bugfix",
    "autoCommit": true,
    "isolationMode": "branch"
  },
  "stateDir": "./state",
  "indexDir": "./.bugfix"
}
```

### 11.2 多仓库配置

`.bugfix/repos.json`：

```json
{
  "repos": [
    {
      "name": "firmware-core",
      "path": "./",
      "role": "main",
      "language": "c++",
      "buildSystem": "cmake"
    },
    {
      "name": "driver-usb",
      "path": "../driver-usb",
      "role": "dependency",
      "language": "c",
      "buildSystem": "cmake"
    },
    {
      "name": "protocol-lib",
      "path": "../protocol-lib",
      "role": "dependency",
      "language": "c++",
      "buildSystem": "cmake"
    }
  ],
  "crossRepoIndex": true,
  "indexStrategy": "incremental"
}
```

### 11.3 日志格式配置

`.bugfix/log-patterns.json`（可选，用于辅助日志解析）：

```json
{
  "timestampPattern": "\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}",
  "levelPatterns": {
    "error": ["ERROR", "ERR", "FATAL"],
    "warn": ["WARN", "WARNING"],
    "info": ["INFO"],
    "debug": ["DEBUG", "DBG"]
  },
  "logFunctionPatterns": [
    "LOG_.*\\(",
    "log_.*\\(",
    "printf\\(",
    "fprintf\\("
  ],
  "errorCodePattern": "error[_\\s]code[:\\s]*(\\d+)"
}
```
  "indexDb": "./.bugfix/index.db",
  "languages": {
    "priority": ["c", "cpp", "typescript", "python", "javascript"]
  },
  "testFrameworks": {
    "c": ["gtest", "catch2"],
    "cpp": ["gtest", "catch2"],
    "typescript": ["jest", "vitest"],
    "python": ["pytest", "unittest"],
    "javascript": ["jest", "mocha"]
  }
}
```

## 12. 错误处理层级

| 层级 | 条件 | 范围 | 回退目标 |
|------|------|------|---------|
| L1 | TDD 测试失败 | 单轮 loop | 同轮重试 |
| L2 | 达到最大 loop 轮数 | 单个 workflow | 标记失败，需人工介入 |
| L3 | 回归验证失败 | 单个 workflow | Phase 5（修复实现） |
| L4 | 上下文定位失败 | 单个 workflow | Phase 2（重新定位） |
| L5 | 输入分析失败 | 单个 workflow | Phase 1（重新分析） |
| L6 | 环境/工具不可用 | 整个 workflow | 暂停 + 用户介入 |

## 13. 输出格式

### 13.1 人类可读报告（REPORT.md）
```markdown
# Bug 修复报告 / Feature 开发报告

## 概述
- Workflow ID: xxx
- 类型: Bug 修复 / Feature 开发
- 状态: 成功 / 失败
- 耗时: xxx

## 问题分析
- 问题分类: xxx
- 关键线索: xxx
- 根因假设: xxx

## 上下文范围
- 相关文件: xxx
- 相关符号: xxx
- 影响面: xxx

## 修复/实现方案
- 改动文件: xxx
- 改动行数: xxx
- 测试覆盖: xxx

## 验证结果
- 回归测试: 通过/失败
- 影响面分析: xxx
- 风险评估: xxx

## 建议
- 后续行动: xxx
- 注意事项: xxx
```

### 13.2 结构化 JSON（result.json）
```json
{
  "schema_version": "1.0.0",
  "workflow": {
    "id": "xxx",
    "type": "bugfix | feature",
    "status": "success | failed | partial | speculative",
    "created_at": "2026-05-03T10:00:00Z",
    "completed_at": "2026-05-03T11:00:00Z",
    "duration_seconds": 3600,
    "speculative_fix": false,
    "requires_real_device_verification": false
  },
  "analysis": {
    "classification": "xxx",
    "key_clues": ["xxx"],
    "root_cause_hypothesis": ["xxx"],
    "reproduce_strategy": "code_level | conditional | speculative",
    "confidence": "high | medium | low"
  },
  "context": {
    "repos": ["firmware-core", "driver-usb"],
    "files": ["xxx"],
    "symbols": ["xxx"],
    "call_chains": ["xxx"],
    "impact_scope": "xxx"
  },
  "changes": {
    "repos": {
      "firmware-core": {
        "branch": "bugfix/BUG-123",
        "files_modified": ["xxx"],
        "commits": ["xxx"]
      },
      "driver-usb": {
        "branch": "bugfix/BUG-123",
        "files_modified": ["xxx"],
        "commits": ["xxx"]
      }
    },
    "total_lines_added": 10,
    "total_lines_removed": 5
  },
  "tests": {
    "reproduce_test": "xxx",
    "test_results": {
      "passed": 10,
      "failed": 0,
      "skipped": 0
    },
    "regression_tests": {
      "passed": 50,
      "failed": 0
    }
  },
  "verification": {
    "regression_status": "passed | failed",
    "impact_analysis": "xxx",
    "risk_level": "low | medium | high"
  },
  "recommendations": ["xxx"]
}
```

## 14. MVP 范围

### 必做
1. ✅ Bug 输入分析（analyzer agent）
2. ✅ 四层上下文检索（locator agent）
3. ✅ 多仓库支持（跨仓库索引、统一分支命名）
4. ✅ 复现测试编写（tester agent）
5. ✅ 非必现 Bug 处理（三级复现策略 + 推测性修复）
6. ✅ TDD 修复实现（fixer agent）
7. ✅ 回归验证（verifier agent）
8. ✅ Git checkpoint / rewind（多仓库同步）
9. ✅ 主 agent + sub-agents 协作
10. ✅ 双输出（报告 + JSON）
11. ✅ 本地状态文件 + SQLite 索引
12. ✅ gtest / 自定义脚本支持
13. ✅ 日志格式识别与解析

### 暂缓
1. ❌ 远程设备执行
2. ❌ 历史 Bug 数据库匹配
3. ❌ 高级可视化
4. ❌ 云端编排
5. ❌ 自动提交到远端仓库

## 15. 验收标准

产品达到 MVP 的标准：

1. ✅ 能处理"现象 + log"的 Bug 输入
2. ✅ 能自动找出相关上下文（四层检索 + 多仓库）
3. ✅ 能自动生成复现测试（或标记为推测性修复）
4. ✅ 能在本地自动修复并验证（TDD loop）
5. ✅ 能在失败时 loop，最多 5 次
6. ✅ 能自动 commit 并 rewind（多仓库同步）
7. ✅ 能输出报告 + JSON
8. ✅ 能支持主 agent 派发、sub-agent 执行的协作模式
9. ✅ 能处理 Feature 开发场景（需求澄清 → 测试先行 → 实现）
10. ✅ 能支持 C/C++、TypeScript、Python 项目

## 16. 关键设计决策

### 16.1 为什么不自建运行时？
- Claude Code 已提供 sub-agents / agent teams 能力
- 插件只需定义结构和工具，不需要自己管理 agent 生命周期
- 降低复杂度，提高可维护性

### 16.2 为什么用 SQLite 存储图谱？
- 轻量级，无需额外服务
- 支持复杂查询（调用链、依赖关系）
- 增量更新效率高

### 16.3 为什么用 branch 而不是 worktree？
- branch 更轻量，适合单任务场景
- worktree 适合并行任务，但 Bug 修复通常是单线程
- 简化 git 操作，降低用户理解成本

### 16.4 为什么严格 TDD？
- Bug 修复：先复现才能验证修复有效
- Feature 开发：先测试才能保证实现正确
- 避免引入新 Bug

### 16.5 为什么支持推测性修复？
- 嵌入式固件 Bug 常无法在开发环境复现
- 只能真机验证，但真机测试成本高
- 推测性修复：基于日志和代码分析，给出最可能的根因和修复方案
- 用户决策：由用户判断是否接受推测性修复
- 明确标注：输出报告中明确标注"推测性修复，需真机验证"

### 16.6 为什么多仓库统一分支命名？
- 打印机固件项目包含多个仓库（主仓库 + 驱动 + 协议库）
- 统一命名便于追踪：所有仓库使用 `bugfix/{workflow-id}` 或 `feature/{workflow-id}`
- 同步操作：创建分支、commit、rewind 都在所有相关仓库同步执行
- 清晰的改动边界：最终输出包含所有仓库的改动清单

### 16.5 为什么需要用户确认？
- 需求、架构、验收标准是关键决策点
- 自动执行可能偏离用户意图
- 平衡自动化与可控性

## 17. 风险与挑战

### 17.1 日志信息不足
- **风险**：测试部输入可能不完整
- **应对**：analyzer agent 交互式澄清，生成假设驱动分析

### 17.2 老代码库复杂
- **风险**：嵌入式 C/C++ 项目可能缺少规范测试
- **应对**：tester agent 自动生成测试，降低复现难度

### 17.3 自动修改风险
- **风险**：自动改代码可能引入新 Bug
- **应对**：严格 TDD + 回归验证 + git checkpoint

### 17.4 Loop 发散
- **风险**：根因判断错误，反复修改
- **应对**：明确重试上限 + 检测重复修改 + rewind 机制

### 17.5 上下文检索不准
- **风险**：四层检索可能遗漏关键代码
- **应对**：用户确认上下文范围 + 支持手动补充

## 18. 后续扩展方向

### 18.1 短期（3 个月内）
- 支持更多测试框架（catch2, vitest）
- 优化图谱构建性能（并行解析）
- 增强日志分析能力（正则模式库）

### 18.2 中期（6 个月内）
- 支持跨仓库依赖分析
- 支持远程设备测试执行
- 增加可视化界面（调用链、影响面）

### 18.3 长期（1 年内）
- 构建知识库（历史 Bug 模式）
- 支持多人协作（任务分配、冲突检测）
- 集成 CI/CD（自动触发修复流程）
