import {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useRef,
} from 'react';
import type { CalculatorState, KeyId } from '@/lib/calculator/engine';
import LcdValue from '@/components/calculator/LcdValue';

type PhysicalKey = {
  id: KeyId;
  primary: string;
  secondary?: string;
  detail?: string;
  tone?: 'dark' | 'mid' | 'light' | 'yellow';
};

export const PHYSICAL_KEY_ROWS: PhysicalKey[][] = [
  [
    { id: 'run', primary: 'x', detail: 'Run', secondary: 'Fan Law 1', tone: 'mid' },
    { id: 'rise', primary: 'y', detail: 'Rise', secondary: 'Fan Law 2', tone: 'mid' },
    { id: 'diag', primary: 'r', detail: 'Diag', secondary: 'Fan Law 3', tone: 'mid' },
    { id: 'pitch', primary: 'θ', detail: 'Pitch', secondary: 'Seg Radius', tone: 'mid' },
    { id: 'hip', primary: 'Hip/V', secondary: 'Ir/Pitch', tone: 'dark' },
  ],
  [
    { id: 'square', primary: 'x²', secondary: 'x³', tone: 'dark' },
    { id: 'sqrt', primary: '√x', secondary: '³√x', tone: 'dark' },
    { id: 'circ', primary: 'Circ', secondary: 'Arc', tone: 'dark' },
    { id: 'stair', primary: 'Stair', secondary: 'Riser', tone: 'dark' },
    { id: 'jack', primary: 'Jack', secondary: 'Ir/Jack', tone: 'dark' },
  ],
  [
    { id: 'sin', primary: 'Sine', secondary: 'ArcSine', tone: 'dark' },
    { id: 'cos', primary: 'Cos', secondary: 'ArcCos', tone: 'dark' },
    { id: 'tan', primary: 'Tan', secondary: 'ArcTan', tone: 'dark' },
    { id: 'left', primary: '(', secondary: 'Offset', tone: 'dark' },
    { id: 'right', primary: ')', secondary: 'Column/Cone', tone: 'dark' },
  ],
  [
    { id: 'meter', primary: 'm', secondary: 'mm', tone: 'dark' },
    { id: 'feet', primary: 'Feet', tone: 'light' },
    { id: 'inch', primary: 'Inch', tone: 'light' },
    { id: 'fraction', primary: '/', secondary: 'x10ʸ', tone: 'light' },
    { id: 'backspace', primary: '←', tone: 'dark' },
  ],
  [
    { id: 'conv', primary: 'Conv', tone: 'yellow' },
    { id: '7', primary: '7', secondary: 'A new', tone: 'light' },
    { id: '8', primary: '8', secondary: 'B new', tone: 'light' },
    { id: '9', primary: '9', secondary: 'LawCos', tone: 'light' },
    { id: 'divide', primary: '÷', secondary: '1/x', tone: 'dark' },
  ],
  [
    { id: 'recall', primary: 'Rcl', secondary: 'Swap M+', tone: 'dark' },
    { id: '4', primary: '4', secondary: 'A', tone: 'light' },
    { id: '5', primary: '5', secondary: 'B', tone: 'light' },
    { id: '6', primary: '6', secondary: 'C', tone: 'light' },
    { id: 'multiply', primary: '×', secondary: 'Clear All', tone: 'dark' },
  ],
  [
    { id: 'mplus', primary: 'M+', secondary: 'M−', tone: 'dark' },
    { id: '1', primary: '1', secondary: 'M1', tone: 'light' },
    { id: '2', primary: '2', secondary: 'M2', tone: 'light' },
    { id: '3', primary: '3', secondary: 'M3', tone: 'light' },
    { id: 'subtract', primary: '−', secondary: '+/−', tone: 'dark' },
  ],
  [
    { id: 'pi', primary: 'π', secondary: 'ArcK', tone: 'dark' },
    { id: '0', primary: '0', secondary: 'VP ↔ FPM', tone: 'light' },
    { id: 'decimal', primary: '•', secondary: 'dms ↔ deg', tone: 'light' },
    { id: 'equals', primary: '=', secondary: 'Prefs', tone: 'dark' },
    { id: 'add', primary: '+', secondary: '%', tone: 'dark' },
  ],
];

function hasMemory(state: CalculatorState): boolean {
  return Boolean(state.memory.cumulative || state.memory.m1 || state.memory.m2 || state.memory.m3);
}

export function lcdValueSizeClass(valueText: string): string {
  const glyphCount = Array.from(valueText).length;
  if (glyphCount >= 12) return 'lcd-value-dense';
  if (glyphCount >= 10) return 'lcd-value-compact';
  return '';
}

function consumeSuppressedPointerClick(
  event: ReactMouseEvent<HTMLButtonElement>,
  suppressed: Set<number>,
  finished: Set<number>,
): boolean {
  const pointerId = (event.nativeEvent as PointerEvent).pointerId;
  let matchedPointer = suppressed.has(pointerId) ? pointerId : undefined;
  // Older engines expose `click` as MouseEvent without pointerId. Pointer
  // clicks have non-zero detail, so fall back to the oldest completed pointer
  // without ever swallowing keyboard activation.
  if (matchedPointer === undefined && event.detail > 0) {
    matchedPointer = finished.values().next().value;
  }
  if (matchedPointer === undefined) return false;
  suppressed.delete(matchedPointer);
  finished.delete(matchedPointer);
  return true;
}

interface PhysicalCalculatorProps {
  active: boolean;
  state: CalculatorState;
  onPress: (key: KeyId) => void;
  onFactoryReset: () => void;
}

export default function PhysicalCalculator({
  active,
  state,
  onPress,
  onFactoryReset,
}: PhysicalCalculatorProps) {
  const heldResetPointers = useRef(new Set<number>());
  const resetOnPointers = useRef(new Set<number>());
  const suppressedMultiplyPointers = useRef(new Set<number>());
  const finishedMultiplyPointers = useRef(new Set<number>());
  const suppressedOnPointers = useRef(new Set<number>());
  const finishedOnPointers = useRef(new Set<number>());
  const resetTriggered = useRef(false);
  const modifier = state.modifier === 'convert'
    ? 'CONV'
    : state.modifier === 'recall-convert'
      ? 'RCL CONV'
    : state.modifier === 'recall'
      ? 'RCL'
      : '';
  const lcdValueText = state.powered ? state.display.valueText : '';
  const lcdValueClass = lcdValueSizeClass(lcdValueText);

  const startResetHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (state.powered || event.button !== 0 || heldResetPointers.current.has(event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    heldResetPointers.current.add(event.pointerId);
    suppressedMultiplyPointers.current.add(event.pointerId);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const finishResetHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const { pointerId } = event;
    if (!heldResetPointers.current.delete(pointerId)) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }
    if (heldResetPointers.current.size === 0) resetTriggered.current = false;
    finishedMultiplyPointers.current.add(pointerId);
    // `click` follows pointer-up. Clear on the next task as a fallback for a
    // cancelled pointer, while still suppressing the click created by this hold.
    window.setTimeout(() => {
      suppressedMultiplyPointers.current.delete(pointerId);
      finishedMultiplyPointers.current.delete(pointerId);
    }, 0);
  };

  const triggerResetFromOn = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (state.powered || event.button !== 0 || heldResetPointers.current.size === 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (!resetOnPointers.current.has(event.pointerId)) {
      resetOnPointers.current.add(event.pointerId);
      suppressedOnPointers.current.add(event.pointerId);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!resetTriggered.current) {
      resetTriggered.current = true;
      onFactoryReset();
    }
  };

  const finishResetOn = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const { pointerId } = event;
    if (!resetOnPointers.current.delete(pointerId)) return;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }
    finishedOnPointers.current.add(pointerId);
    // Normally the synthetic click consumes this flag. A cancelled pointer
    // produces no click, so do not let it suppress a later ordinary On/C tap.
    window.setTimeout(() => {
      suppressedOnPointers.current.delete(pointerId);
      finishedOnPointers.current.delete(pointerId);
    }, 0);
  };

  return (
    <div className="physical-calculator">
      <div className="calculator-face">
        <div className="brand-strip">
          <strong>PROFESSIONAL HVAC CALCULATOR</strong>
          <span>SHEET METAL • CONSTRUCTION MATH</span>
        </div>

        <div
          className={`physical-lcd ${state.display.label === 'ERROR' ? 'lcd-error' : ''}`}
          role={active ? 'status' : undefined}
          aria-live={active ? 'polite' : 'off'}
          aria-label={`${state.display.label} ${state.display.plainText} ${state.display.note ?? ''}`.trim()}
        >
          <div className="lcd-annunciators" aria-hidden="true">
            <span>
              {state.parenthesisDepth ? `(${state.parenthesisDepth}` : ''}
              {state.display.note ? <b className="lcd-warning" title={state.display.note}>▲</b> : null}
            </span>
            <span>{hasMemory(state) ? 'M' : ''}</span>
            <span>{modifier}</span>
          </div>
          <span className="lcd-mode">{state.powered ? state.display.label : ''}</span>
          <LcdValue
            className={`lcd-value ${lcdValueClass}`.trim()}
            text={lcdValueText}
            valueLength={Array.from(lcdValueText).length}
          />
          <span className="lcd-units">{state.powered ? state.display.unitText : ''}</span>
        </div>

        <div className="power-row">
          <span className="reset-label">RESET</span>
          <button type="button" className="power-key power-off" onClick={() => onPress('off')}>Off</button>
          <button
            type="button"
            className="power-key power-on"
            style={{ touchAction: 'none' }}
            onPointerDown={triggerResetFromOn}
            onPointerUp={finishResetOn}
            onPointerCancel={finishResetOn}
            onLostPointerCapture={finishResetOn}
            onClick={(event) => {
              if (consumeSuppressedPointerClick(
                event,
                suppressedOnPointers.current,
                finishedOnPointers.current,
              )) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              onPress('on');
            }}
          >
            On/C
          </button>
        </div>

        <div className="physical-keypad" role="group" aria-label="Professional HVAC calculator keypad">
          {PHYSICAL_KEY_ROWS.flat().map((key) => {
            const secondaryActive = (state.modifier === 'convert' || state.modifier === 'recall-convert') && key.secondary;
            const latched = key.id === 'conv' && state.modifier === 'convert';
            return (
              <div className="physical-key-cell" key={key.id}>
                <span className={`secondary-label ${secondaryActive ? 'secondary-active' : ''}`} aria-hidden="true">
                  {key.secondary ?? '\u00a0'}
                </span>
                <button
                  type="button"
                  className={`physical-key physical-key-${key.tone ?? 'light'} ${latched ? 'key-latched' : ''}`}
                  aria-label={`${key.primary}${key.detail ? ` ${key.detail}` : ''}${key.secondary ? `; Conv function ${key.secondary}` : ''}`}
                  aria-pressed={key.id === 'conv' ? latched : undefined}
                  data-key={key.id}
                  style={key.id === 'multiply' && !state.powered ? { touchAction: 'none' } : undefined}
                  onPointerDown={key.id === 'multiply' ? startResetHold : undefined}
                  onPointerUp={key.id === 'multiply' ? finishResetHold : undefined}
                  onPointerCancel={key.id === 'multiply' ? finishResetHold : undefined}
                  onLostPointerCapture={key.id === 'multiply' ? finishResetHold : undefined}
                  onClick={(event) => {
                    if (key.id === 'multiply' && consumeSuppressedPointerClick(
                      event,
                      suppressedMultiplyPointers.current,
                      finishedMultiplyPointers.current,
                    )) {
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                    onPress(key.id);
                  }}
                >
                  <span>{key.primary}</span>
                  {key.detail ? <small>{key.detail}</small> : null}
                </button>
              </div>
            );
          })}
        </div>

        <div className="maker-mark">PROFESSIONAL FIELD TOOLS</div>
      </div>
    </div>
  );
}
