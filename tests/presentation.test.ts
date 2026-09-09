import { describe, expect, it } from 'vitest';
import { CalculatorState, KeyId, calculatorReducer, initialCalculatorState } from '@/lib/calculator/engine';
import { calculatorExpressionView } from '@/lib/calculator/presentation';
import { splitExpressionText } from '@/components/calculator/ExpressionText';

function run(keys: KeyId[], initial = initialCalculatorState()): CalculatorState {
  return keys.reduce((state, key) => calculatorReducer(state, { type: 'press', key }), initial);
}

function expression(keys: KeyId[], initial?: CalculatorState): string {
  return calculatorExpressionView(run(keys, initial)).expressionText;
}

describe('modern calculator expression display', () => {
  it('keeps every part of a mixed measurement visible as it is entered', () => {
    let state = initialCalculatorState();
    const stages: Array<[KeyId, string]> = [
      ['8', '8'],
      ['feet', '8′'],
      ['2', '8′ 2″'],
      ['inch', '8′ 2″'],
      ['3', '8′ 2″ + 3″'],
      ['fraction', '8′ 2 3/…″'],
      ['8', '8′ 2 3/8″'],
    ];

    for (const [key, expected] of stages) {
      state = run([key], state);
      expect(calculatorExpressionView(state).expressionText).toBe(expected);
    }
  });

  it('lets Backspace visibly edit every part of a mixed measurement', () => {
    let state = run(['8', 'feet', '2', 'inch', '3', 'fraction', '8']);
    const stages = [
      '8′ 2 3/…″',
      '8′ 2″ + 3″',
      '8′ 2″',
      '8′',
      '8',
      '0',
    ];
    for (const expected of stages) {
      state = run(['backspace'], state);
      expect(calculatorExpressionView(state).expressionText).toBe(expected);
    }
  });

  it('lets Backspace undo committed imperial, metric, and powered unit keys', () => {
    const mixed = run(['1', '5', 'feet', '9', 'inch', 'backspace']);
    expect(calculatorExpressionView(mixed).expressionText).toBe('15′');
    expect(expression(['backspace'], mixed)).toBe('15');
    expect(expression(['1', '5', 'meter', 'backspace'])).toBe('15');
    expect(expression(['8', 'feet', 'feet', 'backspace'])).toBe('8′');
    expect(expression(['8', 'feet', 'feet', 'feet', 'backspace', 'backspace'])).toBe('8′');
    expect(expression(['1', '5', 'meter', 'meter', 'backspace', 'backspace'])).toBe('15');
  });

  it('retains the complete arithmetic expression through operators and Equals', () => {
    const first = run(['8', 'feet', '2', 'inch', '3', 'fraction', '8', 'add']);
    expect(calculatorExpressionView(first).expressionText).toBe('8′ 2 3/8″ +');

    const second = run(['1', 'feet', '9', 'inch', '5', 'fraction', '8'], first);
    expect(calculatorExpressionView(second).expressionText).toBe('8′ 2 3/8″ + 1′ 9 5/8″');

    const result = run(['equals'], second);
    expect(calculatorExpressionView(result)).toMatchObject({
      expressionText: '8′ 2 3/8″ + 1′ 9 5/8″',
      resultText: '10′ 0″',
      contextText: 'Expression',
    });
  });

  it('changes the prompt to Expression as soon as the right operand is visible', () => {
    expect(calculatorExpressionView(run(['2', 'add']))).toMatchObject({
      expressionText: '2 +',
      contextText: 'Enter next value',
    });
    expect(calculatorExpressionView(run(['2', 'add', '3']))).toMatchObject({
      expressionText: '2 + 3',
      contextText: 'Expression',
      entryActive: true,
    });
    expect(calculatorExpressionView(run([
      '8', 'feet', '2', 'inch', '3', 'fraction', '8',
      'add', '4', 'feet',
    ]))).toMatchObject({
      expressionText: '8′ 2 3/8″ + 4′',
      contextText: 'Expression',
      entryActive: true,
    });
  });

  it('preserves exact decimal-inch text instead of redrawing it as a different fraction', () => {
    let decimalTenth = initialCalculatorState();
    const stages: Array<[KeyId, string]> = [
      ['1', '1'],
      ['feet', '1′'],
      ['decimal', '1′ 0.″'],
      ['1', '1′ 0.1″'],
      ['inch', '1′ 0.1″'],
      ['add', '1′ 0.1″ +'],
      ['1', '1′ 0.1″ + 1'],
      ['inch', '1′ 0.1″ + 1″'],
    ];
    for (const [key, expected] of stages) {
      decimalTenth = run([key], decimalTenth);
      expect(calculatorExpressionView(decimalTenth).expressionText).toBe(expected);
    }
    expect(calculatorExpressionView(run(['equals'], decimalTenth))).toMatchObject({
      expressionText: '1′ 0.1″ + 1″',
      resultText: '1′ 1 1/8″',
      resultSymbol: '≈',
    });

    expect(calculatorExpressionView(run([
      '1', 'feet', 'decimal', '0', '1', 'inch',
      'multiply', '1', '0', 'equals',
    ]))).toMatchObject({
      expressionText: '1′ 0.01″ × 10',
      resultText: '10′ 0 1/8″',
      resultSymbol: '≈',
    });
  });

  it('preserves explicit fractional inches through unit commit and arithmetic', () => {
    expect(calculatorExpressionView(run([
      '1', 'fraction', '3', 'inch', 'multiply', '3', 'equals',
    ]))).toMatchObject({
      expressionText: '1/3″ × 3',
      resultText: '1″',
      resultSymbol: '=',
    });

    expect(calculatorExpressionView(run([
      '2', 'feet', '1', 'fraction', '3', 'inch', 'multiply', '3', 'equals',
    ]))).toMatchObject({
      expressionText: '2′ 1/3″ × 3',
      resultText: '6′ 1″',
      resultSymbol: '=',
    });
  });

  it('restores an explicit fractional Inch entry when Backspace removes the unit key', () => {
    const restored = run(['1', 'fraction', '3', 'inch', 'backspace']);
    expect(calculatorExpressionView(restored).expressionText).toBe('1/3″');
    expect(calculatorExpressionView(run(['multiply', '3', 'equals'], restored))).toMatchObject({
      expressionText: '1/3″ × 3',
      resultText: '1″',
    });
  });

  it('removes a zero or oversized Inch component without erasing the Feet unit', () => {
    expect(expression(['8', 'feet', '0', 'inch', 'backspace'])).toBe('8′');
    expect(expression(['8', 'feet', '1', '2', 'inch', 'backspace'])).toBe('8′');
  });

  it('writes signed, repeated, and reordered unit components as unambiguous arithmetic', () => {
    expect(calculatorExpressionView(run([
      '8', 'conv', 'subtract', 'feet', '2', 'inch', 'multiply', '1', 'equals',
    ]))).toMatchObject({
      expressionText: '(−8′ + 2″) × 1',
      resultText: '−7′ 10″',
      resultSymbol: '=',
    });

    expect(calculatorExpressionView(run([
      '8', 'conv', 'subtract', 'feet', '1', 'fraction', '2',
      'multiply', '1', 'equals',
    ]))).toMatchObject({
      expressionText: '(−8′ + 1/2″) × 1',
      resultText: '−7′ 11 1/2″',
    });

    expect(calculatorExpressionView(run([
      '8', 'inch', '2', 'feet', 'multiply', '1', 'equals',
    ])).expressionText).toBe('(8″ + 2′) × 1');
    expect(calculatorExpressionView(run([
      '8', 'feet', '2', 'feet', 'multiply', '1', 'equals',
    ])).expressionText).toBe('(8′ + 2′) × 1');
    expect(calculatorExpressionView(run([
      '8', 'feet', '2', 'inch', '3', 'inch', 'multiply', '1', 'equals',
    ])).expressionText).toBe('(8′ 2″ + 3″) × 1');
  });

  it('Backspace removes the last committed component for any accepted unit order', () => {
    const repeatedInches = run(['2', 'inch', '3', 'inch', 'backspace']);
    expect(calculatorExpressionView(repeatedInches).expressionText).toBe('2″');
    expect(calculatorExpressionView(run(['equals'], repeatedInches)).resultText).toBe('2″');

    const repeatedFeet = run(['2', 'feet', '3', 'feet', 'backspace']);
    expect(calculatorExpressionView(repeatedFeet).expressionText).toBe('2′');
    expect(calculatorExpressionView(run(['equals'], repeatedFeet)).resultText).toBe('2′');

    const reordered = run(['2', 'inch', '3', 'feet', 'backspace']);
    expect(calculatorExpressionView(reordered).expressionText).toBe('2″');
    expect(calculatorExpressionView(run(['equals'], reordered)).resultText).toBe('2″');
  });

  it('starts a clean expression when typing after a completed result', () => {
    const result = run(['2', 'add', '3', 'equals']);
    expect(calculatorExpressionView(result).expressionText).toBe('2 + 3');
    expect(expression(['7'], result)).toBe('7');
  });

  it('keeps the exact written source instead of replacing it with a rounded result', () => {
    const result = run(['1', 'feet', 'divide', '3', 'equals']);
    expect(calculatorExpressionView(result)).toMatchObject({
      expressionText: '1′ ÷ 3',
      resultText: '0′ 4″',
    });
    expect(expression(['add'], result)).toBe('(1′ ÷ 3) +');
  });

  it('preserves written parentheses even after the engine evaluates an inner group', () => {
    const state = run(['2', 'multiply', 'left', '3', 'add', '4', 'right', 'equals']);
    expect(calculatorExpressionView(state)).toMatchObject({
      expressionText: '2 × (3 + 4)',
      resultText: '14',
    });
  });

  it('shows an evaluated parenthesized subexpression without erasing what was written', () => {
    expect(calculatorExpressionView(run(['left', '2', 'add', '3', 'right'])))
      .toMatchObject({
        contextText: 'Subexpression',
        expressionText: '(2 + 3)',
        resultText: '5',
        resultSymbol: '=',
        ariaText: '(2 plus 3) equals 5. Continue with an operator or tap =.',
        entryActive: false,
      });
  });

  it('rejects an operator directly after an opening parenthesis without writing invalid math', () => {
    expect(calculatorExpressionView(run(['left', 'add']))).toMatchObject({
      expressionText: '(',
      resultText: 'Complete the entry',
      contextText: 'Check entry',
    });
    expect(calculatorExpressionView(run(['left', 'multiply', '2', 'equals'])).expressionText)
      .not.toContain('×');
  });

  it('rejects a missing operator before a parenthesis without hiding the entered value', () => {
    expect(calculatorExpressionView(run(['2', 'left']))).toMatchObject({
      expressionText: '2',
      resultText: 'Complete the entry',
      contextText: 'Check entry',
    });
  });

  it('keeps unit symbols attached and formats DMS and exponents readably', () => {
    expect(expression(['2', 'decimal', '3', 'decimal', '4'])).toBe('2° 3′ 4″');
    expect(expression(['8', 'conv', 'fraction', '3'])).toBe('8 × 10^3');
  });

  it('speaks angle and length primes correctly when both occur in one formula', () => {
    const dms = run(['3', '0', 'conv', 'decimal']);
    const mixed = run(['add', '8', 'feet', 'equals'], dms);
    expect(calculatorExpressionView(mixed).ariaText).toContain('30 degrees plus 8 feet');
  });

  it('keeps unary operations visible and never revives an older equation', () => {
    const squaredResult = run(['2', 'add', '3', 'equals', 'square']);
    expect(calculatorExpressionView(squaredResult)).toMatchObject({
      expressionText: '(2 + 3)²',
      resultText: '25',
    });
    expect(calculatorExpressionView(run(['conv'], squaredResult)).expressionText).toBe('(2 + 3)²');

    const grouped = run([
      '2', 'multiply', 'left', '3', 'add', '4', 'right', 'square', 'equals',
    ]);
    expect(calculatorExpressionView(grouped)).toMatchObject({
      expressionText: '2 × (3 + 4)²',
      resultText: '98',
    });
  });

  it('parenthesizes negative and repeated postfix operations unambiguously', () => {
    expect(calculatorExpressionView(run(['2', 'conv', 'subtract', 'square']))).toMatchObject({
      expressionText: '(−2)²',
      resultText: '4',
    });
    expect(calculatorExpressionView(run([
      'left', '3', 'add', '4', 'right', 'conv', 'subtract', 'square',
    ]))).toMatchObject({ expressionText: '(−(3 + 4))²', resultText: '49' });
    expect(calculatorExpressionView(run(['2', 'square', 'square']))).toMatchObject({
      expressionText: '(2²)²',
      resultText: '16',
    });
    expect(calculatorExpressionView(run([
      'left', '8', 'feet', 'add', '2', 'inch', 'right', 'square',
    ]))).toMatchObject({
      expressionText: '(8′ + 2″)²',
    });
  });

  it('shows roots, trigonometry, and reciprocal as written operations', () => {
    expect(calculatorExpressionView(run(['9', 'sqrt']))).toMatchObject({
      expressionText: '√(9)',
      resultText: '3',
    });
    expect(calculatorExpressionView(run(['3', '0', 'sin']))).toMatchObject({
      expressionText: 'sin(30)',
      resultText: '0.5',
    });
    expect(calculatorExpressionView(run(['8', 'conv', 'divide']))).toMatchObject({
      expressionText: '1 ÷ (8)',
      resultText: '0.125',
    });
  });

  it('replaces an immediate unary result when a fresh number starts', () => {
    expect(expression(['9', 'sqrt', '2'])).toBe('2');
    expect(expression(['9', 'sqrt', 'decimal', '5'])).toBe('0.5');
    expect(expression(['2', 'add', '9', 'sqrt', '4'])).toBe('2 + 4');
  });

  it('replaces a displayed result with constants, recalled values, and HVAC results', () => {
    expect(expression(['9', 'sqrt', 'pi'])).toBe('π');
    expect(expression(['left', '3', 'add', '4', 'right', 'pi'])).toBe('π');
    expect(expression(['2', 'multiply', 'left', '3', 'add', '4', 'right', 'pi'])).toBe('2 × π');

    const stored = run(['4', '2', 'conv', '1', 'on']);
    expect(expression(['9', 'sqrt', 'recall', '1'], stored)).toBe('42');
    expect(expression(['2', 'multiply', 'left', '3', 'add', '4', 'right', 'recall', '1'], stored))
      .toBe('2 × 42');

    expect(calculatorExpressionView(run([
      '2', 'multiply', 'left', '3', 'add', '4', 'right',
      'conv', '0',
    ])).expressionText).not.toContain('(3 + 4)');
  });

  it('keeps a changed sign visible in grouped and unary expressions', () => {
    expect(calculatorExpressionView(run([
      '2', 'multiply', 'left', '3', 'add', '4', 'right',
      'conv', 'subtract', 'equals',
    ]))).toMatchObject({ expressionText: '2 × −(3 + 4)', resultText: '−14' });

    expect(calculatorExpressionView(run([
      '9', 'sqrt', 'conv', 'subtract', 'add', '5', 'equals',
    ]))).toMatchObject({ expressionText: '−(√(9)) + 5', resultText: '2' });
  });

  it('shows unit and angle conversions as an explicit source-to-result transformation', () => {
    expect(calculatorExpressionView(run(['8', 'feet', '6', 'inch', 'conv', 'meter'])))
      .toMatchObject({ expressionText: '8′ 6″ →', resultText: '2.591 m' });

    const dms = calculatorExpressionView(run([
      '2', '3', 'decimal', '4', '2', 'decimal', '3', '9', 'conv', 'decimal',
    ]));
    expect(dms).toMatchObject({
      expressionText: '23° 42′ 39″ →',
      resultText: '23.71083°',
    });
    expect(dms.ariaText).toContain('42 minutes 39 seconds');
  });

  it('marks a rounded conversion target as approximate without degrading its exact source', () => {
    const converted = run(['1', 'inch', 'conv', 'meter']);
    expect(calculatorExpressionView(converted)).toMatchObject({
      expressionText: '1″ →',
      resultText: '0.025 m',
      resultSymbol: '≈',
      ariaText: '1 inches converts to approximately 0.025 m. Choose another conversion, an operator, or a new value.',
    });
    expect(converted.current?.approximate).toBeUndefined();
    expect(converted.currentDisplayMetadata?.exactness).toBe('exact');
    expect(converted.transformationResultMetadata?.exactness).toBe('approximate');
    expect(calculatorExpressionView(run(['multiply', '1', 'equals'], converted)))
      .toMatchObject({ expressionText: '1″ × 1', resultText: '0.025 m' });
  });

  it('clears conversion arrows before a new mathematical operation', () => {
    const converted = run(['8', 'feet', 'conv', 'meter']);
    expect(calculatorExpressionView(converted).expressionText).toBe('8′ →');

    expect(calculatorExpressionView(run(['square'], converted))).toMatchObject({
      expressionText: '(8′)²',
      resultText: '5.945795 m²',
    });

    expect(calculatorExpressionView(run(['add', '1', 'meter', 'equals'], converted)))
      .toMatchObject({ expressionText: '8′ + 1 m', resultText: '3.438 m' });

    expect(calculatorExpressionView(run(['8', 'feet', 'square', 'conv', 'meter'])))
      .toMatchObject({ expressionText: '(8′)² →', resultText: '5.945795 m²' });
  });

  it('preserves entered metric precision in the formula and formatted precision in the result', () => {
    const entered = run(['3', 'decimal', '5', 'meter', 'add', '2', '5', '0', 'conv', 'meter']);
    expect(calculatorExpressionView(entered).expressionText).toBe('3.5 m + 250 mm');

    expect(calculatorExpressionView(run(['equals'], entered))).toMatchObject({
      expressionText: '3.5 m + 250 mm',
      resultText: '3.750 m',
    });
  });

  it('shows percent input itself instead of replacing it with the computed amount', () => {
    expect(expression(['1', '2', 'conv', 'add'])).toBe('12%');
    expect(calculatorExpressionView(run(['2', '5', '0', 'add', '1', '0', 'conv', 'add'])))
      .toMatchObject({ expressionText: '250 + 10%', resultText: '275' });
    expect(calculatorExpressionView(run([
      '2', '5', '0', 'add', '9', 'sqrt', 'conv', 'add',
    ]))).toMatchObject({ expressionText: '250 + √(9)%', resultText: '257.5' });
    expect(calculatorExpressionView(run([
      '1', '2', 'conv', 'add', 'multiply', '1', '0', '0', 'equals',
    ]))).toMatchObject({ expressionText: '12% × 100', resultText: '12' });

    expect(calculatorExpressionView(run([
      '4', '4', 'decimal', '2', '9', 'conv', 'decimal', 'conv', 'add',
    ]))).toMatchObject({
      expressionText: '44.29°',
      resultText: 'This value cannot be used here',
    });

    const completedPercent = run(['2', '0', '0', 'add', '1', '0', 'conv', 'add']);
    expect(calculatorExpressionView(run(['equals'], completedPercent))).toMatchObject({
      expressionText: '200 + 10%',
      resultText: '220',
    });
  });

  it('keeps DMS entry and calculation synchronized', () => {
    const normalized = run([
      '2', '3', 'decimal', '1', '2', 'decimal', '4', '5', '6', 'conv', 'decimal',
    ]);
    expect(calculatorExpressionView(normalized)).toMatchObject({
      expressionText: '23° 12′ 45″ →',
      resultText: '23.2125°',
    });

    const invalidMinutes = run(['2', '3', 'decimal', '1', '2', '3', 'decimal']);
    expect(calculatorExpressionView(invalidMinutes)).toMatchObject({
      expressionText: '23.123',
      resultText: 'Complete the entry',
    });
  });

  it('names an unfinished DMS seconds field correctly and normalizes DMS before an operator', () => {
    expect(calculatorExpressionView(run(['2', 'decimal', '3', 'decimal'])))
      .toMatchObject({
        expressionText: '2° 3′ …″',
        ariaText: '2 degrees 3 minutes blank seconds. Complete the angle, then choose an operation or conversion.',
      });

    expect(calculatorExpressionView(run([
      '3', '0', 'decimal', '8', '9', 'decimal', '0', 'add',
    ]))).toMatchObject({
      expressionText: '31° 29′ 00″ +',
      ariaText: '31 degrees 29 minutes 00 seconds plus. Enter the next value, then tap =.',
    });
  });

  it('never leaves a bare minus sign after Backspace', () => {
    expect(calculatorExpressionView(run(['8', 'conv', 'subtract', 'backspace'])))
      .toMatchObject({ expressionText: '0', resultText: undefined });
  });

  it('never revives a completed percent equation after a new entry and modifier', () => {
    const percentResult = run(['2', '5', '0', 'add', '1', '0', 'conv', 'add']);
    const freshEntry = run(['7'], percentResult);
    expect(calculatorExpressionView(freshEntry).expressionText).toBe('7');
    expect(calculatorExpressionView(run(['conv'], freshEntry)).expressionText).toBe('7');
  });

  it('materializes the default fraction denominator and preserves standalone fractions', () => {
    expect(calculatorExpressionView(run(['3', 'fraction', 'equals']))).toMatchObject({
      expressionText: '3/16″',
      resultText: '3/16″',
    });
    expect(calculatorExpressionView(run(['3', 'fraction', '8', 'equals']))).toMatchObject({
      expressionText: '3/8″',
      resultText: '3/8″',
    });
    expect(calculatorExpressionView(run([
      '3', 'fraction', 'add', '1', 'inch', 'equals',
    ])).expressionText).toBe('3/16″ + 1″');
  });

  it('renders powered units and DMS results with standard symbols', () => {
    expect(expression(['8', 'feet', 'feet'])).toBe('8 ft²');
    expect(expression(['8', 'inch', 'inch', 'inch'])).toBe('8 in³');

    const exactFractionArea = run(['1', 'fraction', '3', 'inch', 'inch']);
    expect(calculatorExpressionView(exactFractionArea).expressionText).toBe('1/3 in²');
    const restoredFraction = run(['backspace'], exactFractionArea);
    expect(calculatorExpressionView(restoredFraction).expressionText).toBe('1/3″');
    expect(calculatorExpressionView(run(['multiply', '3', 'equals'], restoredFraction)))
      .toMatchObject({ expressionText: '1/3″ × 3', resultText: '1″', resultSymbol: '=' });

    const exactFractionVolume = run(['1', 'fraction', '3', 'inch', 'inch', 'inch']);
    expect(calculatorExpressionView(exactFractionVolume).expressionText).toBe('1/3 in³');
    expect(calculatorExpressionView(run(['backspace'], exactFractionVolume)).expressionText)
      .toBe('1/3 in²');

    const dms = calculatorExpressionView(run([
      '2', '3', 'decimal', '4', '2', 'decimal', '3', '9', 'conv', 'decimal',
    ]));
    expect(dms).toMatchObject({ expressionText: '23° 42′ 39″ →', resultText: '23.71083°' });

    const convertedBack = calculatorExpressionView(run([
      '2', '3', 'decimal', '7', '1', '0', '8', '3', 'conv', 'decimal',
    ]));
    expect(convertedBack.resultText).toBe('23° 42′ 39″');
  });

  it('uses addition instead of invalid mixed-number notation for decimal or repeated fractions', () => {
    expect(expression([
      'decimal', '1', 'inch', '1', 'fraction', '3', 'inch',
    ])).toBe('0.1″ + 1/3″');
    expect(expression([
      '1', 'fraction', '2', 'inch', '1', 'fraction', '4', 'inch',
    ])).toBe('1/2″ + 1/4″');
    expect(expression([
      '0', 'inch', '1', 'fraction', '3', 'inch', '1', 'fraction', '3', 'inch',
    ])).toBe('0 1/3″ + 1/3″');
  });

  it('preserves exact symbolic sources instead of reusing their rounded screen results', () => {
    expect(calculatorExpressionView(run([
      '1', '5', 'divide', '3', '5', 'equals', 'conv', 'cos',
    ]))).toMatchObject({
      expressionText: 'cos⁻¹(15 ÷ 35)',
      resultText: '64.62307°',
    });

    expect(expression(['2', '0', 'tan', 'equals', 'divide', '3']))
      .toBe('tan(20) ÷ 3');

    expect(calculatorExpressionView(run([
      '1', 'meter', 'divide', '3', 'equals', 'conv', 'meter', 'square',
    ]))).toMatchObject({
      expressionText: '(1 m ÷ 3)²',
      resultText: '111111.1111 mm²',
      ariaText: '(1 m divided by 3) squared approximately 111111.1111 square millimeters. Continue with an operator, conversion, or new calculation.',
    });

    expect(calculatorExpressionView(run([
      '1', 'meter', 'multiply', '8', 'feet', 'conv', 'meter', 'equals',
    ]))).toMatchObject({
      expressionText: '1 m × 8′',
      resultText: '2.4384 m²',
    });
  });

  it('marks rounded DMS, HVAC, and recalled operands as approximate when reused', () => {
    const derivedDms = calculatorExpressionView(run([
      '8', '0', 'decimal', '5', 'inch', 'run',
      '2', '2', 'inch', '9', 'fraction', '1', '6', 'rise',
      '6', '8', 'inch', 'conv', '4',
      'conv', 'left', 'left', 'left', 'left', 'left',
      'conv', 'decimal', 'multiply', '2', 'equals',
    ]));
    expect(derivedDms).toMatchObject({
      expressionText: '≈15.6571° × 2',
      resultText: '31° 18′ 51″',
    });
    expect(derivedDms.ariaText).toContain('approximately 15.6571 degrees');

    expect(calculatorExpressionView(run([
      '1', '8', 'rise', '2', '0', 'pitch', 'run', 'multiply', '2', 'equals',
    ]))).toMatchObject({
      expressionText: '≈49 7/16″ × 2',
      resultText: '98 15/16″',
    });

    expect(calculatorExpressionView(run([
      '2', 'feet', '4', 'inch', 'circ',
      '4', 'feet', '6', 'inch', 'rise',
      'conv', 'right', 'multiply', '5', 'equals',
    ]))).toMatchObject({
      expressionText: '≈19.24226 ft³ × 5',
      resultText: '96.21128 ft³',
    });

    expect(calculatorExpressionView(run([
      '1', '5', 'divide', '3', '5', 'equals', 'conv', 'cos',
      'conv', '1', 'on', 'recall', '1', 'multiply', '2', 'equals',
    ]))).toMatchObject({
      expressionText: '≈64.62307° × 2',
      resultText: '129.2461°',
    });
  });

  it('marks a rounded Law of Cosines angle when arithmetic reuses it', () => {
    expect(calculatorExpressionView(run([
      '3', '5', 'feet', '8', 'inch', '3', 'fraction', '4', 'conv', '4',
      '2', '1', 'feet', '8', 'inch', '1', '5', 'fraction', '1', '6', 'conv', '5',
      '2', '4', 'feet', '3', 'inch', '7', 'fraction', '8', 'conv', '6',
      '1', '8', '0', 'subtract', 'conv', '9', 'equals',
    ]))).toMatchObject({
      expressionText: '180 − ≈101.5687°',
      resultText: '78.43128°',
    });
  });

  it('labels chain mode so its left-to-right result is not mistaken for order-of-operations math', () => {
    const initial = {
      ...initialCalculatorState(),
      preferences: { ...initialCalculatorState().preferences, mathMode: 'chain' as const },
    };
    expect(calculatorExpressionView(run(['2', 'add', '3', 'multiply', '4', 'equals'], initial)))
      .toMatchObject({ contextText: 'Chain mode', expressionText: '2 + 3 × 4', resultText: '20' });
  });

  it('includes meaningful HVAC result context in the accessible announcement', () => {
    const view = calculatorExpressionView(run(['0', 'decimal', '0', '9', 'conv', '0']));
    expect(view).toMatchObject({
      contextText: 'Air velocity / pressure',
      valueLabel: 'Air velocity',
      valueText: expect.stringContaining('FPM'),
    });
    expect(view.ariaText).toMatch(/^Air velocity \/ pressure\. Air velocity/);
  });

  it('writes Circle results as complete named equations with a useful next step', () => {
    const diameter = run(['6', 'circ']);
    expect(calculatorExpressionView(diameter)).toMatchObject({
      mode: 'named-result',
      contextText: 'Circle',
      valueLabel: 'Diameter',
      valueText: '6″',
      valueSymbol: '=',
      progressText: '1 of 3',
      guidanceText: 'Tap Circ to show Circumference.',
    });

    const circumference = run(['circ'], diameter);
    expect(calculatorExpressionView(circumference)).toMatchObject({
      valueLabel: 'Circumference',
      valueSymbol: '≈',
      progressText: '2 of 3',
      guidanceText: 'Tap Circ to show Circle area.',
    });

    const area = run(['circ'], circumference);
    expect(calculatorExpressionView(area)).toMatchObject({
      valueLabel: 'Circle area',
      valueSymbol: '≈',
      progressText: '3 of 3',
      guidanceText: 'Tap Circ to return to Diameter.',
    });
  });

  it('restores the units carried only by HVAC result labels', () => {
    expect(calculatorExpressionView(run([
      '6', 'inch', 'pitch', 'pitch', 'pitch',
    ]))).toMatchObject({
      valueLabel: 'Percent grade',
      valueText: '50%',
    });

    expect(calculatorExpressionView(run([
      '1', '2', '5', '0', 'conv', '4',
      '1', '4', '0', '0', 'conv', '7',
      '7', '5', '0', 'conv', '5',
      'conv', 'run',
    ]))).toMatchObject({
      contextText: 'Fan Law 1',
      valueLabel: 'New fan speed',
      valueText: expect.stringContaining('RPM'),
    });
  });

  it('names both physical and Trade-page controls in sequence hints', () => {
    const offset = calculatorExpressionView(run([
      '1', '0', 'feet', 'run',
      '5', 'feet', 'rise',
      '7', 'feet', 'conv', '4',
      'conv', 'left',
    ]));
    expect(offset.guidanceText).toContain('Tap Offset / (');

    const column = calculatorExpressionView(run([
      '6', 'inch', 'circ', '1', '0', 'feet', 'rise', 'conv', 'right',
    ]));
    expect(column.guidanceText).toContain('Tap Column / )');
  });

  it('uses human result names across every multi-result HVAC workflow', () => {
    const samples: Array<[string, string, string, string]> = [
      ['circle', 'AREA', 'Circle', 'Circle area'],
      ['arc', 'AW2', 'Circular arc', 'Arched-wall stud 2 length'],
      ['pitch', '%GRD', 'Pitch', 'Percent grade'],
      ['diag', 'PLMB', 'Right triangle', 'Plumb cut angle'],
      ['offset', 'X', 'Offset', 'Actual length'],
      ['lawcos', 'AREA', 'Law of Cosines', 'Triangle area'],
      ['hip', 'CHK1', 'Hip / valley', 'Cheek cut 1'],
      ['jacks', 'JK1', 'Regular jacks', 'Regular jack 1 length'],
      ['ir-jacks', 'IJ2', 'Irregular jacks', 'Irregular jack 2 length'],
      ['stairs', 'R-HT', 'Stair layout', 'Actual riser height'],
      ['column-cone', 'COL AREA', 'Column / cone', 'Column total surface area'],
      ['velocity', 'KPA', 'Air velocity / pressure', 'Velocity pressure'],
    ];

    for (const [id, rawLabel, contextText, valueLabel] of samples) {
      const state = initialCalculatorState();
      const value = { amount: 12, power: 1, unit: 'in' as const, system: 'imperial' as const };
      state.current = value;
      state.currentDisplayMetadata = { provenance: 'hvac', exactness: 'exact' };
      state.display = { label: rawLabel, valueText: '12', unitText: 'in', plainText: '12 in' };
      const trigger = id === 'offset' ? 'left' : id === 'lawcos' ? '9' : 'circ';
      state.sequence = {
        id,
        results: [{ label: rawLabel, value }],
        index: 0,
        trigger,
      };
      state.lastKey = trigger;
      expect(calculatorExpressionView(state)).toMatchObject({
        mode: 'named-result',
        contextText,
        valueLabel,
      });
    }
  });

  it('qualifies Jack cut results by the active regular or irregular side', () => {
    const state = initialCalculatorState();
    const length = { amount: 16, power: 1, unit: 'in' as const, system: 'imperial' as const };
    const angle = { amount: 30, power: 0, unit: 'auto' as const, system: 'neutral' as const, angle: true };
    state.current = angle;
    state.currentDisplayMetadata = { provenance: 'hvac', exactness: 'approximate' };
    state.display = { label: 'PLMB', valueText: '30', unitText: '°', plainText: '30°' };
    state.sequence = {
      id: 'jacks',
      results: [
        { label: 'JKOC', value: length },
        { label: 'JK1', value: length },
        { label: 'PLMB', value: angle },
        { label: 'IJOC', value: length },
        { label: 'IJ1', value: length },
        { label: 'PLMB', value: angle },
      ],
      index: 5,
      trigger: 'jack',
    };
    state.lastKey = 'jack';

    expect(calculatorExpressionView(state)).toMatchObject({
      contextText: 'Irregular jacks',
      valueLabel: 'Irregular-side plumb cut angle',
      guidanceText: 'Tap Jack to return to Regular on-center spacing.',
    });
  });

  it('shows concise recovery and contextual branch guidance inside the display model', () => {
    const error = calculatorExpressionView(run(['circ']));
    expect(error).toMatchObject({
      mode: 'error',
      errorTitle: 'Circle needs valid inputs',
      guidanceTone: 'error',
    });
    expect(error.guidanceText).toContain('enter a positive diameter');
    expect(error.guidanceText).toContain('bare number is treated as inches');
    expect(error.ariaText.match(/Tap On\/C/g)).toHaveLength(1);

    expect(calculatorExpressionView(run(['8', 'run'])).guidanceText)
      .toBe('Run is stored. Enter Rise, Diagonal, or Pitch.');
    expect(calculatorExpressionView(run(['2', 'add'])).guidanceText)
      .toBe('Enter the next value, then tap =.');
    expect(calculatorExpressionView(run(['2', 'add', '3'])).guidanceText)
      .toBe('Tap = to calculate, or choose another operator to continue.');
    const convertedSequence = calculatorExpressionView(run(['1', '0', 'circ', 'conv']));
    expect(convertedSequence.guidanceText).toBe('Choose a key to use its yellow function.');
    expect(convertedSequence.guidanceText).not.toContain('Tap Circ');
    expect(calculatorExpressionView(run(['6'])).guidanceText)
      .toContain('Length tools treat a bare number as inches.');
  });

  it('does not recommend stale geometry after a unary operation replaces the result', () => {
    const squaredHip = run([
      '3', 'feet', 'run',
      '4', 'feet', 'rise',
      'hip', 'square',
    ]);
    const view = calculatorExpressionView(squaredHip);
    expect(view.guidanceText).toBe(
      'Continue with an operator, conversion, or new calculation.',
    );
    expect(view.guidanceText).not.toContain('Conv + Pitch');
    expect(view.guidanceText).not.toContain('Rise');
  });

  it('does not let stored geometry guidance consume a recalled semantic operand', () => {
    const stored = run([
      '3', 'feet', 'run',
      '4', 'feet', 'rise',
      '0', 'decimal', '0', '4', '9', 'conv', '0',
      'conv', '1', 'on',
    ]);
    const recalled = run(['recall', '1'], stored);
    const view = calculatorExpressionView(recalled);
    expect(view.guidanceText).toBe(
      'Current value is ready. Choose an operator, conversion, or compatible function.',
    );
    expect(view.guidanceText).not.toContain('Conv + Pitch');
  });

  it('temporarily presents Recall instead of a stale multi-result sequence', () => {
    const view = calculatorExpressionView(run(['1', '0', 'circ', 'recall']));
    expect(view).toMatchObject({
      contextText: 'Recall',
      valueLabel: 'Current value',
      valueText: '10″',
      progressText: undefined,
      guidanceText: 'Choose the stored value or preference you want to recall.',
    });
  });

  it('does not promise sequence advancement after an unrelated unary result', () => {
    const circleSquared = calculatorExpressionView(run(['1', '0', 'circ', 'square']));
    expect(circleSquared.progressText).toBeUndefined();
    expect(circleSquared.guidanceText).not.toContain('Tap Circ');
    expect(circleSquared.contextText).not.toBe('Circle');

    const hipSquared = calculatorExpressionView(run([
      '3', 'feet', 'run', '4', 'feet', 'rise', 'hip', 'square',
    ]));
    expect(hipSquared.progressText).toBeUndefined();
    expect(hipSquared.guidanceText).not.toContain('Tap Hip/V');
    expect(hipSquared.contextText).not.toBe('Hip / valley');

    const arcSquared = calculatorExpressionView(run([
      '5', 'feet', 'circ', '3', 'feet', '3', 'inch', 'conv', 'circ', 'square',
    ]));
    expect(arcSquared.progressText).toBeUndefined();
    expect(arcSquared.guidanceText).not.toContain('Tap Circ');
    expect(arcSquared.contextText).not.toBe('Circular arc');

    const grouped = calculatorExpressionView(run(['6', 'circ', 'left', 'circ']));
    expect(grouped).toMatchObject({
      mode: 'entry',
      expressionText: '(6″',
      guidanceText: 'Choose an operator or tap ) to close this group.',
    });
    expect(grouped.contextText).not.toBe('Circle');
  });

  it('keeps valid sequence guidance through display-only conversions and storage overlays', () => {
    const converted = calculatorExpressionView(run(['6', 'circ', 'meter']));
    expect(converted).toMatchObject({
      progressText: '1 of 3',
      guidanceText: 'Tap Circ to show Circumference.',
    });

    const memorized = calculatorExpressionView(run(['6', 'circ', 'mplus']));
    expect(memorized).toMatchObject({
      progressText: undefined,
      guidanceText: 'Tap Circ to show Circumference.',
    });
  });

  it('restores a result cycle after Conv is canceled without changing the value', () => {
    expect(calculatorExpressionView(run(['6', 'circ', 'conv', 'conv']))).toMatchObject({
      mode: 'named-result',
      contextText: 'Circle',
      valueLabel: 'Diameter',
      progressText: '1 of 3',
      guidanceText: 'Tap Circ to show Circumference.',
    });
    expect(calculatorExpressionView(run([
      '6', 'inch', 'pitch', 'conv', 'conv',
    ]))).toMatchObject({
      mode: 'named-result',
      contextText: 'Pitch',
      valueLabel: 'Pitch',
      progressText: '1 of 4',
      guidanceText: 'Tap Pitch to show Pitch angle.',
    });
  });

  it('keeps HVAC meaning when a unitless result becomes an arithmetic operand', () => {
    const grade = calculatorExpressionView(run([
      '6', 'inch', 'pitch', 'pitch', 'pitch', 'add',
    ]));
    expect(grade).toMatchObject({
      contextText: 'Enter next value',
      expressionText: '50 [% grade] +',
      progressText: undefined,
    });

    const velocity = calculatorExpressionView(run([
      '0', 'decimal', '0', '9', 'conv', '0', 'add',
    ]));
    expect(velocity).toMatchObject({
      contextText: 'Enter next value',
      expressionText: '1201.5 FPM +',
      progressText: undefined,
    });

    const pressure = calculatorExpressionView(run([
      '5', '0', '0', 'conv', '0', '0', 'add',
    ]));
    expect(pressure.expressionText).toMatch(/ in\. w\.g\. \+$/);
    expect(pressure.expressionText).not.toContain('″. w.g.');
    expect(pressure.ariaText).not.toContain('inches . w.g.');

    const fan = run([
      '1', '2', '5', '0', 'conv', '4',
      '1', '4', '0', '0', 'conv', '7',
      '7', '5', '0', 'conv', '5',
      'conv', 'run',
    ]);
    expect(calculatorExpressionView(run(['add'], fan))).toMatchObject({
      contextText: 'Enter next value',
      expressionText: expect.stringMatching(/RPM \+$/),
      progressText: undefined,
    });
  });

  it('names the second line for what it actually is', () => {
    // The equals sign is a "print an equals" flag, not a "this is the answer"
    // flag: it is absent for an inner group AND for an exact conversion. Reading
    // the role off that glyph called 6 Feet -> 72 inches a "Current group", and
    // called the 7 inside 2 x (3 + 4) the result.
    const role = (keys: KeyId[]) => calculatorExpressionView(run(keys)).resultRole;

    expect(role(['5', 'multiply', '5', 'equals'])).toBe('result');
    expect(role(['3', '0', 'sin'])).toBe('result');
    expect(role(['2', 'multiply', 'left', '3', 'add', '4', 'right'])).toBe('group');
    expect(role(['2', 'add', 'left', '3', 'add', '4', 'right'])).toBe('group');
    // Conversions, exact and approximate alike - the exact ones are the case
    // that regressed, because they carry no equals sign.
    expect(role(['6', 'feet', 'conv', 'inch'])).toBe('conversion');
    expect(role(['1', '0', 'feet', 'conv', 'meter'])).toBe('conversion');
    expect(role(['3', 'feet', 'conv', 'meter'])).toBe('conversion');
    expect(role(['3', '0', 'decimal', '3', '0', 'conv', 'decimal'])).toBe('conversion');
    // No second line, no role.
    expect(role(['5'])).toBeUndefined();
    expect(role(['5', 'divide', '0', 'equals'])).toBeUndefined();
  });

  it('renders semantic result suffixes once and without a calculator-style trailing dot', () => {
    const grade = calculatorExpressionView(run([
      '6', 'inch', 'pitch', 'pitch', 'pitch',
    ]));
    expect(grade.valueText).toBe('50%');
    expect(grade.valueText).not.toMatch(/\.%|% grade.*% grade/);

    const gradeModifier = calculatorExpressionView(run([
      '6', 'inch', 'pitch', 'pitch', 'pitch', 'conv',
    ]));
    expect(gradeModifier.expressionText).toBe('50% grade');

    const velocity = calculatorExpressionView(run([
      '0', 'decimal', '0', '4', '9', 'conv', '0', 'conv',
    ]));
    expect(velocity.expressionText).toBe('≈886.5445 FPM');
    expect(velocity.expressionText).not.toContain('. FPM');
  });

  it('advertises a valid Fan Law path even when A, B, and C cannot form a triangle', () => {
    const state = run([
      '1', '0', 'conv', '4',
      '2', '0', 'conv', '7',
      '5', 'conv', '5',
      '1', '0', '0', 'conv', '6',
    ]);
    const guidance = calculatorExpressionView(state).guidanceText;
    expect(guidance).toContain('choose Fan Law 1, 2, or 3');
    expect(guidance).toContain('must form a valid triangle');
  });

  it('does not promise Law of Cosines when A, B, or C contains an HVAC field value', () => {
    const state = run([
      '0', 'decimal', '0', '9', 'conv', '0',
      'conv', '4', 'conv', '5', 'conv', '6', 'on',
    ]);
    const guidance = calculatorExpressionView(state).guidanceText;
    expect(guidance).toContain('include an HVAC field value');
    expect(guidance).toContain('Replace it with a length or bare number');
    expect(guidance).not.toContain('A, B, and C are ready');
  });

  it('does not present a special result as a named answer while it is the right operand', () => {
    const view = calculatorExpressionView(run(['2', 'feet', 'add', '6', 'circ']));
    expect(view).toMatchObject({
      mode: 'entry',
      contextText: 'Expression',
      expressionText: '2′ + 6″',
      valueLabel: undefined,
      progressText: undefined,
      guidanceText: 'Tap = to calculate, or choose another operator to continue.',
    });
  });

  it('keeps storage overlays distinct from colliding HVAC result labels', () => {
    const offset = run([
      '1', '0', 'feet', 'run',
      '5', 'feet', 'rise',
      '7', 'feet', 'conv', '4',
      'conv', 'left',
    ]);
    expect(calculatorExpressionView(run(['conv', '4'], offset))).toMatchObject({
      contextText: 'Stored values',
      valueLabel: 'Stored in register A',
      progressText: undefined,
    });
  });

  it('does not let percent entry mode leak into stored or calculated results', () => {
    const percent = ['5', '0', 'conv', 'add'] as KeyId[];
    for (const suffix of [
      ['mplus'],
      ['conv', '1'],
      ['conv', '4'],
    ] as KeyId[][]) {
      expect(calculatorExpressionView(run([...percent, ...suffix])).valueText).not.toContain('%');
    }

    const fan = calculatorExpressionView(run([
      '5', '0', 'conv', 'add', 'conv', '4',
      '1', '0', '0', 'conv', '7',
      '2', '5', 'conv', '5',
      'conv', 'run',
    ]));
    expect(fan.valueText).toContain('RPM');
    expect(fan.valueText).not.toContain('%');
  });

  it('warns before an unavailable irregular-pitch recall instead of promising success', () => {
    expect(calculatorExpressionView(run(['recall', 'conv']))).toMatchObject({
      guidanceTone: 'warning',
      guidanceText: 'No irregular pitch is stored. Tap On/C, enter an irregular pitch, then tap Conv + Hip/V to store it.',
    });

    const stored = run(['8', 'inch', 'conv', 'hip', 'on', 'recall', 'conv']);
    expect(calculatorExpressionView(stored)).toMatchObject({
      guidanceTone: 'next',
      guidanceText: 'Tap Hip/V to recall the stored irregular pitch.',
    });
  });

  it('never relabels an HVAC result as another tool while Conv is active', () => {
    const offset = run([
      '1', '0', 'feet', 'run',
      '5', 'feet', 'rise',
      '7', 'feet', 'conv', '4',
      'conv', 'left', 'conv',
    ]);
    expect(calculatorExpressionView(offset)).toMatchObject({
      mode: 'entry',
      contextText: 'Convert mode',
      valueLabel: undefined,
      progressText: undefined,
      guidanceText: 'Choose a key to use its yellow function.',
    });
  });

  it('does not promise Law of Cosines for invalid stored sides', () => {
    const invalid = calculatorExpressionView(run([
      '3', 'conv', 'subtract', 'conv', '4',
      '4', 'conv', 'subtract', 'conv', '5',
      '5', 'conv', 'subtract', 'conv', '6',
    ]));
    expect(invalid.guidanceText).toBe(
      'A, B, and C are stored, but they must be positive sides that form a valid triangle before using Conv + 9.',
    );
    expect(invalid.guidanceTone).toBe('warning');

    const fieldValue = calculatorExpressionView(run([
      '1', '0', '0', 'conv', '0', 'conv', 'subtract', 'conv', '4',
      '4', 'conv', 'subtract', 'conv', '5',
      '5', 'conv', 'subtract', 'conv', '6',
    ]));
    expect(fieldValue.guidanceText).toContain('Replace it with a length or bare number');
    expect(fieldValue.guidanceTone).toBe('warning');
  });

  it('names the exact next key for segment and stored-pitch workflows', () => {
    expect(calculatorExpressionView(run([
      '1', '0', 'feet', 'conv', 'pitch', '3', 'feet', 'run',
    ])).guidanceText).toBe(
      'Radius and chord are ready. Tap Rise to calculate the segment rise.',
    );
    expect(calculatorExpressionView(run([
      '1', '0', 'feet', 'conv', 'pitch', '3', 'feet', 'rise',
    ])).guidanceText).toBe(
      'Radius and rise are ready. Tap Run to calculate the segment chord.',
    );
    expect(calculatorExpressionView(run([
      '7', 'inch', 'pitch', 'on', 'on', '4', 'feet', 'run',
    ])).guidanceText).toBe(
      'Run and stored Pitch are ready. Tap Rise or Diagonal to solve the triangle, or use Hip/V, Jack, or Stair.',
    );
    expect(calculatorExpressionView(run([
      '3', 'feet', 'run', '1', '0', 'feet', 'conv', 'pitch',
    ])).guidanceText).toBe(
      'Radius and chord are ready. Tap Rise to calculate the segment rise.',
    );

    const segmentRise = run([
      '1', '0', 'feet', 'conv', 'pitch', '3', 'feet', 'run', 'rise',
    ]);
    expect(calculatorExpressionView(segmentRise).guidanceText).toBe(
      'Segment rise is calculated. Tap Run to show the matching chord, or enter a new value.',
    );
    const segmentChord = run([
      '1', '0', 'feet', 'conv', 'pitch', '3', 'feet', 'rise', 'run',
    ]);
    expect(calculatorExpressionView(segmentChord).guidanceText).toBe(
      'Segment chord is calculated. Tap Rise to show the matching segment rise, or enter a new value.',
    );
  });

  it('distinguishes memory storage from recall in the named equation', () => {
    const stored = run(['4', '2', 'conv', '1']);
    expect(calculatorExpressionView(stored)).toMatchObject({
      contextText: 'Memory',
      valueLabel: 'Stored in M1',
    });

    const recalled = run(['on', 'recall', '1'], stored);
    expect(calculatorExpressionView(recalled)).toMatchObject({
      contextText: 'Memory',
      valueLabel: 'Recalled M1',
    });

    const cleared = run(['0', 'conv', '1'], recalled);
    expect(calculatorExpressionView(cleared)).toMatchObject({
      contextText: 'Memory',
      valueLabel: 'Cleared M1',
    });

    const empty = run(['on', 'recall', '1'], cleared);
    expect(calculatorExpressionView(empty)).toMatchObject({
      contextText: 'Memory',
      valueLabel: 'M1 is empty',
      valueText: 'Recall returns 0',
      valueSymbol: undefined,
    });

    const running = run(['5', 'mplus']);
    const recalledAndCleared = run(['recall', 'recall'], running);
    expect(calculatorExpressionView(recalledAndCleared)).toMatchObject({
      contextText: 'Memory',
      valueLabel: 'Recalled and cleared running memory',
      valueText: '5',
    });
  });

  it('keeps the KPA result precision shown by the engine', () => {
    expect(calculatorExpressionView(run([
      '5', '0', '0', 'conv', '0', '0', '0', '0',
    ]))).toMatchObject({
      contextText: 'Air velocity / pressure',
      expressionText: '≈147928.99 Pa',
      valueLabel: 'Velocity pressure',
      progressText: '4 of 5',
      ariaText: 'Air velocity / pressure. Velocity pressure approximately 147928.99 Pa. 4 of 5. Tap VP/FPM / 0 to show Original entry.',
    });
  });

  it('keeps a failed formula visible and explains the error in plain language', () => {
    expect(calculatorExpressionView(run(['1', 'divide', '0', 'equals']))).toMatchObject({
      expressionText: '1 ÷ 0',
      resultText: 'Cannot divide by zero',
      contextText: 'Check entry',
    });

    expect(calculatorExpressionView(run(['1', '9', 'sqrt', 'meter']))).toMatchObject({
      expressionText: '√(19)',
      resultText: 'Complete the entry',
      resultSymbol: undefined,
    });

    expect(calculatorExpressionView(run(['9', 'conv', 'subtract', 'sqrt']))).toMatchObject({
      expressionText: '√(−9)',
      resultText: 'Square root needs a nonnegative value',
      resultSymbol: undefined,
    });

    expect(calculatorExpressionView(run(['9', '0', 'tan']))).toMatchObject({
      expressionText: 'tan(90)',
      resultText: 'Check the angle',
      resultSymbol: undefined,
    });

    expect(calculatorExpressionView(run(['0', 'conv', 'divide']))).toMatchObject({
      expressionText: '1 ÷ (0)',
      resultText: 'Cannot divide by zero',
      resultSymbol: undefined,
    });

    const completed = run(['2', 'add', '3', 'equals']);
    expect(calculatorExpressionView(run(['conv', 'left'], completed))).toMatchObject({
      expressionText: '2 + 3',
      resultText: 'Offset needs valid inputs',
      resultSymbol: undefined,
    });
  });

  it('retains the entered exponent and formats the scientific result unambiguously', () => {
    expect(calculatorExpressionView(run(['2', 'sqrt', 'conv', 'fraction', '3'])))
      .toMatchObject({
        contextText: 'Expression',
        expressionText: '√(2) × 10^3',
        resultText: undefined,
        entryActive: true,
      });
    expect(calculatorExpressionView(run(['8', 'conv', 'fraction', '1', '4', 'equals'])))
      .toMatchObject({
        expressionText: '8 × 10^14',
        resultText: '8.00000 × 10^14',
      });

    expect(calculatorExpressionView(run(['2', 'sqrt', 'conv', 'fraction', '3', 'equals'])))
      .toMatchObject({
        expressionText: '√(2) × 10^3',
        resultText: '1414.214',
      });
  });

  it('keeps a symbolic scientific source visible when a unit is assigned', () => {
    expect(calculatorExpressionView(run([
      '2', 'sqrt', 'conv', 'fraction', '3', 'meter',
    ]))).toMatchObject({
      expressionText: '√(2) × 10^3 m',
      contextText: 'Expression',
      entryActive: true,
    });

    expect(calculatorExpressionView(run([
      '1', 'divide', '3', 'equals',
      'conv', 'fraction', '3', 'meter',
      'multiply', '2', 'equals',
    ]))).toMatchObject({
      expressionText: '(1 ÷ 3) × 10^3 m × 2',
      resultText: '666.667 m',
      resultSymbol: '≈',
    });

    expect(calculatorExpressionView(run([
      '8', 'feet', '2', 'feet',
      'conv', 'fraction', '2', 'equals',
    ]))).toMatchObject({
      expressionText: '(8′ + 2′) × 10^2',
      resultText: '1000′ 0″',
    });

    expect(calculatorExpressionView(run([
      '8', 'conv', 'subtract', 'feet', '2', 'inch',
      'conv', 'fraction', '2', 'equals',
    ]))).toMatchObject({
      expressionText: '(−8′ + 2″) × 10^2',
      resultText: '−783′ 4″',
    });
  });

  it('removes only the assigned unit when Backspace follows scientific entry', () => {
    const restored = run(['8', 'conv', 'fraction', '3', 'feet', 'backspace']);
    expect(calculatorExpressionView(restored)).toMatchObject({
      expressionText: '8 × 10^3',
      contextText: 'Expression',
      entryActive: true,
    });
    expect(calculatorExpressionView(run(['add', '1', 'equals'], restored))).toMatchObject({
      expressionText: '8 × 10^3 + 1',
      resultText: '8001',
    });
  });

  it('never silently discards an invalid scientific exponent or its percent sign', () => {
    expect(calculatorExpressionView(run(['8', 'conv', 'fraction', 'pi']))).toMatchObject({
      expressionText: '8 × 10^π',
      resultText: 'Check the exponent',
      contextText: 'Check entry',
    });

    const percent = run([
      '8', 'conv', 'fraction', '3', 'conv', 'add',
    ]);
    expect(calculatorExpressionView(percent)).toMatchObject({
      expressionText: '(8 × 10^3)%',
      resultText: undefined,
    });
    expect(calculatorExpressionView(run(['equals'], percent))).toMatchObject({
      expressionText: '(8 × 10^3)%',
      resultText: '80',
    });

    const fractionalExponent = calculatorExpressionView(run([
      '9', 'conv', 'fraction', '5', 'fraction',
    ]));
    expect(fractionalExponent).toMatchObject({
      expressionText: '9 × 10^5',
      resultText: 'Check the exponent',
    });
    expect(fractionalExponent.expressionText).not.toContain('/');
  });

  it('never lets HVAC result keys hide an unfinished scientific exponent', () => {
    const pitchAfterStoredSides = calculatorExpressionView(run([
      '3', 'run', '4', 'rise', 'conv', 'fraction', 'pitch',
    ]));
    expect(pitchAfterStoredSides).toMatchObject({
      expressionText: '4″ × 10^…',
      resultText: 'Check the exponent',
      contextText: 'Pitch — check entry',
    });

    const pitchAfterTrig = calculatorExpressionView(run([
      '4', 'tan', 'conv', 'fraction', 'pitch',
    ]));
    expect(pitchAfterTrig).toMatchObject({
      expressionText: 'tan(4) × 10^…',
      resultText: 'Check the exponent',
      contextText: 'Pitch — check entry',
    });

    const hvacKeys: KeyId[][] = [
      ['run'],
      ['circ'],
      ['jack'],
      ['hip'],
      ['stair'],
      ['conv', 'pitch'],
      ['conv', 'circ'],
      ['conv', 'run'],
      ['conv', 'left'],
      ['conv', '9'],
      ['conv', 'jack'],
      ['conv', 'right'],
      ['conv', '0'],
    ];

    for (const keys of hvacKeys) {
      expect(calculatorExpressionView(run([
        '4', 'conv', 'fraction', ...keys,
      ]))).toMatchObject({
        expressionText: '4 × 10^…',
        resultText: 'Check the exponent',
        contextText: expect.stringMatching(/check entry$/),
      });
    }

    expect(calculatorExpressionView(run([
      '4', 'conv', 'fraction', 'conv', 'pi',
    ]))).toMatchObject({
      expressionText: '4 × 10^π',
      resultText: 'Check the exponent',
      contextText: 'Check entry',
    });

    for (const preferenceKeys of [
      ['recall', 'equals'],
      ['conv', 'equals'],
    ] satisfies KeyId[][]) {
      const unfinished = run([
        '8', 'conv', 'fraction', ...preferenceKeys,
      ]);
      expect(calculatorExpressionView(unfinished)).toMatchObject({
        expressionText: '8 × 10^…',
        resultText: 'Check the exponent',
        contextText: 'Check entry',
      });
      expect(unfinished.preferenceMode).toBeUndefined();
      expect(unfinished.exponentBase).toBeDefined();
    }
  });

  it('translates legacy overflow and offset errors into plain language', () => {
    expect(calculatorExpressionView(run([
      '9', 'conv', 'fraction', '9', '9', 'conv', 'square', 'square',
    ]))).toMatchObject({
      expressionText: '((9 × 10^99)³)²',
      resultText: 'Result exceeds the calculator range',
    });

    expect(calculatorExpressionView(run([
      '1', 'run', '1', 'rise', '2', 'conv', '4', 'conv', 'left',
    ]))).toMatchObject({
      resultText: 'Check the offset geometry',
    });
  });

  it('lets Backspace edit and then cancel scientific exponent entry', () => {
    const oneDigit = run(['8', 'conv', 'fraction', '3']);
    const blankExponent = run(['backspace'], oneDigit);
    expect(calculatorExpressionView(blankExponent)).toMatchObject({
      expressionText: '8 × 10^…',
      contextText: 'Expression',
      entryActive: true,
    });
    const cancelled = run(['backspace'], blankExponent);
    expect(calculatorExpressionView(cancelled)).toMatchObject({
      expressionText: '8',
      entryActive: true,
    });
    expect(cancelled.exponentBase).toBeUndefined();
  });

  it('keeps an inert Backspace after a completed powered unit fully inert', () => {
    const squared = run(['8', 'feet', 'square']);
    const first = run(['backspace'], squared);
    const second = run(['backspace'], first);

    expect(first).toBe(squared);
    expect(second).toBe(squared);
    expect(calculatorExpressionView(second)).toMatchObject({
      expressionText: '(8′)²',
      resultText: '64 ft²',
    });
  });

  it('keeps a completed formula on repeated Equals and labels preference review correctly', () => {
    const completed = run(['2', 'add', '3', 'equals']);
    expect(calculatorExpressionView(run(['equals'], completed))).toMatchObject({
      expressionText: '2 + 3',
      resultText: '5',
    });
    expect(calculatorExpressionView(run(['conv', 'equals'], completed)).contextText)
      .toBe('Preference 1 of 13 · Fraction resolution');
  });

  it('does not leave a stale CONV label when conversion mode is toggled off', () => {
    const completed = run(['2', 'add', '3', 'equals']);
    const toggledOff = run(['conv', 'conv'], completed);
    expect(toggledOff.modifier).toBeUndefined();
    expect(calculatorExpressionView(toggledOff)).toMatchObject({
      contextText: 'Expression',
      expressionText: '2 + 3',
      resultText: '5',
    });
  });

  it('shows recalled positive and negative scientific exponents before and after Equals', () => {
    const positive = run(['3', 'conv', '1', 'on']);
    const positiveEntry = run(['8', 'conv', 'fraction', 'recall', '1'], positive);
    expect(calculatorExpressionView(positiveEntry).expressionText).toBe('8 × 10^3');
    expect(calculatorExpressionView(run(['equals'], positiveEntry))).toMatchObject({
      expressionText: '8 × 10^3',
      resultText: '8000',
    });

    const negative = run(['3', 'conv', 'subtract', 'conv', '1', 'on']);
    const negativeEntry = run(['8', 'conv', 'fraction', 'recall', '1'], negative);
    expect(calculatorExpressionView(negativeEntry).expressionText).toBe('8 × 10^−3');
    const negativeResult = calculatorExpressionView(run(['equals'], negativeEntry));
    expect(negativeResult).toMatchObject({
      expressionText: '8 × 10^−3',
      resultText: '0.008',
    });
    expect(negativeResult.ariaText).toContain('ten to the power of minus 3');
  });

  it('replaces repeated operators and visibly closes omitted parentheses on Equals', () => {
    expect(expression(['2', 'add', 'subtract'])).toBe('2 −');
    expect(calculatorExpressionView(run([
      '2', 'multiply', 'left', '3', 'add', '4', 'equals',
    ]))).toMatchObject({ expressionText: '2 × (3 + 4)', resultText: '14' });
  });

  it('keeps a rounded parenthesized source truthful through conversion and reuse', () => {
    const metric = run([
      'left', '1', 'meter', 'divide', '3', 'right', 'conv', 'meter', 'square',
    ]);
    expect(calculatorExpressionView(metric)).toMatchObject({
      expressionText: '(1 m ÷ 3)²',
      resultText: '111111.1111 mm²',
      resultSymbol: '≈',
    });

    const angle = run([
      'left', '1', 'divide', '7', 'right', 'conv', 'decimal',
      'multiply', '7', 'equals',
    ]);
    expect(calculatorExpressionView(angle)).toMatchObject({
      expressionText: '(1 ÷ 7)° × 7',
      resultText: '1° 00′ 00″',
    });
  });

  it('composes symbolic, scientific, conversion, and percent notation without dropping terms', () => {
    const converted = run([
      '1', 'divide', '3', 'equals', 'conv', 'fraction', '3', 'conv', 'decimal',
    ]);
    expect(calculatorExpressionView(converted)).toMatchObject({
      expressionText: '(1 ÷ 3) × 10^3 →',
      resultText: '333° 20′ 00″',
    });

    expect(calculatorExpressionView(run(['multiply', '3', 'equals'], converted)))
      .toMatchObject({
        expressionText: '((1 ÷ 3) × 10^3)° × 3',
        resultText: '1000° 00′ 00″',
      });
    expect(calculatorExpressionView(run(['sin'], converted)).expressionText)
      .toContain('(1 ÷ 3) × 10^3');

    expect(calculatorExpressionView(run([
      '1', 'divide', '3', 'equals', 'conv', 'add', 'multiply', '3', 'equals',
    ]))).toMatchObject({ expressionText: '(1 ÷ 3)% × 3', resultText: '0.01' });
    expect(calculatorExpressionView(run([
      '1', 'divide', '3', 'equals', 'conv', 'fraction', '3',
      'conv', 'add', 'multiply', '3', 'equals',
    ]))).toMatchObject({
      expressionText: '((1 ÷ 3) × 10^3)% × 3',
      resultText: '10',
    });
  });

  it('preserves constants and sign changes as symbolic conversion sources', () => {
    expect(calculatorExpressionView(run(['pi', 'conv', 'decimal'])).expressionText).toBe('π →');
    expect(calculatorExpressionView(run(['conv', 'pi', 'conv', 'decimal'])).expressionText)
      .toBe('π ÷ 180 →');
    expect(calculatorExpressionView(run([
      '1', 'inch', 'divide', '3', 'equals', 'conv', 'subtract', 'conv', 'meter',
    ])).expressionText).toBe('−(1″ ÷ 3) →');
  });

  it('recomputes provenance when preferences reformat the current result', () => {
    let state = run(['1', 'fraction', '8', 'equals']);
    state = calculatorReducer(state, {
      type: 'set-preference',
      key: 'fractionDenominator',
      value: 2,
    });
    state = calculatorReducer(state, {
      type: 'set-preference',
      key: 'constantFraction',
      value: true,
    });
    expect(calculatorExpressionView(state)).toMatchObject({
      expressionText: '1/8″',
      resultText: '0″',
      resultSymbol: '≈',
    });
    expect(calculatorExpressionView(run(['add', '1', 'inch', 'equals'], state)))
      .toMatchObject({ expressionText: '1/8″ + 1″', resultSymbol: '≈' });
  });

  it('does not classify rounded large values as exact', () => {
    const large = run([
      '1', 'conv', 'fraction', '1', '5', 'equals', 'add', '1', 'equals',
    ]);
    expect(large.currentDisplayMetadata?.exactness).toBe('approximate');
    expect(calculatorExpressionView(run(['subtract', '1', 'equals'], large)).expressionText)
      .toBe('(1 × 10^15 + 1) − 1');

    const beyondSafeDisplay = run([
      '1', 'conv', 'fraction', '1', '6', 'equals', 'add', '2', 'equals',
    ]);
    expect(beyondSafeDisplay.currentDisplayMetadata?.exactness).toBe('approximate');
    expect(calculatorExpressionView(beyondSafeDisplay).resultSymbol).toBe('≈');
  });

  it('marks the equation approximate when a visible operand was rounded', () => {
    const recalled = run([
      '1', 'divide', '3', 'equals', 'conv', '1', 'on',
      'recall', '1', 'multiply', '3', 'equals',
    ]);
    expect(calculatorExpressionView(recalled)).toMatchObject({
      expressionText: '≈0.333333 × 3',
      resultText: '1',
      resultSymbol: '≈',
      ariaText: 'approximately 0.333333 times 3 approximately 1. Continue with an operator, conversion, or new calculation.',
    });
  });

  it('marks a rounded recalled exponent before rejecting the hidden non-integer', () => {
    const stored = initialCalculatorState();
    stored.memory.m1 = { amount: 0.9999996, power: 0, unit: 'auto', system: 'neutral' };
    const exponent = run(['8', 'conv', 'fraction', 'recall', '1'], stored);
    expect(calculatorExpressionView(exponent).expressionText).toBe('8 × 10^≈1');
    expect(calculatorExpressionView(run(['equals'], exponent))).toMatchObject({
      expressionText: '8 × 10^≈1',
      resultText: 'Check the exponent',
    });
  });

  it('keeps pending decimal and fractional inch components mathematically unambiguous', () => {
    expect(expression([
      'decimal', '1', 'inch', '1', 'fraction', '3',
    ])).toBe('0.1″ + 1/3″');
    expect(expression([
      '1', 'fraction', '2', 'inch', '1', 'fraction', '4',
    ])).toBe('1/2″ + 1/4″');
    expect(calculatorExpressionView(run([
      'decimal', '1', 'inch', '1', 'fraction', '3', 'square',
    ])).expressionText).toBe('(0.1″ + 1/3″)²');
  });

  it('keeps the complete source visible through scientific unit conversion and power cycling', () => {
    expect(calculatorExpressionView(run([
      '8', 'feet', 'conv', 'fraction', '2', 'meter',
    ]))).toMatchObject({
      expressionText: '8′ × 10^2 →',
      resultText: '243.840 m',
      contextText: 'Conversion',
    });

    const squared = run(['2', 'sqrt', 'conv', 'fraction', '3', 'meter', 'meter']);
    expect(calculatorExpressionView(squared)).toMatchObject({
      expressionText: '√(2) × 10^3 m²',
      resultSymbol: undefined,
    });
    expect(calculatorExpressionView(run(['backspace'], squared)).expressionText)
      .toBe('√(2) × 10^3 m');

    expect(calculatorExpressionView(run([
      '8', 'conv', 'fraction', '3', 'conv', 'meter',
    ])).expressionText).toBe('8 × 10^3 mm');
  });

  it('restores exact fractional metric entries after unit power edits', () => {
    const meter = run(['1', 'fraction', '3', 'meter']);
    expect(calculatorExpressionView(meter).expressionText).toBe('1/3 m');
    expect(calculatorExpressionView(run(['backspace'], meter)).expressionText).toBe('1/3″');

    const volume = run(['1', 'fraction', '3', 'meter', 'meter', 'meter']);
    expect(calculatorExpressionView(volume).expressionText).toBe('1/3 m³');
    const cycled = run(['meter'], volume);
    expect(calculatorExpressionView(cycled).expressionText).toBe('1/3 m');
    const restored = run(['backspace'], cycled);
    expect(calculatorExpressionView(restored).expressionText).toBe('1/3″');
    expect(calculatorExpressionView(run(['multiply', '3', 'equals'], restored)))
      .toMatchObject({ expressionText: '1/3″ × 3', resultText: '1″' });
  });

  it('labels an evaluated inner group without claiming the whole formula equals that group', () => {
    expect(calculatorExpressionView(run([
      '2', 'multiply', 'left', '3', 'add', '4', 'right',
    ]))).toMatchObject({
      contextText: 'Current group',
      expressionText: '2 × (3 + 4)',
      resultText: '7',
      resultSymbol: undefined,
      ariaText: '2 times (3 plus 4). Current group 7. Continue with an operator or tap =.',
    });
  });

  it('normalizes improper DMS everywhere a committed operand is shown', () => {
    expect(calculatorExpressionView(run([
      'left', '3', '0', 'decimal', '8', '9', 'decimal', '0', 'right',
    ])).expressionText).toBe('(31° 29′ 00″)');
    expect(calculatorExpressionView(run([
      '3', '0', 'decimal', '8', '9', 'decimal', '0', 'sin',
    ])).expressionText).toBe('sin(31° 29′ 00″)');
  });

  it('does not reinterpret or hide a decimal inch draft as DMS', () => {
    const inches = run(['8', 'feet', '2', 'decimal', '3', 'decimal', '4']);
    expect(calculatorExpressionView(inches).expressionText).toBe('8′ 2.34″');
    expect(calculatorExpressionView(run(['multiply', '2', 'equals'], inches)))
      .toMatchObject({ expressionText: '8′ 2.34″ × 2', resultText: '16′ 4 11/16″' });
  });

  it('keeps mixed direct unit components as an explicit convertible sum', () => {
    const mixed = run(['8', 'feet', '2', 'meter']);
    expect(calculatorExpressionView(mixed)).toMatchObject({
      expressionText: '(8′ + 2 m)',
      contextText: 'Expression',
    });
    expect(calculatorExpressionView(run(['multiply', '1', 'equals'], mixed)).expressionText)
      .toBe('(8′ + 2 m) × 1');

    const restored = run(['backspace'], mixed);
    expect(calculatorExpressionView(restored).expressionText).toBe('8′ 2″');
    expect(calculatorExpressionView(run(['on', 'backspace'], mixed)).expressionText).toBe('0');
  });

  it('keeps approximate HVAC and geometry outputs visibly approximate', () => {
    const approximate = run([
      '1', 'add', '1', 'conv', 'fraction', '1', '6', 'conv', 'subtract', 'equals',
    ]);
    const velocity = run(['conv', '0'], approximate);
    expect(calculatorExpressionView(velocity)).toMatchObject({
      expressionText: '≈4005 FPM',
      progressText: '1 of 5',
      ariaText: 'Air velocity / pressure. Air velocity approximately 4005 FPM. 1 of 5. Tap VP/FPM / 0 to show Velocity pressure.',
    });
    expect(calculatorExpressionView(run(['multiply', '1', 'equals'], velocity)).resultSymbol)
      .toBe('≈');

    const circle = run([
      '1', 'inch', 'add',
      '1', 'conv', 'fraction', '1', '6', 'conv', 'subtract', 'inch', 'equals',
      'circ',
    ]);
    expect(circle.current?.approximate).toBe(true);
    expect(calculatorExpressionView(run(['multiply', '1', 'equals'], circle)).resultSymbol)
      .toBe('≈');
  });

  it('retains approximation when stored field preferences are recalled', () => {
    const stored = initialCalculatorState();
    stored.permanentPitchSlope = 1 / 12;
    stored.permanentPitchApproximate = true;
    stored.irregularPitchSlope = 1 / 12;
    stored.irregularPitchApproximate = true;
    stored.preferences.onCenter = 16;
    stored.onCenterApproximate = true;
    stored.preferences.desiredRiser = 8;
    stored.desiredRiserApproximate = true;

    for (const key of ['pitch', 'hip', 'jack', 'stair'] as const) {
      const recalled = run(['recall', key], stored);
      expect(recalled.current?.approximate).toBe(true);
      expect(calculatorExpressionView(run(['multiply', '1', 'equals'], recalled)).resultSymbol)
        .toBe('≈');
    }
  });

  it('uses only one grouping layer when an approximate formula becomes an angle', () => {
    const angle = run([
      '1', 'add', '1', 'conv', 'fraction', '1', '6', 'conv', 'subtract', 'equals',
      'conv', 'decimal', 'multiply', '1', 'equals',
    ]);
    expect(calculatorExpressionView(angle).expressionText)
      .toBe('(1 + 1 × 10^−16)° × 1');
  });

  it('never prints exact equality after precision is lost or saturated', () => {
    const beyondIntegerPrecision = run([
      '1', 'conv', 'fraction', '1', '6', 'equals', 'add', '1', 'equals',
    ]);
    expect(calculatorExpressionView(beyondIntegerPrecision).resultSymbol).toBe('≈');

    const tinyAdded = run([
      '1', 'add', '1', 'conv', 'fraction', '1', '6', 'conv', 'subtract', 'equals',
    ]);
    expect(calculatorExpressionView(tinyAdded).resultSymbol).toBe('≈');
    expect(calculatorExpressionView(run(['subtract', '1', 'equals'], tinyAdded)).resultSymbol)
      .toBe('≈');

    expect(calculatorExpressionView(run([
      '1', 'conv', 'fraction', '9', '9', 'conv', 'subtract', 'equals',
      'square', 'square',
    ])).resultSymbol).toBe('≈');
    expect(calculatorExpressionView(run([
      '1', 'conv', 'fraction', '9', '9', 'conv', 'subtract', 'equals', 'cos',
    ])).resultSymbol).toBe('≈');
    expect(calculatorExpressionView(run([
      '1', 'conv', 'fraction', '9', '9', 'equals', 'conv', 'tan',
    ])).resultSymbol).toBe('≈');

    expect(calculatorExpressionView(run(['1', '8', '0', 'sin'])).resultSymbol).toBe('=');
    expect(calculatorExpressionView(run(['3', '6', '0', 'cos'])).resultSymbol).toBe('=');
  });

  it('propagates approximation through percent and reciprocal operations', () => {
    const approximate = run([
      '1', 'add', '1', 'conv', 'fraction', '1', '6', 'conv', 'subtract', 'equals',
    ]);
    expect(calculatorExpressionView(run([
      'conv', 'add', 'multiply', '1', '0', '0', 'equals',
    ], approximate)).resultSymbol).toBe('≈');
    expect(calculatorExpressionView(run(['conv', 'divide'], approximate)).resultSymbol)
      .toBe('≈');
  });

  it('parses fractions and exponents as typographic groups', () => {
    expect(splitExpressionText('8′ 2 3/8″ + 1.25e-9')).toEqual([
      '8′ 2 ',
      { numerator: '3', denominator: '8' },
      '″ + 1.25',
      { exponent: '−9' },
    ]);
    expect(splitExpressionText('3/…″ × 10^3')).toEqual([
      { numerator: '3', denominator: '…' },
      '″ × 10',
      { exponent: '3' },
    ]);
    expect(splitExpressionText('8 × 10^≈−1')).toEqual([
      '8 × 10',
      { exponent: '≈−1' },
    ]);
  });

  it('keeps semantic HVAC units through memory, recall, and arithmetic reuse', () => {
    const cases: Array<{ keys: KeyId[]; operand: RegExp; stored: RegExp }> = [
      {
        keys: ['6', 'inch', 'pitch', 'pitch', 'pitch'],
        operand: /50 \[% grade\] \+$/,
        stored: /50% grade/,
      },
      {
        keys: [
          '1', '2', '5', '0', 'conv', '4',
          '1', '4', '0', '0', 'conv', '7',
          '7', '5', '0', 'conv', '5',
          'conv', 'run',
        ],
        operand: /840 RPM \+$/,
        stored: /840 RPM/,
      },
      {
        keys: ['5', '0', '0', 'conv', '0', '0'],
        operand: /in\. w\.g\. \+$/,
        stored: /in\. w\.g\./,
      },
    ];

    for (const sample of cases) {
      const stored = run(['conv', '1'], run(sample.keys));
      expect(calculatorExpressionView(stored).valueText).toMatch(sample.stored);
      const recalled = run(['on', 'recall', '1'], stored);
      expect(calculatorExpressionView(run(['add'], recalled)).expressionText)
        .toMatch(sample.operand);
    }
  });

  it('shows empty shared registers without a false equality', () => {
    expect(calculatorExpressionView(run(['recall', '4']))).toMatchObject({
      contextText: 'Stored values',
      valueLabel: 'Register A is empty',
      valueText: 'Recall returns 0',
      valueSymbol: undefined,
    });

    expect(calculatorExpressionView(run(['recall', 'recall']))).toMatchObject({
      valueLabel: 'Running memory was empty',
      valueText: 'Recall returns 0',
      valueSymbol: undefined,
    });

    expect(calculatorExpressionView(run(['4', '2', 'conv', 'recall']))).toMatchObject({
      valueLabel: 'Previous running memory was empty',
      valueText: 'Swap returns 0',
      valueSymbol: undefined,
    });
  });

  it('distinguishes storing from recalling field settings', () => {
    const storedJack = run(['1', '6', 'inch', 'jack']);
    expect(calculatorExpressionView(storedJack)).toMatchObject({
      contextText: 'Jack settings',
      valueLabel: 'Stored on-center spacing',
    });
    expect(calculatorExpressionView(run(['on', 'recall', 'jack'], storedJack))).toMatchObject({
      contextText: 'Jack settings',
      valueLabel: 'Recalled on-center spacing',
    });

    const storedRiser = run(['7', 'decimal', '5', 'inch', 'conv', 'stair']);
    expect(calculatorExpressionView(storedRiser)).toMatchObject({
      contextText: 'Stair settings',
      valueLabel: 'Stored desired riser height',
    });
    expect(calculatorExpressionView(run(['on', 'recall', 'stair'], storedRiser))).toMatchObject({
      contextText: 'Stair settings',
      valueLabel: 'Recalled desired riser height',
    });
  });

  it('warns instead of advertising impossible triangle and segment solves', () => {
    expect(calculatorExpressionView(run([
      '3', 'conv', 'subtract', 'run', '4', 'rise',
    ]))).toMatchObject({
      guidanceTone: 'warning',
      guidanceText: expect.stringContaining('positive'),
    });
    expect(calculatorExpressionView(run(['5', 'run', '3', 'diag']))).toMatchObject({
      guidanceTone: 'warning',
      guidanceText: expect.stringContaining('incompatible'),
    });
    expect(calculatorExpressionView(run([
      '1', '0', 'feet', 'conv', 'pitch',
      '2', '5', 'feet', 'run',
    ]))).toMatchObject({
      guidanceTone: 'warning',
      guidanceText: expect.stringContaining('cannot exceed'),
    });
    expect(calculatorExpressionView(run([
      '1', '0', 'feet', 'conv', 'pitch',
      '2', '1', 'feet', 'rise',
    ]))).toMatchObject({
      guidanceTone: 'warning',
      guidanceText: expect.stringContaining('cannot exceed'),
    });
  });

  it('preserves Stair warnings through modifiers, conversions, and storage overlays', () => {
    const stair = run([
      '1', '0', 'feet', '1', 'inch', 'rise',
      '1', '5', 'feet', '5', 'inch', 'run',
      'stair',
    ]);
    expect(stair.display.note).toContain('more than 10%');
    for (const overlay of [
      ['conv'],
      ['recall'],
      ['feet'],
      ['mplus'],
      ['conv', '4'],
    ] as KeyId[][]) {
      expect(calculatorExpressionView(run(overlay, stair))).toMatchObject({
        guidanceTone: 'warning',
        guidanceText: expect.stringContaining('more than 10%'),
      });
    }
  });

  it('advances special cycles after converted-unit display overlays', () => {
    expect(run(['6', 'circ', 'conv', 'meter', 'circ']).display.label).toBe('CIRC');

    const jack = run([
      '7', 'inch', 'pitch', '4', 'feet', 'run',
      'jack', 'jack', 'conv', 'meter', 'jack',
    ]);
    expect(jack.display.label).toBe('JK2');
    expect(jack.preferences.onCenter).toBe(16);
    expect(jack.onCenterStored).toBe(false);
  });

  it('uses neutral physical and Trade names in special-key recovery', () => {
    const arc = calculatorReducer(initialCalculatorState(), {
      type: 'press-converted',
      key: 'circ',
    });
    expect(calculatorExpressionView(arc).guidanceText).toContain('Arc / Conv+Circ');

    const segment = calculatorReducer(initialCalculatorState(), {
      type: 'press-converted',
      key: 'pitch',
    });
    expect(calculatorExpressionView(segment).guidanceText).toContain('Seg Rad / Conv+Pitch');
  });

  it('explains unsupported Recall keys instead of blaming missing geometry', () => {
    expect(calculatorExpressionView(run(['recall', 'circ'])).guidanceText)
      .toContain('choose M+, M1, M2, M3, A');
    expect(calculatorExpressionView(run(['recall', 'conv', 'circ'])).guidanceText)
      .toContain('Hip/V recalls the stored irregular pitch');
  });

  it('keeps an unfinished outer group separate from its evaluated inner result', () => {
    expect(calculatorExpressionView(run([
      'left', '2', 'add', 'left', '3', 'multiply', '4', 'right',
    ]))).toMatchObject({
      contextText: 'Current group',
      expressionText: '(2 + (3 × 4)',
      resultText: '12',
      resultSymbol: undefined,
      guidanceText: 'Continue with an operator, close the outer group, or tap =.',
    });
  });

  it('names every preference and its position in the 13-screen review', () => {
    const tread = run(['conv', 'equals', 'equals', 'equals', 'equals']);
    expect(calculatorExpressionView(tread).contextText)
      .toBe('Preference 4 of 13 · Tread width');

    const floor = run(['equals', 'equals'], tread);
    expect(calculatorExpressionView(floor).contextText)
      .toBe('Preference 6 of 13 · Floor thickness');
  });
});
