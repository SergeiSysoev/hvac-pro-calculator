'use client';

import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import CalculatorDisplay from '@/components/calculator/CalculatorDisplay';
import CalculatorKeypad, {
  KeyAction,
  KeyFace,
} from '@/components/calculator/CalculatorKeypad';
import DuctCalculator from '@/components/calculator/DuctCalculator';
import PreferencesDialog from '@/components/calculator/PreferencesDialog';
import { projectedPageIndex, rubberBandDistance } from '@/lib/carousel';
import {
  KeyId,
  calculatorReducer,
  initialCalculatorState,
  persistedState,
} from '@/lib/calculator/engine';

const STORAGE_KEY = 'hvac-pro-calculator-state-v2';
const LEGACY_STORAGE_KEY = 'hvac-4090-pro-state-v1';
const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const PAGE_NAMES = ['Scientific', 'Trade', 'Duct'] as const;

const KEYBOARD_MAP: Record<string, KeyId> = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '.': 'decimal', ',': 'decimal', '+': 'add', '-': 'subtract',
  '*': 'multiply', '/': 'divide', Enter: 'equals', '=': 'equals',
  Backspace: 'backspace', Escape: 'on', '(': 'left', ')': 'right',
};

function scientificKeys(accuracy: number): KeyFace[] {
  return [
    { id: 's-off', label: 'Off', key: 'off', tone: 'dark' },
    { id: 's-on', label: 'On/C', key: 'on', tone: 'danger' },
    { id: 's-left', label: '(', key: 'left', secondary: 'Offset', tone: 'dark' },
    { id: 's-right', label: ')', key: 'right', secondary: 'Col/Cone', tone: 'dark' },
    { id: 's-back', label: '←', key: 'backspace', tone: 'dark' },
    { id: 's-pi', label: 'π', key: 'pi', secondary: 'ArcK', tone: 'dark' },

    { id: 's-x', label: 'x', key: 'run', secondary: 'Fan 1', detail: 'Run' },
    { id: 's-y', label: 'y', key: 'rise', secondary: 'Fan 2', detail: 'Rise' },
    { id: 's-r', label: 'r', key: 'diag', secondary: 'Fan 3', detail: 'Diag' },
    { id: 's-theta', label: 'θ', key: 'pitch', secondary: 'Seg Rad', detail: 'Pitch' },
    { id: 's-circ', label: 'Circ', key: 'circ', secondary: 'Arc' },
    { id: 's-square', label: 'x²', key: 'square', secondary: 'x³' },

    { id: 's-sin', label: 'Sin', key: 'sin', secondary: 'ArcSin' },
    { id: 's-cos', label: 'Cos', key: 'cos', secondary: 'ArcCos' },
    { id: 's-tan', label: 'Tan', key: 'tan', secondary: 'ArcTan' },
    { id: 's-root', label: '√', key: 'sqrt', secondary: '³√' },
    { id: 's-feet', label: 'Feet', key: 'feet', tone: 'dark' },
    { id: 's-inch', label: 'Inch', key: 'inch', tone: 'dark' },

    { id: 's-conv', label: 'Conv', key: 'conv', tone: 'accent' },
    { id: 's-recall', label: 'Rcl', key: 'recall', secondary: 'Swap M+', tone: 'dark' },
    { id: 's-7', label: '7', key: '7', secondary: 'A new', tone: 'number' },
    { id: 's-8', label: '8', key: '8', secondary: 'B new', tone: 'number' },
    { id: 's-9', label: '9', key: '9', secondary: 'LawCos', tone: 'number' },
    { id: 's-divide', label: '÷', key: 'divide', secondary: '1/x', tone: 'dark' },

    { id: 's-memory', label: 'M+', key: 'mplus', secondary: 'M−', tone: 'dark' },
    { id: 's-fraction', label: '/', key: 'fraction', secondary: 'x10ʸ', tone: 'dark' },
    { id: 's-4', label: '4', key: '4', secondary: 'A', tone: 'number' },
    { id: 's-5', label: '5', key: '5', secondary: 'B', tone: 'number' },
    { id: 's-6', label: '6', key: '6', secondary: 'C', tone: 'number' },
    { id: 's-multiply', label: '×', key: 'multiply', secondary: 'Clear All', tone: 'dark' },

    { id: 's-clear', label: 'C', key: 'on', tone: 'dark' },
    { id: 's-sign', label: '+/−', key: 'subtract', converted: true, tone: 'dark' },
    { id: 's-1', label: '1', key: '1', secondary: 'M1', tone: 'number' },
    { id: 's-2', label: '2', key: '2', secondary: 'M2', tone: 'number' },
    { id: 's-3', label: '3', key: '3', secondary: 'M3', tone: 'number' },
    { id: 's-subtract', label: '−', key: 'subtract', tone: 'dark' },

    { id: 's-meter', label: 'm', key: 'meter', secondary: 'mm', tone: 'dark' },
    { id: 's-accuracy', label: `1/${accuracy}`, action: 'accuracy', tone: 'dark' },
    { id: 's-0', label: '0', key: '0', secondary: 'VP/FPM', tone: 'number' },
    { id: 's-decimal', label: '•', key: 'decimal', secondary: 'dms/deg', tone: 'number' },
    { id: 's-equals', label: '=', key: 'equals', secondary: 'Prefs', tone: 'number' },
    { id: 's-add', label: '+', key: 'add', secondary: '%', tone: 'dark' },
  ];
}

function tradeKeys(accuracy: number): KeyFace[] {
  return [
    { id: 't-hip', label: 'Hip/V', key: 'hip' },
    { id: 't-pitch', label: 'Pitch', key: 'pitch' },
    { id: 't-jack', label: 'Jack', key: 'jack' },
    { id: 't-stair', label: 'Stair', key: 'stair' },
    { id: 't-offset', label: 'Offset', key: 'left', converted: true, tone: 'accent' },
    { id: 't-column', label: 'Column', key: 'right', converted: true, tone: 'accent' },

    { id: 't-ir-pitch', label: 'Ir/Pitch', key: 'hip', converted: true },
    { id: 't-segment', label: 'Seg Rad', key: 'pitch', converted: true },
    { id: 't-ir-jack', label: 'Ir/Jack', key: 'jack', converted: true },
    { id: 't-riser', label: 'Riser', key: 'stair', converted: true },
    { id: 't-circle', label: 'Circ', key: 'circ' },
    { id: 't-arc', label: 'Arc', key: 'circ', converted: true },

    { id: 't-x', label: 'x', key: 'run', detail: 'Run' },
    { id: 't-y', label: 'y', key: 'rise', detail: 'Rise' },
    { id: 't-r', label: 'r', key: 'diag', detail: 'Diag' },
    { id: 't-theta', label: 'θ', key: 'pitch', detail: 'Pitch' },
    { id: 't-on', label: 'On/C', key: 'on', tone: 'danger' },
    { id: 't-inch', label: 'Inch', key: 'inch', tone: 'dark' },

    { id: 't-conv', label: 'Conv', key: 'conv', tone: 'accent' },
    { id: 't-recall', label: 'Rcl', key: 'recall', tone: 'dark' },
    { id: 't-7', label: '7', key: '7', tone: 'number' },
    { id: 't-8', label: '8', key: '8', tone: 'number' },
    { id: 't-9', label: '9', key: '9', tone: 'number' },
    { id: 't-divide', label: '÷', key: 'divide', tone: 'dark' },

    { id: 't-memory', label: 'M+', key: 'mplus', tone: 'dark' },
    { id: 't-fraction', label: '/', key: 'fraction', tone: 'dark' },
    { id: 't-4', label: '4', key: '4', tone: 'number' },
    { id: 't-5', label: '5', key: '5', tone: 'number' },
    { id: 't-6', label: '6', key: '6', tone: 'number' },
    { id: 't-multiply', label: '×', key: 'multiply', tone: 'dark' },

    { id: 't-clear', label: 'C', key: 'on', tone: 'dark' },
    { id: 't-sign', label: '+/−', key: 'subtract', converted: true, tone: 'dark' },
    { id: 't-1', label: '1', key: '1', tone: 'number' },
    { id: 't-2', label: '2', key: '2', tone: 'number' },
    { id: 't-3', label: '3', key: '3', tone: 'number' },
    { id: 't-subtract', label: '−', key: 'subtract', tone: 'dark' },

    { id: 't-back', label: '←', key: 'backspace', tone: 'dark' },
    { id: 't-feet', label: 'Feet', key: 'feet', tone: 'dark' },
    { id: 't-0', label: '0', key: '0', tone: 'number' },
    { id: 't-decimal', label: '•', key: 'decimal', tone: 'number' },
    { id: 't-equals', label: '=', key: 'equals', tone: 'number' },
    { id: 't-add', label: '+', key: 'add', tone: 'dark' },

    { id: 't-meter', label: 'm', key: 'meter', secondary: 'mm', tone: 'dark' },
    { id: 't-fan-1', label: 'Fan 1', key: 'run', converted: true },
    { id: 't-fan-2', label: 'Fan 2', key: 'rise', converted: true },
    { id: 't-fan-3', label: 'Fan 3', key: 'diag', converted: true },
    { id: 't-velocity', label: 'VP/FPM', key: '0', converted: true },
    { id: 't-accuracy', label: `1/${accuracy}`, action: 'accuracy', tone: 'dark' },
  ];
}

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  baseOffset: number;
  lastX: number;
  lastTime: number;
  velocity: number;
  locked: boolean;
};

export default function HvacCalculator() {
  const [state, dispatch] = useReducer(calculatorReducer, undefined, initialCalculatorState);
  const [activePage, setActivePage] = useState(0);
  const [trackOffset, setTrackOffsetState] = useState(0);
  const [dragging, setDragging] = useState(false);
  const hydrated = useRef(false);
  const viewport = useRef<HTMLDivElement>(null);
  const viewportWidth = useRef(0);
  const activePageRef = useRef(0);
  const trackOffsetRef = useRef(0);
  const dragState = useRef<DragState | null>(null);
  const animationFrame = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const preferencesDialog = useRef<HTMLElement>(null);
  const preferencesOpener = useRef<HTMLElement | null>(null);

  const setTrackOffset = useCallback((value: number) => {
    trackOffsetRef.current = value;
    setTrackOffsetState(value);
  }, []);

  const cancelAnimation = useCallback(() => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
  }, []);

  const animateToPage = useCallback((page: number, initialVelocity = 0) => {
    const width = viewportWidth.current;
    const targetPage = Math.max(0, Math.min(PAGE_NAMES.length - 1, page));
    const target = -targetPage * width;
    cancelAnimation();
    activePageRef.current = targetPage;
    setActivePage(targetPage);

    if (!width || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTrackOffset(target);
      return;
    }

    let velocity = initialVelocity;
    let lastTime = performance.now();
    const damping = Math.abs(initialVelocity) > 80 ? 31 : 38;
    const stiffness = 360;

    const tick = (time: number) => {
      const deltaTime = Math.min((time - lastTime) / 1000, 0.032);
      lastTime = time;
      const position = trackOffsetRef.current;
      const acceleration = -stiffness * (position - target) - damping * velocity;
      velocity += acceleration * deltaTime;
      const next = position + velocity * deltaTime;
      setTrackOffset(next);

      if (Math.abs(next - target) < 0.35 && Math.abs(velocity) < 7) {
        setTrackOffset(target);
        animationFrame.current = null;
        return;
      }
      animationFrame.current = requestAnimationFrame(tick);
    };

    animationFrame.current = requestAnimationFrame(tick);
  }, [cancelAnimation, setTrackOffset]);

  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => {
      const width = element.getBoundingClientRect().width;
      if (!width) return;
      viewportWidth.current = width;
      cancelAnimation();
      setTrackOffset(-activePageRef.current * width);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [cancelAnimation, setTrackOffset]);

  useEffect(() => () => cancelAnimation(), [cancelAnimation]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
        ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
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

  const press = useCallback((key: KeyId, forceConverted = false) => {
    if (
      key === 'equals' &&
      (forceConverted || state.modifier === 'convert' || state.modifier === 'recall') &&
      document.activeElement instanceof HTMLElement
    ) {
      preferencesOpener.current = document.activeElement;
    }
    if (forceConverted && state.modifier !== 'convert') dispatch({ type: 'press', key: 'conv' });
    dispatch({ type: 'press', key });
    if ('vibrate' in navigator) navigator.vibrate?.(7);
  }, [state.modifier]);

  const openPreferences = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) preferencesOpener.current = document.activeElement;
    dispatch({ type: 'toggle-preferences', open: true });
  }, []);

  const handleAction = useCallback((action: KeyAction) => {
    if (action === 'preferences') {
      openPreferences();
      return;
    }
    const options = [16, 32, 64, 2, 4, 8] as const;
    const currentIndex = options.indexOf(state.preferences.fractionDenominator);
    const next = options[(currentIndex + 1) % options.length];
    dispatch({ type: 'set-preference', key: 'fractionDenominator', value: next });
    if ('vibrate' in navigator) navigator.vibrate?.(7);
  }, [openPreferences, state.preferences.fractionDenominator]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (state.preferencesOpen && event.key === 'Escape') {
        event.preventDefault();
        dispatch({ type: 'toggle-preferences', open: false });
        return;
      }
      if (state.preferencesOpen || activePage === 2) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      const key = KEYBOARD_MAP[event.key];
      if (!key) return;
      event.preventDefault();
      press(key);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePage, press, state.preferencesOpen]);

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

  const scientific = useMemo(
    () => scientificKeys(state.preferences.fractionDenominator),
    [state.preferences.fractionDenominator],
  );
  const trade = useMemo(
    () => tradeKeys(state.preferences.fractionDenominator),
    [state.preferences.fractionDenominator],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseOffset: trackOffsetRef.current,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocity: 0,
      locked: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (!drag.locked) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 10) return;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        dragState.current = null;
        return;
      }
      const animationWasRunning = animationFrame.current !== null;
      cancelAnimation();
      if (animationWasRunning) drag.baseOffset = trackOffsetRef.current - deltaX;
      drag.locked = true;
      setDragging(true);
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(now - drag.lastTime, 1);
    const sampleVelocity = (event.clientX - drag.lastX) / elapsed * 1000;
    drag.velocity = drag.velocity * 0.62 + sampleVelocity * 0.38;
    drag.lastX = event.clientX;
    drag.lastTime = now;

    const width = viewportWidth.current;
    const minimum = -(PAGE_NAMES.length - 1) * width;
    let next = drag.baseOffset + deltaX;
    if (next > 0) next = rubberBandDistance(next, width);
    if (next < minimum) next = minimum + rubberBandDistance(next - minimum, width);
    setTrackOffset(next);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragState.current = null;
    setDragging(false);
    if (!drag.locked) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const velocity = cancelled ? 0 : drag.velocity;
    const target = cancelled
      ? activePageRef.current
      : projectedPageIndex(
        trackOffsetRef.current,
        velocity,
        viewportWidth.current,
        PAGE_NAMES.length,
        activePageRef.current,
      );
    animateToPage(target, velocity);
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  };

  return (
    <main className="app-frame">
      <div className="app-surface" aria-hidden={state.preferencesOpen} inert={state.preferencesOpen}>
        <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-badge" aria-hidden="true">HV</span>
          <div>
            <strong>HVAC PRO CALC</strong>
            <span>{PAGE_NAMES[activePage]} calculator</span>
          </div>
        </div>
        <button type="button" className="settings-button" aria-label="Open calculator preferences" onClick={openPreferences}>
          <span aria-hidden="true">⚙</span>
        </button>
        </header>

        <div
          ref={viewport}
          className="carousel-viewport"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => finishPointer(event)}
          onPointerCancel={(event) => finishPointer(event, true)}
          onClickCapture={(event) => {
            if (!suppressClick.current) return;
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }}
        >
        <div
          className={`carousel-track ${dragging ? 'is-dragging' : ''}`}
          style={{ transform: `translate3d(${trackOffset}px, 0, 0)` }}
        >
          <section className="calculator-page" aria-label="Scientific calculator" aria-hidden={activePage !== 0} inert={activePage !== 0}>
            <div className="page-scroll keypad-page">
              <CalculatorDisplay active={activePage === 0} state={state} />
              <CalculatorKeypad keys={scientific} modifier={state.modifier} onAction={handleAction} onPress={press} />
            </div>
          </section>

          <section className="calculator-page" aria-label="Trade calculator" aria-hidden={activePage !== 1} inert={activePage !== 1}>
            <div className="page-scroll keypad-page">
              <CalculatorDisplay active={activePage === 1} state={state} />
              <CalculatorKeypad keys={trade} modifier={state.modifier} onAction={handleAction} onPress={press} />
            </div>
          </section>

          <section className="calculator-page" aria-label="Duct calculator" aria-hidden={activePage !== 2} inert={activePage !== 2}>
            <div className="page-scroll duct-page">
              <DuctCalculator />
            </div>
          </section>
        </div>
        </div>

        <nav className="page-dots" aria-label="Calculator screens">
          {PAGE_NAMES.map((name, index) => (
            <button
              type="button"
              key={name}
              className={index === activePage ? 'active' : ''}
              aria-label={`Open ${name} calculator`}
              aria-current={index === activePage ? 'page' : undefined}
              onClick={() => animateToPage(index)}
            >
              <span />
            </button>
          ))}
        </nav>
      </div>

      {state.preferencesOpen ? (
        <PreferencesDialog dialogRef={preferencesDialog} dispatch={dispatch} state={state} />
      ) : null}
    </main>
  );
}
