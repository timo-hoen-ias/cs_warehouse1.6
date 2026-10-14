import { describe, expect, it } from 'vitest';
import { generateLagerDaten, specFor } from './demo';
import { computeSolids } from './level';
import { DEFAULT_MAP, MAPS, mapById } from './maps';

describe('Karten-Registry', () => {
  it('mindestens vier Lager-Karten mit eindeutigen IDs (de_-Präfix)', () => {
    expect(MAPS.length).toBeGreaterThanOrEqual(4);
    const ids = new Set(MAPS.map((m) => m.id));
    expect(ids.size).toBe(MAPS.length);
    for (const m of MAPS) {
      expect(m.id.startsWith('de_')).toBe(true);
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.orte).toBeGreaterThan(0);
    }
  });

  it('mapById fällt auf die Standardkarte zurück', () => {
    expect(mapById('gibtsnicht').id).toBe(DEFAULT_MAP);
    expect(mapById(undefined).id).toBe(DEFAULT_MAP);
    expect(mapById('de_hochregal').id).toBe('de_hochregal');
  });

  it('jedes Profil erzeugt ein baubares Lager (Regale + 4 Wände) und ist deterministisch', () => {
    for (const m of MAPS) {
      const a = generateLagerDaten(m.orte, m.seed, m.layout);
      const b = generateLagerDaten(m.orte, m.seed, m.layout);
      expect(a).toEqual(b);
      const solids = computeSolids(a);
      expect(solids.filter((s) => s.kind === 'rack').length).toBeGreaterThan(3);
      expect(solids.filter((s) => s.kind === 'wall')).toHaveLength(4);
    }
  });

  it('Profile unterscheiden sich (Hochregal nur LTD3, Block hat Bodenlager)', () => {
    for (let i = 0; i < 6; i++) expect(specFor(i, 'hochregal').technik).toBe('LTD3HR');
    expect([0, 1, 2].map((i) => specFor(i, 'block').technik)).toContain('LTD1UF');
    expect(specFor(0, 'mix')).toEqual(specFor(0));
  });
});
