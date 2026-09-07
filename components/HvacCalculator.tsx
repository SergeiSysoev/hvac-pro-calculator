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
import PhysicalCalculator from '@/components/calculator/PhysicalCalculator';
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
const PAGE_NAMES = ['HVAC', 'Trade', 'Duct'] as const;

const KEYBOARD_MAP: Record<string, KeyId> = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '.': 'decimal', ',': 'decimal', '+': 'add', '-': 'subtract',
  '*': 'multiply', '/': 'divide', Enter: 'equals', '=': 'equals',
  Backspace: 'backspace', Escape: 'on', '(': 'left', ')': 'right',
};

const INTERACTIVE_KEY_TARGETS = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const TEXT_ENTRY_KEY_TARGETS = [
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
].join(', ');

const CAROUSEL_GESTURE_EXCLUSION_TARGETS = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'label',
  'option',
  'summary',
  '[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(', ');

const ACTIVE_CALCULATOR_KEYBOARD_SCOPE = '[data-calculator-keyboard-scope="active"]';
const RELEASE_VELOCITY_MEMORY_MS = 120;

type KeyboardEventTarget = EventTarget & {
  closest?: (selector: string) => Element | null;
  isContentEditable?: boolean;
};

export function isInteractiveKeyboardTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const candidate = target as KeyboardEventTarget;
  if (candidate.isContentEditable) return true;
  return typeof candidate.closest === 'function'
    && candidate.closest(INTERACTIVE_KEY_TARGETS) !== null;
}

export function isTextEntryKeyboardTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const candidate = target as KeyboardEventTarget;
  if (candidate.isContentEditable) return true;
  return typeof candidate.closest === 'function'
    && candidate.closest(TEXT_ENTRY_KEY_TARGETS) !== null;
}

export function isCarouselGestureControl(target: EventTarget | null): boolean {
  if (!target) return false;
  const candidate = target as KeyboardEventTarget;
  if (candidate.isContentEditable) return true;
  return typeof candidate.closest === 'function'
    && candidate.closest(CAROUSEL_GESTURE_EXCLUSION_TARGETS) !== null;
}

export function isCalculatorKeyboardScopeTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const candidate = target as KeyboardEventTarget;
  return typeof candidate.closest === 'function'
    && candidate.closest(ACTIVE_CALCULATOR_KEYBOARD_SCOPE) !== null;
}

export function releasePointerVelocity(
  previousVelocity: number,
  lastX: number,
  lastTime: number,
  releaseX: number,
  releaseTime: number,
): number {
  if (![previousVelocity, lastX, lastTime, releaseX, releaseTime].every(Number.isFinite)) return 0;
  const elapsed = Math.max(releaseTime - lastTime, 1);
  const releaseSample = (releaseX - lastX) / elapsed * 1000;
  const historyWeight = Math.max(0, 1 - elapsed / RELEASE_VELOCITY_MEMORY_MS);
  return previousVelocity * historyWeight + releaseSample * (1 - historyWeight);
}

export function carouselOffsetForPointer(
  baseOffset: number,
  startX: number,
  pointerX: number,
  width: number,
  pageCount: number,
): number {
  const minimum = -Math.max(0, pageCount - 1) * width;
  let next = baseOffset + pointerX - startX;
  if (next > 0) next = rubberBandDistance(next, width);
  if (next < minimum) next = minimum + rubberBandDistance(next - minimum, width);
  return next;
}

export function calculatorKeyForKeyboardEvent(
  eventKey: string,
  target: EventTarget | null,
  activeElement: EventTarget | null,
): KeyId | undefined {
  const nativeActivation = eventKey === 'Enter' || eventKey === ' ';
  if (
    !isCalculatorKeyboardScopeTarget(target)
    || !isCalculatorKeyboardScopeTarget(activeElement)
    || isTextEntryKeyboardTarget(target)
    || isTextEntryKeyboardTarget(activeElement)
    || (
      nativeActivation
      && (isInteractiveKeyboardTarget(target) || isInteractiveKeyboardTarget(activeElement))
    )
  ) {
    return undefined;
  }
  return KEYBOARD_MAP[eventKey];
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
    { id: 't-decimal', label: '.', key: 'decimal', tone: 'number' },
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
    if (forceConverted) dispatch({ type: 'press-converted', key });
    else dispatch({ type: 'press', key });
    if ('vibrate' in navigator) navigator.vibrate?.(7);
  }, []);

  const factoryReset = useCallback(() => {
    dispatch({ type: 'factory-reset' });
    if ('vibrate' in navigator) navigator.vibrate?.(20);
  }, []);

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
    let resetMultiplyHeld = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (state.preferencesOpen && event.key === 'Escape') {
        event.preventDefault();
        dispatch({ type: 'toggle-preferences', open: false });
        return;
      }
      if (state.preferencesOpen || activePage === 2) return;

      const calculatorFocused = isCalculatorKeyboardScopeTarget(event.target)
        && isCalculatorKeyboardScopeTarget(document.activeElement);

      // Handle the deliberate Off-state reset chord before ordinary shortcuts.
      if (!state.powered && event.key === '*' && calculatorFocused) {
        event.preventDefault();
        resetMultiplyHeld = true;
        return;
      }
      if (!state.powered && event.key === 'Escape' && resetMultiplyHeld) {
        event.preventDefault();
        resetMultiplyHeld = false;
        factoryReset();
        return;
      }

      const key = calculatorKeyForKeyboardEvent(event.key, event.target, document.activeElement);
      if (!key) return;
      event.preventDefault();
      press(key);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === '*' || event.code === 'Digit8' || event.code === 'NumpadMultiply') {
        resetMultiplyHeld = false;
      }
    };
    const clearResetHold = () => { resetMultiplyHeld = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearResetHold);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearResetHold);
    };
  }, [activePage, factoryReset, press, state.powered, state.preferencesOpen]);

  useEffect(() => {
    if (!state.powered || state.display.valueText !== 'ALL rESEt') return;
    const timeout = window.setTimeout(() => {
      dispatch({ type: 'press', key: 'on' });
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [state.display.valueText, state.powered]);

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

  const trade = useMemo(
    () => tradeKeys(state.preferences.fractionDenominator),
    [state.preferences.fractionDenominator],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || isCarouselGestureControl(event.target)) return;
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

    setTrackOffset(carouselOffsetForPointer(
      drag.baseOffset,
      drag.startX,
      event.clientX,
      viewportWidth.current,
      PAGE_NAMES.length,
    ));
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
    const releaseTime = performance.now();
    const releaseOffset = cancelled
      ? trackOffsetRef.current
      : carouselOffsetForPointer(
        drag.baseOffset,
        drag.startX,
        event.clientX,
        viewportWidth.current,
        PAGE_NAMES.length,
      );
    if (!cancelled) setTrackOffset(releaseOffset);
    const velocity = cancelled
      ? 0
      : releasePointerVelocity(
        drag.velocity,
        drag.lastX,
        drag.lastTime,
        event.clientX,
        releaseTime,
      );
    const target = cancelled
      ? activePageRef.current
      : projectedPageIndex(
        releaseOffset,
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
          <section
            className="calculator-page"
            aria-label="Professional HVAC calculator"
            aria-hidden={activePage !== 0}
            data-calculator-keyboard-scope={activePage === 0 ? 'active' : undefined}
            inert={activePage !== 0}
            tabIndex={activePage === 0 ? 0 : -1}
          >
            <div className="page-scroll physical-page">
              <PhysicalCalculator
                active={activePage === 0}
                state={state}
                onPress={press}
                onFactoryReset={factoryReset}
              />
            </div>
          </section>

          <section
            className="calculator-page"
            aria-label="Trade calculator"
            aria-hidden={activePage !== 1}
            data-calculator-keyboard-scope={activePage === 1 ? 'active' : undefined}
            inert={activePage !== 1}
            tabIndex={activePage === 1 ? 0 : -1}
          >
            <div className="page-scroll keypad-page">
              <div className="page-title-row">
                <div>
                  <span>PROFESSIONAL HVAC</span>
                  <strong>Trade calculator</strong>
                </div>
                <button type="button" className="settings-button" aria-label="Open calculator preferences" onClick={openPreferences}>
                  <span aria-hidden="true">⚙</span>
                </button>
              </div>
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
