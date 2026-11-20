import { useEffect, useRef, useState } from 'react'
import { providers } from 'ofm-provider-list'
import { Activity, ArrowRight, ArrowUpRight, Boxes, Check, CircleCheck, Copy, Handshake, Layers3, Network, RefreshCw, Terminal, Zap } from 'lucide-react'
import { Badge, Button, Card } from './ui'
import { useCountUp, useReveal, useSpotlight, useTilt } from '../motion/hooks'
import type { Host, Snapshot } from '../types'

const number = (value: number) => new Intl.NumberFormat('en-US').format(value)
const compact = (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)}K` : number(value)

/** Compresses a series of numbers into a full-width trend band (viewBox 100x26, preserveAspectRatio=none stretches). */
function sparkGeometry(values: number[]): { line: string; area: string } | undefined {
  if (values.length < 2 || values.every(value => value === 0)) return undefined
  const max = Math.max(1, ...values)
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100
    const y = 22 - (value / max) * 18
    return [x, y] as const
  })
  return {
    line: points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
    area: `0,26 ${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} 100,26`,
  }
}

/** Single KPI card: number scroll + mini trend line + spotlight. */
function MetricCard({ name, value, detail, icon: Icon, trend }: {
  name: string; value: string; detail: string
  icon: typeof Boxes; trend: number[]
}) {
  const tilt = useTilt<HTMLDivElement>(4, 3)
  const spot = useSpotlight<HTMLDivElement>()
  const attach = (node: HTMLDivElement | null) => {
    tilt.current = node
    spot.current = node
  }
  const spark = sparkGeometry(trend)
  return <Card className="ov-metric m-tilt m-spot" ref={attach}>
    <div><span>{name}</span><div className="ov-metric-icon"><Icon size={15} /></div></div>
    <strong>{value}</strong><p>{detail}</p>
    {spark ? <svg className="ov-spark" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={spark.area} /><polyline points={spark.line} />
    </svg> : null}
  </Card>
}

export function Overview({ summary, stats, host }: Snapshot & { host: Host }) {
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

  const routable = summary.catalog.filter(model => model.routable).length
  const totalTokens = stats.grand.input + stats.grand.output
  const turns = useCountUp(stats.turns)
  const recovered = useCountUp(stats.recoveredTurns)
  const tokens = useCountUp(totalTokens)
  const models = useCountUp(routable)

  const today = new Date()
  const days = Array.from({ length: 7 }, (_, index) => {
    const at = new Date(today); at.setDate(at.getDate() - 6 + index)
    const id = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
    return { id, value: stats.days.find(row => row.day === id)?.total ?? 0 }
  })
  const total = days.reduce((sum, row) => sum + row.value, 0)
  const max = Math.max(1, ...days.map(row => row.value))
  const failures = [...stats.samples].reverse().filter(row => row.ok === false).slice(0, 4)

// Trend band only for the two cards with real daily data (user turns, cumulative tokens).
// Accessible models and recovered turns have no daily history—rather not draw than fabricate a fake curve.
  const metricRows = [
    { name: 'Accessible Models', value: number(Math.round(models)), icon: Boxes, detail: 'Current public model list', trend: [] },
    { name: 'User Turns', value: number(Math.round(turns)), icon: Layers3, detail: `${number(stats.requests)} physical requests`, trend: days.map(day => day.value) },
    { name: 'Cumulative Tokens', value: compact(Math.round(tokens)), icon: Zap, detail: `Input ${compact(stats.grand.input)} · Output ${compact(stats.grand.output)}`, trend: days.map(day => day.value) },
    { name: 'Recovered Turns', value: number(Math.round(recovered)), icon: Activity, detail: `Finally incomplete ${number(stats.failedTurns)} turns`, trend: [] },
  ]

  const sources = [
    { name: 'Anonymous & Kilo', sub: 'Free models without an account', icon: Zap, count: summary.catalog.filter(row => row.channel === 'anonymous' || row.channel === 'kilo').length, page: 'models' as const },
    { name: 'EAC router', sub: `${providers.length} providers, independent account pool`, icon: Network, count: summary.catalog.filter(row => !['anonymous', 'kilo', 'eac'].includes(row.channel)).length, page: 'channels' as const },
    { name: 'EAC Paid Channel', sub: summary.eacAuth?.local ? 'Local authorization saved' : 'Local authorization not saved', icon: Handshake, count: summary.catalog.filter(row => row.channel === 'eac').length, page: 'eac' as const },
  ]

  const reveal = useReveal<HTMLDivElement>(sources.length)
  const quickTilt = useTilt<HTMLDivElement>(3, 2)
  const quickSpot = useSpotlight<HTMLDivElement>()
  const attachQuick = (node: HTMLDivElement | null) => {
    quickTilt.current = node
    quickSpot.current = node
  }

  const copyEndpoint = () => {
    void host.copy(`${summary.baseUrl}/v1`).then(() => {
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    }).catch(host.error)
  }

  return <div className="dashboard" data-testid="overview-ready">
    <header className="dashboard-heading"><div><div className="heading-eyebrow">WORKSPACE / OVERVIEW</div><h1>Workspace Overview</h1><p>View your model connections and status.</p></div>
      <Button variant="outline" disabled={refreshing} onClick={() => {
        setRefreshing(true); void host.refresh().catch(host.error).finally(() => setRefreshing(false))
      }}><RefreshCw size={14} className={refreshing ? 'spinning' : ''} />{refreshing ? 'Updating...' : 'Refresh status'}</Button></header>

    <div className="dashboard-metrics">{metricRows.map(metric => <MetricCard key={metric.name} {...metric} />)}</div>

    <div className="dashboard-main-grid">
      <Card className="ov-chart-panel">
        <div className="card-heading"><div><h2>Token Usage</h2><p>Input and output over the last 7 days</p></div><Badge>Last 7 days</Badge></div>
        <div className="ov-chart-total">{compact(total)} <span>Token</span></div>
        <div className="ov-chart" role="img" aria-label={`Last 7 days token usage: ${days.map(day => `${day.id} ${day.value}`).join('; ')}`}>
          <div className="chart-grid-lines"><span /><span /><span /><span /></div>
          {days.map(day => <div className="ov-chart-col" key={day.id} title={`${day.id} · ${number(day.value)} tokens`}>
            <div className={`ov-chart-bar ${day.value === 0 ? 'zero' : ''}`} style={{ height: `${Math.max(2, day.value / max * 80)}%` }} />
            <span>{day.id.slice(5).replace('-', '/')}</span>
          </div>)}
          {total === 0 && <div className="ov-chart-empty"><Activity size={20} /><span>No call records yet</span><small>Usage will appear here after connecting a client</small></div>}
        </div>
        <div className="card-foot"><span>Based on actual request records</span><button onClick={() => host.navigate('usage')}>View all usage <ArrowRight size={13} /></button></div>
      </Card>

      <Card className="ov-quick m-tilt m-spot" ref={attachQuick}>
        <div className="ov-quick-icon"><Terminal size={18} /></div>
        <h2>API Access</h2><p>OpenAI-compatible · Chat Completions / Responses</p>
        <label>API BASE URL</label>
        <div className="ov-endpoint"><code>{summary.baseUrl}/v1</code>
          <Button variant="ghost" aria-label="Copy API address" onClick={copyEndpoint} title="Copy API address"
            className={copied ? 'ov-copied' : ''}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </Button>
        </div>
        {copied && <span className="copy-feedback" role="status">Address copied</span>}
        <div className="connect-steps"><span>Session management: local independent session</span><span>Inference auth: Bearer API Key</span><span>Listen scope: loopback only</span></div>
        <Button className="connect-button" onClick={() => host.navigate('connection')}>View connection config <ArrowUpRight size={15} /></Button>
        <div className="connection-footnote"><span className={`status-dot ${summary.settings.enabled ? '' : 'paused'}`} />{summary.settings.enabled ? 'Inference service enabled' : 'Inference service paused'}</div>
      </Card>
    </div>

    <div className="dashboard-bottom-grid">
      <Card className="ov-panel">
        <div className="card-heading"><div><h2>Model Sources</h2><p>All channels, shared access address</p></div><Network size={16} /></div>
        <div className="ov-source-list m-reveal" ref={reveal}>{sources.map((source, index) => <button className="ov-source-row" key={source.name} onClick={() => host.navigate(source.page)}
          style={{ '--i': index } as React.CSSProperties}>
          <span className="ov-source-icon"><source.icon size={16} /></span>
          <span><strong>{source.name}</strong><small>{source.sub}</small></span>
          <Badge>{source.count} models</Badge><ArrowRight size={13} />
        </button>)}</div>
      </Card>

      <Card className="ov-panel">
        <div className="card-heading"><div><h2>Runtime Check</h2><p>Service and recent failed requests</p></div>
          <Badge tone={failures.length ? 'warning' : 'success'}>{failures.length ? 'Failures recorded' : 'No failures yet'}</Badge></div>
        <div className="runtime-check"><CircleCheck size={16} /><span>Channel module</span><strong>{summary.channels.state === 'ready' ? 'Ready' : summary.channels.state === 'failed' ? 'Load failed' : 'Initializing'}</strong></div>
        <div className="runtime-check"><RefreshCw size={16} /><span>Model auto refresh</span><strong>{summary.automaticRefresh ? `Every ${summary.settings.probeIntervalMinutes} minutes` : 'Paused'}</strong></div>
        {failures.length ? <div className="ov-failure-list">{failures.map((row, index) =>
          <div key={`${row.at}-${index}`} className="ov-failure-row">
            <span>{row.model ?? 'Unknown model'}</span>
            <small>{row.at ? new Date(row.at).toLocaleTimeString('en-US') : 'Unknown time'} · Request incomplete</small>
          </div>)}</div>
          : <div className="ov-runtime-empty"><CircleCheck size={16} /><span>No failure records in recent request samples</span></div>}
        <div className="card-foot"><span title={summary.dataDir}>Data stored only in local independent directory</span><button onClick={() => host.navigate('settings')}>Service settings <ArrowRight size={13} /></button></div>
      </Card>
    </div>
  </div>
}
