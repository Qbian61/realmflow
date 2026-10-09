import type {
  RevisionedModelProfile,
  RevisionedModelProvider
} from './model'

export type EffectiveModelCandidate = {
  provider: RevisionedModelProvider
  profile: RevisionedModelProfile
}

export type EffectiveModelSelection =
  | {
      outcome: 'selected'
      reason: 'conversation' | 'default' | 'first_available'
      provider: RevisionedModelProvider
      profile: RevisionedModelProfile
    }
  | {
      outcome: 'unavailable'
      code: 'no_available_model'
    }

export function resolveEffectiveModel(
  candidates: readonly EffectiveModelCandidate[],
  preference: {
    conversationProfileId?: string
    defaultProfileId?: string
  }
): EffectiveModelSelection {
  const conversation = findCandidate(
    candidates,
    preference.conversationProfileId
  )
  if (conversation) return selected('conversation', conversation)

  const applicationDefault = findCandidate(
    candidates,
    preference.defaultProfileId
  )
  if (applicationDefault) return selected('default', applicationDefault)

  const first = [...candidates].sort(compareCandidates)[0]
  if (first) return selected('first_available', first)
  return { outcome: 'unavailable', code: 'no_available_model' }
}

function findCandidate(
  candidates: readonly EffectiveModelCandidate[],
  profileId: string | undefined
): EffectiveModelCandidate | undefined {
  if (!profileId) return undefined
  return candidates.find(({ profile }) => profile.id === profileId)
}

function selected(
  reason: Extract<EffectiveModelSelection, { outcome: 'selected' }>['reason'],
  candidate: EffectiveModelCandidate
): EffectiveModelSelection {
  return {
    outcome: 'selected',
    reason,
    provider: candidate.provider,
    profile: candidate.profile
  }
}

function compareCandidates(
  left: EffectiveModelCandidate,
  right: EffectiveModelCandidate
): number {
  return (
    compareText(left.provider.name, right.provider.name) ||
    compareText(left.profile.displayName, right.profile.displayName) ||
    compareText(left.provider.id, right.provider.id) ||
    compareText(left.profile.id, right.profile.id)
  )
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
