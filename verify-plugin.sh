#!/bin/bash

echo "=== 验证插件结构 ==="
echo

# 检查 skills 目录
echo "1. 检查 skills 目录"
skills_dir="skills"
if [ -d "$skills_dir" ]; then
    echo "   ✓ $skills_dir 存在"
    skill_count=$(find "$skills_dir" -name "SKILL.md" | wc -l)
    echo "   ✓ 找到 $skill_count 个 SKILL.md 文件"
else
    echo "   ✗ $skills_dir 不存在"
    exit 1
fi

# 检查每个 skill 的 SKILL.md
echo "2. 检查每个 skill 的 SKILL.md 格式"
for skill_md in $(find "$skills_dir" -name "SKILL.md"); do
    skill_dir=$(dirname "$skill_md")
    skill_name=$(basename "$skill_dir")

    # 检查 frontmatter
    if head -1 "$skill_md" | grep -q "^---$"; then
        # 提取 name 字段
        name_value=$(grep "^name:" "$skill_md" | head -1 | sed 's/^name: *//')

        if [ "$name_value" = "$skill_name" ]; then
            echo "   ✓ $skill_name: 目录名与 name 字段一致"
        else
            echo "   ✗ $skill_name: 目录名与 name 字段不一致 (name: $name_value)"
        fi

        # 检查必需字段
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
echo "测试插件："
echo "claude --plugin-dir $(pwd) -p \"list available skills\""
