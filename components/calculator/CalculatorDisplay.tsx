import type { CalculatorState } from '@/lib/calculator/engine';
import { calculatorExpressionView } from '@/lib/calculator/presentation';
import CalculatorDiagram from '@/components/calculator/CalculatorDiagram';
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
    view.liveText,
    ...accessibleDisplayIndicators(state),
  ].filter(Boolean).join('. ');
  const guidanceLabel = view.guidanceTone === 'error'
    ? 'Fix'
    : view.guidanceTone === 'warning'
      ? 'Note'
      : view.guidanceTone === 'next' ? 'Next' : 'Tip';
  const guidanceDescriptionId = `${variant}-calculator-guidance-description`;
  const diagramDescriptionId = `${variant}-calculator-diagram-description`;
  const descriptionIds = active
    ? [
        view.guidanceText ? guidanceDescriptionId : '',
        view.diagram ? diagramDescriptionId : '',
      ].filter(Boolean).join(' ') || undefined
    : undefined;

  return (
    <div
      className="display-stack"
      role={active ? 'group' : undefined}
      aria-label={active ? 'Calculator display' : undefined}
      aria-describedby={descriptionIds}
    >
      <div
        className={`calc-display calc-display-${variant} display-mode-${view.mode} ${state.display.label === 'ERROR' ? 'is-error' : ''}`}
        aria-hidden="true"
      >
        <div className="expression-meta">
          <span>{view.contextText}</span>
          <span className="expression-indicators">
            {view.progressText ? <b className="sequence-progress">{view.progressText}</b> : null}
            {state.parenthesisDepth ? <b>{`(${state.parenthesisDepth}`}</b> : null}
            {hasMemory(state) ? <b>M</b> : null}
            {modifier ? <b>{modifier}</b> : null}
          </span>
        </div>

        <div className={view.diagram ? 'display-body has-diagram' : 'display-body'}>
          {view.diagram ? <CalculatorDiagram view={view.diagram} /> : null}
          <div className="display-readout">
            {view.mode === 'error' ? (
              <div className="display-error-content">
                {view.errorTitle && view.expressionText !== view.errorTitle ? (
                  <ExpressionText className="display-error-expression" text={view.expressionText} />
                ) : null}
                <div className="display-error-title">{view.errorTitle ?? 'Check the entry'}</div>
              </div>
            ) : view.mode === 'named-result' && view.valueLabel && view.valueText ? (
              <div className="named-result-equation">
                <span className="named-result-label">{view.valueLabel}</span>
                <div className={`named-result-value-line ${sizeClass}`.trim()}>
                  {view.valueSymbol ? <span className="named-result-symbol">{view.valueSymbol}</span> : null}
                  <ExpressionText className="named-result-value" text={view.valueText} />
                </div>
              </div>
            ) : (
              <>
                <div className={`expression-line ${sizeClass} ${view.entryActive ? 'is-entering' : ''}`.trim()}>
                  <ExpressionText className="expression-text" text={view.expressionText} />
                  {view.entryActive ? <span className="expression-caret" aria-hidden="true" /> : null}
                </div>
                {view.resultText ? (
                  <div className="expression-result">
                    {view.resultSymbol ? <span className="expression-result-symbol">{view.resultSymbol}</span> : null}
                    <ExpressionText className="expression-result-text" text={view.resultText} />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        {view.guidanceText ? (
          <div className={`display-guidance display-guidance-${view.guidanceTone ?? 'tip'}`}>
            <strong>{guidanceLabel}</strong>
            <span>{view.guidanceText}</span>
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
      {view.guidanceText ? (
        <span
          id={guidanceDescriptionId}
          className="visually-hidden"
          aria-hidden={active ? undefined : true}
        >
          {`${guidanceLabel}: ${view.guidanceText}`}
        </span>
      ) : null}
      {view.diagram ? (
        <span
          id={diagramDescriptionId}
          className="visually-hidden"
          aria-hidden={active ? undefined : true}
        >
          {view.diagram.ariaText}
        </span>
      ) : null}
    </div>
  );
}
