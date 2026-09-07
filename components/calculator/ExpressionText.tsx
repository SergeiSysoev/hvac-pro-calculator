interface ExpressionTextProps {
  className: string;
  text: string;
}

export type ExpressionTextPart = string
  | { numerator: string; denominator: string }
  | { exponent: string };

export function splitExpressionText(text: string): ExpressionTextPart[] {
  return text
    .split(/(\d+\/(?:\d+|…)|e[−-]?\d+|\^(?:≈?[−-]?\d+|…))/g)
    .filter(Boolean)
    .map((part) => {
      const fraction = part.match(/^(\d+)\/(\d+|…)$/);
      if (fraction) return { numerator: fraction[1], denominator: fraction[2] };
      const exponent = part.match(/^(?:e|\^)(≈?[−-]?\d+|…)$/);
      return exponent
        ? { exponent: exponent[1].replace('-', '−') }
        : part;
    });
}

export default function ExpressionText({ className, text }: ExpressionTextProps) {
  return (
    <span aria-hidden="true" className={className}>
      {splitExpressionText(text).map((part, index) => {
        if (typeof part === 'string') return part;
        if ('exponent' in part) {
          return <sup className="math-exponent" key={`exponent-${index}`}>{part.exponent}</sup>;
        }
        return (
          <span className="math-fraction" key={`${part.numerator}/${part.denominator}-${index}`}>
            <span>{part.numerator}</span>
            <span>{part.denominator}</span>
          </span>
        );
      })}
    </span>
  );
}
