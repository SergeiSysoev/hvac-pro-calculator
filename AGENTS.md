# Professional HVAC Calculator Agent Guide

## Role

Maintain an accurate, independent, installable HVAC field calculator with three full-screen tools: Scientific, Trade and Duct.

## Product rules

- Treat published engineering examples and the automated test suite as golden behavior.
- Implement duct sizing from public ASHRAE equations; do not copy proprietary source code or artwork.
- Preserve original branding and visual assets. Never add third-party logos, product photos or exact proprietary artwork.
- Keep the independence and engineering-limit notices visible in project documentation and the Duct screen.
- Keep all three screens usable by touch at phone and tablet sizes.
- Preserve keyboard accessibility, visible focus, reduced-motion support and 44px minimum touch targets.
- A single swipe may move only to an adjacent screen; all screens stay mounted so calculator state survives navigation.

## Architecture

- `app/` — Vinext route, metadata and full-screen global styles
- `components/HvacCalculator.tsx` — three-screen pager, shared calculator state and persistence
- `components/calculator/` — display, keypad, preferences and Duct screen components
- `lib/calculator/core.ts` — dimensional values, expression evaluation and formatting
- `lib/calculator/formulas.ts` — trade-domain formulas and named result sequences
- `lib/calculator/duct.ts` — ASHRAE round-duct solver, unit conversion and rectangular equivalents
- `lib/calculator/engine.ts` — physical-key state machine
- `lib/carousel.ts` — swipe projection and edge physics
- `tests/` — field-calculator examples, keypad sequences, duct pairs and carousel behavior

## Commands

```bash
npm run dev
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## Workflow

Research unfamiliar HVAC behavior against primary public sources, implement it independently, update tests, verify the interface on a phone viewport, run the repository audit and publish both GitHub Pages and the configured Sites deployment.
