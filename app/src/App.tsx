import { ActionSheet, Badge, DotLoading, Segmented, Skeleton, TabBar } from 'antd-mobile'
import {
  DownOutline,
  EnvironmentOutline,
  ExclamationShieldOutline,
  FileOutline,
  MessageOutline,
} from 'antd-mobile-icons'
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { HeroIcon } from './components/HeroIcon'
import type { NewsStatus, Report, TownsStatus, WaterStatusLive } from './data/liveTypes'
import { SCENARIOS } from './data/scenarios'
import { getAdminKey } from './data/admin'
import { useJson } from './data/useJson'
import { useLiveStatus } from './data/useLiveStatus'
import { LANGS, saveLang } from './i18n'
import { resolveWarning } from './rules/resolve'
import type { CycloneLevel, Lang, WarningSnapshot } from './rules/types'
import { NowScreen, type DataMode } from './screens/NowScreen'
import './App.css'

// Loaded on first use, so the Now screen opens fast on slow connections.
const MapScreen = lazy(() => import('./screens/MapScreen').then((m) => ({ default: m.MapScreen })))
const MmsScreen = lazy(() => import('./screens/MmsScreen').then((m) => ({ default: m.MmsScreen })))
const ReportScreen = lazy(() => import('./screens/ReportScreen').then((m) => ({ default: m.ReportScreen })))

// 'family' (the "I'm safe" check-in) is hidden until it's built.
type Tab = 'now' | 'map' | 'mms' | 'report'

// Reporting opens automatically with any cyclone warning (Class I–IV) and stays open through the safety bulletin.
const REPORTING: CycloneLevel[] = ['class1', 'class2', 'class3', 'class4', 'safetyBulletin']

// ?mode=live (default) | belal | <scenario id>. ?scenario=<id> still works.
function initialMode(): { mode: DataMode; scenarioId: string } {
  const p = new URLSearchParams(window.location.search)
  const m = p.get('mode') ?? p.get('scenario') ?? 'live'
  if (m === 'belal') return { mode: 'belal', scenarioId: 'c3' }
  if (SCENARIOS.some((s) => s.id === m)) return { mode: 'demo', scenarioId: m }
  return { mode: 'live', scenarioId: 'c3' }
}

function initialTab(): Tab {
  const t = new URLSearchParams(window.location.search).get('tab')
  return t === 'map' || t === 'mms' || t === 'report' ? t : 'now'
}

function setUrlParam(key: string, value: string | null) {
  const url = new URL(window.location.href)
  if (key === 'mode') url.searchParams.delete('scenario')
  if (value === null) url.searchParams.delete(key)
  else url.searchParams.set(key, value)
  window.history.replaceState(null, '', url)
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

const buildScenario = (id: string) => SCENARIOS.find((s) => s.id === id)!.build(Date.now())

export default function App() {
  const { t, i18n } = useTranslation()
  const [{ mode, scenarioId }, setModeState] = useState(initialMode)
  const [demoSnapshot, setDemoSnapshot] = useState(() => buildScenario(scenarioId))
  const [modeOpen, setModeOpen] = useState(false)

  useEffect(() => {
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  const chooseMode = (value: string) => {
    setUrlParam('mode', value === 'live' ? null : value)
    if (value === 'live' || value === 'belal') setModeState({ mode: value, scenarioId })
    else {
      setModeState({ mode: 'demo', scenarioId: value })
      setDemoSnapshot(buildScenario(value))
    }
  }

  const modeLabel = mode === 'demo' ? `${t('mode.demo')}: ${SCENARIOS.find((s) => s.id === scenarioId)?.label}` : t(`mode.${mode}`)

  const modeControl = (
    <button className="mode-btn" onClick={() => setModeOpen(true)} aria-haspopup="dialog">
      <span className="mode-btn-label">{t('mode.label')}</span>
      <span className="mode-btn-value">{modeLabel}</span>
      <DownOutline />
    </button>
  )

  const langSwitch = (
    <Segmented
      className="lang-switch"
      aria-label={t('language')}
      value={i18n.language}
      options={LANGS}
      onChange={(v) => {
        void i18n.changeLanguage(String(v))
        saveLang(v as Lang)
      }}
    />
  )

  return (
    <>
      {/* Remount when switching live ↔ archive so data never mixes. */}
      <Shell
        key={mode === 'belal' ? 'belal' : 'live'}
        mode={mode}
        demoSnapshot={demoSnapshot}
        modeControl={modeControl}
        langSwitch={langSwitch}
      />
      <ActionSheet
        visible={modeOpen}
        onClose={() => setModeOpen(false)}
        cancelText={t('cancel')}
        extra={t('mode.choose')}
        actions={[
          { key: 'live', text: t('mode.live'), bold: mode === 'live' },
          { key: 'belal', text: t('mode.belal'), bold: mode === 'belal' },
          ...SCENARIOS.map((s) => ({ key: s.id, text: `${t('mode.demo')}: ${s.label}`, bold: mode === 'demo' && s.id === scenarioId })),
        ]}
        onAction={(a) => {
          chooseMode(String(a.key))
          setModeOpen(false)
        }}
      />
    </>
  )
}

interface ShellProps {
  mode: DataMode
  demoSnapshot: WarningSnapshot
  modeControl: ReactNode
  langSwitch: ReactNode
}

function Shell({ mode, demoSnapshot, modeControl, langSwitch }: ShellProps) {
  const { t } = useTranslation()
  const now = useNow()
  const [tab, setTabState] = useState<Tab>(initialTab)
  const live = useLiveStatus(mode === 'belal' ? 'belal' : 'live')
  const water = useJson<WaterStatusLive>('/api/water', 30 * 60 * 1000)
  // Live map: real reports only. Demo/archive: test reports only.
  const reports = useJson<Report[]>(`/api/reports?scope=${mode === 'live' ? 'live' : 'demo'}`, 60 * 1000)
  const news = useJson<NewsStatus>('/api/news', 10 * 60 * 1000)
  const towns = useJson<TownsStatus>('/api/towns', 15 * 60 * 1000)

  const snapshot = mode === 'demo' ? demoSnapshot : live.data?.snapshot
  const reportEnabled = !!snapshot && REPORTING.includes(snapshot.cyclone)
  // The owner (admin key on this device) can always open Report to manage reports.
  const [isAdmin] = useState(() => !!getAdminKey())
  const reportVisible = reportEnabled || isAdmin
  const activeTab: Tab = tab === 'report' && !reportVisible ? 'now' : tab

  const setTab = (next: Tab) => {
    setTabState(next)
    setUrlParam('tab', next === 'now' ? null : next)
    window.scrollTo({ top: 0 })
  }

  const navItems: { key: Tab; icon: ReactNode; hidden?: boolean }[] = [
    { key: 'now', icon: <ExclamationShieldOutline /> },
    { key: 'map', icon: <EnvironmentOutline /> },
    { key: 'report', icon: <MessageOutline />, hidden: !reportVisible },
    { key: 'mms', icon: <FileOutline /> },
  ]
  const visibleNav = navItems.filter((n) => !n.hidden)

  let content: ReactNode
  if (activeTab === 'now') {
    content = !snapshot ? (
      // Never show "no warning" before we actually know.
      <div className="now">
        <section className="hero sev-loading" role="status">
          <div className="hero-body">
            <div>
              <h1 className="hero-headline">{live.error ? t('offline') : t('loading')}</h1>
              {!live.error && <DotLoading color="white" />}
            </div>
          </div>
        </section>
      </div>
    ) : (
      <NowScreen
        warning={resolveWarning(snapshot, now)}
        fetchedAt={snapshot.fetchedAt}
        live={live.data}
        loading={live.loading}
        offline={live.error}
        mode={mode}
        now={now}
        modeControl={modeControl}
        water={water.data}
        news={news.data}
        towns={towns.data}
        reportEnabled={reportEnabled}
        onOpenMap={() => setTab('map')}
        onReport={() => setTab('report')}
      />
    )
  } else if (activeTab === 'map') {
    content = <MapScreen live={mode === 'demo' ? undefined : live.data} water={water.data} reports={reports.data} />
  } else if (activeTab === 'mms') {
    content = <MmsScreen />
  } else {
    content = (
      <ReportScreen
        enabled={reportEnabled}
        demo={mode !== 'live'}
        demoWarning={snapshot?.cyclone}
        reports={reports.data}
        onSent={() => void reports.reload()}
      />
    )
  }

  return (
    <div className="shell">
      {/* Laptop / desktop: sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><HeroIcon kind="clear" size={26} /></span>
          <div>
            <div className="brand-name">{t('appName')}</div>
            <div className="brand-tag">{t('tagline')}</div>
          </div>
        </div>
        <nav className="side-nav">
          {visibleNav.map((n) => (
            <button
              key={n.key}
              className={`side-link ${activeTab === n.key ? 'active' : ''} ${n.key === 'report' && reportEnabled ? 'side-report' : ''}`}
              onClick={() => setTab(n.key)}
              aria-current={activeTab === n.key ? 'page' : undefined}
            >
              {n.icon}
              <span>{t(`tabs.${n.key}`)}</span>
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          {modeControl}
          {langSwitch}
        </div>
      </aside>

      {/* Phone / tablet: top bar */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><HeroIcon kind="clear" size={22} /></span>
          <span className="brand-name">{t('appName')}</span>
        </div>
        {langSwitch}
      </header>

      <main className="content">
        <div className={`content-inner tab-${activeTab}`}>
          <Suspense fallback={<div className="now"><Skeleton.Paragraph lineCount={8} animated /></div>}>{content}</Suspense>
        </div>
      </main>

      <nav className="tabbar">
        <TabBar activeKey={activeTab} onChange={(k) => setTab(k as Tab)} safeArea>
          {visibleNav.map((n) => (
            <TabBar.Item
              key={n.key}
              icon={n.key === 'report' && reportEnabled ? <Badge content={Badge.dot}>{n.icon}</Badge> : n.icon}
              title={t(`tabs.${n.key}`)}
            />
          ))}
        </TabBar>
      </nav>
    </div>
  )
}
