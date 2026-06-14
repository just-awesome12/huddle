/**
 * Huddle palette — "Pop" direction (OQ-4). Single source of colour for
 * mobile, mirroring the web @theme tokens. Brand violet (c-purple ramp),
 * accent pink (c-pink), neutrals from slate, semantic idea badge colours
 * kept (they encode meaning).
 */
export const colors = {
  brand: {
    50: '#eeedfe',
    100: '#cecbf6',
    200: '#afa9ec',
    400: '#7f77dd',
    600: '#534ab7',
    700: '#473e9f',
    800: '#3c3489',
    900: '#26215c',
  },
  accent: {
    50: '#fbeaf0',
    400: '#d4537e',
    600: '#993556',
  },
  canvas: '#f7f6fd',
  surface: '#ffffff',
  ink: '#1e1b35',
  text: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  border: '#e2e8f0',
  white: '#ffffff',
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerText: '#b91c1c',
} as const;
