#!/bin/bash

echo "=== 验证插件结构 ==="
echo

# 检查 marketplace.json
echo "1. 检查 marketplace.json"
if [ -f ".claude-plugin/marketplace.json" ]; then
    echo "   ✓ .claude-plugin/marketplace.json 存在"
else
    echo "   ✗ .claude-plugin/marketplace.json 不存在"
    exit 1
fi

# 检查 plugin.json
echo "2. 检查 plugin.json"
if [ -f "plugins/workflow_bugfix/.claude-plugin/plugin.json" ]; then
    echo "   ✓ plugins/workflow_bugfix/.claude-plugin/plugin.json 存在"
else
    echo "   ✗ plugins/workflow_bugfix/.claude-plugin/plugin.json 不存在"
    exit 1
fi

# 检查 skills 目录
echo "3. 检查 skills 目录"
skills_dir="plugins/workflow_bugfix/skills"
if [ -d "$skills_dir" ]; then
    echo "   ✓ $skills_dir 存在"
    skill_count=$(find "$skills_dir" -name "SKILL.md" | wc -l)
    echo "   ✓ 找到 $skill_count 个 SKILL.md 文件"
else
    echo "   ✗ $skills_dir 不存在"
    exit 1
fi

# 检查每个 skill 的 SKILL.md
echo "4. 检查每个 skill 的 SKILL.md 格式"
for skill_md in $(find "$skills_dir" -name "SKILL.md"); do
    skill_name=$(dirname "$skill_md" | xargs basename)

    # 检查 frontmatter
    if head -1 "$skill_md" | grep -q "^---$"; then
        echo "   ✓ $skill_name: frontmatter 存在"

        # 检查必需字段
        if grep -q "^name:" "$skill_md"; then
            echo "   ✓ $skill_name: name 字段存在"
        else
            echo "   ✗ $skill_name: name 字段缺失"
        fi

        if grep -q "^description:" "$skill_md"; then
            echo "   ✓ $skill_name: description 字段存在"
        else
            echo "   ✗ $skill_name: description 字段缺失"
        fi

        if grep -q "^user-invocable:" "$skill_md"; then
            echo "   ✓ $skill_name: user-invocable 字段存在"
        else
            echo "   ✗ $skill_name: user-invocable 字段缺失"
        fi
    else
        echo "   ✗ $skill_name: frontmatter 格式错误"
    fi
done

echo
echo "=== 验证完成 ==="
echo
echo "下一步："
echo "1. 在 Claude Code 中执行: /plugin add $(pwd)/.claude-plugin/marketplace.json"
echo "2. 安装插件: /plugin install workflow_bugfix@local-workflow-marketplace"
echo "3. 验证: /help"
