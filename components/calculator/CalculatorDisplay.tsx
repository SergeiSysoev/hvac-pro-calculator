import type { CalculatorState } from '@/lib/calculator/engine';
import { calculatorExpressionView } from '@/lib/calculator/presentation';
import ExpressionText from '@/components/calculator/ExpressionText';

interface CalculatorDisplayProps {
  active: boolean;
  state: CalculatorState;
  variant?: 'physical' | 'trade';
}

function hasMemory(state: CalculatorState): boolean {
  return Boolean(state.memory.cumulative || state.memory.m1 || state.memory.m2 || state.memory.m3);
}

export function accessibleDisplayIndicators(state: CalculatorState): string[] {
  const indicators: string[] = [];
  if (hasMemory(state)) indicators.push('Memory contains a stored value');
  if (state.modifier === 'convert') indicators.push('Convert mode');
  if (state.modifier === 'recall') indicators.push('Recall mode');
  if (state.modifier === 'recall-convert') indicators.push('Recall convert mode');
  return indicators;
}

export function expressionSizeClass(text: string): string {
  const glyphCount = Array.from(text).length;
  if (glyphCount >= 38) return 'expression-text-small';
  if (glyphCount >= 24) return 'expression-text-medium';
  return '';
}

export default function CalculatorDisplay({
  active,
  state,
  variant = 'trade',
}: CalculatorDisplayProps) {
  const view = calculatorExpressionView(state);
  const modifier = state.modifier === 'convert'
    ? 'CONV'
    : state.modifier === 'recall-convert'
      ? 'RCL CONV'
      : state.modifier === 'recall'
      ? 'RCL'
      : '';
  const sizeClass = expressionSizeClass(view.expressionText);
  const accessibleDisplay = [
    view.ariaText,
    ...accessibleDisplayIndicators(state),
    state.display.note,
  ].filter(Boolean).join('. ');

  return (
    <div className="display-stack">
      <div
        className={`calc-display calc-display-${variant} ${state.display.label === 'ERROR' ? 'is-error' : ''}`}
        aria-hidden="true"
      >
        <div className="expression-meta" aria-hidden="true">
          <span>{view.contextText}</span>
          <span className="expression-indicators">
            {state.parenthesisDepth ? <b>{`(${state.parenthesisDepth}`}</b> : null}
            {hasMemory(state) ? <b>M</b> : null}
            {modifier ? <b>{modifier}</b> : null}
          </span>
        </div>
        <div className={`expression-line ${sizeClass} ${view.entryActive ? 'is-entering' : ''}`.trim()}>
          <ExpressionText className="expression-text" text={view.expressionText} />
          {view.entryActive ? <span className="expression-caret" aria-hidden="true" /> : null}
        </div>
        {view.resultText ? (
          <div className="expression-result" aria-hidden="true">
            {view.resultSymbol ? <span className="expression-result-symbol">{view.resultSymbol}</span> : null}
            <ExpressionText className="expression-result-text" text={view.resultText} />
          </div>
        ) : null}
      </div>
      <span
        className="visually-hidden"
        role={active ? 'status' : undefined}
        aria-live={active ? 'polite' : 'off'}
        aria-atomic="true"
        aria-hidden={active ? undefined : true}
      >
        {accessibleDisplay}
      </span>
      {state.display.note ? <p className="display-note">{state.display.note}</p> : null}
    </div>
  );
}
