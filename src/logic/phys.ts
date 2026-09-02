export function nextVertical(
  vy: number,
  grounded: boolean,
  jump: boolean,
  dt: number,
  gravity = 20,
  jumpSpeed = 8,
): number {
  if (grounded && jump) return jumpSpeed;
  return vy - gravity * dt;
}
