import { useEffect, useMemo, useState } from 'react'
import './App.css'

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
  targetId: string
  amount: string
  type: ActionType
}

const STORAGE_KEY = 'jdr-fight-tools-v1'

const initialAddForm: AddForm = {
  name: '',
  kind: 'player',
  hpCurrent: '10',
  hpMax: '10',
  initiative: '10',
}

const initialActionForm: ActionForm = {
  targetId: '',
  amount: '1',
  type: 'damage',
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isAlive(participant: Participant): boolean {
  return participant.hpCurrent > 0
}

function sortByInitiative(participants: Participant[]): Participant[] {
  return [...participants].sort((a, b) => {
    if (a.initiative === b.initiative) {
      return a.order - b.order
    }

    return b.initiative - a.initiative
  })
}

function getSafeTurnIndex(participants: Participant[], currentTurnIndex: number): number {
  if (participants.length === 0) {
    return 0
  }

  if (currentTurnIndex < 0) {
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
    return 'Combat terminé : plus aucun participant debout.'
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
        return {
          participants: [],
          events: [],
          currentTurnIndex: 0,
          round: 1,
          started: false,
          nextOrder: 1,
        }
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
      return {
        participants: [],
        events: [],
        currentTurnIndex: 0,
        round: 1,
        started: false,
        nextOrder: 1,
      }
    }
  })

  const [addForm, setAddForm] = useState<AddForm>(initialAddForm)
  const [actionForm, setActionForm] = useState<ActionForm>(initialActionForm)
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const participants = state.participants
  const safeTurnIndex = getSafeTurnIndex(participants, state.currentTurnIndex)
  const activeParticipant = participants[safeTurnIndex] ?? null
  const winnerLabel = getWinnerLabel(participants)
  const canAct = state.started && !winnerLabel && activeParticipant && isAlive(activeParticipant)

  const possibleTargets = useMemo(() => {
    if (!activeParticipant) {
      return []
    }

    return participants.filter((participant) => participant.id !== activeParticipant.id && isAlive(participant))
  }, [activeParticipant, participants])

  useEffect(() => {
    if (possibleTargets.length === 0) {
      setActionForm((previous) => ({ ...previous, targetId: '' }))
      return
    }

    const isCurrentTargetValid = possibleTargets.some((target) => target.id === actionForm.targetId)
    if (isCurrentTargetValid) {
      return
    }

    setActionForm((previous) => ({ ...previous, targetId: possibleTargets[0].id }))
  }, [possibleTargets, actionForm.targetId])

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
      setState((previous) => ({
        ...previous,
        participants: updatedParticipants,
        nextOrder: previous.nextOrder + 1,
      }))
    }

    setAddForm((previous) => ({
      ...initialAddForm,
      kind: previous.kind,
    }))
  }

  function handleStartCombat(): void {
    if (participants.length < 2) {
      setErrorMessage('Ajoute au moins 2 participants pour demarrer.')
      return
    }

    const sorted = sortByInitiative(participants)
    const firstAlive = sorted.findIndex((participant) => isAlive(participant))

    setState((previous) => ({
      ...previous,
      participants: sorted,
      currentTurnIndex: firstAlive >= 0 ? firstAlive : 0,
      round: 1,
      started: true,
    }))
    setErrorMessage('')
  }

  function handleResetCombat(): void {
    setState({
      participants: [],
      events: [],
      currentTurnIndex: 0,
      round: 1,
      started: false,
      nextOrder: 1,
    })
    setActionForm(initialActionForm)
    setAddForm(initialAddForm)
    setErrorMessage('')
  }

  function handleParticipantFieldChange(
    participantId: string,
    field: 'name' | 'hpCurrent' | 'hpMax' | 'initiative' | 'kind',
    value: string,
  ): void {
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
          const nextCurrent = clamp(participant.hpCurrent, 0, nextHpMax)
          return { ...participant, hpMax: nextHpMax, hpCurrent: nextCurrent }
        }

        if (field === 'hpCurrent') {
          return { ...participant, hpCurrent: clamp(numeric, 0, participant.hpMax) }
        }

        return { ...participant, initiative: numeric }
      })

      const activeId = previous.participants[previous.currentTurnIndex]?.id ?? ''
      const sorted = previous.started ? sortByInitiative(updated) : updated
      const newTurnIndex = sorted.findIndex((participant) => participant.id === activeId)

      return {
        ...previous,
        participants: sorted,
        currentTurnIndex: newTurnIndex >= 0 ? newTurnIndex : 0,
      }
    })
  }

  function handleDeleteParticipant(participantId: string): void {
    setState((previous) => {
      const filtered = previous.participants.filter((participant) => participant.id !== participantId)
      const activeId = previous.participants[previous.currentTurnIndex]?.id ?? ''
      const nextIndex = filtered.findIndex((participant) => participant.id === activeId)

      return {
        ...previous,
        participants: filtered,
        currentTurnIndex: nextIndex >= 0 ? nextIndex : 0,
      }
    })
  }

  function handleApplyAction(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
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

    if (!actionForm.targetId) {
      setErrorMessage('Choisis une cible.')
      return
    }

    const target = participants.find((participant) => participant.id === actionForm.targetId)
    if (!target) {
      setErrorMessage('Cible introuvable.')
      return
    }

    setState((previous) => {
      const updatedParticipants = previous.participants.map((participant) => {
        if (participant.id !== target.id) {
          return participant
        }

        if (actionForm.type === 'damage') {
          return {
            ...participant,
            hpCurrent: clamp(participant.hpCurrent - amount, 0, participant.hpMax),
          }
        }

        return {
          ...participant,
          hpCurrent: clamp(participant.hpCurrent + amount, 0, participant.hpMax),
        }
      })

      const newEvent: CombatEvent = {
        id: crypto.randomUUID(),
        sourceId: activeParticipant.id,
        targetId: target.id,
        amount,
        type: actionForm.type,
        round: previous.round,
        createdAt: Date.now(),
      }

      return {
        ...previous,
        participants: updatedParticipants,
        events: [...previous.events, newEvent],
      }
    })
  }

  function handleNextTurn(): void {
    if (!state.started || participants.length === 0) {
      return
    }

    const nextIndex = nextLivingIndex(participants, safeTurnIndex)
    const wrapped = nextIndex <= safeTurnIndex

    setState((previous) => ({
      ...previous,
      currentTurnIndex: nextIndex,
      round: wrapped ? previous.round + 1 : previous.round,
    }))
  }

  const stats = useMemo(() => {
    const totalDamageBySource: Record<string, number> = {}
    const totalDamageByTarget: Record<string, number> = {}
    const totalHealBySource: Record<string, number> = {}
    const totalHealByTarget: Record<string, number> = {}

    for (const combatEvent of state.events) {
      if (combatEvent.type === 'damage') {
        totalDamageBySource[combatEvent.sourceId] =
          (totalDamageBySource[combatEvent.sourceId] ?? 0) + combatEvent.amount
        totalDamageByTarget[combatEvent.targetId] =
          (totalDamageByTarget[combatEvent.targetId] ?? 0) + combatEvent.amount
        continue
      }

      totalHealBySource[combatEvent.sourceId] =
        (totalHealBySource[combatEvent.sourceId] ?? 0) + combatEvent.amount
      totalHealByTarget[combatEvent.targetId] =
        (totalHealByTarget[combatEvent.targetId] ?? 0) + combatEvent.amount
    }

    function findTop(map: Record<string, number>): { id: string; value: number } | null {
      const entries = Object.entries(map)
      if (entries.length === 0) {
        return null
      }

      const [topId, topValue] = entries.reduce((best, current) => {
        return current[1] > best[1] ? current : best
      })

      return { id: topId, value: topValue }
    }

    return {
      topDamageSource: findTop(totalDamageBySource),
      topDamageTarget: findTop(totalDamageByTarget),
      topHealSource: findTop(totalHealBySource),
      topHealTarget: findTop(totalHealByTarget),
    }
  }, [state.events])

  function participantNameById(id: string): string {
    return participants.find((participant) => participant.id === id)?.name ?? 'Inconnu'
  }

  return (
    <main className="app">
      <header className="panel">
        <h1>Suivi de combat JDR</h1>
        <p className="muted">
          Ajoute les combattants, lance le combat, puis enregistre les degats et soins tour par tour.
        </p>
      </header>

      <section className="panel">
        <h2>Ajouter un participant</h2>
        <form className="grid-form" onSubmit={handleAddParticipant}>
          <label>
            Nom
            <input
              value={addForm.name}
              onChange={(event) => setAddForm((previous) => ({ ...previous, name: event.target.value }))}
              required
            />
          </label>

          <label>
            Type
            <select
              value={addForm.kind}
              onChange={(event) =>
                setAddForm((previous) => ({
                  ...previous,
                  kind: event.target.value as ParticipantKind,
                }))
              }
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
              value={addForm.hpCurrent}
              onChange={(event) =>
                setAddForm((previous) => ({ ...previous, hpCurrent: event.target.value }))
              }
              required
            />
          </label>

          <label>
            HP max
            <input
              type="number"
              min={1}
              value={addForm.hpMax}
              onChange={(event) => setAddForm((previous) => ({ ...previous, hpMax: event.target.value }))}
              required
            />
          </label>

          <label>
            Initiative
            <input
              type="number"
              value={addForm.initiative}
              onChange={(event) =>
                setAddForm((previous) => ({
                  ...previous,
                  initiative: event.target.value,
                }))
              }
              required
            />
          </label>

          <button type="submit">Ajouter</button>
        </form>
      </section>

      <section className="panel">
        <div className="row">
          <h2>Combat</h2>
          <div className="actions-inline">
            <button onClick={handleStartCombat} disabled={participants.length < 2}>
              Demarrer
            </button>
            <button className="secondary" onClick={handleResetCombat}>
              Reinitialiser
            </button>
          </div>
        </div>

        <p className="muted">Round: {state.round}</p>
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

        <form className="grid-form" onSubmit={handleApplyAction}>
          <label>
            Action
            <select
              value={actionForm.type}
              onChange={(event) =>
                setActionForm((previous) => ({
                  ...previous,
                  type: event.target.value as ActionType,
                }))
              }
            >
              <option value="damage">Degats</option>
              <option value="heal">Soin</option>
            </select>
          </label>

          <label>
            Cible
            <select
              value={actionForm.targetId}
              onChange={(event) =>
                setActionForm((previous) => ({
                  ...previous,
                  targetId: event.target.value,
                }))
              }
              disabled={possibleTargets.length === 0}
            >
              {possibleTargets.length === 0 ? (
                <option value="">Aucune cible disponible</option>
              ) : (
                possibleTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label>
            Montant
            <input
              type="number"
              min={1}
              value={actionForm.amount}
              onChange={(event) =>
                setActionForm((previous) => ({
                  ...previous,
                  amount: event.target.value,
                }))
              }
              required
            />
          </label>

          <button type="submit" disabled={!canAct || possibleTargets.length === 0}>
            Appliquer
          </button>
          <button type="button" className="secondary" onClick={handleNextTurn} disabled={!state.started}>
            Participant suivant
          </button>
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
            >
              <div className="row">
                <strong>{participant.name || 'Sans nom'}</strong>
                {!isAlive(participant) && <span className="badge">KO</span>}
              </div>

              <label>
                Nom
                <input
                  value={participant.name}
                  onChange={(event) =>
                    handleParticipantFieldChange(participant.id, 'name', event.target.value)
                  }
                />
              </label>

              <label>
                Type
                <select
                  value={participant.kind}
                  onChange={(event) =>
                    handleParticipantFieldChange(participant.id, 'kind', event.target.value)
                  }
                >
                  <option value="player">Joueur</option>
                  <option value="monster">Monstre</option>
                </select>
              </label>

              <div className="inline-3">
                <label>
                  HP
                  <input
                    type="number"
                    min={0}
                    value={participant.hpCurrent}
                    onChange={(event) =>
                      handleParticipantFieldChange(participant.id, 'hpCurrent', event.target.value)
                    }
                  />
                </label>

                <label>
                  HP max
                  <input
                    type="number"
                    min={1}
                    value={participant.hpMax}
                    onChange={(event) =>
                      handleParticipantFieldChange(participant.id, 'hpMax', event.target.value)
                    }
                  />
                </label>

                <label>
                  Init.
                  <input
                    type="number"
                    value={participant.initiative}
                    onChange={(event) =>
                      handleParticipantFieldChange(participant.id, 'initiative', event.target.value)
                    }
                  />
                </label>
              </div>

              <button className="danger" onClick={() => handleDeleteParticipant(participant.id)}>
                Supprimer
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Statistiques</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <p className="muted">Plus de degats infliges</p>
            <p>
              {stats.topDamageSource
                ? `${participantNameById(stats.topDamageSource.id)} (${stats.topDamageSource.value})`
                : 'Aucune donnee'}
            </p>
          </div>
          <div className="stat-card">
            <p className="muted">Plus de degats recus</p>
            <p>
              {stats.topDamageTarget
                ? `${participantNameById(stats.topDamageTarget.id)} (${stats.topDamageTarget.value})`
                : 'Aucune donnee'}
            </p>
          </div>
          <div className="stat-card">
            <p className="muted">Plus de soins prodigues</p>
            <p>
              {stats.topHealSource
                ? `${participantNameById(stats.topHealSource.id)} (${stats.topHealSource.value})`
                : 'Aucune donnee'}
            </p>
          </div>
          <div className="stat-card">
            <p className="muted">Plus de soins recus</p>
            <p>
              {stats.topHealTarget
                ? `${participantNameById(stats.topHealTarget.id)} (${stats.topHealTarget.value})`
                : 'Aucune donnee'}
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
