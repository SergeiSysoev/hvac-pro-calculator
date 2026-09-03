'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DuctField,
  DuctUnitSystem,
  displayToImperialValue,
  imperialToDisplayValue,
  parseDuctEntry,
  promoteDuctInput,
  rectangularEquivalents,
  solveRoundDuct,
} from '@/lib/calculator/duct';

const STORAGE_KEY = 'hvac-pro-duct-state-v1';
const DUCT_FIELDS: DuctField[] = ['airflowCfm', 'frictionRate', 'velocityFpm', 'diameterIn'];

const FIELD_DETAILS: Record<DuctField, {
  label: string;
  imperialUnit: string;
  siUnit: string;
  placeholder: string;
}> = {
  airflowCfm: { label: 'Air flow', imperialUnit: 'CFM', siUnit: 'L/s', placeholder: 'e.g. 1000' },
  frictionRate: { label: 'Friction loss', imperialUnit: 'in.wg/100ft', siUnit: 'Pa/m', placeholder: 'e.g. 0.10' },
  velocityFpm: { label: 'Velocity', imperialUnit: 'FPM', siUnit: 'm/s', placeholder: 'e.g. 900' },
  diameterIn: { label: 'Round diameter', imperialUnit: 'in', siUnit: 'mm', placeholder: 'e.g. 14' },
};

const EMPTY_VALUES: Record<DuctField, string> = {
  airflowCfm: '',
  frictionRate: '',
  velocityFpm: '',
  diameterIn: '',
};

function formatNumber(value: number, maximumFractionDigits = 3): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
    useGrouping: false,
  }).format(value);
}

function formatInput(value: number): string {
  const digits = Math.abs(value) >= 100 ? 1 : Math.abs(value) >= 10 ? 2 : 4;
  return Number(value.toFixed(digits)).toString();
}

export default function DuctCalculator() {
  const [unitSystem, setUnitSystem] = useState<DuctUnitSystem>('imperial');
  const [manualOrder, setManualOrder] = useState<DuctField[]>([]);
  const [rawValues, setRawValues] = useState<Record<DuctField, string>>(EMPTY_VALUES);
  const [storageReady, setStorageReady] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as {
          unitSystem?: DuctUnitSystem;
          manualOrder?: DuctField[];
          rawValues?: Partial<Record<DuctField, string>>;
        } | null;
        if (saved?.unitSystem === 'imperial' || saved?.unitSystem === 'si') {
          setUnitSystem(saved.unitSystem);
        }
        if (Array.isArray(saved?.manualOrder)) {
          setManualOrder(saved.manualOrder.filter((field) => DUCT_FIELDS.includes(field)).slice(-2));
        }
        if (saved?.rawValues) {
          setRawValues(Object.fromEntries(DUCT_FIELDS.map((field) => [
            field,
            typeof saved.rawValues?.[field] === 'string' ? saved.rawValues[field] : '',
          ])) as Record<DuctField, string>);
        }
      } catch {
        // A corrupt or disabled localStorage must not block field calculations.
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(hydrateTimer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ unitSystem, manualOrder, rawValues }));
    } catch {
      // Duct entries remain available for the current session.
    }
  }, [manualOrder, rawValues, storageReady, unitSystem]);

  const result = (() => {
    if (manualOrder.length !== 2) return { solution: undefined, error: undefined };
    const inputs: Partial<Record<DuctField, number>> = {};
    for (const field of manualOrder) {
      const displayValue = parseDuctEntry(rawValues[field]);
      if (displayValue === undefined || displayValue <= 0) {
        return { solution: undefined, error: 'Use positive numbers in both input fields.' };
      }
      inputs[field] = displayToImperialValue(field, displayValue, unitSystem);
    }
    try {
      return { solution: solveRoundDuct(inputs), error: undefined };
    } catch (error) {
      return {
        solution: undefined,
        error: error instanceof Error ? error.message : 'These values could not be solved.',
      };
    }
  })();

  const equivalents = (
    result.solution
      ? rectangularEquivalents(result.solution.diameterIn, result.solution.airflowCfm)
      : []
  );

  const displayedValue = (field: DuctField): string => {
    if (manualOrder.includes(field)) return rawValues[field];
    if (!result.solution) return '';
    return formatInput(imperialToDisplayValue(field, result.solution[field], unitSystem));
  };

  const makeManual = (field: DuctField) => {
    const alreadyManual = manualOrder.includes(field);
    setManualOrder((current) => promoteDuctInput(current, field));
    if (!alreadyManual) setRawValues((current) => ({ ...current, [field]: '' }));
  };

  const updateField = (field: DuctField, value: string) => {
    setManualOrder((current) => promoteDuctInput(current, field));
    setRawValues((current) => ({ ...current, [field]: value }));
  };

  const releaseEmptyField = (field: DuctField) => {
    if (rawValues[field].trim()) return;
    setManualOrder((current) => current.filter((item) => item !== field));
  };

  const switchUnits = (next: DuctUnitSystem) => {
    if (next === unitSystem) return;
    setRawValues((current) => {
      const converted = { ...current };
      for (const field of manualOrder) {
        const displayValue = parseDuctEntry(current[field]);
        if (displayValue === undefined || displayValue <= 0) continue;
        const imperial = displayToImperialValue(field, displayValue, unitSystem);
        converted[field] = formatInput(imperialToDisplayValue(field, imperial, next));
      }
      return converted;
    });
    setUnitSystem(next);
  };

  const clearAll = () => {
    setManualOrder([]);
    setRawValues({ ...EMPTY_VALUES });
    requestAnimationFrame(() => firstInputRef.current?.focus());
  };

  return (
    <section className="duct-calculator" aria-label="ASHRAE equal-friction duct calculator">
      <div className="duct-title-row">
        <div>
          <p className="panel-kicker">Equal friction method</p>
          <h2>Duct calculator</h2>
        </div>
        <div className="unit-toggle" aria-label="Duct unit system">
          <button type="button" className={unitSystem === 'imperial' ? 'active' : ''} aria-pressed={unitSystem === 'imperial'} onClick={() => switchUnits('imperial')}>Imperial</button>
          <button type="button" className={unitSystem === 'si' ? 'active' : ''} aria-pressed={unitSystem === 'si'} onClick={() => switchUnits('si')}>SI</button>
        </div>
      </div>

      <div className="duct-fields">
        {DUCT_FIELDS.map((field, index) => {
          const details = FIELD_DETAILS[field];
          const manual = manualOrder.includes(field);
          const unit = unitSystem === 'imperial' ? details.imperialUnit : details.siUnit;
          return (
            <label className={`duct-field ${manual ? 'is-input' : result.solution ? 'is-solved' : ''}`} key={field}>
              <span className="duct-field-heading">
                <span>{details.label}</span>
                <small>{manual ? 'INPUT' : result.solution ? 'SOLVED' : ''}</small>
              </span>
              <span className="duct-input-wrap">
                <input
                  ref={index === 0 ? firstInputRef : undefined}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={`${details.label}, ${unit}`}
                  value={displayedValue(field)}
                  placeholder={manualOrder.length < 2 || manual ? details.placeholder : ''}
                  onFocus={() => makeManual(field)}
                  onChange={(event) => updateField(field, event.target.value)}
                  onBlur={() => releaseEmptyField(field)}
                />
                <span>{unit}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="duct-helper" aria-live="polite">
        <span className="input-count">{manualOrder.length}/2</span>
        <p>{result.error ?? (result.solution
          ? 'Solved. Tap any result to replace the oldest input.'
          : 'Enter any two values. The other two solve automatically.')}</p>
      </div>

      <button type="button" className="clear-duct" onClick={clearAll}>Clear all</button>

      <div className="equivalent-card">
        <div className="equivalent-heading">
          <div>
            <p className="panel-kicker">Equivalent at the same airflow</p>
            <h3>Equivalent rectangular ducts</h3>
          </div>
          {result.solution ? (
            <span className="round-size">
              Ø {formatNumber(imperialToDisplayValue('diameterIn', result.solution.diameterIn, unitSystem), 1)} {unitSystem === 'imperial' ? 'in' : 'mm'}
            </span>
          ) : null}
        </div>

        {equivalents.length ? (
          <div className="equivalent-list">
            {equivalents.map((item) => {
              const width = unitSystem === 'imperial' ? item.widthIn : item.widthIn * 25.4;
              const height = unitSystem === 'imperial' ? item.heightIn : item.heightIn * 25.4;
              const velocity = imperialToDisplayValue('velocityFpm', item.velocityFpm, unitSystem);
              return (
                <div className="equivalent-row" key={`${item.widthIn}-${item.heightIn}`}>
                  <strong>{formatNumber(width, unitSystem === 'imperial' ? 0 : 0)} × {formatNumber(height, unitSystem === 'imperial' ? 0 : 0)}</strong>
                  <span>{unitSystem === 'imperial' ? 'in' : 'mm'}</span>
                  <small>
                    {formatNumber(velocity, 1)} {unitSystem === 'imperial' ? 'FPM' : 'm/s'} · ΔP {item.frictionDifferencePercent >= 0 ? '+' : ''}{formatNumber(item.frictionDifferencePercent, 1)}%
                  </small>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="equivalent-empty">{result.solution
            ? 'No built-in standard size is within ±10% of the target friction rate.'
            : 'Solve a round duct to see standard rectangular options.'}</p>
        )}
      </div>

      {result.solution && result.solution.reynolds < 10_000 ? (
        <p className="duct-warning">Low Reynolds number: transitional-flow estimates may be unreliable.</p>
      ) : null}
      <p className="duct-assumption">Straight average sheet-metal duct · standard air · internal dimensions. Add fitting and equipment losses separately.</p>
    </section>
  );
}
