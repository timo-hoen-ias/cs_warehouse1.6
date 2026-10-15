import { describe, expect, it } from 'vitest';
import { BOT_RADIO, BOT_RADIO_COOLDOWN, RADIO_MENUS, radioAllowed, radioMenuFor, radioPick } from './radio';

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

describe('Bot-Funk', () => {
  it('Bot-Sprüche stammen aus dem Funkmenü (außer Bombe gelegt / Ich entschärfe)', () => {
    const all = new Set(RADIO_MENUS.flatMap((m) => m.items));
    for (const [key, text] of Object.entries(BOT_RADIO)) {
      if (key === 'bombPlanted' || key === 'defusing') continue;
      expect(all.has(text), text).toBe(true);
    }
    for (const key of Object.keys(BOT_RADIO)) expect(BOT_RADIO_COOLDOWN[key as keyof typeof BOT_RADIO]).toBeGreaterThan(0);
  });

  it('kein Spam: Mindestabstand im Team und Abklingzeit je Spruch', () => {
    const log = new Map<string, number>();
    expect(radioAllowed(log, 'enemySpotted', 10)).toBe(true);
    expect(radioAllowed(log, 'needBackup', 11)).toBe(false); // < 4 s nach dem letzten
    expect(radioAllowed(log, 'needBackup', 14.5)).toBe(true);
    expect(radioAllowed(log, 'enemySpotted', 19)).toBe(false); // Abklingzeit 10 s
    expect(radioAllowed(log, 'enemySpotted', 20.5)).toBe(true);
  });
});
