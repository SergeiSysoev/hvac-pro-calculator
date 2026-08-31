# HVAC 4090 Pro Agent Guide

## Role

Maintain an accurate, independent web implementation of the Model 4090 working method.

## Product rules

- Treat the official User’s Guide examples as golden behavior.
- Do not invent functions absent from Model 4090. In particular: no psychrometrics, load calculations, temperature conversion, ductulator friction sizing, or equivalent-round sizing.
- Keep formulas and methods compatible while preserving original branding and visual assets.
- Never add Calculated Industries logos, product photos, manual text, or exact proprietary artwork.
- Keep the independence notice visible.
- The calculator must remain usable by touch at phone and tablet sizes.
- Preserve keyboard accessibility, focus styles, reduced-motion support, and 44px touch targets where space allows.

## Architecture

- `app/` — Vinext route, metadata, and global styles
- `components/HvacCalculator.tsx` — interactive UI and persistence
- `lib/calculator/core.ts` — dimensional values, expression evaluation, formatting
- `lib/calculator/formulas.ts` — domain formulas and named result sequences
- `lib/calculator/engine.ts` — physical-key state machine
- `tests/` — golden examples and keypad sequences

## Commands

```bash
npm run dev
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## Workflow

Use `/deep` for research, `/shape` for planning, `/make` for execution, and `/audit` for review. Update golden tests whenever calculator behavior changes.
