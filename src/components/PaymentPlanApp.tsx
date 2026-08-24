import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  calcularCuota, construirPlan, diagnosticar, generarConsejos,
  type AbonoPuntual, type Estrategia, type PlanInput, type PlanResult, type Presupuesto, type TipoTasa,
} from '../lib/amortization';
import {
  duracionLegible, formatMoney, formatPercent, getMoneda, mesActualISO, MONEDAS,
} from '../lib/format';
import { AnualChart, SaldoChart } from './Charts';
import { PlanTable } from './PlanTable';
import { Card, MonthField, NumberField, SelectField, Segmented, StatTile, TextField } from './ui';

const CLAVE = 'plan-de-pagos:v1';

interface Estado {
  input: PlanInput;
  presupuesto: Presupuesto;
}

const INICIAL: Estado = {
  input: {
    nombre: 'Mi crédito',
    moneda: 'COP',
    monto: 20_000_000,
    tasa: 1.4,
    tipoTasa: 'mensual',
    plazoMeses: 60,
    cuotaPersonalizada: 0,
    fechaInicio: mesActualISO(),
    costosMensuales: 0,
    abonoExtraMensual: 0,
    incrementoAnualPct: 0,
    estrategia: 'reducir-cuota',
    abonosPuntuales: [],
  },
  presupuesto: { ingresoMensual: 0, gastosFijos: 0, otrasDeudas: 0 },
};

interface Preset {
  nombre: string;
  emoji: string;
  descripcion: string;
  parche: Partial<PlanInput>;
}

const PRESETS: Preset[] = [
  {
    nombre: 'Vivienda',
    emoji: '🏠',
    descripcion: 'Plazo largo, tasa baja',
    parche: { nombre: 'Crédito de vivienda', monto: 180_000_000, tasa: 12.5, tipoTasa: 'anual-efectiva', plazoMeses: 180, costosMensuales: 120_000 },
  },
  {
    nombre: 'Vehículo',
    emoji: '🚗',
    descripcion: 'Plazo medio con seguro',
    parche: { nombre: 'Crédito de vehículo', monto: 60_000_000, tasa: 1.5, tipoTasa: 'mensual', plazoMeses: 60, costosMensuales: 90_000 },
  },
  {
    nombre: 'Libre inversión',
    emoji: '💡',
    descripcion: 'Tasa alta, plazo corto',
    parche: { nombre: 'Libre inversión', monto: 20_000_000, tasa: 1.9, tipoTasa: 'mensual', plazoMeses: 36, costosMensuales: 0 },
  },
  {
    nombre: 'Tarjeta',
    emoji: '💳',
    descripcion: 'Lo más caro: sal pronto',
    parche: { nombre: 'Deuda de tarjeta', monto: 6_000_000, tasa: 2.2, tipoTasa: 'mensual', plazoMeses: 24, costosMensuales: 0 },
  },
];

/**
 * Plantilla en blanco. Los selectores (moneda, tipo de tasa, estrategia) y el mes
 * de la primera cuota no tienen un "cero" con sentido, así que se quedan en su
 * valor por defecto; todo lo demás vuelve a 0.
 */
function vacio(): Estado {
  return {
    input: {
      nombre: '',
      moneda: 'COP',
      monto: 0,
      tasa: 0,
      tipoTasa: 'mensual',
      plazoMeses: 0,
      cuotaPersonalizada: 0,
      fechaInicio: mesActualISO(),
      costosMensuales: 0,
      abonoExtraMensual: 0,
      incrementoAnualPct: 0,
      estrategia: 'reducir-cuota',
      abonosPuntuales: [],
    },
    presupuesto: { ingresoMensual: 0, gastosFijos: 0, otrasDeudas: 0 },
  };
}

function cargar(): Estado {
  if (typeof window === 'undefined') return INICIAL;
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return INICIAL;
    const guardado = JSON.parse(crudo) as Partial<Estado>;
    return {
      input: { ...INICIAL.input, ...guardado.input },
      presupuesto: { ...INICIAL.presupuesto, ...guardado.presupuesto },
    };
  } catch {
    return INICIAL;
  }
}

export default function PaymentPlanApp() {
  const [estado, setEstado] = useState<Estado>(INICIAL);
  const [hidratado, setHidratado] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [errorExport, setErrorExport] = useState<string | null>(null);

  useEffect(() => {
    setEstado(cargar());
    setHidratado(true);
  }, []);

  useEffect(() => {
    if (!hidratado) return;
    try {
      window.localStorage.setItem(CLAVE, JSON.stringify(estado));
    } catch {
      /* modo privado o cuota llena: el plan sigue funcionando en memoria */
    }
  }, [estado, hidratado]);

  const { input, presupuesto } = estado;
  const moneda = getMoneda(input.moneda);

  const set = useCallback(<K extends keyof PlanInput>(clave: K, valor: PlanInput[K]) => {
    setEstado((s) => ({ ...s, input: { ...s.input, [clave]: valor } }));
  }, []);

  const setPresu = useCallback(<K extends keyof Presupuesto>(clave: K, valor: Presupuesto[K]) => {
    setEstado((s) => ({ ...s, presupuesto: { ...s.presupuesto, [clave]: valor } }));
  }, []);

  const plan = useMemo(() => construirPlan(input), [input]);

  /**
   * Mientras se escribe, un valor a medias (el monto vacío un instante) deja el
   * plan en error. Guardamos el último cálculo bueno para no vaciar la página
   * entera en cada tecla: se siguen viendo las cifras anteriores, marcadas como
   * desactualizadas, hasta que la entrada vuelva a ser válida.
   */
  const ultimoValido = useRef<PlanResult | null>(null);
  useEffect(() => {
    if (!plan.error && plan.filas.length > 0) ultimoValido.current = plan;
  }, [plan]);

  const desactualizado = Boolean(plan.error) && ultimoValido.current !== null;
  const planVisible = desactualizado ? ultimoValido.current! : plan;

  // Escenario sin abonos, solo para dibujar la comparación en la gráfica.
  const planSinAbonos = useMemo(
    () => construirPlan({ ...input, abonoExtraMensual: 0, incrementoAnualPct: 0, abonosPuntuales: [] }),
    [input],
  );

  const pagoMensual = planVisible.filas[0]?.pagoTotal ?? 0;
  const salud = useMemo(() => diagnosticar(presupuesto, pagoMensual), [presupuesto, pagoMensual]);
  const consejos = useMemo(() => generarConsejos(planVisible, input, salud), [planVisible, input, salud]);

  const hayAbonos = planVisible.totalAbonosExtra > 0;

  const exportar = async () => {
    setExportando(true);
    setErrorExport(null);
    try {
      const { exportarExcel } = await import('../lib/export-excel');
      await exportarExcel({ input, plan, presupuesto, salud, consejos });
    } catch (e) {
      setErrorExport(e instanceof Error ? e.message : 'No se pudo generar el archivo.');
    } finally {
      setExportando(false);
    }
  };

  const aplicarPreset = (p: Preset) => {
    setEstado((s) => ({ ...s, input: { ...s.input, ...p.parche, cuotaPersonalizada: 0, abonosPuntuales: [] } }));
  };

  const reiniciar = () => {
    if (!window.confirm('Se borrarán todos los datos de este plan y la plantilla quedará en cero. ¿Continuar?')) return;
    setEstado(vacio());
  };

  return (
    <div className="stack app">
      {/* ---------------- Resumen pegajoso ---------------- */}
      <div className="resumen">
        <div className="resumen__hero">
          <span className="resumen__label">
            {planVisible.cuotaVariable ? 'Tu primera cuota' : 'Tu cuota mensual'}
            {desactualizado && <span className="chip chip--warn">Sin actualizar</span>}
          </span>
          <span className={`resumen__cifra num${desactualizado ? ' resumen__cifra--viejo' : ''}`}>
            {planVisible.error ? '—' : formatMoney(pagoMensual, moneda)}
          </span>
          <span className="resumen__detalle">
            {planVisible.error
              ? planVisible.error
              : `${duracionLegible(planVisible.mesesReales)} · termina en ${planVisible.fechaFinal}` +
                (planVisible.cuotaVariable
                  ? ` · la cuota baja hasta ${formatMoney(planVisible.cuotaUltima, moneda)}`
                  : '')}
          </span>
        </div>

        {plan.error && (
          <p className="alerta alerta--warn" role="status">
            <strong>Revisa los datos:</strong> {plan.error}
            {desactualizado && ' Mientras tanto ves las cifras del último cálculo válido.'}
          </p>
        )}

        <div className="stats">
          <StatTile
            label="Total a pagar"
            value={formatMoney(planVisible.totalPagado, moneda)}
            detail={`${formatMoney(input.monto, moneda)} de capital`}
          />
          <StatTile
            label="Intereses"
            value={formatMoney(planVisible.totalIntereses, moneda)}
            accent="plum"
            detail={planVisible.totalPagado > 0 ? `${((planVisible.totalIntereses / planVisible.totalPagado) * 100).toFixed(0)} % de lo que pagas` : undefined}
          />
          <StatTile
            label="Tasa anual efectiva"
            value={formatPercent(planVisible.tasaAnualEfectiva)}
            accent="gold"
            detail={`${formatPercent(planVisible.tasaMensual * 100)} mensual`}
          />
          <StatTile
            label={hayAbonos ? 'Te ahorras' : 'Ahorro con abonos'}
            value={hayAbonos ? formatMoney(planVisible.interesesAhorrados, moneda) : '—'}
            accent={hayAbonos ? 'ok' : 'ink'}
            detail={hayAbonos ? `${planVisible.mesesAhorrados} meses menos` : 'Agrega un abono extra abajo'}
          />
        </div>

        <div className="resumen__acciones">
          <button type="button" className="btn btn--primary btn--lg" onClick={exportar} disabled={exportando || !!plan.error}>
            {exportando ? 'Generando…' : '↓  Descargar en Excel'}
          </button>
          <button type="button" className="btn btn--quiet" onClick={reiniciar}>Empezar de cero</button>
        </div>
        {errorExport && <p className="alerta alerta--danger">No se pudo exportar: {errorExport}</p>}
      </div>

      {/* ---------------- Datos del crédito ---------------- */}
      <Card
        id="credito"
        title="1 · Tu crédito"
        subtitle="Los datos que aparecen en tu carta de aprobación o extracto."
        icon={<Icono nombre="doc" />}
          paso={1}
        actions={
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.nombre} type="button" className="preset" onClick={() => aplicarPreset(p)} title={p.descripcion}>
                <span aria-hidden="true">{p.emoji}</span> {p.nombre}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid-fields">
          <TextField label="Nombre del plan" value={input.nombre} onChange={(v) => set('nombre', v)} placeholder="Crédito de vivienda" />
          <SelectField
            label="Moneda"
            value={input.moneda}
            onChange={(v) => set('moneda', v)}
            options={MONEDAS.map((m) => ({ value: m.codigo, label: `${m.codigo} · ${m.corto}` }))}
            hint={`${moneda.nombre} (${moneda.simbolo})`}
          />
          <NumberField label="Monto del crédito" value={input.monto} onChange={(v) => set('monto', v)} moneda={moneda} prefix={moneda.simbolo} />
          <NumberField label="Tasa de interés" value={input.tasa} onChange={(v) => set('tasa', v)} moneda={moneda} suffix="%" decimales={2} max={200} />
          <SelectField<TipoTasa>
            label="Tipo de tasa"
            value={input.tipoTasa}
            onChange={(v) => set('tipoTasa', v)}
            options={[
              { value: 'mensual', label: 'Mensual (M.V.)' },
              { value: 'anual-efectiva', label: 'Anual efectiva (E.A.)' },
              { value: 'anual-nominal', label: 'Anual nominal' },
            ]}
            hint="Si tu banco dice “% E.A.”, elige anual efectiva."
          />
          <NumberField label="Plazo" value={input.plazoMeses} onChange={(v) => set('plazoMeses', Math.round(v))} moneda={moneda} suffix="meses" decimales={0} max={600} hint={input.plazoMeses > 0 ? duracionLegible(input.plazoMeses) : undefined} />
          <NumberField
            label="Cuota que te dio el banco"
            value={input.cuotaPersonalizada}
            onChange={(v) => set('cuotaPersonalizada', v)}
            moneda={moneda}
            prefix={moneda.simbolo}
            hint={input.cuotaPersonalizada > 0
              ? `Se usa esta cuota. La calculada sería ${formatMoney(calcularCuota(input.monto, plan.tasaMensual, input.plazoMeses), moneda)}.`
              : 'Opcional. Déjala en blanco y la calculamos por ti.'}
          />
          <MonthField label="Primera cuota" value={input.fechaInicio} onChange={(v) => set('fechaInicio', v)} />
          <NumberField label="Costos mensuales" value={input.costosMensuales} onChange={(v) => set('costosMensuales', v)} moneda={moneda} prefix={moneda.simbolo} hint="Seguros, administración. Suman al pago pero no bajan el saldo." />
        </div>
      </Card>

      {/* ---------------- Abonos extra ---------------- */}
      <Card
        id="abonos"
        title="2 · Tu estrategia de abonos extra"
        subtitle="Aquí está el verdadero ahorro: cada peso extra ataca el capital, no los intereses."
        icon={<Icono nombre="rayo" />}
          paso={2}
      >
        <div className="grid-fields">
          <Segmented<Estrategia>
            label="¿Qué quieres que haga el abono?"
            value={input.estrategia}
            onChange={(v) => set('estrategia', v)}
            options={[
              { value: 'reducir-cuota', label: 'Reducir la cuota', hint: 'Cada abono recalcula la cuota hacia abajo sobre el plazo pactado. Alivia el mes a mes; si el abono es mensual, el crédito igual puede terminar antes.' },
              { value: 'reducir-plazo', label: 'Reducir el plazo', hint: 'Mantienes la misma cuota y terminas antes. Ahorra más intereses.' },
            ]}
          />
          <NumberField label="Abono extra mensual" value={input.abonoExtraMensual} onChange={(v) => set('abonoExtraMensual', v)} moneda={moneda} prefix={moneda.simbolo} hint="Un valor fijo adicional que abonas cada mes." />
          <NumberField label="Aumento anual del abono" value={input.incrementoAnualPct} onChange={(v) => set('incrementoAnualPct', v)} moneda={moneda} suffix="%" decimales={1} max={100} hint="Cada 12 cuotas el abono sube este porcentaje." />
          {salud.capacidadAbono > 0 && (
            <div className="field" style={{ justifyContent: 'flex-end' }}>
              <span className="field__label">Sugerencia según tu presupuesto</span>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => set('abonoExtraMensual', Math.round(salud.capacidadAbono))}
              >
                Usar {formatMoney(salud.capacidadAbono, moneda)} / mes
              </button>
              <span className="field__hint">La mitad de tu excedente, dejando colchón.</span>
            </div>
          )}
        </div>

        {input.abonosPuntuales.length > 0 && (
          <div className="puntuales">
            <span className="field__label">Abonos puntuales registrados</span>
            <div className="puntuales__lista">
              {[...input.abonosPuntuales].sort((a, b) => a.cuota - b.cuota).map((a) => (
                <span key={a.id} className="chip chip--warn">
                  Cuota {a.cuota}: {formatMoney(a.monto, moneda)}
                  <button
                    type="button"
                    className="chip__x"
                    aria-label={`Quitar abono de la cuota ${a.cuota}`}
                    onClick={() => set('abonosPuntuales', input.abonosPuntuales.filter((x) => x.id !== a.id))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ---------------- Presupuesto ---------------- */}
      <Card
        id="presupuesto"
        title="3 · ¿Cabe en tu presupuesto?"
        subtitle="Opcional, pero es lo que evita que te sobreendeudes. Nada sale de tu equipo."
        icon={<Icono nombre="balanza" />}
          paso={3}
      >
        <div className="grid-fields">
          <NumberField label="Ingreso mensual neto" value={presupuesto.ingresoMensual} onChange={(v) => setPresu('ingresoMensual', v)} moneda={moneda} prefix={moneda.simbolo} hint="Lo que realmente te llega cada mes." />
          <NumberField label="Gastos fijos" value={presupuesto.gastosFijos} onChange={(v) => setPresu('gastosFijos', v)} moneda={moneda} prefix={moneda.simbolo} hint="Arriendo, mercado, servicios, transporte." />
          <NumberField label="Otras cuotas de deuda" value={presupuesto.otrasDeudas} onChange={(v) => setPresu('otrasDeudas', v)} moneda={moneda} prefix={moneda.simbolo} hint="Tarjetas y otros créditos que ya pagas." />
        </div>

        <div className={`salud salud--${salud.nivel}`}>
          <div className="salud__cabeza">
            <span className={`chip chip--${salud.nivel === 'comodo' ? 'ok' : salud.nivel === 'ajustado' ? 'warn' : salud.nivel === 'riesgo' ? 'danger' : ''}`}>
              {salud.titulo}
            </span>
            {salud.nivel !== 'sin-datos' && (
              <span className="muted num" style={{ fontSize: '0.82rem' }}>
                Cuota {(salud.ratioCuota * 100).toFixed(0)} % · Deudas {(salud.ratioDeudaTotal * 100).toFixed(0)} % del ingreso
              </span>
            )}
          </div>
          <p className="salud__texto">{salud.mensaje}</p>
          {salud.nivel !== 'sin-datos' && (
            <div className="barra" role="img" aria-label={`La cuota representa el ${(salud.ratioCuota * 100).toFixed(0)} por ciento de tu ingreso`}>
              <div className="barra__pista">
                <div className="barra__valor" style={{ width: `${Math.min(100, salud.ratioCuota * 100)}%` }} />
                <div className="barra__marca" style={{ left: '30%' }} title="Límite recomendado: 30 %" />
              </div>
              <div className="barra__pies">
                <span>0 %</span>
                <span className="barra__lim">límite sano 30 %</span>
                <span>100 %</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ---------------- Gráficas ---------------- */}
      {!planVisible.error && planVisible.filas.length > 0 && (
        <Card
          id="graficas"
          title="4 · Cómo se comporta tu deuda"
          subtitle="La línea que baja es tu saldo. Las barras muestran a dónde se va cada pago."
          icon={<Icono nombre="grafica" />}
          paso={4}
        >
          <div className="charts">
            <SaldoChart plan={planVisible} moneda={moneda} filasSinAbonos={hayAbonos ? planSinAbonos.filas : undefined} />
            <AnualChart resumen={planVisible.resumenAnual} moneda={moneda} />
          </div>
        </Card>
      )}

      {/* ---------------- Consejos ---------------- */}
      {consejos.length > 0 && (
        <Card
          id="consejos"
          title="5 · Para tu caso"
          subtitle="Lecturas sobre tus propios números, no consejos genéricos."
          icon={<Icono nombre="idea" />}
          paso={5}
        >
          <div className="consejos">
            {consejos.map((c) => (
              <article key={c.titulo} className={`consejo consejo--${c.tono}`}>
                <h3 className="consejo__titulo">{c.titulo}</h3>
                <p className="consejo__texto">{c.texto}</p>
              </article>
            ))}
          </div>
          {planVisible.advertencias.length > 0 && (
            <ul className="advertencias">
              {planVisible.advertencias.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
        </Card>
      )}

      {/* ---------------- Tabla ---------------- */}
      <Card
        id="tabla"
        title="6 · Tu plan de pagos"
        subtitle="Cuota por cuota. Esta misma tabla es la que baja a Excel."
        icon={<Icono nombre="tabla" />}
          paso={6}
        actions={
          <button type="button" className="btn btn--primary" onClick={exportar} disabled={exportando || !!plan.error}>
            {exportando ? 'Generando…' : '↓  Excel'}
          </button>
        }
      >
        {planVisible.error
          ? <p className="alerta alerta--warn">{planVisible.error}</p>
          : (
            <PlanTable
              plan={planVisible}
              moneda={moneda}
              abonos={input.abonosPuntuales}
              onAbonosChange={(a) => set('abonosPuntuales', a as AbonoPuntual[])}
            />
          )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Iconos                                                             */
/* ------------------------------------------------------------------ */

function Icono({ nombre }: { nombre: 'doc' | 'rayo' | 'balanza' | 'grafica' | 'idea' | 'tabla' }) {
  const comun = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (nombre) {
    case 'doc':
      return <svg {...comun}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>;
    case 'rayo':
      return <svg {...comun}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>;
    case 'balanza':
      return <svg {...comun}><path d="M12 3v18M5 7h14M7 7l-3 7h6zM17 7l-3 7h6zM8 21h8" /></svg>;
    case 'grafica':
      return <svg {...comun}><path d="M4 19V5M4 19h16M8 15l4-5 3 3 5-7" /></svg>;
    case 'idea':
      return <svg {...comun}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6h5.4c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z" /></svg>;
    case 'tabla':
      return <svg {...comun}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10" /></svg>;
  }
}
