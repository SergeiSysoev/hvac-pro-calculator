# Professional HVAC Calculator

A full-screen, installable browser calculator for HVAC and sheet-metal field work. The interface is an original implementation with three horizontally swipeable tools and no third-party branding or artwork.

Live site: [https://sergeisysoev.github.io/hvac-pro-calculator/](https://sergeisysoev.github.io/hvac-pro-calculator/)

## Three calculator screens

- **HVAC** — a faithful five-column professional sheet-metal calculator with feet, inches, fractions, metric units, dimensional arithmetic, trigonometry, memory and right-triangle solving.
- **Trade** — offsets, circle/arc/segment layout, column/cone work, fan laws, hip/jack geometry and stair layout.
- **Duct** — enter any two of airflow, friction rate, velocity and round diameter; the other two solve automatically. Includes Imperial/SI conversion and equivalent rectangular sizes.

Swipe left or right, or use the three dots at the bottom, to change screens. Preferences, stored memories and duct entries remain on the device. The app supports offline use after the first successful load.

## Engineering basis

The duct screen is an independent implementation of the ASHRAE equal-friction method. It uses Darcy-Weisbach pressure loss, the Colebrook friction factor, standard-air assumptions and the ASHRAE/Huebscher equivalent rectangular relationship. The six possible pairs of duct inputs are covered by automated tests.

The calculation applies to straight average sheet-metal duct at standard air conditions. Add fittings, transitions, dampers, equipment, leakage and project-specific design requirements separately.

## Run locally

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

## Public sources

- [ASHRAE Handbook — Duct Design](https://handbook.ashrae.org/Handbooks/F25/IP/F25_Ch21/F25_Ch21_ip.aspx)
- [Reference app listing — Trade Calculator: Sheet Metal](https://apps.apple.com/us/app/trade-calculator-sheet-metal/id6758922258)
- [Reference app support description](https://github.com/EODMATT1980/trade-calculator/blob/main/support.html)

## Independence and safety

This project uses original source code, artwork and branding. It is not affiliated with or endorsed by the developers or manufacturers of any referenced calculator. Public product descriptions were used to identify workflows; engineering behavior was implemented independently from published formulas.

Use this calculator as a field aid. Verify critical dimensions, airflow design, code compliance and project requirements independently.

## License

MIT for the original source code in this repository. Third-party trademarks remain the property of their owners.
