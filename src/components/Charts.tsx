import { useMemo, useRef, useState } from 'react';
import type { PlanResult, PlanRow, ResumenAnual } from '../lib/amortization';
import { formatCompact, formatMoney, type Moneda } from '../lib/format';

const W = 760;
const H = 268;
const M = { t: 18, r: 18, b: 36, l: 62 };
const IW = W - M.l - M.r;
const IH = H - M.t - M.b;

const SERIE_1 = 'var(--series-1)'; // capital
const SERIE_2 = 'var(--series-2)'; // interés
const SERIE_3 = 'var(--series-3)'; // sin abonos / extras

/**
 * Escala redonda: el tope del eje es el último tick, no el dato crudo.
 * Así ninguna marca queda por encima del área y pisando la leyenda.
 */
function escala(max: number, n = 4): { ticks: number[]; max: number } {
  if (max <= 0) return { ticks: [0, 1], max: 1 };
  const paso = max / n;
  const mag = Math.pow(10, Math.floor(Math.log10(paso)));
  const norm = paso / mag;
  const bonito = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  const step = bonito * mag;
  const out: number[] = [];
  for (let v = 0; v < max - step * 1e-9; v += step) out.push(v);
  out.push(out.length ? out[out.length - 1] + step : step);
  return { ticks: out, max: out[out.length - 1] };
}

/** Rectángulo con las dos esquinas de arriba redondeadas. */
function topeRedondo(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

function Legend({ items }: { items: Array<{ color: string; label: string; dashed?: boolean }> }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span className="legend__item" key={it.label}>
          <span
            className="legend__swatch"
            style={{
              background: it.dashed ? 'transparent' : it.color,
              borderColor: it.color,
              borderStyle: it.dashed ? 'dashed' : 'solid',
            }}
            aria-hidden="true"
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Saldo pendiente en el tiempo                                       */
/* ================================================================== */

export function SaldoChart({
  plan, moneda, filasSinAbonos,
}: {
  plan: PlanResult;
  moneda: Moneda;
  filasSinAbonos?: PlanRow[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const filas = plan.filas;
  const comparar = !!filasSinAbonos && filasSinAbonos.length > filas.length;
  const nMax = Math.max(filas.length, comparar ? filasSinAbonos!.length : 0);
  const { ticks: yTicks, max: yMax } = escala(Math.max(plan.filas[0]?.saldoInicial ?? 0, 1));

  const x = (n: number) => M.l + (nMax <= 1 ? 0 : ((n - 1) / (nMax - 1)) * IW);
  const y = (v: number) => M.t + IH - (v / yMax) * IH;

  const linea = (rows: PlanRow[]) =>
    rows.map((f, i) => `${i === 0 ? 'M' : 'L'}${x(f.n).toFixed(1)},${y(f.saldo).toFixed(1)}`).join(' ');

  const area = useMemo(() => {
    if (filas.length === 0) return '';
    const cabeza = `M${x(1).toFixed(1)},${y(filas[0].saldoInicial).toFixed(1)}`;
    const cuerpo = filas.map((f) => `L${x(f.n).toFixed(1)},${y(f.saldo).toFixed(1)}`).join(' ');
    return `${cabeza} ${cuerpo} L${x(filas[filas.length - 1].n).toFixed(1)},${y(0).toFixed(1)} L${x(1).toFixed(1)},${y(0).toFixed(1)} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, nMax, yMax]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || filas.length === 0) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const t = (px - M.l) / (IW || 1);
    const idx = Math.round(t * (nMax - 1));
    setHover(Math.min(filas.length - 1, Math.max(0, idx)));
  };

  const f = hover !== null ? filas[hover] : null;

  if (filas.length === 0) return null;

  return (
    <figure className="chart">
      <figcaption className="chart__title">
        Saldo pendiente mes a mes
        <span className="chart__note">Pasa el cursor sobre la gráfica para ver cada cuota</span>
      </figcaption>
      {comparar && (
        <Legend items={[
          { color: 'var(--series-1)', label: 'Con tus abonos extra' },
          { color: 'var(--series-3)', label: 'Sin abonos extra', dashed: true },
        ]} />
      )}
      <div className="chart__canvas">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Saldo pendiente desde ${formatMoney(yMax, moneda)} hasta cero en ${filas.length} cuotas`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="grad-saldo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIE_1} stopOpacity="0.26" />
              <stop offset="100%" stopColor={SERIE_1} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {yTicks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={M.l - 10} y={y(t)} className="axis-label" textAnchor="end" dominantBaseline="middle">
                {formatCompact(t, moneda)}
              </text>
            </g>
          ))}

          {[1, Math.round(nMax / 2), nMax].filter((v, i, a) => a.indexOf(v) === i && v >= 1).map((n) => (
            <text key={n} x={x(n)} y={H - 12} className="axis-label" textAnchor={n === 1 ? 'start' : n === nMax ? 'end' : 'middle'}>
              cuota {n}
            </text>
          ))}

          <path d={area} fill="url(#grad-saldo)" />
          {comparar && (
            <path d={linea(filasSinAbonos!)} fill="none" stroke={SERIE_3} strokeWidth="2"
              strokeDasharray="6 5" strokeLinecap="round" opacity="0.85" />
          )}
          <path d={linea(filas)} fill="none" stroke={SERIE_1} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {f && (
            <g>
              <line x1={x(f.n)} x2={x(f.n)} y1={M.t} y2={M.t + IH} className="crosshair" />
              <circle cx={x(f.n)} cy={y(f.saldo)} r="6" fill={SERIE_1} stroke="var(--surface-raised)" strokeWidth="2" />
            </g>
          )}
        </svg>

        {f && (
          <div
            className="tooltip"
            style={{
              left: `${(x(f.n) / W) * 100}%`,
              transform: `translate(${x(f.n) > W * 0.62 ? '-104%' : '4%'}, -50%)`,
            }}
          >
            <strong>Cuota {f.n} · {f.mes} {f.anio}</strong>
            <span><i style={{ background: SERIE_1 }} />Saldo <b className="num">{formatMoney(f.saldo, moneda)}</b></span>
            <span><i style={{ background: SERIE_2 }} />Interés del mes <b className="num">{formatMoney(f.interes, moneda)}</b></span>
            <span><i style={{ background: SERIE_1 }} />Abonado a capital <b className="num">{formatMoney(f.amortizacion, moneda)}</b></span>
            {f.abonoExtra > 0 && (
              <span><i style={{ background: SERIE_3 }} />Abono extra <b className="num">{formatMoney(f.abonoExtra, moneda)}</b></span>
            )}
          </div>
        )}
      </div>
    </figure>
  );
}

/* ================================================================== */
/*  Capital vs. intereses por año                                      */
/* ================================================================== */

export function AnualChart({ resumen, moneda }: { resumen: ResumenAnual[]; moneda: Moneda }) {
  const [hover, setHover] = useState<number | null>(null);
  if (resumen.length === 0) return null;

  const { ticks: yTicks, max: yMax } = escala(Math.max(...resumen.map((a) => a.capital + a.interes), 1));
  const paso = IW / resumen.length;
  const ancho = Math.min(46, Math.max(6, paso * 0.62));
  const cx = (i: number) => M.l + paso * i + paso / 2;
  const y = (v: number) => M.t + IH - (v / yMax) * IH;
  const R = 4;

  // Solo se etiquetan los extremos: nunca un número sobre cada barra.
  const iMax = resumen.reduce((best, a, i, arr) => (a.interes > arr[best].interes ? i : best), 0);

  const a = hover !== null ? resumen[hover] : null;

  return (
    <figure className="chart">
      <figcaption className="chart__title">
        Cuánto pagas cada año
        <span className="chart__note">Al principio casi todo se va en intereses</span>
      </figcaption>
      <Legend items={[
        { color: 'var(--series-1)', label: 'Capital (baja tu deuda)' },
        { color: 'var(--series-2)', label: 'Intereses (costo del crédito)' },
      ]} />
      <div className="chart__canvas">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Capital e intereses pagados por año, ${resumen.length} años`}
          onPointerLeave={() => setHover(null)}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={M.l - 10} y={y(t)} className="axis-label" textAnchor="end" dominantBaseline="middle">
                {formatCompact(t, moneda)}
              </text>
            </g>
          ))}

          {resumen.map((r, i) => {
            const hCap = Math.max(0, (r.capital / yMax) * IH);
            const hInt = Math.max(0, (r.interes / yMax) * IH);
            const x0 = cx(i) - ancho / 2;
            const yCap = M.t + IH - hCap;
            // 2px de aire entre segmentos apilados: se leen como piezas distintas.
            const yInt = yCap - hInt - 2;
            const activo = hover === null || hover === i;
            return (
              <g key={r.anio} opacity={activo ? 1 : 0.42}>
                {/* Capital: pegado a la línea base, sin redondear (va bajo el interés). */}
                <rect x={x0} y={yCap} width={ancho} height={hCap} fill={SERIE_1} />
                {hInt > 0.5 && (
                  /* Interés: es el extremo del dato, solo ahí van las esquinas redondas. */
                  <path d={topeRedondo(x0, Math.max(M.t, yInt), ancho, Math.max(1, hInt), R)} fill={SERIE_2} />
                )}
                <rect
                  x={cx(i) - paso / 2} y={M.t} width={paso} height={IH}
                  fill="transparent" style={{ cursor: 'pointer' }}
                  onPointerEnter={() => setHover(i)}
                />
                <text x={cx(i)} y={H - 12} className="axis-label" textAnchor="middle">{r.anio}</text>
                {i === iMax && hInt > 14 && (
                  <text x={cx(i)} y={Math.max(M.t + 9, yInt - 12)} className="bar-label" textAnchor="middle">
                    {formatCompact(r.interes, moneda)} de interés
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {a && (
          <div
            className="tooltip"
            style={{
              left: `${(cx(hover!) / W) * 100}%`,
              top: '12%',
              transform: `translate(${cx(hover!) > W * 0.62 ? '-104%' : '4%'}, 0)`,
            }}
          >
            <strong>Año {a.anio}</strong>
            <span><i style={{ background: SERIE_1 }} />Capital <b className="num">{formatMoney(a.capital, moneda)}</b></span>
            <span><i style={{ background: SERIE_2 }} />Intereses <b className="num">{formatMoney(a.interes, moneda)}</b></span>
            {a.extras > 0 && <span><i style={{ background: SERIE_3 }} />Abonos extra <b className="num">{formatMoney(a.extras, moneda)}</b></span>}
            <span><i style={{ background: 'var(--ink-muted)' }} />Saldo a fin de año <b className="num">{formatMoney(a.saldoFinal, moneda)}</b></span>
          </div>
        )}
      </div>
    </figure>
  );
}
