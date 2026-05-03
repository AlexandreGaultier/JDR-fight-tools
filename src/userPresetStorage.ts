import { normalizeCombatSheet } from './combatSheet'
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
  if (o.initiative !== undefined) {
    if (typeof o.initiative !== 'number' || !Number.isFinite(o.initiative)) {
      return false
    }
    if (kind === 'monster' && (o.initiative < 1 || o.initiative > 20)) {
      return false
    }
  }
  if (o.combat !== undefined && o.combat !== null) {
    if (typeof o.combat !== 'object') {
      return false
    }
    normalizeCombatSheet(o.combat, kind as PresetKind)
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
    const initiativeRaw = o.initiative
    let initiative: number | undefined
    if (initiativeRaw !== undefined && initiativeRaw !== null) {
      const ini = Number(initiativeRaw)
      if (!Number.isFinite(ini)) {
        throw new Error(`Initiative invalide à l'index ${i}.`)
      }
      const rounded = Math.round(ini)
      if (kind === 'monster' && (rounded < 1 || rounded > 20)) {
        throw new Error(`Initiative monstre (1–20) invalide à l'index ${i}.`)
      }
      initiative = rounded
    }
    const combatRaw = o.combat
    const combat =
      combatRaw !== undefined && combatRaw !== null && typeof combatRaw === 'object'
        ? normalizeCombatSheet(combatRaw, kind as PresetKind)
        : undefined
    out.push({
      name,
      kind: kind as PresetKind,
      hpMax,
      hpCurrent,
      ...(initiative !== undefined ? { initiative } : {}),
      ...(combat !== undefined ? { combat } : {}),
    })
  }
  return out
}

function sanitizePresetBasename(name: string): string {
  const s = name
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return s || 'preset'
}

export function exportUserPresetsToFile(
  presets: ParticipantPreset[],
  options?: { downloadFilename?: string },
): void {
  const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const defaultName = `jdr-presets-perso-${new Date().toISOString().slice(0, 10)}.json`
  const custom = options?.downloadFilename?.trim()
  let download = defaultName
  if (custom) {
    download = custom.toLowerCase().endsWith('.json') ? custom : `${custom}.json`
  }
  a.download = download
  a.click()
  URL.revokeObjectURL(url)
}

/** Télécharge un seul preset dans un fichier JSON dédié (pratique pour éviter les gros exports). */
export function exportSingleUserPresetToFile(preset: ParticipantPreset): void {
  const stamp = new Date().toISOString().slice(0, 10)
  exportUserPresetsToFile([preset], { downloadFilename: `jdr-preset-${sanitizePresetBasename(preset.name)}-${stamp}.json` })
}
