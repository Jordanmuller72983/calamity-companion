import { describe, expect, it } from 'vitest'
import { classifyDisruption, curfewFacts, datesIn, datesOf, findDisruptions, keyHeadlines, pickCurfew } from './disruptions.ts'
import { curfewSummary, disruptionsByTopic, isWeekend, stateToday } from '../src/data/disruptions.ts'

// Real headlines from L'Express and Defimedia, 13–16 Oct 2026.
describe('disruptions from press headlines', () => {
  it.each([
    ['Metro Express : pas de service ce mercredi, reprise des opérations prévue dans une semaine', [['metro', 'stopped']]],
    ['L’après-Camp-Levieux : Transports publics : métro à l’arrêt, autobus au ralenti', [['metro', 'stopped'], ['bus', 'limited']]],
    ['Les services d’autobus prendront fin à 18 heures ce jeudi 15 octobre, selon la NLTA', [['bus', 'early']]],
    ['Transport public : Les autobus reprendront du service dès 5 heures ce jeudi 15 octobre', [['bus', 'resumed']]],
    ['Éducation : Pas de classes jeudi et vendredi', [['school', 'stopped']]],
    ['Transport public : les derniers autobus à 19 heures ce vendredi et samedi, reprise des services à 5 heures du matin', [['bus', 'early']]],
    ['[Info Soirée] : « Curfew mainteni ant 8h30 ek 5h di matin »', [['curfew', 'active']]],
    ['Décision du Cabinet : le couvre-feu prolongé jusqu’à vendredi matin et étendu à deux nouvelles localités', [['curfew', 'active']]],
    ['Levée du couvre-feu : toutes les routes de l’île praticables, selon la police', [['curfew', 'resumed']]],
    // "entreprises" contains "reprise": must not read as a restart.
    ['Couvre-feu : Business Mauritius appelle les entreprises à poursuivre leurs activités', [['curfew', 'active']]],
  ])('%s', (title, expected) => {
    expect(classifyDisruption(title).map((c) => [c.service, c.state])).toEqual(expected)
  })

  it.each([
    'Non-respect du couvre-feu : le procès de 13 prévenus débute ce vendredi',
    'Pakistan : le toit d’une école s’effondre, un enseignant et seize enfants tués',
    'Metro Express : des millions de roupies de dégâts',
  ])('ignores headlines that are not a service status: %s', (title) => {
    expect(classifyDisruption(title)).toEqual([])
  })

  it('counts any curfew headline as a curfew report, without inventing a bus status', () => {
    expect(classifyDisruption('Couvre-feu - AUTOBUS : jusqu’à 50 % de passagers et de recettes en moins')).toEqual([{ service: 'curfew', state: 'active' }])
  })

  it('keeps the newest report per service and drops anything older than 3 days', () => {
    const now = Date.parse('2026-10-16T08:00:00Z')
    const item = (title: string, at: string) => ({ title, url: `https://x/${at}`, source: 'Defimedia' as const, publishedAt: at })
    const found = findDisruptions(
      [
        item('Transport public : Les autobus reprendront du service dès 5 heures ce jeudi 15 octobre', '2026-10-14T11:06:00Z'),
        item('Les services d’autobus prendront fin à 18 heures ce jeudi 15 octobre, selon la NLTA', '2026-10-15T10:50:00Z'),
        item('Metro Express : service suspendu', '2026-10-12T08:00:00Z'),
      ],
      now,
    )
    expect(found.map((d) => [d.service, d.state])).toEqual([['bus', 'early']])
  })
})

// Friday 16 Oct 2026: schools closed Thu–Fri, Metro stopped since Mon, both announced to restart later.
describe('what a report means on the day it is read', () => {
  const at = (mu: string) => Date.parse(mu + '+04:00')
  const report = (title: string, publishedAt: string) => {
    const [c] = classifyDisruption(title)
    return { ...c, ...datesOf(title, publishedAt), title, url: 'https://x', source: 'Defimedia' as const, publishedAt }
  }
  const metro = report(
    'Metro Express : reprise du service samedi et dimanche de 7 h à 17 h, retour à la normale lundi',
    '2026-10-16T12:12:00+04:00',
  )
  const school = report('Éducation : reprise des classes ce lundi 19 octobre', '2026-10-16T13:33:00+04:00')
  const closed = report('Éducation : Pas de classes jeudi et vendredi', '2026-10-14T17:47:00+04:00')

  it('reads the days named in the headline', () => {
    expect(datesOf(metro.title, metro.publishedAt)).toEqual({ resumesOn: '2026-10-17', normalOn: '2026-10-19' })
    expect(datesOf(school.title, school.publishedAt)).toEqual({ resumesOn: '2026-10-19' })
    expect(datesOf(closed.title, closed.publishedAt)).toEqual({ until: '2026-10-16' })
    expect(datesIn('demain', '2026-10-31T21:00:00Z')).toEqual(['2026-11-02'])
  })

  it('a restart announced for later means stopped until then', () => {
    expect(stateToday(metro, at('2026-10-16T18:00:00'))).toBe('stopped')
    expect(stateToday(metro, at('2026-10-17T09:00:00'))).toBe('limited')
    expect(stateToday(metro, at('2026-10-19T06:00:00'))).toBe('resumed')
    expect(stateToday(school, at('2026-10-16T18:00:00'))).toBe('stopped')
    expect(stateToday(school, at('2026-10-19T06:00:00'))).toBe('resumed')
  })

  it('a closure for named days stops counting once they are past', () => {
    expect(stateToday(closed, at('2026-10-16T07:00:00'))).toBe('stopped')
    expect(stateToday(closed, at('2026-10-17T07:00:00'))).toBeUndefined()
  })

  it('turns the School and Buses & Metro tiles red on Friday 16 Oct', () => {
    const news = { fetchedAt: '', items: [], errors: [], disruptions: [metro, school] }
    const tiles = disruptionsByTopic(news, at('2026-10-16T18:30:00'))
    expect(tiles.school?.status).toBe('stop')
    expect(tiles.transport?.status).toBe('caution')
    expect(tiles.transport?.reports.map((d) => d.state)).toEqual(['stopped'])
    // Monday: both back to normal, nothing raised.
    expect(disruptionsByTopic(news, at('2026-10-19T08:00:00'))).toEqual({})
  })

  it('knows the weekend in Mauritius time', () => {
    expect(isWeekend(at('2026-10-16T23:30:00'))).toBe(false)
    expect(isWeekend(at('2026-10-17T00:30:00'))).toBe(true)
    expect(isWeekend(at('2026-10-18T23:30:00'))).toBe(true)
    expect(isWeekend(at('2026-10-19T00:10:00'))).toBe(false)
  })

  it.each([
    ['Tensions dans l’île : Fermeture des écoles ce mercredi 14 octobre, examens de SC et de HSC maintenus', 'stopped'],
    ['Tensions à travers l’île : Pas de classe ce mardi 13 octobre', 'stopped'],
  ])('reads other closure wordings: %s', (title, state) => {
    expect(classifyDisruption(title)).toEqual([{ service: 'school', state }])
  })
})

// Curfew headlines from 15–16 Oct 2026, as the feeds returned them.
describe('curfew: the useful headlines, with hours and last day', () => {
  it.each([
    ['Couvre-feu maintenu jusqu’à dimanche, mais de 22 h à 4 h 30 au lieu de 20 h 30 à 5 h', '2026-10-16T11:46:00+04:00', { hours: '22:00–04:30', until: '2026-10-18' }],
    ['Ramgoolam : couvre-feu maintenu ce week-end, la suite sera décidée lundi selon la situation sur le terrain', '2026-10-16T16:28:00+04:00', { until: '2026-10-18' }],
    ['Couvre-feu : de 20 h 30 ce mercredi à 5 heures jeudi matin', '2026-10-14T13:09:00+04:00', { hours: '20:30–05:00' }],
    ['Décision du Cabinet : le couvre-feu prolongé jusqu’à vendredi matin et étendu à deux nouvelles localités', '2026-10-14T16:18:00+04:00', { until: '2026-10-16' }],
    ['Couvre-feu : Le spectacle de Jarry reporté au dimanche 18 octobre', '2026-10-16T17:41:00+04:00', {}],
  ])('%s', (title, at, facts) => {
    expect(curfewFacts(title, at)).toEqual(facts)
  })

  it('prefers decisions with hours and dates over side stories, even newer ones', () => {
    const item = (title: string, at: string) => ({ title, url: `https://x/${at}`, source: "L'Express" as const, publishedAt: at })
    const found = findDisruptions(
      [
        item('Conseil des ministres : Couvre-feu : vers un renforcement de la loi et des sanctions', '2026-10-16T18:07:00+04:00'),
        item('Couvre-feu : Le spectacle de Jarry reporté au dimanche 18 octobre', '2026-10-16T17:41:00+04:00'),
        item('Ramgoolam : couvre-feu maintenu ce week-end, la suite sera décidée lundi selon la situation sur le terrain', '2026-10-16T16:28:00+04:00'),
        item('Couvre-feu : la vie nocturne et l’économie au ralenti', '2026-10-16T09:00:00+04:00'),
        item('Couvre-feu maintenu jusqu’à dimanche, mais de 22 h à 4 h 30 au lieu de 20 h 30 à 5 h', '2026-10-16T11:46:00+04:00'),
      ],
      Date.parse('2026-10-16T18:30:00+04:00'),
    )
    expect(found.map((d) => d.title.slice(0, 25))).toEqual(['Ramgoolam : couvre-feu ma', 'Couvre-feu maintenu jusqu'])
    expect(curfewSummary(found, Date.parse('2026-10-16T18:30:00+04:00'))).toEqual({ hours: '22:00–04:30', until: '2026-10-18', past: false, inForce: true })
    // Monday: the last day named has passed, so the app no longer claims it is in force.
    expect(curfewSummary(found, Date.parse('2026-10-19T08:00:00+04:00')).inForce).toBe(false)
  })

  it('falls back to side stories when nothing better was published', () => {
    const found = pickCurfew([
      { service: 'curfew', state: 'active', title: 'Couvre-feu : Le spectacle de Jarry reporté au dimanche 18 octobre', url: 'a', source: "L'Express", publishedAt: '2026-10-16T13:41:00Z' },
    ])
    expect(found).toHaveLength(1)
  })
})

describe('other key headlines', () => {
  const now = Date.parse('2026-10-16T18:00:00+04:00')
  const item = (title: string, h = 2) => ({ title, url: `https://x/${title}`, source: 'Defimedia' as const, publishedAt: new Date(now - h * 3600000).toISOString() })

  it('keeps cuts, closed roads and warnings; drops stories that only name the CWA, older ones and covered topics', () => {
    const picked = keyHeadlines(
      [
        item('CWA : coupure d’eau à Curepipe et Floréal ce samedi de 8 h à 16 h'),
        item('Water Tank and Pump Grant Scheme : 18 490 demandes enregistrées par la CWA en quatre jours'),
        item('Route fermée à Grand-Bois après un éboulement', 30),
        item('Avis de fortes pluies en vigueur sur le Plateau central', 1),
        item('Couvre-feu : coupure de courant à Camp-Levieux'),
      ],
      now,
    )
    expect(picked.map((i) => i.title.slice(0, 20))).toEqual(['Avis de fortes pluie', 'CWA : coupure d’eau '])
  })
})
