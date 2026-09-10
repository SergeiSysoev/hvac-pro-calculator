'use client';

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import DuctCalculator from '@/components/calculator/DuctCalculator';
import PhysicalCalculator from '@/components/calculator/PhysicalCalculator';
import PreferencesDialog from '@/components/calculator/PreferencesDialog';
import { pageIndexForScroll } from '@/lib/carousel';
import {
  KeyId,
  calculatorReducer,
  initialCalculatorState,
  persistedState,
} from '@/lib/calculator/engine';

const STORAGE_KEY = 'hvac-pro-calculator-state-v2';
const LEGACY_STORAGE_KEY = 'hvac-4090-pro-state-v1';
const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const PAGE_NAMES = ['HVAC', 'Duct'] as const;

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

const ACTIVE_CALCULATOR_KEYBOARD_SCOPE = '[data-calculator-keyboard-scope="active"]';

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

export function isCalculatorKeyboardScopeTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const candidate = target as KeyboardEventTarget;
  return typeof candidate.closest === 'function'
    && candidate.closest(ACTIVE_CALCULATOR_KEYBOARD_SCOPE) !== null;
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


export default function HvacCalculator() {
  const [state, dispatch] = useReducer(calculatorReducer, undefined, initialCalculatorState);
  const [activePage, setActivePage] = useState(0);
  const hydrated = useRef(false);
  const viewport = useRef<HTMLDivElement>(null);
  const viewportWidth = useRef(0);
  const activePageRef = useRef(0);
  const preferencesDialog = useRef<HTMLElement>(null);
  const preferencesOpener = useRef<HTMLElement | null>(null);

  /* PAGING IS THE BROWSER'S SCROLL, NOT OUR GESTURE.
     This used to be a hand-written pager: capture the pointer, follow the
     finger with a transform, project a flick, spring to the nearest page. It
     never worked on a phone. To follow a finger sideways you must first take
     the horizontal gesture away from the browser with `touch-action`, and that
     rule is resolved only as far up as the nearest scroll container - which on
     this page sits INSIDE the pager, so the browser kept the gesture, sent a
     few moves and cancelled the pointer. The track followed the finger a
     quarter of the way and sprang back, every time, on every screen.

     A scroll container with scroll-snap has no such argument to lose: the
     browser was always going to own this gesture, so it owns it, with its own
     inertia and its own rubber band. What is left here is reading which page
     the scroll landed on, and scrolling to one when a dot is tapped. */
  const goToPage = useCallback((page: number) => {
    const element = viewport.current;
    const width = viewportWidth.current;
    const target = Math.max(0, Math.min(PAGE_NAMES.length - 1, page));
    activePageRef.current = target;
    setActivePage(target);
    if (!element || !width) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollTo({ left: target * width, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, []);

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
      // A rotation or a keyboard must not leave the page half-shown.
      element.scrollTo({ left: activePageRef.current * width, behavior: 'auto' });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let frame: number | null = null;
    const read = () => {
      frame = null;
      const page = pageIndexForScroll(
        element.scrollLeft,
        viewportWidth.current,
        PAGE_NAMES.length,
      );
      if (page === activePageRef.current) return;
      activePageRef.current = page;
      setActivePage(page);
    };
    const onScroll = () => {
      // One read per frame: a snap scroll fires this a great many times.
      if (frame === null) frame = requestAnimationFrame(read);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

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


  useEffect(() => {
    let resetMultiplyHeld = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (state.preferencesOpen && event.key === 'Escape') {
        event.preventDefault();
        dispatch({ type: 'toggle-preferences', open: false });
        return;
      }
      if (state.preferencesOpen || activePage === 1) return;

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
      if (!state.powered && key !== 'on') return;
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


  return (
    <main className="app-frame">
      <div className="app-surface" aria-hidden={state.preferencesOpen} inert={state.preferencesOpen}>
        <div ref={viewport} className="carousel-viewport">
        <div className="carousel-track">
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
                onOpenPreferences={openPreferences}
              />
            </div>
          </section>

          <section className="calculator-page" aria-label="Duct calculator" aria-hidden={activePage !== 1} inert={activePage !== 1}>
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
              onClick={() => goToPage(index)}
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
