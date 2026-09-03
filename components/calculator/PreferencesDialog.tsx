import type { Dispatch, RefObject } from 'react';
import type { CalculatorAction, CalculatorState } from '@/lib/calculator/engine';

interface PreferencesDialogProps {
  dialogRef: RefObject<HTMLElement | null>;
  dispatch: Dispatch<CalculatorAction>;
  state: CalculatorState;
}

export default function PreferencesDialog({
  dialogRef,
  dispatch,
  state,
}: PreferencesDialogProps) {
  const close = () => dispatch({ type: 'toggle-preferences', open: false });

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={close}>
      <section
        ref={dialogRef}
        className="preferences-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="preferences-header">
          <div>
            <p className="panel-kicker">Calculator setup</p>
            <h2 id="preferences-title">Preferences</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close preferences" autoFocus onClick={close}>×</button>
        </div>

        <div className="preferences-grid">
          <label>
            Fraction resolution
            <select value={state.preferences.fractionDenominator} onChange={(event) => dispatch({ type: 'set-preference', key: 'fractionDenominator', value: Number(event.target.value) as 2 | 4 | 8 | 16 | 32 | 64 })}>
              {[16, 32, 64, 2, 4, 8].map((value) => <option key={value} value={value}>1/{value}</option>)}
            </select>
          </label>
          <label>
            Fraction mode
            <select value={state.preferences.constantFraction ? 'constant' : 'standard'} onChange={(event) => dispatch({ type: 'set-preference', key: 'constantFraction', value: event.target.value === 'constant' })}>
              <option value="standard">Reduced</option>
              <option value="constant">Constant denominator</option>
            </select>
          </label>
          <label>
            Area answers
            <select value={state.preferences.areaFormat} onChange={(event) => dispatch({ type: 'set-preference', key: 'areaFormat', value: event.target.value as 'standard' | 'sq-ft' | 'sq-m' })}>
              <option value="standard">Standard</option><option value="sq-ft">Square feet</option><option value="sq-m">Square meters</option>
            </select>
          </label>
          <label>
            Volume answers
            <select value={state.preferences.volumeFormat} onChange={(event) => dispatch({ type: 'set-preference', key: 'volumeFormat', value: event.target.value as 'standard' | 'cu-ft' | 'cu-m' })}>
              <option value="standard">Standard</option><option value="cu-ft">Cubic feet</option><option value="cu-m">Cubic meters</option>
            </select>
          </label>
          <label>
            Math method
            <select value={state.preferences.mathMode} onChange={(event) => dispatch({ type: 'set-preference', key: 'mathMode', value: event.target.value as 'order' | 'chain' })}>
              <option value="order">Order of operations</option><option value="chain">Chain / as entered</option>
            </select>
          </label>
          <label>
            Jack order
            <select value={state.preferences.jackOrder} onChange={(event) => dispatch({ type: 'set-preference', key: 'jackOrder', value: event.target.value as 'descending' | 'ascending' })}>
              <option value="descending">Descending</option><option value="ascending">Ascending</option>
            </select>
          </label>
          <label>
            Irregular jack spacing
            <select value={state.preferences.irregularJackMode} onChange={(event) => dispatch({ type: 'set-preference', key: 'irregularJackMode', value: event.target.value as 'oc-oc' | 'mate' })}>
              <option value="oc-oc">On-center both sides</option><option value="mate">Mate at hip / valley</option>
            </select>
          </label>
          <label>
            Exponential display
            <select value={state.preferences.exponent ? 'on' : 'off'} onChange={(event) => dispatch({ type: 'set-preference', key: 'exponent', value: event.target.value === 'on' })}>
              <option value="on">On</option><option value="off">Off</option>
            </select>
          </label>
          <label>
            Meter display
            <select value={state.preferences.meterDecimals} onChange={(event) => dispatch({ type: 'set-preference', key: 'meterDecimals', value: event.target.value as 'fixed-3' | 'float' })}>
              <option value="fixed-3">Fixed 0.000</option><option value="float">Floating decimals</option>
            </select>
          </label>
          <label>
            Degree display
            <select value={state.preferences.degreeDecimals} onChange={(event) => dispatch({ type: 'set-preference', key: 'degreeDecimals', value: event.target.value as 'float' | 'fixed-2' })}>
              <option value="float">Floating decimals</option><option value="fixed-2">Fixed 0.00°</option>
            </select>
          </label>
          <label>
            On-center spacing (in)
            <input type="number" min="1" step="0.25" value={state.preferences.onCenter} onChange={(event) => dispatch({ type: 'set-preference', key: 'onCenter', value: Number(event.target.value) })} />
          </label>
          <label>
            Desired riser (in)
            <input type="number" min="1" step="0.0625" value={state.preferences.desiredRiser} onChange={(event) => dispatch({ type: 'set-preference', key: 'desiredRiser', value: Number(event.target.value) })} />
          </label>
          <label>
            Desired tread (in)
            <input type="number" min="1" step="0.25" value={state.preferences.treadWidth} onChange={(event) => dispatch({ type: 'set-preference', key: 'treadWidth', value: Number(event.target.value) })} />
          </label>
          <label>
            Headroom (in)
            <input type="number" min="1" step="1" value={state.preferences.headroom} onChange={(event) => dispatch({ type: 'set-preference', key: 'headroom', value: Number(event.target.value) })} />
          </label>
          <label>
            Floor thickness (in)
            <input type="number" min="1" step="1" value={state.preferences.floorThickness} onChange={(event) => dispatch({ type: 'set-preference', key: 'floorThickness', value: Number(event.target.value) })} />
          </label>
        </div>
        <div className="preferences-actions">
          <button type="button" className="reset-button" onClick={() => dispatch({ type: 'reset-preferences' })}>Reset defaults</button>
          <button type="button" className="done-button" onClick={close}>Done</button>
        </div>
      </section>
    </div>
  );
}
