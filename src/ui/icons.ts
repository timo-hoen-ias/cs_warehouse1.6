/**
 * Kleine UI-Symbole als Inline-SVG (keine Bilddateien): HUD-Vitals, Status,
 * Team-Embleme, Menü-Knöpfe. Füllung per currentColor.
 */
const svg = (vb: string, d: string, extra = ''): string => `<svg viewBox="${vb}" aria-hidden="true"${extra}><path fill-rule="evenodd" d="${d}"/></svg>`;

export const ICON = {
  health: svg('0 0 24 24', 'M9 2h6v7h7v6h-7v7H9v-7H2V9h7z'),
  armor: svg('0 0 24 24', 'M12 1l9 4v6c0 6-4 10.5-9 12C7 21.5 3 17 3 11V5z'),
  cart: svg('0 0 24 24', 'M2 3h3l2.6 11.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L22 7H7.2L6.6 4.4A2 2 0 0 0 4.7 3H2zm7 16a2 2 0 1 0 0 .01zm9 0a2 2 0 1 0 0 .01z'),
  speakerOn: svg('0 0 24 24', 'M3 9h4l5-5v16l-5-5H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z'),
  speakerOff: svg('0 0 24 24', 'M3 9h4l5-5v16l-5-5H3zm13.6 3l2.7-2.7 1.4 1.4L18 12.4l2.7 2.7-1.4 1.4-2.7-2.7-2.7 2.7-1.4-1.4 2.7-2.7-2.7-2.7 1.4-1.4z'),
  back: svg('0 0 24 24', 'M15.4 4.6L8 12l7.4 7.4-1.4 1.4L5.2 12 14 3.2z'),
  lock: svg('0 0 24 24', 'M7 10V7a5 5 0 0 1 10 0v3h2v12H5V10zm2 0h6V7a3 3 0 0 0-6 0z'),
  refresh: svg('0 0 24 24', 'M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.8-4.2L13 11h7V4z'),
  copy: svg('0 0 24 24', 'M8 2h12v14h-4v6H4V8h4zm2 2v4h6v6h2V4zM6 10v10h8V10z'),
  crown: svg('0 0 24 24', 'M3 7l5 4 4-7 4 7 5-4-2 12H5z'),
  user: svg('0 0 24 24', 'M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 12c5 0 9 2.5 9 6v2H3v-2c0-3.5 4-6 9-6z'),
  bomb: svg('0 0 24 24', 'M3 9h14v11H3zm2 2v7h10v-7zm1 1h3v2H6zm4 0h3v2h-3zm7.5-7.5L19 3l2 2-1.5 1.5L21 8l-2 1-1.5-1.5z'),
  /** Terroristen-Emblem: Sturmhaube mit Augenschlitz. */
  teamT: svg('0 0 64 80', 'M32 2C16 2 8 14 8 30v18c0 14 10 26 24 30 14-4 24-16 24-30V30C56 14 48 2 32 2zM14 30h36v10H14zm6 22h24v6H20z'),
  /** CT-Emblem: Helm mit Visier. */
  teamCT: svg('0 0 64 80', 'M32 4C15 4 6 16 6 32v8h52v-8C58 16 49 4 32 4zM4 44h56v8H4zm8 12h40l-6 18H18z'),
};
