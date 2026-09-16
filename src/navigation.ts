import {
  AlarmClock,
  Blocks,
  ChartNoAxesCombined,
  House,
  MessageCirclePlus
} from 'lucide-react'

export const primaryNavigation = [
  {
    path: '/',
    label: '工作台',
    description: '查看个人任务与工作进展',
    icon: House
  },
  {
    path: '/chat/new',
    label: '新对话',
    description: '开始一次新的 RealmFlow 对话',
    icon: MessageCirclePlus
  },
  {
    path: '/schedules',
    label: '定时任务',
    description: '编排并跟踪自动执行计划',
    icon: AlarmClock
  },
  {
    path: '/capabilities',
    label: '技能 · 连接器',
    description: '配置外部连接和本地技能',
    icon: Blocks
  },
  {
    path: '/analytics',
    label: '统计分析',
    description: '观察流程效率与资源使用',
    icon: ChartNoAxesCombined
  }
] as const

export const spaces = [
  {
    path: '/spaces/xxx',
    label: 'xxx 空间',
    description: '查看空间中的需求与产物'
  }
] as const

export const utilityPages = [
  {
    path: '/settings',
    label: '设置',
    description: '调整应用与模型偏好'
  },
  {
    path: '/settings/appearance',
    label: '外观设置',
    description: '调整主题与界面显示'
  },
  {
    path: '/favorites',
    label: '收藏夹',
    description: '查看已收藏的内容'
  },
  {
    path: '/updates',
    label: '检查更新',
    description: '检查 RealmFlow 的新版本'
  },
  {
    path: '/feedback',
    label: '帮助与反馈',
    description: '查找帮助或提交使用反馈'
  },
  {
    path: '/settings/storage',
    label: '存储状态',
    description: '查看本地数据占用情况'
  },
  {
    path: '/settings/backup',
    label: '数据备份',
    description: '管理本地备份与恢复'
  }
] as const
