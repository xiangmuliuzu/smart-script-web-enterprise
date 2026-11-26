const taskTypes = { script: '剧本', script_storyboard: '剧本 + 分镜', storyboard: '分镜' }

export function briefTaskLabel(type) {
  return taskTypes[type] || '待确认'
}

export function yuan(value) {
  return value == null || value === '' || !Number.isFinite(Number(value))
    ? '待确认'
    : '¥' + Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export function formatDemandMarkdown(brief) {
  return [
    '# 采购需求草案｜' + brief.title.replace(/\s+/g, ' '),
    '',
    '- 任务类型：' + briefTaskLabel(brief.taskType),
    '- 题材标签：' + brief.genreTags.join('、'),
    '- 目标集数：' + brief.totalEpisodes + ' 集',
    '- 预算参考：' + yuan(brief.budgetYuan),
    '- 期望周期：' + brief.durationDays + ' 天',
    '',
    '## 商业化诉求',
    brief.commercialGoal,
    '',
    '## 详细要求',
    brief.requirement,
    '',
    '## 交付验收清单',
    ...brief.deliveryChecklist.map(item => '- ' + item.replace(/\s+/g, ' '))
  ].join('\n')
}
