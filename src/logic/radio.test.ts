import { describe, expect, it } from 'vitest';
import { RADIO_MENUS, radioMenuFor, radioPick } from './radio';

describe('Funkbefehle', () => {
  it('drei Menüs (Z/X/C) mit je 1–9 eindeutigen Einträgen', () => {
    expect(RADIO_MENUS.map((m) => m.key)).toEqual(['KeyZ', 'KeyX', 'KeyC']);
    for (const m of RADIO_MENUS) {
      expect(m.items.length).toBeGreaterThan(0);
      expect(m.items.length).toBeLessThanOrEqual(9);
      expect(new Set(m.items).size).toBe(m.items.length);
    }
  });
  it('Tasten- und Ziffernauswahl inkl. ungültiger Eingaben', () => {
    const z = radioMenuFor('KeyZ')!;
    expect(radioPick(z, 1)).toBe(z.items[0]);
    expect(radioPick(z, z.items.length)).toBe(z.items[z.items.length - 1]);
    expect(radioPick(z, 0)).toBeNull();
    expect(radioPick(z, 99)).toBeNull();
    expect(radioPick(z, 1.5)).toBeNull();
    expect(radioMenuFor('KeyQ')).toBeNull();
  });
});
