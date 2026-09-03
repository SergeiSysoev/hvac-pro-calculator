import type { KeyId } from '@/lib/calculator/engine';

export type KeyTone = 'number' | 'dark' | 'utility' | 'accent' | 'danger';
export type KeyAction = 'preferences' | 'accuracy';

export interface KeyFace {
  id: string;
  label: string;
  key?: KeyId;
  secondary?: string;
  detail?: string;
  converted?: boolean;
  tone?: KeyTone;
  action?: KeyAction;
}

interface CalculatorKeypadProps {
  keys: KeyFace[];
  modifier?: 'convert' | 'recall' | 'recall-convert';
  onAction: (action: KeyAction) => void;
  onPress: (key: KeyId, converted?: boolean) => void;
}

export function accessibleKeyLabel(face: KeyFace): string {
  const detail = face.detail ? ` ${face.detail}` : '';
  const converted = face.secondary ? `; Conv function ${face.secondary}` : '';
  return `${face.label}${detail}${converted}`;
}

export default function CalculatorKeypad({
  keys,
  modifier,
  onAction,
  onPress,
}: CalculatorKeypadProps) {
  return (
    <div className="trade-keypad" role="group" aria-label="Calculator keypad">
      {keys.map((face) => {
        const latched = face.key === 'conv' && modifier === 'convert';
        return (
          <button
            type="button"
            key={face.id}
            className={`calc-key key-${face.tone ?? 'utility'} ${latched ? 'is-latched' : ''}`}
            aria-label={accessibleKeyLabel(face)}
            aria-pressed={face.key === 'conv' ? latched : undefined}
            data-key={face.key}
            data-action={face.action}
            onClick={() => {
              if (face.action) onAction(face.action);
              else if (face.key) onPress(face.key, face.converted);
            }}
          >
            {face.secondary ? <small>{face.secondary}</small> : null}
            <span>{face.label}</span>
            {face.detail ? <em>{face.detail}</em> : null}
          </button>
        );
      })}
    </div>
  );
}
