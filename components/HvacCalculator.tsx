'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  CalculatorState,
  KeyId,
  activeGuide,
  calculatorReducer,
  initialCalculatorState,
  persistedState,
} from '@/lib/calculator/engine';

type KeyFace = {
  id: KeyId;
  primary: string;
  secondary?: string;
  detail?: string;
  tone?: 'dark' | 'mid' | 'light' | 'yellow';
};

const KEY_ROWS: KeyFace[][] = [
  [
    { id: 'run', primary: 'x', detail: 'Run', secondary: 'Fan Law 1', tone: 'mid' },
    { id: 'rise', primary: 'y', detail: 'Rise', secondary: 'Fan Law 2', tone: 'mid' },
    { id: 'diag', primary: 'r', detail: 'Diag', secondary: 'Fan Law 3', tone: 'mid' },
    { id: 'pitch', primary: 'θ', detail: 'Pitch', secondary: 'Seg Radius', tone: 'mid' },
    { id: 'hip', primary: 'Hip/V', secondary: 'Ir/Pitch', tone: 'dark' },
  ],
  [
    { id: 'square', primary: 'x²', secondary: 'x³' },
    { id: 'sqrt', primary: '√x', secondary: '³√x' },
    { id: 'circ', primary: 'Circ', secondary: 'Arc' },
    { id: 'stair', primary: 'Stair', secondary: 'Riser' },
    { id: 'jack', primary: 'Jack', secondary: 'Ir/Jack' },
  ],
  [
    { id: 'sin', primary: 'Sine', secondary: 'ArcSine' },
    { id: 'cos', primary: 'Cos', secondary: 'ArcCos' },
    { id: 'tan', primary: 'Tan', secondary: 'ArcTan' },
    { id: 'left', primary: '(', secondary: 'Offset' },
    { id: 'right', primary: ')', secondary: 'Column/Cone' },
  ],
  [
    { id: 'meter', primary: 'm', secondary: 'mm', tone: 'dark' },
    { id: 'feet', primary: 'Feet', tone: 'mid' },
    { id: 'inch', primary: 'Inch', tone: 'mid' },
    { id: 'fraction', primary: '/', secondary: 'x10ʸ', tone: 'mid' },
    { id: 'backspace', primary: '←', tone: 'dark' },
  ],
  [
    { id: 'conv', primary: 'Conv', tone: 'yellow' },
    { id: '7', primary: '7', secondary: 'A new' },
    { id: '8', primary: '8', secondary: 'B new' },
    { id: '9', primary: '9', secondary: 'LawCos' },
    { id: 'divide', primary: '÷', secondary: '1/x', tone: 'dark' },
  ],
  [
    { id: 'recall', primary: 'Rcl', secondary: 'Swap M+', tone: 'dark' },
    { id: '4', primary: '4', secondary: 'A' },
    { id: '5', primary: '5', secondary: 'B' },
    { id: '6', primary: '6', secondary: 'C' },
    { id: 'multiply', primary: '×', secondary: 'Clear All', tone: 'dark' },
  ],
  [
    { id: 'mplus', primary: 'M+', secondary: 'M−', tone: 'dark' },
    { id: '1', primary: '1', secondary: 'M1' },
    { id: '2', primary: '2', secondary: 'M2' },
    { id: '3', primary: '3', secondary: 'M3' },
    { id: 'subtract', primary: '−', secondary: '+/−', tone: 'dark' },
  ],
  [
    { id: 'pi', primary: 'π', secondary: 'ArcK', tone: 'dark' },
    { id: '0', primary: '0', secondary: 'VP ↔ FPM' },
    { id: 'decimal', primary: '•', secondary: 'dms ↔ deg' },
    { id: 'equals', primary: '=', secondary: 'Prefs', tone: 'dark' },
    { id: 'add', primary: '+', secondary: '%', tone: 'dark' },
  ],
];

const STORAGE_KEY = 'hvac-4090-pro-state-v1';
const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const KEYBOARD_MAP: Record<string, KeyId> = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '.': 'decimal', ',': 'decimal', '+': 'add', '-': 'subtract',
  '*': 'multiply', '/': 'divide', Enter: 'equals', '=': 'equals',
  Backspace: 'backspace', Escape: 'on', '(': 'left', ')': 'right',
};

function hasMemory(state: CalculatorState): boolean {
  return Boolean(state.memory.cumulative || state.memory.m1 || state.memory.m2 || state.memory.m3);
}

export default function HvacCalculator() {
  const [state, dispatch] = useReducer(calculatorReducer, undefined, initialCalculatorState);
  const [guideOpen, setGuideOpen] = useState(true);
  const hydrated = useRef(false);
  const preferencesDialog = useRef<HTMLElement>(null);
  const preferencesOpener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) dispatch({ type: 'hydrate', payload: JSON.parse(saved) });
    } catch {
      // A disabled or corrupt localStorage should never block calculator use.
    } finally {
      hydrated.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState(state)));
    } catch {
      // Preferences simply remain session-only when storage is unavailable.
    }
  }, [state]);

  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      navigator.serviceWorker.register(`${PUBLIC_BASE_PATH}/sw.js`, {
        scope: `${PUBLIC_BASE_PATH}/`,
      }).catch(() => undefined);
    }
  }, []);

  const press = useCallback((key: KeyId) => {
    if (
      key === 'equals' &&
      (state.modifier === 'convert' || state.modifier === 'recall') &&
      document.activeElement instanceof HTMLElement
    ) {
      preferencesOpener.current = document.activeElement;
    }
    dispatch({ type: 'press', key });
    if ('vibrate' in navigator) navigator.vibrate?.(7);
  }, [state.modifier]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (state.preferencesOpen && event.key === 'Escape') {
        event.preventDefault();
        dispatch({ type: 'toggle-preferences', open: false });
        return;
      }
      if (state.preferencesOpen) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      const key = KEYBOARD_MAP[event.key];
      if (!key) return;
      event.preventDefault();
      press(key);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [press, state.preferencesOpen]);

  useEffect(() => {
    if (!state.preferencesOpen) return;
    const dialog = preferencesDialog.current;
    const opener = preferencesOpener.current;

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      if (opener?.isConnected) opener.focus();
      preferencesOpener.current = null;
    };
  }, [state.preferencesOpen]);

  const guide = useMemo(() => activeGuide(state), [state]);
  const modifierText = state.modifier === 'convert' ? 'CONV' : state.modifier === 'recall' ? 'RCL' : '';

  return (
    <main className="site-shell">
      <header className="site-heading">
        <div>
          <p className="eyebrow">Independent 4090-compatible calculator</p>
          <h1>HVAC 4090 Pro</h1>
        </div>
        <div className="header-actions">
          <p className="heading-note">Sheet metal math, wherever the job takes you.</p>
          <button type="button" className="header-button" onClick={() => setGuideOpen((open) => !open)}>
            {guideOpen ? 'Hide guide' : 'Show guide'}
          </button>
        </div>
      </header>

      <section className={`calculator-stage ${guideOpen ? '' : 'guide-hidden'}`} aria-label="4090-compatible HVAC calculator">
        <div className="calculator-wrap">
          <div className={`calculator ${state.modifier === 'convert' ? 'convert-active' : ''}`}>
            <div className="shell-detail shell-detail-left" />
            <div className="shell-detail shell-detail-right" />
            <div className="calculator-face">
              <div className="brand-strip">
                <strong>HVAC 4090 PRO</strong>
                <span>FIELD CALCULATOR • WEB EDITION</span>
              </div>

              <div
                className={`lcd ${state.display.label === 'ERROR' ? 'lcd-error' : ''}`}
                role="status"
                aria-live="polite"
                aria-label={`${state.display.label} ${state.display.plainText}`.trim()}
              >
                <div className="lcd-annunciators" aria-hidden="true">
                  <span>{state.parenthesisDepth ? `(${state.parenthesisDepth}` : ''}</span>
                  <span>{hasMemory(state) ? 'M' : ''}</span>
                  <span>{modifierText}</span>
                </div>
                <span className="lcd-mode">{state.powered ? state.display.label : ''}</span>
                <span className="lcd-value">{state.powered ? state.display.valueText : ''}</span>
                <span className="lcd-units">{state.powered ? state.display.unitText : ''}</span>
              </div>

              <div className="power-row">
                <span className="reset-label">RESET</span>
                <button type="button" className="power-key power-off" onClick={() => press('off')}>Off</button>
                <button type="button" className="power-key power-on" onClick={() => press('on')}>On/C</button>
              </div>

              <div className="keypad">
                {KEY_ROWS.flat().map((key) => {
                  const secondaryActive = state.modifier === 'convert' && key.secondary;
                  return (
                    <div className="key-cell" key={key.id}>
                      <span className={`secondary-label ${secondaryActive ? 'secondary-active' : ''}`} aria-hidden="true">
                        {key.secondary ?? '\u00a0'}
                      </span>
                      <button
                        type="button"
                        className={`calc-key key-${key.tone ?? 'light'} ${key.id === 'conv' && state.modifier === 'convert' ? 'key-latched' : ''}`}
                        aria-label={key.secondary ? `${key.primary}; converted function ${key.secondary}` : key.primary}
                        aria-pressed={key.id === 'conv' ? state.modifier === 'convert' : undefined}
                        onClick={() => press(key.id)}
                        data-key={key.id}
                      >
                        <span>{key.primary}</span>
                        {key.detail ? <small>{key.detail}</small> : null}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="maker-mark">FIELD TOOLS • MODEL 4090</div>
            </div>
          </div>
          {state.display.note ? <p className="display-note">{state.display.note}</p> : null}
        </div>

        {guideOpen ? (
          <aside className="guide-panel" aria-label="Calculator guide">
            <div className="guide-card guide-primary">
              <div className="guide-heading">
                <div>
                  <p className="panel-kicker">Live key guide</p>
                  <h2>{guide.title}</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Open preferences"
                  onClick={(event) => {
                    preferencesOpener.current = event.currentTarget;
                    dispatch({ type: 'toggle-preferences', open: true });
                  }}
                >
                  ⚙
                </button>
              </div>
              <ol>
                {guide.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <div className="mode-strip">
                <span className={state.modifier === 'convert' ? 'active' : ''}>CONV</span>
                <span className={state.modifier === 'recall' ? 'active' : ''}>RCL</span>
                <span className={state.permanentPitchSlope ? 'active' : ''}>PITCH</span>
                <span className={hasMemory(state) ? 'active' : ''}>MEM</span>
              </div>
            </div>

            <div className="guide-card function-card">
              <p className="panel-kicker">Functions included</p>
              <div className="function-grid">
                <span>Fan Laws 1–3</span><span>VP / FPM</span>
                <span>Offsets</span><span>Triangles</span>
                <span>Circle / Arc</span><span>Hip / Jacks</span>
                <span>Stair layout</span><span>Feet / Metric</span>
              </div>
            </div>

            <div className="guide-card history-card">
              <div className="guide-heading compact">
                <div>
                  <p className="panel-kicker">Recent results</p>
                  <h3>Field tape</h3>
                </div>
                <span className="history-count">{state.history.length}</span>
              </div>
              {state.history.length ? (
                <ul>
                  {state.history.slice(0, 5).map((item) => (
                    <li key={item.id}><span>{item.label}</span><strong>{item.result}</strong></li>
                  ))}
                </ul>
              ) : (
                <p className="empty-history">Your calculated values will stay here while you work.</p>
              )}
            </div>

            <p className="keyboard-hint">Keyboard: numbers, operators, Enter, Backspace and parentheses.</p>
          </aside>
        ) : null}
      </section>

      <footer>
        Independent 4090-compatible tool. Not affiliated with Calculated Industries.
        Values are for field assistance; verify critical work against project requirements.
      </footer>

      {state.preferencesOpen ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => dispatch({ type: 'toggle-preferences', open: false })}>
          <section ref={preferencesDialog} className="preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="preferences-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="preferences-header">
              <div>
                <p className="panel-kicker">4090 setup</p>
                <h2 id="preferences-title">Preferences</h2>
              </div>
              <button type="button" className="icon-button" aria-label="Close preferences" autoFocus onClick={() => dispatch({ type: 'toggle-preferences', open: false })}>×</button>
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
              <button type="button" className="done-button" onClick={() => dispatch({ type: 'toggle-preferences', open: false })}>Done</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
