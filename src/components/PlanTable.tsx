import { useMemo, useState } from 'react';
import type { AbonoPuntual, PlanResult } from '../lib/amortization';
import { formatNumber, parseNumero, type Moneda } from '../lib/format';

type Filtro = 'todas' | 'abonos' | 'anual';
const PAGINA = 24;

export function PlanTable({
  plan, moneda, abonos, onAbonosChange,
}: {
  plan: PlanResult;
  moneda: Moneda;
  abonos: AbonoPuntual[];
  onAbonosChange: (a: AbonoPuntual[]) => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [limite, setLimite] = useState(PAGINA);
  const [editando, setEditando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState('');

  const puntualPorCuota = useMemo(() => {
    const m = new Map<number, AbonoPuntual>();
    for (const a of abonos) m.set(a.cuota, a);
    return m;
  }, [abonos]);

  const filas = useMemo(() => {
    if (filtro === 'abonos') return plan.filas.filter((f) => f.abonoExtra > 0);
    if (filtro === 'anual') return plan.filas.filter((f, i) => i === plan.filas.length - 1 || f.n % 12 === 0);
    return plan.filas;
  }, [plan.filas, filtro]);

  const visibles = filas.slice(0, limite);

  const guardarPuntual = (cuota: number, texto: string) => {
    const monto = parseNumero(texto);
    const resto = abonos.filter((a) => a.cuota !== cuota);
    onAbonosChange(monto > 0 ? [...resto, { id: `p-${cuota}`, cuota, monto, nota: '' }] : resto);
    setEditando(null);
    setBorrador('');
  };

  const n = (v: number) => formatNumber(v, moneda);

  if (plan.filas.length === 0) return null;

  return (
    <div className="tabla-zona">
      <div className="tabla-barra">
        <div className="segments" role="group" aria-label="Filtrar filas">
          {([
            ['todas', `Todas (${plan.filas.length})`],
            ['anual', 'Cada 12 cuotas'],
            ['abonos', `Con abono extra (${plan.filas.filter((f) => f.abonoExtra > 0).length})`],
          ] as Array<[Filtro, string]>).map(([v, l]) => (
            <button
              key={v}
              type="button"
              className="segment"
              aria-pressed={filtro === v}
              onClick={() => { setFiltro(v); setLimite(PAGINA); }}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="field__hint">
          Toca <b>+</b> en cualquier fila para registrar un abono extra puntual (una prima, un bono).
        </span>
      </div>

      <div className="tabla-scroll" tabIndex={0} role="region" aria-label="Tabla del plan de pagos">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col" className="col-n">#</th>
              <th scope="col">Mes</th>
              <th scope="col" className="num-col">Cuota</th>
              <th scope="col" className="num-col">Abono extra</th>
              <th scope="col" className="num-col">Intereses</th>
              <th scope="col" className="num-col">Amortización</th>
              <th scope="col" className="num-col">Pago total</th>
              <th scope="col" className="num-col">Saldo</th>
              <th scope="col" className="col-accion"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => {
              const nuevoAnio = i > 0 && visibles[i - 1].anio !== f.anio;
              const tienePuntual = puntualPorCuota.has(f.n);
              return (
                <tr key={f.n} className={`${nuevoAnio ? 'fila--anio' : ''}${f.abonoExtra > 0 ? ' fila--abono' : ''}`}>
                  <td className="col-n num">{f.n}</td>
                  <td className="col-mes">
                    {f.mes} <span className="muted">{f.anio}</span>
                  </td>
                  <td className="num-col num">{n(f.cuota)}</td>
                  <td className="num-col num">
                    {editando === f.n ? (
                      <input
                        className="input input--mini"
                        autoFocus
                        inputMode="decimal"
                        value={borrador}
                        placeholder="0"
                        onChange={(e) => setBorrador(e.target.value)}
                        onBlur={() => guardarPuntual(f.n, borrador)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') guardarPuntual(f.n, borrador);
                          if (e.key === 'Escape') { setEditando(null); setBorrador(''); }
                        }}
                      />
                    ) : f.abonoExtra > 0 ? (
                      <b style={{ color: 'var(--gold-strong)' }}>{n(f.abonoExtra)}</b>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num-col num" style={{ color: 'var(--plum)' }}>{n(f.interes)}</td>
                  <td className="num-col num">{n(f.amortizacion)}</td>
                  <td className="num-col num">{n(f.pagoTotal)}</td>
                  <td className="num-col num" style={{ fontWeight: 600 }}>{n(f.saldo)}</td>
                  <td className="col-accion">
                    <button
                      type="button"
                      className="btn btn--quiet"
                      title={tienePuntual ? `Editar abono puntual de la cuota ${f.n}` : `Agregar abono extra en la cuota ${f.n}`}
                      aria-label={tienePuntual ? `Editar abono puntual de la cuota ${f.n}` : `Agregar abono extra en la cuota ${f.n}`}
                      onClick={() => {
                        setEditando(f.n);
                        setBorrador(tienePuntual ? String(puntualPorCuota.get(f.n)!.monto) : '');
                      }}
                    >
                      {tienePuntual ? '✎' : '+'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Totales</td>
              <td className="num-col num">{n(plan.totalPagado - plan.totalAbonosExtra - plan.totalCostos)}</td>
              <td className="num-col num">{n(plan.totalAbonosExtra)}</td>
              <td className="num-col num">{n(plan.totalIntereses)}</td>
              <td className="num-col num">{n(plan.totalCapital)}</td>
              <td className="num-col num">{n(plan.totalPagado)}</td>
              <td className="num-col num">0</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {limite < filas.length && (
        <div className="tabla-mas">
          <button type="button" className="btn btn--ghost" onClick={() => setLimite((l) => l + PAGINA * 2)}>
            Ver {Math.min(PAGINA * 2, filas.length - limite)} cuotas más
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => setLimite(filas.length)}>
            Ver todas ({filas.length})
          </button>
        </div>
      )}
    </div>
  );
}
