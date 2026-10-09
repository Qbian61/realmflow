import {
  AlarmClock,
  Blocks,
  ChartNoAxesCombined,
  House,
  MessageCirclePlus,
  Workflow
} from 'lucide-react'
import type { Translator } from './localization/translate'

export function getPrimaryNavigation(t: Translator) {
  return [
    {
      path: '/',
      label: t('navigation.home'),
      description: t('navigation.homeDescription'),
      icon: House
    },
    {
      path: '/chat/new',
      label: t('navigation.newChat'),
      description: t('navigation.newChatDescription'),
      icon: MessageCirclePlus
    },
    {
      path: '/schedules',
      label: t('navigation.schedules'),
      description: t('navigation.schedulesDescription'),
      icon: AlarmClock
    },
    {
      path: '/capabilities',
      label: t('navigation.capabilities'),
      description: t('navigation.capabilitiesDescription'),
      icon: Blocks
    },
    {
      path: '/workflows',
      label: t('navigation.workflows'),
      description: t('navigation.workflowsDescription'),
      icon: Workflow
    },
    {
      path: '/analytics',
      label: t('navigation.analytics'),
      description: t('navigation.analyticsDescription'),
      icon: ChartNoAxesCombined
    }
  ] as const
}

export const spaces = [
  {
    path: '/spaces/xxx',
    label: 'xxx 空间',
    description: '查看空间中的需求与产物'
  }
] as const

export function getUtilityPages(t: Translator) {
  return [
    {
      path: '/settings',
      label: t('navigation.settings'),
      description: t('navigation.settingsDescription')
    },
    {
      path: '/updates',
      label: t('navigation.updates'),
      description: t('navigation.updatesDescription')
    },
    {
      path: '/feedback',
      label: t('navigation.feedback'),
      description: t('navigation.feedbackDescription')
    },
    {
      path: '/settings/storage',
      label: t('navigation.storage'),
      description: t('navigation.storageDescription')
    },
    {
      path: '/settings/backup',
      label: t('navigation.backup'),
      description: t('navigation.backupDescription')
    }
  ] as const
}
