export type PresetKind = 'player' | 'monster'

export interface ParticipantPreset {
  name: string
  kind: PresetKind
  hpMax: number
  hpCurrent: number
}

/** Modifie ce tableau ou ajoute des entrées pour tes persos / monstres récurrents. */
export const PARTICIPANT_PRESETS: ParticipantPreset[] = [
  { name: 'Nerys Devolia', kind: 'player', hpMax: 10, hpCurrent: 10 },
  { name: 'Sir Calmon Daemos', kind: 'player', hpMax: 10, hpCurrent: 10 },
  { name: 'Aelyn', kind: 'player', hpMax: 8, hpCurrent: 8 },
  { name: 'Brokk Ferkang', kind: 'player', hpMax: 11, hpCurrent: 11 },
  { name: 'Rôde-Pierre Briseur', kind: 'monster', hpMax: 16, hpCurrent: 16 },
  { name: 'Rôde-Pierre Guetteur', kind: 'monster', hpMax: 15, hpCurrent: 15 },
  { name: 'Rôde-Pierre Porte Bouclier', kind: 'monster', hpMax: 18, hpCurrent: 18 },
  { name: 'Venefil Traqueuse', kind: 'monster', hpMax: 18, hpCurrent: 18 },
  { name: 'Venefil Libélule', kind: 'monster', hpMax: 24, hpCurrent: 24 },
  { name: 'Venefil Scarabé', kind: 'monster', hpMax: 28, hpCurrent: 28 },
  { name: 'Venefil Crache Venin', kind: 'monster', hpMax: 22, hpCurrent: 22 },
  { name: 'Reine Venefil', kind: 'monster', hpMax: 64, hpCurrent: 64 },
  { name: 'Venefil Serviteur', kind: 'monster', hpMax: 12, hpCurrent: 12 },
]

export function normalizePresetName(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

/** Cherche d'abord dans les presets perso (localStorage), puis dans la liste de base. */
export function findParticipantPreset(
  name: string,
  userPresets: readonly ParticipantPreset[] = [],
): ParticipantPreset | undefined {
  const key = normalizePresetName(name)
  if (!key) {
    return undefined
  }
  const fromUser = userPresets.find((preset) => normalizePresetName(preset.name) === key)
  if (fromUser) {
    return fromUser
  }
  return PARTICIPANT_PRESETS.find((preset) => normalizePresetName(preset.name) === key)
}
