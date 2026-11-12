import { useState } from "react";

/**
 * Small hand-rolled charts (no chart lib): single-series, so no legend — the
 * card title names the series. Thin marks, rounded data-ends, hover tooltips,
 * values in text tokens. Each chart also renders an sr-only table.
 */

export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-text-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-text-3">{hint}</div>}
    </div>
  );
}

/** Horizontal bars: name · bar · figure, aligned. */
export function BarList({
  rows,
  format = (v) => String(v),
  caption,
}: {
  rows: { label: string; value: number; sub?: string }[];
  format?: (v: number) => string;
  caption: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(7rem,11rem)_1fr_auto] items-center gap-3 text-sm" title={`${r.label}: ${format(r.value)}${r.sub ? ` (${r.sub})` : ""}`}>
            <span className="truncate text-text-2">{r.label}</span>
            <span className="relative h-2.5 rounded-full bg-surface-2">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value > 0 ? 4 : 0, background: "var(--bar)" }}
              />
            </span>
            <span className="min-w-[3ch] text-right tabular-nums text-text">
              {format(r.value)}
              {r.sub && <span className="ml-1 text-xs text-text-3">{r.sub}</span>}
            </span>
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th>{r.label}</th>
              <td>{format(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Vertical columns over time with a hover tooltip. */
export function Columns({ data, caption, valueLabel }: { data: { x: string; label: string; value: number }[]; caption: string; valueLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  const H = 140;
  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative w-5 shrink-0 text-right text-[11px] tabular-nums text-text-3" style={{ height: H }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: H - (t / max) * H }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-border" style={{ top: H - (t / max) * H }} />
          ))}
          <div className="relative flex items-end gap-[2px]" style={{ height: H }} onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => (
              <div
                key={d.x}
                className="flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${d.label}: ${d.value} ${valueLabel}`}
              >
                <div
                  className="w-full max-w-6 rounded-t-[4px] transition-opacity"
                  style={{
                    height: d.value ? Math.max(3, (d.value / max) * H) : 0,
                    background: "var(--bar)",
                    opacity: hover === null || hover === i ? 1 : 0.45,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-[2px] text-[10px] text-text-3">
            {data.map((d, i) => (
              <span key={d.x} className="flex-1 truncate text-center">
                {i % 4 === 0 || i === data.length - 1 ? d.label : ""}
              </span>
            ))}
          </div>
          {hover !== null && data[hover] && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-md"
              style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
            >
              <div className="text-text-2">Semana del {data[hover].label}</div>
              <div className="font-medium tabular-nums">
                {data[hover].value} {valueLabel}
              </div>
            </div>
          )}
        </div>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.x}>
              <th>{d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
