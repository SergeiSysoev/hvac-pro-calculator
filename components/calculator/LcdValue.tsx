interface LcdValueProps {
  className: string;
  text: string;
  valueLength?: number;
}

export type LcdValuePart = string
  | { numerator: string; denominator: string }
  | { exponent: string };

export function splitLcdValueText(text: string): LcdValuePart[] {
  const scientific = text.match(/^(.*)e(-?\d+)$/);
  const value = scientific?.[1] ?? text;
  const parts: LcdValuePart[] = value
    .split(/(\d+\/\d+)/g)
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(\d+)\/(\d+)$/);
      return match
        ? { numerator: match[1], denominator: match[2] }
        : part;
    });
  if (scientific) parts.push({ exponent: scientific[2].replace('-', '−') });
  return parts;
}

export default function LcdValue({ className, text, valueLength }: LcdValueProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      data-value-length={valueLength ?? Array.from(text).length}
    >
      {splitLcdValueText(text).map((part, index) => {
        if (typeof part === 'string') return part;
        if ('exponent' in part) {
          return <span className="lcd-exponent" key={`exponent-${index}`}>{part.exponent}</span>;
        }
        return (
          <span className="lcd-stacked-fraction" key={`${part.numerator}/${part.denominator}-${index}`}>
            <span>{part.numerator}</span>
            <span>{part.denominator}</span>
          </span>
        );
      })}
    </span>
  );
}
