import { normalizePresetName } from './participantPresets'

export type PresetStatusId = 'poison' | 'stun' | 'overcharged' | 'marked' | 'focus'

export const PRESET_STATUSES: readonly { id: PresetStatusId; label: string; title: string }[] = [
  {
    id: 'poison',
    label: 'Poison',
    title:
      'Empoisonné — rappel MJ : par exemple subir des dégâts au début du tour (ex. 2 PV au prochain tour). À adapter selon ta règle.',
  },
  {
    id: 'stun',
    label: 'Stun',
    title:
      'Sonné / étourdi — rappel MJ : par exemple ne pas jouer son prochain tour, ou agir avec désavantage. À adapter selon ta règle.',
  },
  {
    id: 'overcharged',
    label: 'Surch.',
    title:
      'Surchargé — rappel MJ : effet situationnel (bonus temporaire, risque de surcharge, etc.). À adapter selon ta règle.',
  },
  {
    id: 'marked',
    label: 'Marqué',
    title:
      'Marqué — rappel MJ : la prochaine attaque ou un allié inflige un effet bonus / avantage. À adapter selon ta règle.',
  },
  {
    id: 'focus',
    label: 'Focus',
    title:
      'Focus — rappel MJ : cible prioritaire pour les monstres ou avantage tactique. À adapter selon ta règle.',
  },
] as const

const VALID_IDS = new Set<PresetStatusId>(PRESET_STATUSES.map((status) => status.id))

function legacyNameToId(name: string): PresetStatusId | null {
  const key = normalizePresetName(name)
  if (!key) {
    return null
  }
  if (key.includes('empoison') || key === 'poison') {
    return 'poison'
  }
  if (key.includes('stun') || key.includes('sonne') || key.includes('etourdi') || key.includes('étourdi')) {
    return 'stun'
  }
  if (key.includes('surcharg')) {
    return 'overcharged'
  }
  if (key.includes('marqu')) {
    return 'marked'
  }
  if (key.includes('focus')) {
    return 'focus'
  }
  return null
}

/** Migre l’ancien format (objets { id, name, description }) ou chaînes vers les IDs prédéfinis. */
export function normalizeParticipantStatuses(raw: unknown): PresetStatusId[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const result = new Set<PresetStatusId>()
  for (const item of raw) {
    if (typeof item === 'string' && VALID_IDS.has(item as PresetStatusId)) {
      result.add(item as PresetStatusId)
      continue
    }
    if (!item || typeof item !== 'object') {
      continue
    }
    const record = item as Record<string, unknown>
    if (typeof record.id === 'string' && VALID_IDS.has(record.id as PresetStatusId)) {
      result.add(record.id as PresetStatusId)
      continue
    }
    if (typeof record.name === 'string') {
      const mapped = legacyNameToId(record.name)
      if (mapped) {
        result.add(mapped)
      }
    }
  }
  return Array.from(result)
}
