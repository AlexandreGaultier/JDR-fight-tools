import { normalizePresetName, type ParticipantPreset, type PresetKind } from './participantPresets'

export const USER_PRESETS_STORAGE_KEY = 'jdr-fight-tools-user-presets-v1'

export function loadUserPresets(): ParticipantPreset[] {
  try {
    const raw = localStorage.getItem(USER_PRESETS_STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(isValidPresetEntry)
  } catch {
    return []
  }
}

export function saveUserPresets(presets: ParticipantPreset[]): void {
  localStorage.setItem(USER_PRESETS_STORAGE_KEY, JSON.stringify(presets))
}

function isValidPresetEntry(item: unknown): item is ParticipantPreset {
  if (!item || typeof item !== 'object') {
    return false
  }
  const o = item as Record<string, unknown>
  const name = o.name
  const kind = o.kind
  const hpMax = o.hpMax
  const hpCurrent = o.hpCurrent
  if (typeof name !== 'string' || name.trim() === '') {
    return false
  }
  if (kind !== 'player' && kind !== 'monster') {
    return false
  }
  if (typeof hpMax !== 'number' || typeof hpCurrent !== 'number') {
    return false
  }
  if (hpMax <= 0 || hpCurrent < 0 || hpCurrent > hpMax) {
    return false
  }
  return true
}

/** Ajoute ou remplace un preset (clé = nom normalisé comme dans participantPresets). */
export function upsertUserPreset(list: ParticipantPreset[], preset: ParticipantPreset): ParticipantPreset[] {
  const key = normalizePresetName(preset.name)
  const without = list.filter((p) => normalizePresetName(p.name) !== key)
  return [...without, { ...preset, name: preset.name.trim() }]
}

export function parseUserPresetsFromJson(text: string): ParticipantPreset[] {
  const parsed = JSON.parse(text) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('Le JSON doit être un tableau de presets.')
  }
  const out: ParticipantPreset[] = []
  for (let i = 0; i < parsed.length; i += 1) {
    const item = parsed[i]
    if (!item || typeof item !== 'object') {
      throw new Error(`Entrée invalide à l'index ${i}.`)
    }
    const o = item as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    const kind = o.kind === 'player' || o.kind === 'monster' ? o.kind : null
    const hpMax = Number(o.hpMax)
    const hpCurrent = Number(o.hpCurrent)
    if (!name || !kind || Number.isNaN(hpMax) || Number.isNaN(hpCurrent)) {
      throw new Error(`Entrée invalide à l'index ${i} (nom, type ou HP).`)
    }
    if (hpMax <= 0 || hpCurrent < 0 || hpCurrent > hpMax) {
      throw new Error(`HP invalides à l'index ${i}.`)
    }
    out.push({ name, kind: kind as PresetKind, hpMax, hpCurrent })
  }
  return out
}

export function exportUserPresetsToFile(presets: ParticipantPreset[]): void {
  const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `jdr-presets-perso-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
