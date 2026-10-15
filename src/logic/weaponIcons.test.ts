import { describe, expect, it } from 'vitest';
import { ICON_HEIGHT, headshotIconSvg, iconIds, weaponIcon, weaponIconSvg } from './weaponIcons';
import { EQUIPMENT, WEAPONS } from './weapons';

const PATH_OK = /^[MLHVQAZ0-9 .\-]+$/;

describe('weaponIcon', () => {
  it('jede Waffe aus weapons.json und jede Ausrüstung hat eine eigene Silhouette', () => {
    const ids = new Set(iconIds());
    for (const id of Object.keys(WEAPONS)) if (id !== 'knife_stab') expect(ids.has(id), id).toBe(true);
    for (const id of Object.keys(EQUIPMENT)) expect(ids.has(id), id).toBe(true);
  });

  it('liefert gültige, nicht-leere Pfade mit plausibler Breite', () => {
    for (const id of iconIds()) {
      const i = weaponIcon(id);
      expect(i.h).toBe(ICON_HEIGHT);
      expect(i.w, id).toBeGreaterThanOrEqual(20);
      expect(i.w, id).toBeLessThanOrEqual(160);
      expect(i.d.length, id).toBeGreaterThan(20);
      expect(i.d, id).toMatch(PATH_OK);
      expect(i.d, id).not.toMatch(/NaN|Infinity/);
    }
  });

  it('Pistolen sind kürzer als Gewehre, die AWP ist die längste Waffe', () => {
    expect(weaponIcon('glock').w).toBeLessThan(weaponIcon('ak47').w);
    expect(weaponIcon('mac10').w).toBeLessThan(weaponIcon('m4a1').w);
    const longest = Object.keys(WEAPONS).filter((id) => id !== 'knife_stab').sort((a, b) => weaponIcon(b).w - weaponIcon(a).w)[0];
    expect(['awp', 'm249', 'sg550', 'g3sg1']).toContain(longest);
  });

  it('Waffen unterscheiden sich (keine zwei identischen Silhouetten)', () => {
    const paths = Object.keys(WEAPONS).filter((id) => id !== 'knife_stab').map((id) => weaponIcon(id).d);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('Messerstich nutzt das Messer, Unbekanntes fällt auf ein generisches Gewehr zurück', () => {
    expect(weaponIcon('knife_stab').d).toBe(weaponIcon('knife').d);
    expect(weaponIcon('<script>').d).toMatch(PATH_OK);
  });

  it('ist deterministisch (Cache liefert dasselbe Objekt)', () => {
    expect(weaponIcon('ak47')).toBe(weaponIcon('ak47'));
  });
});

describe('SVG-Markup', () => {
  it('enthält viewBox, currentColor und keinen fremden Text', () => {
    const svg = weaponIconSvg('awp');
    expect(svg).toMatch(/^<svg class="wicon" viewBox="0 0 \d+ 40"/);
    expect(svg).toContain('fill="currentColor"');
    expect(weaponIconSvg('<img onerror=x>')).not.toContain('onerror');
  });

  it('Kopfschuss-Symbol', () => {
    expect(headshotIconSvg()).toContain('viewBox="0 0 36 40"');
  });
});
