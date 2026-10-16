import { describe, expect, it } from 'vitest'
import { classifyDisruption, findDisruptions } from './disruptions.ts'

// Real headlines from L'Express and Defimedia, 13–16 Oct 2026.
describe('disruptions from press headlines', () => {
  it.each([
    ['Metro Express : pas de service ce mercredi, reprise des opérations prévue dans une semaine', [['metro', 'stopped']]],
    ['L’après-Camp-Levieux : Transports publics : métro à l’arrêt, autobus au ralenti', [['metro', 'stopped'], ['bus', 'limited']]],
    ['Les services d’autobus prendront fin à 18 heures ce jeudi 15 octobre, selon la NLTA', [['bus', 'early']]],
    ['Transport public : Les autobus reprendront du service dès 5 heures ce jeudi 15 octobre', [['bus', 'resumed']]],
    ['Éducation : Pas de classes jeudi et vendredi', [['school', 'stopped']]],
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
