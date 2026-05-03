import type { CombatSheet } from './combatSheet'
import { emptyCombatSheet } from './combatSheet'

export type PresetKind = 'player' | 'monster'

export interface ParticipantPreset {
  name: string
  kind: PresetKind
  hpMax: number
  hpCurrent: number
  /** Initiative par défaut (joueur). Monstre : 1–20 si renseignée, sinon tirage au d20 à l’application du preset. */
  initiative?: number
  /** Fiche combat (caracs, protection, esquive, attaques, IA monstre…). */
  combat?: CombatSheet
}

/** Modifie ce tableau ou ajoute des entrées pour tes persos / monstres récurrents. */
export const PARTICIPANT_PRESETS: ParticipantPreset[] = [
  { name: 'Nerys Devolia', kind: 'player', hpMax: 10, hpCurrent: 10, combat: emptyCombatSheet('player') },
  { name: 'Sir Calmon Daemos', kind: 'player', hpMax: 10, hpCurrent: 10, combat: emptyCombatSheet('player') },
  { name: 'Aelyn', kind: 'player', hpMax: 8, hpCurrent: 8, combat: emptyCombatSheet('player') },
  { name: 'Brokk Ferkang', kind: 'player', hpMax: 11, hpCurrent: 11, combat: emptyCombatSheet('player') },
  { name: 'Rôde-Pierre Briseur', kind: 'monster', hpMax: 16, hpCurrent: 16, combat: emptyCombatSheet('monster') },
  { name: 'Rôde-Pierre Guetteur', kind: 'monster', hpMax: 15, hpCurrent: 15, combat: emptyCombatSheet('monster') },
  { name: 'Rôde-Pierre Porte Bouclier', kind: 'monster', hpMax: 18, hpCurrent: 18, combat: emptyCombatSheet('monster') },
  { name: 'Venefil Traqueuse', kind: 'monster', hpMax: 18, hpCurrent: 18, combat: emptyCombatSheet('monster') },
  { name: 'Venefil Libélule', kind: 'monster', hpMax: 24, hpCurrent: 24, combat: emptyCombatSheet('monster') },
  { name: 'Venefil Scarabé', kind: 'monster', hpMax: 28, hpCurrent: 28, combat: emptyCombatSheet('monster') },
  { name: 'Venefil Crache Venin', kind: 'monster', hpMax: 22, hpCurrent: 22, combat: emptyCombatSheet('monster') },
  { name: 'Reine Venefil', kind: 'monster', hpMax: 64, hpCurrent: 64, combat: emptyCombatSheet('monster') },
  { name: 'Venefil Serviteur', kind: 'monster', hpMax: 12, hpCurrent: 12, combat: emptyCombatSheet('monster') },
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
