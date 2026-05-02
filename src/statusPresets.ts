import { normalizePresetName } from './participantPresets'

export type PresetStatusId = 'poison' | 'stun' | 'overcharged' | 'marked' | 'focus'

export const PRESET_STATUSES: readonly { id: PresetStatusId; label: string; title: string }[] = [
  {
    id: 'poison',
    label: 'Poison',
    title:
      'La cible, au début de son tour, doit lancer 1d20 + Modificateur de Vaillance et faire 15 ou + pour résister au poison prendant 3 tours. Si elle rate, elle prend 2 dégâts de poison.',
  },
  {
    id: 'stun',
    label: 'Stun',
    title:
      'La cible est étourdie et ne peut pas agir pendant 1 tour.',
  },
  {
    id: 'overcharged',
    label: 'Surch.',
    title:
      'La prochaine attaque d\'un allié ciblée fera 1,5 fois les dégâts',
  },
  {
    id: 'marked',
    label: 'Marqué',
    title:
      'La cible prend +5 dégâts lors de la prochaine attaque magique/physique subie',
  },
  {
    id: 'focus',
    label: 'Focus',
    title:
      'La cible ajoutera +2 dégâts lors de sa prochaine attaque.',
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
