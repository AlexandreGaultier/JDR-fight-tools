import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  findParticipantPreset,
  normalizePresetName,
  PARTICIPANT_PRESETS,
  type ParticipantPreset,
} from './participantPresets'
import {
  exportUserPresetsToFile,
  loadUserPresets,
  parseUserPresetsFromJson,
  saveUserPresets,
  upsertUserPreset,
} from './userPresetStorage'
import { normalizeParticipantStatuses, PRESET_STATUSES, type PresetStatusId } from './statusPresets'
import './App.css'

const StatsDetailModal = lazy(async () => {
  const module = await import('./StatsDetailModal')
  return { default: module.StatsDetailModal }
})

type ParticipantKind = 'player' | 'monster'
type ActionType = 'damage' | 'heal'

interface Participant {
  id: string
  order: number
  name: string
  kind: ParticipantKind
  hpCurrent: number
  hpMax: number
  initiative: number
  statuses: PresetStatusId[]
}

interface CombatEvent {
  id: string
  sourceId: string
  targetId: string
  amount: number
  type: ActionType
  round: number
  createdAt: number
}

interface CombatState {
  participants: Participant[]
  events: CombatEvent[]
  currentTurnIndex: number
  round: number
  started: boolean
  nextOrder: number
}

interface AddForm {
  name: string
  kind: ParticipantKind
  hpCurrent: string
  hpMax: string
  initiative: string
}

interface ActionForm {
  targetIds: string[]
  amount: string
  type: ActionType
}

const STORAGE_KEY = 'jdr-fight-tools-v1'

const initialAddForm: AddForm = { name: '', kind: 'player', hpCurrent: '', hpMax: '', initiative: '' }
const initialActionForm: ActionForm = { targetIds: [], amount: '', type: 'damage' }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Initiative automatique monstre : d20 (1–20). */
function rollMonsterInitiative(): number {
  return Math.floor(Math.random() * 20) + 1
}

function isAlive(participant: Participant): boolean {
  return participant.hpCurrent > 0
}

function sortByInitiative(participants: Participant[]): Participant[] {
  return [...participants].sort((a, b) => (a.initiative === b.initiative ? a.order - b.order : b.initiative - a.initiative))
}

function getSafeTurnIndex(participants: Participant[], currentTurnIndex: number): number {
  if (participants.length === 0 || currentTurnIndex < 0) {
    return 0
  }
  if (currentTurnIndex > participants.length - 1) {
    return participants.length - 1
  }
  return currentTurnIndex
}

function getWinnerLabel(participants: Participant[]): string | null {
  const alivePlayers = participants.some((participant) => participant.kind === 'player' && isAlive(participant))
  const aliveMonsters = participants.some((participant) => participant.kind === 'monster' && isAlive(participant))
  if (!alivePlayers && !aliveMonsters) {
    return 'Combat termine : plus aucun participant debout.'
  }
  if (!aliveMonsters) {
    return 'Victoire des joueurs !'
  }
  if (!alivePlayers) {
    return 'Victoire des monstres !'
  }
  return null
}

function nextLivingIndex(participants: Participant[], fromIndex: number): number {
  if (participants.length === 0) {
    return 0
  }
  const safeFromIndex = getSafeTurnIndex(participants, fromIndex)
  for (let step = 1; step <= participants.length; step += 1) {
    const candidate = (safeFromIndex + step) % participants.length
    if (isAlive(participants[candidate])) {
      return candidate
    }
  }
  return safeFromIndex
}

function App() {
  const [state, setState] = useState<CombatState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return { participants: [], events: [], currentTurnIndex: 0, round: 1, started: false, nextOrder: 1 }
      }
      const parsed = JSON.parse(raw) as CombatState
      const safeParticipants = Array.isArray(parsed.participants)
        ? parsed.participants.map((participant) => ({
            ...participant,
            statuses: normalizeParticipantStatuses(participant.statuses),
          }))
        : []

      return {
        participants: safeParticipants,
        events: Array.isArray(parsed.events) ? parsed.events : [],
        currentTurnIndex: typeof parsed.currentTurnIndex === 'number' ? parsed.currentTurnIndex : 0,
        round: typeof parsed.round === 'number' ? parsed.round : 1,
        started: Boolean(parsed.started),
        nextOrder: typeof parsed.nextOrder === 'number' ? parsed.nextOrder : 1,
      }
    } catch {
      return { participants: [], events: [], currentTurnIndex: 0, round: 1, started: false, nextOrder: 1 }
    }
  })

  const [addForm, setAddForm] = useState<AddForm>(initialAddForm)
  const [actionForm, setActionForm] = useState<ActionForm>(initialActionForm)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false)
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null)
  const [isApplyLocked, setIsApplyLocked] = useState<boolean>(false)
  const [isStatsModalOpen, setIsStatsModalOpen] = useState<boolean>(false)
  const [userPresets, setUserPresets] = useState<ParticipantPreset[]>(() => loadUserPresets())
  const [savePresetOnAdd, setSavePresetOnAdd] = useState<boolean>(false)
  const [addModalFeedback, setAddModalFeedback] = useState<{ text: string; variant: 'success' | 'error' } | null>(null)
  const importPresetsInputRef = useRef<HTMLInputElement>(null)
  const initiativeRollFeedbackClearRef = useRef<number | null>(null)
  const [initiativeRollAnimating, setInitiativeRollAnimating] = useState(false)

  function playInitiativeRollFeedback(): void {
    if (initiativeRollFeedbackClearRef.current !== null) {
      window.clearTimeout(initiativeRollFeedbackClearRef.current)
      initiativeRollFeedbackClearRef.current = null
    }
    setInitiativeRollAnimating(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setInitiativeRollAnimating(true)
        initiativeRollFeedbackClearRef.current = window.setTimeout(() => {
          setInitiativeRollAnimating(false)
          initiativeRollFeedbackClearRef.current = null
        }, 400)
      })
    })
  }

  useEffect(() => {
    return () => {
      if (initiativeRollFeedbackClearRef.current !== null) {
        window.clearTimeout(initiativeRollFeedbackClearRef.current)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    saveUserPresets(userPresets)
  }, [userPresets])

  useEffect(() => {
    if (!isApplyLocked) {
      return
    }
    const timeoutId = window.setTimeout(() => setIsApplyLocked(false), 500)
    return () => window.clearTimeout(timeoutId)
  }, [isApplyLocked])

  const participants = state.participants
  const safeTurnIndex = getSafeTurnIndex(participants, state.currentTurnIndex)
  const activeParticipant = participants[safeTurnIndex] ?? null
  const winnerLabel = getWinnerLabel(participants)
  const canAct = state.started && !winnerLabel && activeParticipant && isAlive(activeParticipant)

  const possibleTargets = useMemo(() => {
    if (!state.started) {
      return []
    }
    return participants.filter((participant) => isAlive(participant))
  }, [participants, state.started])

  useEffect(() => {
    if (possibleTargets.length === 0) {
      setActionForm((previous) => ({ ...previous, targetIds: [] }))
      return
    }
    setActionForm((previous) => {
      const aliveIds = new Set(possibleTargets.map((target) => target.id))
      const filteredIds = previous.targetIds.filter((targetId) => aliveIds.has(targetId))
      if (filteredIds.length === previous.targetIds.length) {
        return previous
      }
      return { ...previous, targetIds: filteredIds }
    })
  }, [possibleTargets])

  function handleAddParticipant(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setErrorMessage('')
    const name = addForm.name.trim()
    const hpCurrent = Number(addForm.hpCurrent)
    const hpMax = Number(addForm.hpMax)
    const initiative = Number(addForm.initiative)

    if (!name) {
      setErrorMessage('Le nom est obligatoire.')
      return
    }
    if (
      addForm.hpCurrent.trim() === '' ||
      addForm.hpMax.trim() === '' ||
      addForm.initiative.trim() === '' ||
      Number.isNaN(hpCurrent) ||
      Number.isNaN(hpMax) ||
      Number.isNaN(initiative)
    ) {
      setErrorMessage("Remplis les HP (actuels et max) et l'initiative.")
      return
    }
    if (addForm.kind === 'monster' && (initiative < 1 || initiative > 20)) {
      setErrorMessage("L'initiative monstre doit être entre 1 et 20.")
      return
    }
    if (hpMax <= 0) {
      setErrorMessage('Les HP max doivent etre superieurs a 0.')
      return
    }
    if (hpCurrent < 0 || hpCurrent > hpMax) {
      setErrorMessage('Les HP actuels doivent etre entre 0 et HP max.')
      return
    }

    const newParticipant: Participant = {
      id: crypto.randomUUID(),
      order: state.nextOrder,
      name,
      kind: addForm.kind,
      hpCurrent,
      hpMax,
      initiative,
      statuses: [],
    }

    const updatedParticipants = [...participants, newParticipant]
    if (state.started) {
      const sorted = sortByInitiative(updatedParticipants)
      const activeId = activeParticipant?.id ?? ''
      const activeIndex = sorted.findIndex((participant) => participant.id === activeId)
      setState((previous) => ({
        ...previous,
        participants: sorted,
        currentTurnIndex: activeIndex >= 0 ? activeIndex : 0,
        nextOrder: previous.nextOrder + 1,
      }))
    } else {
      setState((previous) => ({ ...previous, participants: updatedParticipants, nextOrder: previous.nextOrder + 1 }))
    }

    if (savePresetOnAdd) {
      setUserPresets((previous) =>
        upsertUserPreset(previous, {
          name,
          kind: addForm.kind,
          hpMax,
          hpCurrent,
        }),
      )
    }

    setAddForm(initialAddForm)
    setSavePresetOnAdd(false)
    setIsAddModalOpen(false)
  }

  function applyPresetForName(rawName: string): void {
    const preset = findParticipantPreset(rawName, userPresets)
    if (!preset) {
      return
    }
    setAddForm((previous) => ({
      ...previous,
      name: preset.name,
      kind: preset.kind,
      hpCurrent: String(preset.hpCurrent),
      hpMax: String(preset.hpMax),
      initiative: preset.kind === 'monster' ? String(rollMonsterInitiative()) : previous.initiative,
    }))
  }

  function handleStartCombat(): void {
    if (participants.length < 2) {
      setErrorMessage('Ajoute au moins 2 participants pour demarrer.')
      return
    }
    const sorted = sortByInitiative(participants)
    const firstAlive = sorted.findIndex((participant) => isAlive(participant))
    setState((previous) => ({ ...previous, participants: sorted, currentTurnIndex: firstAlive >= 0 ? firstAlive : 0, round: 1, started: true }))
    setErrorMessage('')
  }

  function handleResetCombat(): void {
    setState({ participants: [], events: [], currentTurnIndex: 0, round: 1, started: false, nextOrder: 1 })
    setActionForm(initialActionForm)
    setAddForm(initialAddForm)
    setErrorMessage('')
    setEditingParticipantId(null)
  }

  function handleParticipantFieldChange(participantId: string, field: 'name' | 'hpCurrent' | 'hpMax' | 'initiative' | 'kind', value: string): void {
    setState((previous) => {
      const updated = previous.participants.map((participant) => {
        if (participant.id !== participantId) {
          return participant
        }
        if (field === 'name') {
          return { ...participant, name: value }
        }
        if (field === 'kind') {
          const newKind = value as ParticipantKind
          if (newKind === 'monster') {
            return { ...participant, kind: newKind, initiative: rollMonsterInitiative() }
          }
          return { ...participant, kind: newKind }
        }
        const numeric = Number(value)
        if (Number.isNaN(numeric)) {
          return participant
        }
        if (field === 'hpMax') {
          const nextHpMax = Math.max(1, numeric)
          return { ...participant, hpMax: nextHpMax, hpCurrent: clamp(participant.hpCurrent, 0, nextHpMax) }
        }
        if (field === 'hpCurrent') {
          return { ...participant, hpCurrent: clamp(numeric, 0, participant.hpMax) }
        }
        return { ...participant, initiative: numeric }
      })

      const activeId = previous.participants[previous.currentTurnIndex]?.id ?? ''
      const sorted = previous.started ? sortByInitiative(updated) : updated
      const newTurnIndex = sorted.findIndex((participant) => participant.id === activeId)
      return { ...previous, participants: sorted, currentTurnIndex: newTurnIndex >= 0 ? newTurnIndex : 0 }
    })
  }

  function handleDeleteParticipant(participantId: string): void {
    setState((previous) => {
      const filtered = previous.participants.filter((participant) => participant.id !== participantId)
      const activeId = previous.participants[previous.currentTurnIndex]?.id ?? ''
      const nextIndex = filtered.findIndex((participant) => participant.id === activeId)
      return { ...previous, participants: filtered, currentTurnIndex: nextIndex >= 0 ? nextIndex : 0 }
    })
    if (editingParticipantId === participantId) {
      setEditingParticipantId(null)
    }
  }

  function toggleParticipantStatus(participantId: string, statusId: PresetStatusId): void {
    setState((previous) => ({
      ...previous,
      participants: previous.participants.map((participant) => {
        if (participant.id !== participantId) {
          return participant
        }

        const hasStatus = participant.statuses.includes(statusId)
        return {
          ...participant,
          statuses: hasStatus ? participant.statuses.filter((id) => id !== statusId) : [...participant.statuses, statusId],
        }
      }),
    }))
  }

  function renderStatusToggleStrip(participantId: string, active: readonly PresetStatusId[], variant: 'card' | 'compact') {
    return (
      <div
        className={`status-toggle-strip ${variant === 'compact' ? 'status-toggle-strip--compact' : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="group"
        aria-label="Statuts"
      >
        {PRESET_STATUSES.map((definition) => {
          const isOn = active.includes(definition.id)
          return (
            <button
              key={definition.id}
              type="button"
              className={`status-toggle status-toggle--${definition.id} ${isOn ? 'is-on' : ''}`}
              title={definition.title}
              aria-pressed={isOn}
              onClick={() => toggleParticipantStatus(participantId, definition.id)}
            >
              {definition.label}
            </button>
          )
        })}
      </div>
    )
  }

  function handleApplyAction(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (isApplyLocked) {
      return
    }
    setErrorMessage('')

    if (!activeParticipant) {
      setErrorMessage('Aucun participant actif.')
      return
    }
    if (actionForm.amount.trim() === '') {
      setErrorMessage('Indique un montant.')
      return
    }
    const amount = Number(actionForm.amount)
    if (Number.isNaN(amount) || amount <= 0) {
      setErrorMessage('Le montant doit etre superieur a 0.')
      return
    }
    if (actionForm.targetIds.length === 0) {
      setErrorMessage('Choisis au moins une cible.')
      return
    }

    setIsApplyLocked(true)
    setState((previous) => {
      const targetSet = new Set(actionForm.targetIds)
      const updatedParticipants = previous.participants.map((participant) => {
        if (!targetSet.has(participant.id)) {
          return participant
        }
        if (actionForm.type === 'damage') {
          return { ...participant, hpCurrent: clamp(participant.hpCurrent - amount, 0, participant.hpMax) }
        }
        return { ...participant, hpCurrent: clamp(participant.hpCurrent + amount, 0, participant.hpMax) }
      })
      const newEvents: CombatEvent[] = actionForm.targetIds.map((targetId) => ({
        id: crypto.randomUUID(),
        sourceId: activeParticipant.id,
        targetId,
        amount,
        type: actionForm.type,
        round: previous.round,
        createdAt: Date.now(),
      }))
      return { ...previous, participants: updatedParticipants, events: [...previous.events, ...newEvents] }
    })
    setActionForm((previous) => ({ ...previous, amount: '', targetIds: [] }))
  }

  function handleNextTurn(): void {
    if (!state.started || participants.length === 0) {
      return
    }
    const nextIndex = nextLivingIndex(participants, safeTurnIndex)
    const wrapped = nextIndex <= safeTurnIndex
    setState((previous) => ({ ...previous, currentTurnIndex: nextIndex, round: wrapped ? previous.round + 1 : previous.round }))
    setActionForm((previous) => ({ ...previous, targetIds: [] }))
  }

  function participantNameById(id: string): string {
    return participants.find((participant) => participant.id === id)?.name ?? 'Inconnu'
  }

  function toggleTarget(targetId: string): void {
    setActionForm((previous) => {
      if (previous.targetIds.includes(targetId)) {
        return { ...previous, targetIds: previous.targetIds.filter((id) => id !== targetId) }
      }
      return { ...previous, targetIds: [...previous.targetIds, targetId] }
    })
  }

  const editingParticipant = editingParticipantId ? participants.find((participant) => participant.id === editingParticipantId) ?? null : null
  const stats = useMemo(() => {
    const damageBySource: Record<string, number> = {}
    const damageByTarget: Record<string, number> = {}
    const healBySource: Record<string, number> = {}
    const healByTarget: Record<string, number> = {}
    let totalDamage = 0
    let totalHeal = 0
    let maxDamageEvent: CombatEvent | null = null
    let maxHealEvent: CombatEvent | null = null

    for (const combatEvent of state.events) {
      if (combatEvent.type === 'damage') {
        totalDamage += combatEvent.amount
        damageBySource[combatEvent.sourceId] = (damageBySource[combatEvent.sourceId] ?? 0) + combatEvent.amount
        damageByTarget[combatEvent.targetId] = (damageByTarget[combatEvent.targetId] ?? 0) + combatEvent.amount
        if (!maxDamageEvent || combatEvent.amount > maxDamageEvent.amount) {
          maxDamageEvent = combatEvent
        }
        continue
      }
      totalHeal += combatEvent.amount
      healBySource[combatEvent.sourceId] = (healBySource[combatEvent.sourceId] ?? 0) + combatEvent.amount
      healByTarget[combatEvent.targetId] = (healByTarget[combatEvent.targetId] ?? 0) + combatEvent.amount
      if (!maxHealEvent || combatEvent.amount > maxHealEvent.amount) {
        maxHealEvent = combatEvent
      }
    }

    const findTop = (map: Record<string, number>): { id: string; value: number } | null => {
      const entries = Object.entries(map)
      if (entries.length === 0) {
        return null
      }
      const [id, value] = entries.reduce((best, current) => (current[1] > best[1] ? current : best))
      return { id, value }
    }
    return {
      topDamageSource: findTop(damageBySource),
      topDamageTarget: findTop(damageByTarget),
      topHealSource: findTop(healBySource),
      topHealTarget: findTop(healByTarget),
      totalDamage,
      totalHeal,
      actionCount: state.events.length,
      maxDamageEvent,
      maxHealEvent,
    }
  }, [state.events])

  const mergedPresetOptions = useMemo(() => {
    const map = new Map<string, ParticipantPreset>()
    for (const preset of PARTICIPANT_PRESETS) {
      map.set(normalizePresetName(preset.name), preset)
    }
    for (const preset of userPresets) {
      map.set(normalizePresetName(preset.name), preset)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [userPresets])

  const playerColorById = useMemo(() => {
    const colors = ['player-green', 'player-blue', 'player-yellow', 'player-purple']
    const map: Record<string, string> = {}
    let index = 0
    for (const participant of participants) {
      if (participant.kind !== 'player') {
        continue
      }
      map[participant.id] = colors[index % colors.length]
      index += 1
    }
    return map
  }, [participants])

  function getParticipantBarClass(participant: Participant): string {
    if (participant.kind === 'monster') {
      return 'monster'
    }
    return playerColorById[participant.id] ?? 'player-green'
  }

  function handleExportUserPresets(): void {
    exportUserPresetsToFile(userPresets)
    setAddModalFeedback({ text: 'Fichier JSON téléchargé.', variant: 'success' })
  }

  function handleImportUserPresetsFile(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result)
        const next = parseUserPresetsFromJson(text)
        setUserPresets(next)
        setAddModalFeedback({ text: `Import réussi : ${next.length} entrée(s).`, variant: 'success' })
      } catch (error) {
        setAddModalFeedback({
          text: error instanceof Error ? error.message : 'Import impossible.',
          variant: 'error',
        })
      }
    }
    reader.readAsText(file)
  }

  return (
    <main className="app">
      <section className="panel combat-panel">
        <div className="combat-heading">
          <h2>Combat</h2>
          <div className="combat-toolbar" role="toolbar" aria-label="Actions combat">
            <button
              type="button"
              className="btn-sm btn-add"
              title="Ajouter un participant"
              onClick={() => {
                setAddForm(initialAddForm)
                setSavePresetOnAdd(false)
                setAddModalFeedback(null)
                setIsAddModalOpen(true)
              }}
            >
              Ajouter
            </button>
            <button type="button" className="btn-sm" onClick={handleStartCombat} disabled={participants.length < 2}>
              Démarrer
            </button>
            <button type="button" className="btn-sm secondary" onClick={handleResetCombat}>
              Réinit.
            </button>
          </div>
        </div>

        <p className="muted">Tour n°{state.round}</p>
        {errorMessage && <p className="error">{errorMessage}</p>}

        {activeParticipant && (
          <div className="active-card active-card-compact">
            <p className="active-line1">
              <span className="muted">Participant actif :</span>{' '}
              <strong className="active-name">{activeParticipant.name}</strong>
            </p>
            <p className="active-line2 muted">
              {activeParticipant.hpCurrent}/{activeParticipant.hpMax} HP - Initiative {activeParticipant.initiative}
            </p>
            {renderStatusToggleStrip(activeParticipant.id, activeParticipant.statuses, 'compact')}
          </div>
        )}

        <form className="combat-form" onSubmit={handleApplyAction}>
          <div className="action-amount-row combat-action-controls">
            <div className="segmented" role="group" aria-label="Type d'action">
              <button
                type="button"
                className={`segmented-btn ${actionForm.type === 'damage' ? 'is-active' : ''}`}
                onClick={() => setActionForm((previous) => ({ ...previous, type: 'damage' }))}
              >
                Dégâts
              </button>
              <button
                type="button"
                className={`segmented-btn ${actionForm.type === 'heal' ? 'is-active' : ''}`}
                onClick={() => setActionForm((previous) => ({ ...previous, type: 'heal' }))}
              >
                Soin
              </button>
            </div>
            <label className="amount-field">
              <input
                className="input-amount"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="Montant"
                value={actionForm.amount}
                onChange={(event) => setActionForm((previous) => ({ ...previous, amount: event.target.value }))}
              />
            </label>
          </div>

          <div className="targets-box">
            <p className="muted">Cibles (selection multiple, auto-soin autorise)</p>
            {possibleTargets.length === 0 && <p className="muted">Aucune cible disponible</p>}
            <div className="targets-split">
              <div className="targets-column">
                <p className="targets-column-title muted">Joueurs</p>
                <div className="targets-grid">
                  {possibleTargets
                    .filter((target) => target.kind === 'player')
                    .map((target) => (
                      <label key={target.id} className="target-item">
                        <input type="checkbox" checked={actionForm.targetIds.includes(target.id)} onChange={() => toggleTarget(target.id)} />
                        <div className="target-item-body">
                          <span className={`target-label ${getParticipantBarClass(target)}`}>
                            {target.name} ({target.hpCurrent}/{target.hpMax})
                          </span>
                          <div className={`hp-bar hp-bar-tiny ${getParticipantBarClass(target)}`}>
                            <div
                              className="hp-bar-fill"
                              style={{ width: `${clamp((target.hpCurrent / target.hpMax) * 100, 0, 100)}%` }}
                            />
                          </div>
                        </div>
                      </label>
                    ))}
                </div>
              </div>
              <div className="targets-column">
                <p className="targets-column-title muted">Monstres</p>
                <div className="targets-grid">
                  {possibleTargets
                    .filter((target) => target.kind === 'monster')
                    .map((target) => (
                      <label key={target.id} className="target-item">
                        <input type="checkbox" checked={actionForm.targetIds.includes(target.id)} onChange={() => toggleTarget(target.id)} />
                        <div className="target-item-body">
                          <span className={`target-label ${getParticipantBarClass(target)}`}>
                            {target.name} ({target.hpCurrent}/{target.hpMax})
                          </span>
                          <div className={`hp-bar hp-bar-tiny ${getParticipantBarClass(target)}`}>
                            <div
                              className="hp-bar-fill"
                              style={{ width: `${clamp((target.hpCurrent / target.hpMax) * 100, 0, 100)}%` }}
                            />
                          </div>
                        </div>
                      </label>
                    ))}
                </div>
              </div>
            </div>
          </div>

          <div className="combat-submit-row">
            <button type="submit" className="btn-sm" disabled={!canAct || possibleTargets.length === 0 || isApplyLocked}>
              Appliquer
            </button>
            <button type="button" className="btn-sm secondary" onClick={handleNextTurn} disabled={!state.started}>
              Suivant
            </button>
          </div>
        </form>
      </section>

      <section className="panel participants-panel">
        <h2>Participants</h2>
        <div className="list">
          {participants.length === 0 && <p className="muted">Aucun participant pour le moment.</p>}
          {participants.map((participant, index) => (
            <article
              className={`participant-card ${index === safeTurnIndex && state.started ? 'is-active' : ''} ${!isAlive(participant) ? 'is-ko' : ''}`}
              key={participant.id}
              onClick={() => setEditingParticipantId(participant.id)}
            >
              <div className="participant-top participant-top-with-status">
                <div className="participant-title-block">
                  <div className="participant-name-row">
                    <strong className="participant-name" title={participant.name || undefined}>
                      {participant.name || 'Sans nom'}
                    </strong>
                    {!isAlive(participant) && <span className="badge">KO</span>}
                  </div>
                  <div className="participant-meta muted">
                    <span>
                      {participant.hpCurrent}/{participant.hpMax} HP
                    </span>
                    <span className="participant-meta-sep" aria-hidden="true">
                      ·
                    </span>
                    <span>Init {participant.initiative}</span>
                  </div>
                </div>
                {renderStatusToggleStrip(participant.id, participant.statuses, 'card')}
              </div>
              <div className={`hp-bar ${getParticipantBarClass(participant)}`}>
                <div className="hp-bar-fill" style={{ width: `${clamp((participant.hpCurrent / participant.hpMax) * 100, 0, 100)}%` }} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel stats-panel">
        <div className="stats-heading">
          <h2>Statistiques</h2>
          {state.events.length > 0 && (
            <button type="button" className="btn-sm secondary" onClick={() => setIsStatsModalOpen(true)}>
              Plus de stats
            </button>
          )}
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <p className="muted">Total degats (PV)</p>
            <p>{stats.totalDamage > 0 ? stats.totalDamage : '—'}</p>
          </div>
          <div className="stat-card">
            <p className="muted">Total soins (PV)</p>
            <p>{stats.totalHeal > 0 ? stats.totalHeal : '—'}</p>
          </div>
          <div className="stat-card">
            <p className="muted">Actions enregistrees</p>
            <p>{stats.actionCount}</p>
          </div>
          <div className="stat-card">
            <p className="muted">Plus gros coup (degats)</p>
            <p className="stat-card-detail">
              {stats.maxDamageEvent
                ? `${stats.maxDamageEvent.amount} PV — ${participantNameById(stats.maxDamageEvent.sourceId)} → ${participantNameById(stats.maxDamageEvent.targetId)}`
                : 'Aucune donnee'}
            </p>
          </div>
          <div className="stat-card">
            <p className="muted">Plus gros soin (un coup)</p>
            <p className="stat-card-detail">
              {stats.maxHealEvent
                ? `${stats.maxHealEvent.amount} PV — ${participantNameById(stats.maxHealEvent.sourceId)} → ${participantNameById(stats.maxHealEvent.targetId)}`
                : 'Aucune donnee'}
            </p>
          </div>
          <div className="stat-card">
            <p className="muted">Plus de degats infliges</p>
            <p>{stats.topDamageSource ? `${participantNameById(stats.topDamageSource.id)} (${stats.topDamageSource.value})` : 'Aucune donnee'}</p>
          </div>
          <div className="stat-card">
            <p className="muted">Plus de degats recus</p>
            <p>{stats.topDamageTarget ? `${participantNameById(stats.topDamageTarget.id)} (${stats.topDamageTarget.value})` : 'Aucune donnee'}</p>
          </div>
          <div className="stat-card">
            <p className="muted">Plus de soins prodigues</p>
            <p>{stats.topHealSource ? `${participantNameById(stats.topHealSource.id)} (${stats.topHealSource.value})` : 'Aucune donnee'}</p>
          </div>
          <div className="stat-card">
            <p className="muted">Plus de soins recus</p>
            <p>{stats.topHealTarget ? `${participantNameById(stats.topHealTarget.id)} (${stats.topHealTarget.value})` : 'Aucune donnee'}</p>
          </div>
        </div>
      </section>

      {isAddModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAddModalOpen(false)}>
          <div className="modal modal-add-participant" onClick={(event) => event.stopPropagation()}>
            <div className="row modal-title-row">
              <h3>Ajouter un participant</h3>
              <button type="button" className="secondary btn-sm btn-modal-close" onClick={() => setIsAddModalOpen(false)}>
                Fermer
              </button>
            </div>
            <p className="muted preset-hint">
              Choisis un nom connu (suggestions ci-dessous) puis quitte le champ : les HP et le type se remplissent tout seuls.
              {addForm.kind === 'monster'
                ? " Pour un monstre, l'initiative est tirée au d20 — clique sur la valeur pour relancer."
                : ' Il reste à saisir l\u2019initiative.'}
            </p>
            <div className="user-presets-toolbar">
              <button type="button" className="btn-sm secondary" onClick={handleExportUserPresets}>
                Exporter mes presets
              </button>
              <button type="button" className="btn-sm secondary" onClick={() => importPresetsInputRef.current?.click()}>
                Importer des presets
              </button>
              <input
                ref={importPresetsInputRef}
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                aria-hidden="true"
                onChange={handleImportUserPresetsFile}
              />
              <span className="muted user-presets-count">{userPresets.length} perso(s) enregistré(s)</span>
            </div>
            {addModalFeedback && (
              <p className={`add-modal-feedback ${addModalFeedback.variant === 'error' ? 'is-error' : ''}`}>{addModalFeedback.text}</p>
            )}
            <datalist id="participant-preset-datalist">
              {mergedPresetOptions.map((preset) => (
                <option key={`${normalizePresetName(preset.name)}-${preset.kind}`} value={preset.name} />
              ))}
            </datalist>
            <form className="grid-form" onSubmit={handleAddParticipant}>
              <label>
                Nom
                <input
                  list="participant-preset-datalist"
                  autoComplete="off"
                  placeholder="ex. Aelyn ou Brokk Ferkang"
                  value={addForm.name}
                  onChange={(event) => setAddForm((previous) => ({ ...previous, name: event.target.value }))}
                  onBlur={(event) => applyPresetForName(event.target.value)}
                  required
                />
              </label>
              <label>
                Type
                <select
                  value={addForm.kind}
                  onChange={(event) => {
                    const kind = event.target.value as ParticipantKind
                    setAddForm((previous) => ({
                      ...previous,
                      kind,
                      initiative: kind === 'monster' ? String(rollMonsterInitiative()) : '',
                    }))
                  }}
                >
                  <option value="player">Joueur</option>
                  <option value="monster">Monstre</option>
                </select>
              </label>
              <label>
                HP actuels
                <input
                  type="number"
                  min={0}
                  placeholder="ex. 10"
                  value={addForm.hpCurrent}
                  onChange={(event) => setAddForm((previous) => ({ ...previous, hpCurrent: event.target.value }))}
                />
              </label>
              <label>
                HP max
                <input
                  type="number"
                  min={1}
                  placeholder="ex. 10"
                  value={addForm.hpMax}
                  onChange={(event) => setAddForm((previous) => ({ ...previous, hpMax: event.target.value }))}
                />
              </label>
              <label>
                Initiative
                {addForm.kind === 'monster' ? (
                  <button
                    type="button"
                    className={`initiative-roll-btn${initiativeRollAnimating ? ' initiative-roll-btn--rolling' : ''}`}
                    title="Relancer l'initiative (d20, 1–20)"
                    onClick={() => {
                      playInitiativeRollFeedback()
                      setAddForm((previous) => ({
                        ...previous,
                        initiative: String(rollMonsterInitiative()),
                      }))
                    }}
                  >
                    {addForm.initiative.trim() === '' ? '—' : addForm.initiative}
                  </button>
                ) : (
                  <input
                    type="number"
                    placeholder="ex. 15"
                    inputMode="numeric"
                    value={addForm.initiative}
                    onChange={(event) => setAddForm((previous) => ({ ...previous, initiative: event.target.value }))}
                  />
                )}
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={savePresetOnAdd}
                  onChange={(event) => setSavePresetOnAdd(event.target.checked)}
                />
                <span>Enregistrer dans mes presets (navigateur)</span>
              </label>
              <button type="submit">Ajouter</button>
            </form>
          </div>
        </div>
      )}

      {isStatsModalOpen && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <div className="modal">
                <p className="muted">Chargement des graphiques…</p>
              </div>
            </div>
          }
        >
          <StatsDetailModal
            isOpen
            onClose={() => setIsStatsModalOpen(false)}
            events={state.events}
            participants={participants.map((participant) => ({ id: participant.id, name: participant.name }))}
          />
        </Suspense>
      )}

      {editingParticipant && (
        <div
          className="modal-backdrop"
          onClick={() => setEditingParticipantId(null)}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="row modal-title-row">
              <h3>Modifier {editingParticipant.name}</h3>
              <button
                type="button"
                className="secondary btn-sm btn-modal-close"
                onClick={() => setEditingParticipantId(null)}
              >
                Fermer
              </button>
            </div>
            <div className="grid-form">
              <label>
                Nom
                <input value={editingParticipant.name} onChange={(event) => handleParticipantFieldChange(editingParticipant.id, 'name', event.target.value)} />
              </label>
              <label>
                Type
                <select value={editingParticipant.kind} onChange={(event) => handleParticipantFieldChange(editingParticipant.id, 'kind', event.target.value)}>
                  <option value="player">Joueur</option>
                  <option value="monster">Monstre</option>
                </select>
              </label>
              <label>
                HP actuels
                <input type="number" min={0} value={editingParticipant.hpCurrent} onChange={(event) => handleParticipantFieldChange(editingParticipant.id, 'hpCurrent', event.target.value)} />
              </label>
              <label>
                HP max
                <input type="number" min={1} value={editingParticipant.hpMax} onChange={(event) => handleParticipantFieldChange(editingParticipant.id, 'hpMax', event.target.value)} />
              </label>
              <label>
                Initiative
                {editingParticipant.kind === 'monster' ? (
                  <button
                    type="button"
                    className={`initiative-roll-btn${initiativeRollAnimating ? ' initiative-roll-btn--rolling' : ''}`}
                    title="Relancer l'initiative (d20, 1–20)"
                    onClick={() => {
                      playInitiativeRollFeedback()
                      handleParticipantFieldChange(editingParticipant.id, 'initiative', String(rollMonsterInitiative()))
                    }}
                  >
                    {editingParticipant.initiative}
                  </button>
                ) : (
                  <input
                    type="number"
                    value={editingParticipant.initiative}
                    onChange={(event) => handleParticipantFieldChange(editingParticipant.id, 'initiative', event.target.value)}
                  />
                )}
              </label>
              <div className="status-editor">
                <p className="muted">Statuts (clic pour activer / désactiver)</p>
                {renderStatusToggleStrip(editingParticipant.id, editingParticipant.statuses, 'card')}
              </div>
              <button className="danger" onClick={() => handleDeleteParticipant(editingParticipant.id)}>
                Supprimer le participant
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
