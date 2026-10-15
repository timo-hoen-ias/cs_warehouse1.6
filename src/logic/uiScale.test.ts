import { describe, expect, it } from 'vitest';
import { HUD_MAX_ASPECT, UI_SCALE_MAX, UI_SCALE_MIN, canvasPixels, computeUiScale, hudSideInset } from './uiScale';

describe('computeUiScale', () => {
  it('1080p ist die Referenz (Faktor 1)', () => {
    expect(computeUiScale(1920, 1080)).toBe(1);
  });

  it('skaliert mit 1440p und 4K', () => {
    expect(computeUiScale(2560, 1440)).toBeCloseTo(1.333, 3);
    expect(computeUiScale(3840, 2160)).toBe(2);
  });

  it('720p wird kleiner, bleibt aber über dem Minimum', () => {
    expect(computeUiScale(1280, 720)).toBeCloseTo(0.667, 3);
    expect(computeUiScale(1280, 800)).toBeCloseTo(0.667, 3);
  });

  it('Ultrawide richtet sich nach der Höhe', () => {
    expect(computeUiScale(3440, 1440)).toBeCloseTo(1.333, 3);
    expect(computeUiScale(5120, 1440)).toBeCloseTo(1.333, 3);
  });

  it('Hochformat/schmale Fenster richten sich nach der Breite', () => {
    expect(computeUiScale(1200, 1600)).toBeCloseTo(0.625, 3);
  });

  it('klemmt auf Minimum und Maximum', () => {
    expect(computeUiScale(320, 240)).toBe(UI_SCALE_MIN);
    expect(computeUiScale(15360, 8640)).toBe(UI_SCALE_MAX);
  });

  it('multipliziert den Nutzerfaktor (geklemmt auf 0.75..1.5)', () => {
    expect(computeUiScale(1920, 1080, 1.25)).toBe(1.25);
    expect(computeUiScale(1920, 1080, 5)).toBe(1.5);
    expect(computeUiScale(1920, 1080, 0.1)).toBe(0.75);
    expect(computeUiScale(1920, 1080, NaN)).toBe(1);
  });

  it('übersteht kaputte Fenstermaße', () => {
    expect(computeUiScale(NaN, NaN)).toBe(1);
    expect(computeUiScale(0, 0)).toBe(UI_SCALE_MIN);
  });
});

describe('hudSideInset', () => {
  it('kein Rand bis 21:9', () => {
    expect(hudSideInset(1920, 1080)).toBe(0);
    expect(hudSideInset(3440, 1440)).toBe(0);
  });

  it('Super-Ultrawide (32:9) bekommt symmetrische Ränder', () => {
    const inset = hudSideInset(5120, 1440);
    expect(inset).toBe(Math.round((5120 - 1440 * HUD_MAX_ASPECT) / 2));
    expect(5120 - 2 * inset).toBe(3456);
  });

  it('robust gegen Höhe 0 / NaN', () => {
    expect(hudSideInset(1000, 0)).toBe(0);
    expect(hudSideInset(NaN, 1000)).toBe(0);
  });
});

describe('canvasPixels', () => {
  it('multipliziert mit dem Gerätepixelverhältnis', () => {
    expect(canvasPixels(200, 2)).toBe(400);
    expect(canvasPixels(200, 1)).toBe(200);
  });

  it('klemmt DPR auf 1..3 und deckelt die Größe', () => {
    expect(canvasPixels(200, 0.5)).toBe(200);
    expect(canvasPixels(200, 8)).toBe(600);
    expect(canvasPixels(900, 3)).toBe(1024);
    expect(canvasPixels(0, 2)).toBe(1);
  });
});
