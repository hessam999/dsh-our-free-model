import { Coffee, Activity, BarChart3, BookOpen, Boxes, Cable, ChevronRight, Globe, Handshake, Image, LayoutDashboard, LogOut, MessageSquareWarning, Moon, Network, Palette, PanelsTopLeft, Puzzle, Route, RotateCw, Settings2, ShieldCheck, Sparkles, Sun, Terminal, Monitor, LibraryBig, Wrench, Waves } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import type { ComponentType } from 'react'
import { flushSync } from 'react-dom'
import brandMark from '../../../../icon.svg?inline'
import { Badge, Button } from './ui'
import { useMotionSetting } from '../motion/hooks'
import { useMotionField } from '../motion/field'
import type { Host, Page, PluginPage, Summary } from '../types'
import { hasDesktopBridge } from '../desktop-update'

type NavIcon = ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>
interface NavItem { id: Page; name: string; icon: NavIcon }
interface NavGroup { label: string; items: NavItem[] }

const CORE_NAVIGATION: NavGroup[] = [
  { label: 'Workspace', items: [
    { id: 'overview', name: 'Overview', icon: LayoutDashboard },
    { id: 'workspace', name: 'Model Workbench (magpie)', icon: PanelsTopLeft },
    { id: 'agents', name: 'Clients & Subscriptions', icon: Monitor },
    { id: 'models', name: 'Model List', icon: Boxes },
    { id: 'usage', name: 'Usage Stats', icon: Activity },
    { id: 'library', name: 'Library', icon: LibraryBig },
  ] },
  { label: 'Channels & Connections', items: [
    { id: 'providers', name: 'Aggregated Channels', icon: PanelsTopLeft },
    { id: 'routing', name: 'Route Groups', icon: Route },
    { id: 'channels', name: 'EAC router', icon: Network },
    { id: 'eac', name: 'EAC Paid Channel', icon: Handshake },
    { id: 'connection', name: 'API Access', icon: Cable },
  ] },
  { label: 'Management', items: [
    { id: 'plugins', name: 'Plugin Center', icon: Puzzle },
    { id: 'settings', name: 'Service Settings', icon: Settings2 },
    { id: 'updates', name: 'App Updates', icon: RotateCw },
  ] },
  { label: 'Project Support', items: [
    { id: 'feedback', name: 'Feedback & Wishes', icon: MessageSquareWarning },
    { id: 'sponsor', name: 'Sponsor Advertisement', icon: Coffee },
  ] },
]

const PAGE_ICONS: Record<string, NavIcon> = {
  puzzle: Puzzle,
  sparkles: Sparkles,
  chart: BarChart3,
  tool: Wrench,
  image: Image,
  globe: Globe,
  terminal: Terminal,
  book: BookOpen,
  palette: Palette,
  activity: Activity,
  boxes: Boxes,
  route: Route,
}

export const pageIcon = (name: string): NavIcon => PAGE_ICONS[name] ?? Puzzle

/**
 * The sidebar is the only list of pages — nothing may restate it.
 *
 * `navigationPages` is the core whitelist (`App` derives it from the sidebar),
 * and `pageIdsFor` appends the plugin pages the console learned from
 * `/summary`. A page that is not in either list is silently unreachable, so
 * both the shell and the host must read the same source.
 *
 * Previously `app.tsx` wrote the same array itself, and any drift between the
 * two broke "Model Workbench": the sidebar had the item but the whitelist did
 * not, so `navigate('workspace')` was short-circuited by `includes` (#678).
 * Deriving from the sidebar instead of restating it is the only way to keep
 * the two from ever drifting again.
 */
export const navigationPages: Page[] = CORE_NAVIGATION.flatMap(group => group.items.map(item => item.id))

export function pageIdsFor(pluginPages: PluginPage[] = []): Page[] {
  return [...navigationPages, ...pluginPages.map(page => page.id)]
}

type Origin = { x: number; y: number }

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const apply = (next: 'light' | 'dark') => {
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('ofm-theme', next) } catch { /* Only valid for current session when storage unavailable */ }
    setTheme(next)
  }
  const toggle = (origin?: Origin) => {
    const next = theme === 'dark' ? 'light' : 'dark'
    // No View Transition, or user prefers reduced motion: switch directly, no spread.
    if (!origin || typeof document.startViewTransition !== 'function'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(next); return }
    const root = document.documentElement
    // Radius takes the distance from button center to the farthest viewport corner, guaranteeing the disc covers the whole screen.
    const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y))
    root.style.setProperty('--theme-reveal-x', `${origin.x}px`)
    root.style.setProperty('--theme-reveal-y', `${origin.y}px`)
    root.style.setProperty('--theme-reveal-r', `${radius}px`)
    // Turn off the 300ms background transition during expansion, otherwise the "new theme" snapshot catches the intermediate color.
    root.classList.add('theme-transitioning')
    const transition = document.startViewTransition(() => { flushSync(() => apply(next)) })
    const finish = () => {
      root.classList.remove('theme-transitioning')
      root.style.removeProperty('--theme-reveal-x')
      root.style.removeProperty('--theme-reveal-y')
      root.style.removeProperty('--theme-reveal-r')
    }
    transition.finished.then(finish, finish)
  }
  return { theme, toggle }
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  return <Button variant="ghost" className="theme-toggle" aria-label={label} title={theme === 'dark' ? 'Light' : 'Dark'}
    onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); toggle({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) }}>
    <span className="theme-toggle-track" data-theme={theme}>
      <span className="theme-toggle-icon theme-toggle-sun" aria-hidden="true"><Sun size={13} /></span>
      <span className="theme-toggle-icon theme-toggle-moon" aria-hidden="true"><Moon size={13} /></span>
    </span>
  </Button>
}

/**
 * Motion toggle. Write `data-motion` to <html>; the gate in motion.css takes effect immediately;
 * preference stored in localStorage['ofm-motion'], same namespace as theme.mjs theme key.
 */
function MotionToggle() {
  const [on, setOn] = useMotionSetting()
  return <Button variant="ghost" aria-label={on ? 'Disable UI animation' : 'Enable animation'} title={on ? 'Animation: on' : 'Animation: off'}
    onClick={() => setOn(!on)}>
    <Waves size={15} style={{ opacity: on ? 1 : .4 }} />
  </Button>
}

export const pageNames: Record<string, string> = Object.fromEntries(CORE_NAVIGATION.flatMap(group => group.items.map(item => [item.id, item.name])))

export function pageLabel(page: Page, pluginPages: PluginPage[] = []): string {
  return pluginPages.find(entry => entry.id === page)?.title ?? pageNames[page] ?? 'Plugin page'
}

export function Sidebar({ page, summary, host, onDisclaimer, pluginPages = [] }: { page: Page; summary?: Summary; host: Host; onDisclaimer(): void; pluginPages?: PluginPage[] }) {
  // Decoration layer attaches to document.body (see motion/field.tsx for why: the shell's
  // backdrop-filter and overflow become clipping containers for fixed descendants).
  useMotionField()
  // Narrow sidebar is a horizontal scrollbar strip: after page switch, scroll current item into view (centered).
  // Use rect difference instead of offsetLeft — the latter is relative to the nearest positioned ancestor,
  // which computes wrong in strip layout. scrollTo only applies to this container, won't push the page.
  const navRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const scroll = () => {
      if (nav.scrollWidth <= nav.clientWidth) return
      const active = nav.querySelector<HTMLElement>('.console-nav-item.selected')
      if (!active) return
      const navRect = nav.getBoundingClientRect()
      const activeRect = active.getBoundingClientRect()
      const delta = activeRect.left - navRect.left - (nav.clientWidth - activeRect.width) / 2
// Don't use behavior:'smooth' — may be skipped in headless/low-power environments,
// leaving the active item out of view. Jump directly to position; reliability first.
      nav.scrollLeft = Math.max(0, nav.scrollLeft + delta)
    }
    scroll()
    // Re-check once after the first frame layout stabilizes; window size changes (desktop→narrow) also need recalculation.
    const timer = window.setTimeout(scroll, 120)
    window.addEventListener('resize', scroll)
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', scroll) }
  }, [page])
  const groups: NavGroup[] = pluginPages.length === 0 ? CORE_NAVIGATION : [...CORE_NAVIGATION, {
    label: 'Plugins',
    items: pluginPages.map(entry => ({ id: entry.id, name: entry.title, icon: pageIcon(entry.icon) })),
  }]
  return <>
    <a className="console-brand" href="/" aria-label="Our Free Model home">
      <img className="console-mark" src={brandMark} alt="" width={32} height={34} />
      <span>Our Free Model<small>Local model workbench</small></span>
    </a>
    <div className="workspace-switch"><span className="workspace-avatar"><ShieldCheck size={15} /></span>
      <span>Personal workspace<small>Independent local service</small></span><Badge>Local</Badge>
    </div>
    <nav className="console-nav" aria-label="Management navigation" ref={navRef}>{groups.map(group => <div className="nav-group" key={group.label}>
      <span className="nav-group-label">{group.label}</span>
      {group.items.filter(item => item.id !== 'updates' || hasDesktopBridge()).map(item => <button key={item.id} id={item.id === 'sponsor' ? 'ofm-sponsor-menu-desktop' : undefined} className={`console-nav-item ${item.id === 'sponsor' ? 'ofm-sponsor-nav' : ''} ${page === item.id ? 'selected' : ''}`}
        aria-current={page === item.id ? 'page' : undefined} onClick={() => host.navigate(item.id)}>
        <span className="console-nav-indicator" aria-hidden="true" />
        <item.icon size={16} strokeWidth={1.7} /><span>{item.name}</span>
        {item.id === 'models' && <span className="count-badge">{summary?.catalog.length ?? '—'}</span>}
      </button>)}
    </div>)}</nav>
    <div className="sidebar-support"><ShieldCheck size={15} /><div><strong>Independent local storage</strong><p>Run locally / listen to loopback only</p></div></div>
    <div className="console-sidebar-footer"><div title="Local service online"><span className="status-dot" /><span className="console-sidebar-state">Online</span><small>v{summary?.version ?? '—'}</small></div>
      <MotionToggle /><ThemeToggle /><Button variant="ghost" aria-label="Exit management" title="Exit management" onClick={() => { void host.logout().catch(host.error) }}><LogOut size={15} /></Button></div>
    <button type="button" className="sidebar-disclaimer" onClick={onDisclaimer}>Usage and disclaimer</button>
  </>
}
export function Topbar({ page, summary, pluginPages = [] }: { page: Page; summary?: Summary; pluginPages?: PluginPage[] }) {
  return <><div className="console-breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong key={page} className="console-breadcrumb-current">{pageLabel(page, pluginPages)}</strong></div>
    <div className="console-topbar-status"><span className="status-dot" /><span>{summary?.settings.enabled === false ? 'Inference paused' : 'Local service'}</span><span className="topbar-divider" /><span>LOCAL</span></div></>
}
