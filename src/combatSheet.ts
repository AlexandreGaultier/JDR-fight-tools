export type CombatParticipantKind = 'player' | 'monster'

export type CombatBonusStat = 'none' | 'puissance' | 'vaillance' | 'agilite' | 'instinct' | 'intelligence'

export interface CombatAttack {
  id: string
  name: string
  /** Portée libre : CaC, CP, MP, LP… */
  portee: string
  diceCount: number
  diceSides: number
  flatBonus: number
  bonusStat: CombatBonusStat
}

export interface CombatSheet {
  puissance: number
  vaillance: number
  agilite: number
  instinct: number
  intelligence: number
  defense: number
  armure: number
  /** Faces du d6 sur lesquelles le participant esquive (1 à 6). */
  esquiveOn: number[]
  /** Monstres uniquement : niveau d’IA tactique (0–3). */
  combatIA?: number
  attacks: CombatAttack[]
}

export const BONUS_STAT_OPTIONS: { value: CombatBonusStat; label: string }[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'puissance', label: 'Puissance' },
  { value: 'vaillance', label: 'Vaillance' },
  { value: 'agilite', label: 'Agilité' },
  { value: 'instinct', label: 'Instinct' },
  { value: 'intelligence', label: 'Intelligence' },
]

function clampInt(n: number, min: number, max: number): number {
  const v = Math.round(Number.isFinite(n) ? n : min)
  return Math.min(max, Math.max(min, v))
}

function clampNonNegativeOpen(n: number, max = 999): number {
  const v = Math.round(Number.isFinite(n) ? n : 0)
  return Math.min(max, Math.max(0, v))
}

export function emptyCombatSheet(kind: CombatParticipantKind): CombatSheet {
  return {
    puissance: 0,
    vaillance: 0,
    agilite: 0,
    instinct: 0,
    intelligence: 0,
    defense: 0,
    armure: 0,
    esquiveOn: [],
    combatIA: kind === 'monster' ? 0 : undefined,
    attacks: [],
  }
}

/** Ancienne sauvegarde : champ `monster` au lieu de `combat`. */
export function participantCombatFromStorage(participant: {
  kind: CombatParticipantKind
  combat?: unknown
  monster?: unknown
}): CombatSheet | undefined {
  const raw = participant.combat ?? participant.monster
  if (raw === undefined || raw === null) {
    if (participant.kind === 'monster') {
      return emptyCombatSheet('monster')
    }
    return undefined
  }
  return normalizeCombatSheet(raw, participant.kind)
}

function normalizeBonusStat(raw: unknown): CombatBonusStat {
  const s = typeof raw === 'string' ? raw : ''
  const ok = BONUS_STAT_OPTIONS.some((o) => o.value === s)
  return ok ? (s as CombatBonusStat) : 'none'
}

function normalizeCombatIA(raw: unknown, kind: CombatParticipantKind): number | undefined {
  if (kind !== 'monster') {
    return undefined
  }
  if (typeof raw === 'number') {
    return clampInt(raw, 0, 3)
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed === '') {
      return 0
    }
    const n = Number(trimmed)
    if (Number.isFinite(n)) {
      return clampInt(n, 0, 3)
    }
    return 0
  }
  return 0
}

function normalizeAttack(raw: unknown, index: number): CombatAttack {
  const base = {
    id: crypto.randomUUID(),
    name: '',
    portee: '',
    diceCount: 1,
    diceSides: 8,
    flatBonus: 0,
    bonusStat: 'none' as CombatBonusStat,
  }
  if (!raw || typeof raw !== 'object') {
    return { ...base, name: `Attaque ${index + 1}` }
  }
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' && o.id.length > 0 ? o.id : base.id
  const name = typeof o.name === 'string' ? o.name : base.name
  const portee = typeof o.portee === 'string' ? o.portee : ''
  return {
    id,
    name,
    portee,
    diceCount: clampInt(Number(o.diceCount), 1, 30),
    diceSides: clampInt(Number(o.diceSides), 2, 100),
    flatBonus: clampInt(Number(o.flatBonus), -50, 50),
    bonusStat: normalizeBonusStat(o.bonusStat),
  }
}

export function normalizeCombatSheet(raw: unknown, kind: CombatParticipantKind): CombatSheet {
  const base = emptyCombatSheet(kind)
  if (!raw || typeof raw !== 'object') {
    return base
  }
  const o = raw as Record<string, unknown>
  const esquiveRaw = o.esquiveOn
  let esquiveOn: number[] = []
  if (Array.isArray(esquiveRaw)) {
    esquiveOn = [...new Set(esquiveRaw.map((x) => clampInt(Number(x), 1, 6)))].filter((x) => x >= 1 && x <= 6).sort((a, b) => a - b)
  }
  const attacksRaw = o.attacks
  let attacks: CombatAttack[] = []
  if (Array.isArray(attacksRaw)) {
    attacks = attacksRaw.map((a, i) => normalizeAttack(a, i))
  }
  return {
    puissance: clampInt(Number(o.puissance), -99, 99),
    vaillance: clampInt(Number(o.vaillance), -99, 99),
    agilite: clampInt(Number(o.agilite ?? o.agilité), -99, 99),
    instinct: clampInt(Number(o.instinct), -99, 99),
    intelligence: clampInt(Number(o.intelligence), -99, 99),
    defense: clampNonNegativeOpen(Number(o.defense ?? o.def)),
    armure: clampNonNegativeOpen(Number(o.armure)),
    esquiveOn,
    combatIA: normalizeCombatIA(o.combatIA, kind),
    attacks,
  }
}

export interface AttackRollResult {
  rolls: number[]
  diceSum: number
  flatBonus: number
  statBonus: number
  statLabel: string
  total: number
}

export function rollCombatAttackDamage(attack: CombatAttack, stats: CombatSheet): AttackRollResult {
  const diceCount = clampInt(attack.diceCount, 1, 30)
  const diceSides = clampInt(attack.diceSides, 2, 100)
  const rolls: number[] = []
  for (let i = 0; i < diceCount; i += 1) {
    rolls.push(Math.floor(Math.random() * diceSides) + 1)
  }
  const diceSum = rolls.reduce((a, b) => a + b, 0)
  const flatBonus = clampInt(attack.flatBonus, -50, 50)
  let statBonus = 0
  let statLabel = ''
  if (attack.bonusStat !== 'none') {
    const key = attack.bonusStat as keyof CombatSheet
    if (key in stats && typeof stats[key] === 'number') {
      statBonus = stats[key] as number
      statLabel = BONUS_STAT_OPTIONS.find((opt) => opt.value === attack.bonusStat)?.label ?? ''
    }
  }
  const total = diceSum + flatBonus + statBonus
  return { rolls, diceSum, flatBonus, statBonus, statLabel, total }
}

export function formatEsquiveLabel(esquiveOn: readonly number[]): string {
  if (!esquiveOn.length) {
    return '—'
  }
  return esquiveOn.join(', ')
}

export function attackSummaryLabel(attack: CombatAttack): string {
  const name = attack.name.trim() || 'Attaque'
  const porteeRaw = attack.portee.trim()
  const porteePrefix = porteeRaw ? `[${porteeRaw}] ` : ''
  const d = `${attack.diceCount}d${attack.diceSides}`
  const flat = attack.flatBonus === 0 ? '' : attack.flatBonus > 0 ? ` +${attack.flatBonus}` : ` ${attack.flatBonus}`
  const bonus =
    attack.bonusStat === 'none'
      ? ''
      : ` + ${BONUS_STAT_OPTIONS.find((o) => o.value === attack.bonusStat)?.label ?? ''}`
  return `${porteePrefix}${name} (${d}${flat}${bonus})`
}
