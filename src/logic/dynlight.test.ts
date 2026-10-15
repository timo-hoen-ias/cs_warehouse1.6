import { describe, expect, it } from 'vitest';
import {
  DYN_LIGHT_MAX, POOL_CAPACITY, VISIBLE_RANGE, addLight, createPool, currentIntensity, envelope, explosionLight, flashLight, lightScore,
  muzzleLight, selectLights, tickPool, type LightSpec,
} from './dynlight';

const at = (x: number, y = 1.5, z = 0): { x: number; y: number; z: number } => ({ x, y, z });
const spec = (over: Partial<LightSpec> = {}): LightSpec => ({ pos: at(0), color: [1, 0.5, 0.2], radius: 5, intensity: 1, duration: 0.2, ...over });

describe('envelope (Lebensdauer-Kurven)', () => {
  it('flash: sofort voll, fällt monoton auf 0', () => {
    const l = { duration: 1, shape: 'flash' as const };
    expect(envelope({ ...l, age: 0 })).toBe(1);
    let last = 1;
    for (let a = 0.05; a < 1; a += 0.05) {
      const e = envelope({ ...l, age: a });
      expect(e).toBeLessThan(last);
      expect(e).toBeGreaterThan(0);
      last = e;
    }
    expect(envelope({ ...l, age: 1 })).toBe(0);
    expect(envelope({ ...l, age: 5 })).toBe(0);
  });

  it('blast: kurzer Anstieg bis zur Spitze, danach Ausklingen; nie 0 am Anfang', () => {
    const l = { duration: 1, shape: 'blast' as const };
    expect(envelope({ ...l, age: 0 })).toBeGreaterThan(0.3);
    expect(envelope({ ...l, age: 0.08 })).toBeCloseTo(1, 5);
    expect(envelope({ ...l, age: 0.5 })).toBeLessThan(envelope({ ...l, age: 0.2 }));
    expect(envelope({ ...l, age: 1 })).toBe(0);
  });

  it('Dauer 0 → sofort aus', () => {
    expect(envelope({ age: 0, duration: 0, shape: 'flash' })).toBe(0);
  });
});

describe('Pool: aufnehmen, altern, ablaufen', () => {
  it('unsinnige Lichter werden abgelehnt', () => {
    const p = createPool();
    expect(addLight(p, spec({ duration: 0 }))).toBeNull();
    expect(addLight(p, spec({ radius: 0 }))).toBeNull();
    expect(addLight(p, spec({ intensity: -1 }))).toBeNull();
    expect(addLight(p, spec({ intensity: NaN }))).toBeNull();
    expect(p.lights).toHaveLength(0);
  });

  it('Standardform flash, Position wird kopiert', () => {
    const p = createPool();
    const pos = at(1);
    const l = addLight(p, spec({ pos }))!;
    pos.x = 99;
    expect(l.shape).toBe('flash');
    expect(l.pos.x).toBe(1);
  });

  it('neues Licht überlebt mindestens einen Frame in voller Helligkeit (auch bei dt > Lebensdauer)', () => {
    const p = createPool();
    addLight(p, spec({ duration: 0.05 }));
    tickPool(p, 0.5); // erster Schritt: nur „gezeigt“ markieren
    expect(p.lights).toHaveLength(1);
    expect(currentIntensity(p.lights[0]!)).toBe(1);
    tickPool(p, 0.5);
    expect(p.lights).toHaveLength(0);
  });

  it('Lichter altern und verschwinden nach ihrer Dauer', () => {
    const p = createPool();
    addLight(p, spec({ duration: 0.2 }));
    tickPool(p, 0.016);
    for (let i = 0; i < 5; i++) tickPool(p, 0.03);
    expect(p.lights).toHaveLength(1);
    expect(currentIntensity(p.lights[0]!)).toBeLessThan(0.5);
    for (let i = 0; i < 5; i++) tickPool(p, 0.03);
    expect(p.lights).toHaveLength(0);
  });

  it('negatives dt altert nicht', () => {
    const p = createPool();
    addLight(p, spec());
    tickPool(p, 0.016);
    tickPool(p, -1);
    expect(p.lights[0]!.age).toBe(0);
  });

  it('voller Pool ohne Kamera: das älteste wird verdrängt', () => {
    const p = createPool(3);
    for (let i = 0; i < 3; i++) {
      addLight(p, spec({ pos: at(i), duration: 5 }));
      tickPool(p, 0.1);
      tickPool(p, 0.1);
    }
    expect(p.lights).toHaveLength(3);
    const n = addLight(p, spec({ pos: at(10), duration: 5 }))!;
    expect(p.lights).toHaveLength(3);
    expect(p.lights).toContain(n);
    expect(p.lights.map((l) => l.pos.x).sort((a, b) => a - b)).toEqual([1, 2, 10]);
  });

  it('voller Pool mit Kamera: unwichtiges (fernes) Licht wird verdrängt, ein noch unwichtigeres abgelehnt', () => {
    const cam = at(0);
    const p = createPool(2);
    addLight(p, spec({ pos: at(2), duration: 5 }), cam);
    addLight(p, spec({ pos: at(60), duration: 5 }), cam);
    const near = addLight(p, spec({ pos: at(3), duration: 5 }), cam);
    expect(near).not.toBeNull();
    expect(p.lights.map((l) => l.pos.x).sort((a, b) => a - b)).toEqual([2, 3]);
    expect(addLight(p, spec({ pos: at(65), duration: 5 }), cam)).toBeNull();
    expect(p.lights).toHaveLength(2);
  });

  it('Kapazität wird nie überschritten', () => {
    const p = createPool();
    for (let i = 0; i < 100; i++) addLight(p, spec({ pos: at(i), duration: 5 }), at(0));
    expect(p.lights.length).toBeLessThanOrEqual(POOL_CAPACITY);
  });
});

describe('Wichtigkeit und Auswahl nach Entfernung', () => {
  const mk = (over: Partial<LightSpec>) => {
    const p = createPool();
    return addLight(p, spec(over))!;
  };

  it('näher = wichtiger, heller = wichtiger, größere Reichweite = wichtiger', () => {
    const cam = at(0);
    expect(lightScore(mk({ pos: at(2) }), cam)).toBeGreaterThan(lightScore(mk({ pos: at(30) }), cam));
    expect(lightScore(mk({ pos: at(10), intensity: 2 }), cam)).toBeGreaterThan(lightScore(mk({ pos: at(10), intensity: 1 }), cam));
    expect(lightScore(mk({ pos: at(10), radius: 15 }), cam)).toBeGreaterThan(lightScore(mk({ pos: at(10), radius: 5 }), cam));
  });

  it('außerhalb der Sichtweite zählt nichts', () => {
    expect(lightScore(mk({ pos: at(VISIBLE_RANGE + 1), radius: 200 }), at(0))).toBe(0);
  });

  it('selectLights: höchstens max, wichtigste zuerst, Farbe × Helligkeit', () => {
    const p = createPool();
    for (const x of [30, 5, 15, 2, 50, 8]) addLight(p, spec({ pos: at(x), color: [1, 0, 0.5], intensity: 2, duration: 5 }));
    tickPool(p, 0.01);
    const sel = selectLights(p, at(0), 3);
    expect(sel.map((s) => s.x)).toEqual([2, 5, 8]);
    expect(sel[0]!.r).toBeCloseTo(2, 3);
    expect(sel[0]!.g).toBe(0);
    expect(sel[0]!.b).toBeCloseTo(1, 3);
    expect(sel[0]!.radius).toBe(5);
    expect(selectLights(p, at(0), 0)).toEqual([]);
  });

  it('Auswahl folgt der Kamera', () => {
    const p = createPool();
    addLight(p, spec({ pos: at(0), duration: 5 }));
    addLight(p, spec({ pos: at(40), duration: 5 }));
    tickPool(p, 0.01);
    expect(selectLights(p, at(0), 1)[0]!.x).toBe(0);
    expect(selectLights(p, at(40), 1)[0]!.x).toBe(40);
  });

  it('abgeklungene und unsichtbare Lichter werden nicht ausgewählt', () => {
    const p = createPool();
    addLight(p, spec({ pos: at(1), duration: 0.1 }));
    addLight(p, spec({ pos: at(500), duration: 5 }));
    tickPool(p, 0.01);
    tickPool(p, 0.2);
    expect(selectLights(p, at(0), 4)).toEqual([]);
  });

  it('Grafikstufen: niedrig 2 Lichter, hoch 6', () => {
    expect(DYN_LIGHT_MAX.low).toBe(2);
    expect(DYN_LIGHT_MAX.high).toBe(6);
    expect(DYN_LIGHT_MAX.low).toBeLessThan(DYN_LIGHT_MAX.high);
  });
});

describe('Vorlagen', () => {
  it('Mündungsfeuer: kurz und klein, Scharfschützen/Schrot größer', () => {
    const rifle = muzzleLight(at(0), 1.1);
    const awp = muzzleLight(at(0), 1.6);
    expect(rifle.duration).toBeLessThan(0.12);
    expect(rifle.radius).toBeGreaterThan(3);
    expect(rifle.radius).toBeLessThan(8);
    expect(awp.radius).toBeGreaterThan(rifle.radius);
    expect(muzzleLight(at(0), 100).radius).toBeLessThan(12); // gedeckelt
    expect(muzzleLight(at(0), -3).radius).toBeGreaterThan(0);
  });

  it('Explosion: groß, länger, orange; C4 (Skala 3) größer als HE, Radius gedeckelt', () => {
    const he = explosionLight(at(0), 1);
    const c4 = explosionLight(at(0), 3);
    expect(he.radius).toBeGreaterThan(10);
    expect(c4.radius).toBeGreaterThan(he.radius);
    expect(explosionLight(at(0), 100).radius).toBeLessThanOrEqual(36);
    expect(c4.duration).toBeGreaterThan(he.duration);
    expect(he.duration).toBeGreaterThan(muzzleLight(at(0)).duration * 4);
    expect(he.color[0]).toBeGreaterThan(he.color[2]);
    expect(he.pos.y).toBeGreaterThan(0.4); // über dem Boden, damit der Boden nicht senkrecht angestrahlt wird
  });

  it('Blendgranate: weiß und hell', () => {
    const f = flashLight(at(0));
    expect(f.color).toEqual([1, 1, 1]);
    expect(f.intensity).toBeGreaterThan(explosionLight(at(0)).intensity * 0.8);
  });

  it('alle Vorlagen sind gültig (werden vom Pool akzeptiert)', () => {
    const p = createPool();
    for (const s of [muzzleLight(at(0)), explosionLight(at(0)), flashLight(at(0)), explosionLight(at(0), 3)]) expect(addLight(p, s)).not.toBeNull();
  });
});
