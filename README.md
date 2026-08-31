# HVAC 4090 Pro — Web Field Calculator

An independent, browser-based calculator compatible with the working method of the Calculated Industries Model 4090. It recreates the dual-function keypad workflow for sheet-metal geometry, HVAC test-and-balance math, dimensional calculations, and construction layout.

## What it includes

- Feet, inches, fractions, decimal feet/inches, meters, and millimeters
- Dimensional arithmetic with area and volume tracking
- Right triangles, pitch, slope, percent grade, and Law of Cosines
- Sheet-metal offsets, circle/arc/segment, column, and cone calculations
- Fan Laws 1–3 and VP/FPM/MPS pressure conversions
- Regular/irregular hip and jack rafters
- Stair layout calculations
- M+, M1–M3, preferences, keyboard input, local persistence, and offline support

Model 4090 does **not** include psychrometrics, load calculations, temperature conversion, ductulator friction sizing, or equivalent-round duct sizing. This project intentionally does not invent those functions.

## Use

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Quality checks

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

The golden tests are derived from worked examples in the official Model 4090 User’s Guide.

## Sources

- [Official Model 4090 User’s Guide](https://www.calculated.com/UGFiles/UG4090E-E.pdf)
- [Official Model 4090 product page](https://www.calculated.com/mobile/prd722/Sheet-Metal-HVAC-Pro.html)
- [Official specification sheet](https://www.calculated.com/artwork/4090-CI_SPEC-4C.pdf)

## Independence notice

This is an unofficial compatible implementation and is not affiliated with, endorsed by, or sponsored by Calculated Industries. It uses original source code, original artwork, and distinct branding. “Sheet Metal / HVAC Pro,” “Armadillo Gear,” and “Calculated Industries” are trademarks of their respective owner.

Use this calculator as a field aid. Verify critical dimensions, code compliance, and project requirements independently.

## License

MIT for the original source code in this repository. Third-party trademarks remain the property of their owners.
