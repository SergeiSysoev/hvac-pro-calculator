import type { CalculatorState } from '@/lib/calculator/engine';

interface CalculatorDisplayProps {
  active: boolean;
  state: CalculatorState;
}

function hasMemory(state: CalculatorState): boolean {
  return Boolean(state.memory.cumulative || state.memory.m1 || state.memory.m2 || state.memory.m3);
}

export default function CalculatorDisplay({ active, state }: CalculatorDisplayProps) {
  const modifier = state.modifier === 'convert'
    ? 'CONV'
    : state.modifier === 'recall'
      ? 'RCL'
      : '';

  return (
    <div className="display-stack">
      <div
        className={`calc-display ${state.display.label === 'ERROR' ? 'is-error' : ''}`}
        role={active ? 'status' : undefined}
        aria-live={active ? 'polite' : 'off'}
        aria-label={`${state.display.label} ${state.display.plainText}`.trim()}
      >
        <div className="display-status" aria-hidden="true">
          <span>{state.parenthesisDepth ? `(${state.parenthesisDepth}` : 'READY'}</span>
          <span>{hasMemory(state) ? 'M' : ''}</span>
          <span>{modifier}</span>
        </div>
        <span className="display-mode">{state.powered ? state.display.label : 'OFF'}</span>
        <span className="display-value">{state.powered ? state.display.valueText : ''}</span>
        <span className="display-unit">{state.powered ? state.display.unitText : ''}</span>
      </div>
      {state.display.note ? <p className="display-note">{state.display.note}</p> : null}
    </div>
  );
}
