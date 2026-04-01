import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
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

const initialAddForm: AddForm = { name: '', kind: 'player', hpCurrent: '10', hpMax: '10', initiative: '10' }
const initialActionForm: ActionForm = { targetIds: [], amount: '1', type: 'damage' }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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
      return {
        participants: Array.isArray(parsed.participants) ? parsed.participants : [],
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

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
    if (Number.isNaN(hpCurrent) || Number.isNaN(hpMax) || Number.isNaN(initiative)) {
      setErrorMessage('HP et initiative doivent etre des nombres.')
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

    setAddForm((previous) => ({ ...initialAddForm, kind: previous.kind }))
    setIsAddModalOpen(false)
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
          return { ...participant, kind: value as ParticipantKind }
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
  }

  function handleNextTurn(): void {
    if (!state.started || participants.length === 0) {
      return
    }
    const nextIndex = nextLivingIndex(participants, safeTurnIndex)
    const wrapped = nextIndex <= safeTurnIndex
    setState((previous) => ({ ...previous, currentTurnIndex: nextIndex, round: wrapped ? previous.round + 1 : previous.round }))
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
    for (const combatEvent of state.events) {
      if (combatEvent.type === 'damage') {
        damageBySource[combatEvent.sourceId] = (damageBySource[combatEvent.sourceId] ?? 0) + combatEvent.amount
        damageByTarget[combatEvent.targetId] = (damageByTarget[combatEvent.targetId] ?? 0) + combatEvent.amount
      } else {
        healBySource[combatEvent.sourceId] = (healBySource[combatEvent.sourceId] ?? 0) + combatEvent.amount
        healByTarget[combatEvent.targetId] = (healByTarget[combatEvent.targetId] ?? 0) + combatEvent.amount
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
    }
  }, [state.events])

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
              onClick={() => setIsAddModalOpen(true)}
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
        {winnerLabel && <p className="winner">{winnerLabel}</p>}
        {errorMessage && <p className="error">{errorMessage}</p>}

        {activeParticipant && (
          <div className="active-card">
            <p className="muted">Participant actif</p>
            <h3>{activeParticipant.name}</h3>
            <p>
              {activeParticipant.hpCurrent}/{activeParticipant.hpMax} HP - Initiative {activeParticipant.initiative}
            </p>
          </div>
        )}

        <form className="combat-form" onSubmit={handleApplyAction}>
          <div className="action-amount-row">
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
              <span className="amount-label">Montant</span>
              <input
                className="input-amount"
                type="number"
                min={1}
                value={actionForm.amount}
                onChange={(event) => setActionForm((previous) => ({ ...previous, amount: event.target.value }))}
                required
              />
            </label>
          </div>

          <div className="targets-box">
            <p className="muted">Cibles (selection multiple, auto-soin autorise)</p>
            <div className="targets-grid">
              {possibleTargets.length === 0 && <p className="muted">Aucune cible disponible</p>}
              {possibleTargets.map((target) => (
                <label key={target.id} className="target-item">
                  <input type="checkbox" checked={actionForm.targetIds.includes(target.id)} onChange={() => toggleTarget(target.id)} />
                  <span>
                    {target.name} ({target.hpCurrent}/{target.hpMax})
                  </span>
                </label>
              ))}
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

      <section className="panel">
        <h2>Participants</h2>
        <div className="list">
          {participants.length === 0 && <p className="muted">Aucun participant pour le moment.</p>}
          {participants.map((participant, index) => (
            <article
              className={`participant-card ${index === safeTurnIndex && state.started ? 'is-active' : ''}`}
              key={participant.id}
              onClick={() => setEditingParticipantId(participant.id)}
            >
              <div className="row">
                <strong>{participant.name || 'Sans nom'}</strong>
                {!isAlive(participant) && <span className="badge">KO</span>}
              </div>
              <div className="hp-line">
                <span className="muted">
                  {participant.hpCurrent}/{participant.hpMax} HP
                </span>
                <span className="muted">Init {participant.initiative}</span>
              </div>
              <div className={`hp-bar ${getParticipantBarClass(participant)}`}>
                <div className="hp-bar-fill" style={{ width: `${clamp((participant.hpCurrent / participant.hpMax) * 100, 0, 100)}%` }} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="stats-heading">
          <h2>Statistiques</h2>
          <button type="button" className="btn-sm secondary" onClick={() => setIsStatsModalOpen(true)}>
            Plus de stats
          </button>
        </div>
        <div className="stats-grid">
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
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="row">
              <h3>Ajouter un participant</h3>
              <button className="secondary" onClick={() => setIsAddModalOpen(false)}>
                Fermer
              </button>
            </div>
            <form className="grid-form" onSubmit={handleAddParticipant}>
              <label>
                Nom
                <input value={addForm.name} onChange={(event) => setAddForm((previous) => ({ ...previous, name: event.target.value }))} required />
              </label>
              <label>
                Type
                <select value={addForm.kind} onChange={(event) => setAddForm((previous) => ({ ...previous, kind: event.target.value as ParticipantKind }))}>
                  <option value="player">Joueur</option>
                  <option value="monster">Monstre</option>
                </select>
              </label>
              <label>
                HP actuels
                <input type="number" min={0} value={addForm.hpCurrent} onChange={(event) => setAddForm((previous) => ({ ...previous, hpCurrent: event.target.value }))} required />
              </label>
              <label>
                HP max
                <input type="number" min={1} value={addForm.hpMax} onChange={(event) => setAddForm((previous) => ({ ...previous, hpMax: event.target.value }))} required />
              </label>
              <label>
                Initiative
                <input type="number" value={addForm.initiative} onChange={(event) => setAddForm((previous) => ({ ...previous, initiative: event.target.value }))} required />
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
        <div className="modal-backdrop" onClick={() => setEditingParticipantId(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="row">
              <h3>Modifier {editingParticipant.name}</h3>
              <button className="secondary" onClick={() => setEditingParticipantId(null)}>
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
                <input type="number" value={editingParticipant.initiative} onChange={(event) => handleParticipantFieldChange(editingParticipant.id, 'initiative', event.target.value)} />
              </label>
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
