import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './StatsDetailModal.css'

export type StatsEventType = 'damage' | 'heal'

export interface StatsDetailEvent {
  sourceId: string
  targetId: string
  amount: number
  type: StatsEventType
}

export interface StatsDetailParticipant {
  id: string
  name: string
}

interface StatsDetailModalProps {
  isOpen: boolean
  onClose: () => void
  events: StatsDetailEvent[]
  participants: StatsDetailParticipant[]
}

const tooltipStyle = {
  background: '#1d2532',
  border: '1px solid #2d3648',
  borderRadius: 8,
  color: '#e6ebf4',
}

function mapToChartRows(totals: Record<string, number>, nameById: Record<string, string>) {
  return Object.entries(totals)
    .map(([id, value]) => ({ name: nameById[id] ?? 'Inconnu', value }))
    .sort((a, b) => b.value - a.value)
}

export function StatsDetailModal({ isOpen, onClose, events, participants }: StatsDetailModalProps) {
  const nameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of participants) {
      map[p.id] = p.name || 'Sans nom'
    }
    return map
  }, [participants])

  const { damageDealt, damageTaken, healGiven, healReceived } = useMemo(() => {
    const damageDealt: Record<string, number> = {}
    const damageTaken: Record<string, number> = {}
    const healGiven: Record<string, number> = {}
    const healReceived: Record<string, number> = {}

    for (const event of events) {
      if (event.type === 'damage') {
        damageDealt[event.sourceId] = (damageDealt[event.sourceId] ?? 0) + event.amount
        damageTaken[event.targetId] = (damageTaken[event.targetId] ?? 0) + event.amount
        continue
      }
      healGiven[event.sourceId] = (healGiven[event.sourceId] ?? 0) + event.amount
      healReceived[event.targetId] = (healReceived[event.targetId] ?? 0) + event.amount
    }

    return { damageDealt, damageTaken, healGiven, healReceived }
  }, [events])

  const chartDamageDealt = useMemo(() => mapToChartRows(damageDealt, nameById), [damageDealt, nameById])
  const chartDamageTaken = useMemo(() => mapToChartRows(damageTaken, nameById), [damageTaken, nameById])
  const chartHealGiven = useMemo(() => mapToChartRows(healGiven, nameById), [healGiven, nameById])
  const chartHealReceived = useMemo(() => mapToChartRows(healReceived, nameById), [healReceived, nameById])

  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop stats-detail-backdrop" onClick={onClose}>
      <div className="modal stats-detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="stats-detail-header">
          <h3>Statistiques détaillées</h3>
          <button type="button" className="secondary btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>
        <p className="muted stats-detail-intro">Totaux par combattant, calculés à partir de l&apos;historique des actions.</p>

        <div className="stats-charts">
          <ChartBlock title="Dégâts infligés" data={chartDamageDealt} color="var(--chart-damage)" emptyHint="Aucun dégât enregistré." />
          <ChartBlock title="Dégâts subis" data={chartDamageTaken} color="var(--chart-damage-received)" emptyHint="Aucun dégât enregistré." />
          <ChartBlock title="Soins prodigués" data={chartHealGiven} color="var(--chart-heal)" emptyHint="Aucun soin enregistré." />
          <ChartBlock title="Soins reçus" data={chartHealReceived} color="var(--chart-heal-received)" emptyHint="Aucun soin enregistré." />
        </div>
      </div>
    </div>
  )
}

interface ChartBlockProps {
  title: string
  data: { name: string; value: number }[]
  color: string
  emptyHint: string
}

function ChartBlock({ title, data, color, emptyHint }: ChartBlockProps) {
  if (data.length === 0) {
    return (
      <section className="chart-block">
        <h4>{title}</h4>
        <p className="muted chart-empty">{emptyHint}</p>
      </section>
    )
  }

  return (
    <section className="chart-block">
      <h4>{title}</h4>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%" minHeight={200}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3648" horizontal={false} />
            <XAxis type="number" stroke="#9aa6be" fontSize={11} tickLine={false} />
            <YAxis type="category" dataKey="name" width={118} stroke="#9aa6be" fontSize={11} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'rgba(106, 141, 255, 0.08)' }}
              contentStyle={tooltipStyle}
              formatter={(value: number) => [`${value} PV`, 'Total']}
            />
            <Bar dataKey="value" name="Total" fill={color} radius={[0, 4, 4, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
