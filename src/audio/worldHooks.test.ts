import { describe, expect, it } from 'vitest';
import { colliderOccluded } from './worldHooks';
import { colliderFor } from '../logic/collision';

describe('colliderOccluded', () => {
  const col = colliderFor([{ minX: 4, maxX: 5, minY: 0, maxY: 3, minZ: -5, maxZ: 5 }]);
  it('meldet eine Wand zwischen Quelle und Hörer', () => {
    expect(colliderOccluded(col, { x: 0, y: 1.5, z: 0 }, { x: 10, y: 1.5, z: 0 })).toBe(true);
  });
  it('freie Sicht ist nicht verdeckt', () => {
    expect(colliderOccluded(col, { x: 0, y: 1.5, z: 0 }, { x: 0, y: 1.5, z: 10 })).toBe(false);
  });
  it('sehr kurze Strecken gelten nie als verdeckt', () => {
    expect(colliderOccluded(col, { x: 4.4, y: 1.5, z: 0 }, { x: 4.6, y: 1.5, z: 0 })).toBe(false);
  });
});
