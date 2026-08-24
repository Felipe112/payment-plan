/* Verificación offline del motor y del exportador (no forma parte del sitio). */
import { construirPlan, calcularCuota, tasaMensualDesde, diagnosticar, generarConsejos } from '../src/lib/amortization';
import type { PlanInput } from '../src/lib/amortization';

const base: PlanInput = {
  nombre: 'Préstamo de referencia',
  moneda: 'COP',
  monto: 20_000_000,
  tasa: 1.4,
  tipoTasa: 'mensual',
  plazoMeses: 60,
  cuotaPersonalizada: 0,
  fechaInicio: '2026-02',
  costosMensuales: 0,
  abonoExtraMensual: 0,
  incrementoAnualPct: 0,
  estrategia: 'reducir-plazo',
  abonosPuntuales: [],
};

const r = (n: number) => Math.round(n);
let fallos = 0;
const check = (nombre: string, real: number | string, esperado: number | string, tol = 0) => {
  const ok = typeof real === 'number' && typeof esperado === 'number'
    ? Math.abs(real - esperado) <= tol
    : real === esperado;
  if (!ok) fallos += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${nombre}: ${real}${ok ? '' : ` (esperado ${esperado})`}`);
};

// --- 1. Cuota del sistema francés ---
check('cuota 20M / 1,4% / 60m', r(calcularCuota(20_000_000, 0.014, 60)), 494_903, 2);

// --- 2. Conversión de tasas ---
check('25% E.A. -> mensual %', +(tasaMensualDesde(25, 'anual-efectiva') * 100).toFixed(4), 1.8769, 0.0002);
check('18% nominal -> mensual %', +(tasaMensualDesde(18, 'anual-nominal') * 100).toFixed(4), 1.5, 0.0001);

// --- 3. El plan cierra en cero y respeta el plazo ---
const plan = construirPlan(base);
check('meses del plan', plan.mesesReales, 60);
check('saldo final', r(plan.filas.at(-1)!.saldo), 0);
check('primer interés = saldo x tasa', r(plan.filas[0].interes), r(20_000_000 * 0.014));
check('total pagado ~ cuota x 60', r(plan.totalPagado), r(plan.cuotaBase * 60), 5);
check('capital + interés = total', r(plan.totalCapital + plan.totalIntereses), r(plan.totalPagado), 5);
check('capital total = monto', r(plan.totalCapital), 20_000_000, 5);
check('última cuota', plan.fechaFinal, 'Enero 2031');

// --- 4. Abonos extra: acortan el plazo y ahorran intereses ---
const conAbono = construirPlan({ ...base, abonoExtraMensual: 200_000 });
check('abono acorta el plazo', conAbono.mesesReales < 60 ? 1 : 0, 1);
check('abono ahorra intereses', conAbono.totalIntereses < plan.totalIntereses ? 1 : 0, 1);
check('saldo final con abono', r(conAbono.filas.at(-1)!.saldo), 0);
check('nunca se paga de más', conAbono.filas.at(-1)!.pagoTotal <= plan.cuotaBase + 200_000 + 0.01 ? 1 : 0, 1);
console.log(`      → con 200k/mes: ${conAbono.mesesReales} cuotas, ahorro ${r(conAbono.interesesAhorrados).toLocaleString('es-CO')}`);

// --- 5. Abono puntual ---
const puntual = construirPlan({
  ...base,
  abonosPuntuales: [{ id: 'a', cuota: 12, monto: 5_000_000, nota: '' }],
});
check('abono puntual aplicado', r(puntual.filas[11].abonoExtra), 5_000_000);
check('abono puntual acorta plazo', puntual.mesesReales < 60 ? 1 : 0, 1);

// --- 6. Reducir cuota mantiene el plazo ---
const reducirCuota = construirPlan({ ...base, abonoExtraMensual: 200_000, estrategia: 'reducir-cuota' });
check('reducir-cuota baja la cuota', reducirCuota.filas[5].cuota < plan.cuotaBase ? 1 : 0, 1);
check('reducir-plazo ahorra más', conAbono.totalIntereses <= reducirCuota.totalIntereses ? 1 : 0, 1);

// --- 7. Tasa cero ---
const sinTasa = construirPlan({ ...base, tasa: 0 });
check('tasa 0: cuota = monto/plazo', r(sinTasa.cuotaBase), r(20_000_000 / 60));
check('tasa 0: sin intereses', r(sinTasa.totalIntereses), 0);

// --- 8. Costos mensuales suman al pago, no al capital ---
const conSeguro = construirPlan({ ...base, costosMensuales: 50_000 });
check('seguro suma al pago', r(conSeguro.totalPagado - plan.totalPagado), 50_000 * 60, 5);
check('seguro no cambia intereses', r(conSeguro.totalIntereses), r(plan.totalIntereses), 5);

// --- 9. Entradas inválidas ---
check('monto 0 -> error', construirPlan({ ...base, monto: 0 }).error ? 1 : 0, 1);
check('plazo 0 -> error', construirPlan({ ...base, plazoMeses: 0 }).error ? 1 : 0, 1);
check('plazo 999 -> error', construirPlan({ ...base, plazoMeses: 999 }).error ? 1 : 0, 1);

// --- 9b. Cuota dictada por el banco (como en la plantilla original) ---
const cuotaBanco = construirPlan({ ...base, cuotaPersonalizada: 569_081 });
check('usa la cuota escrita', r(cuotaBanco.cuotaBase), 569_081);
check('cuota mayor acorta el plazo', cuotaBanco.mesesReales < 60 ? 1 : 0, 1);
check('avisa que termina antes', cuotaBanco.advertencias.some((a) => a.includes('antes del plazo')) ? 1 : 0, 1);
check('cuota que no cubre interés -> error', construirPlan({ ...base, cuotaPersonalizada: 100_000 }).error ? 1 : 0, 1);
console.log(`      → cuota 569.081 liquida 20M en ${cuotaBanco.mesesReales} cuotas`);

// --- 10. Diagnóstico de presupuesto ---
const salud = diagnosticar({ ingresoMensual: 5_000_000, gastosFijos: 2_000_000, otrasDeudas: 0 }, plan.cuotaBase);
check('cuota cómoda con 5M de ingreso', salud.nivel, 'comodo');
const apretado = diagnosticar({ ingresoMensual: 1_200_000, gastosFijos: 800_000, otrasDeudas: 0 }, plan.cuotaBase);
check('cuota en riesgo con 1,2M', apretado.nivel, 'riesgo');
check('consejos generados', generarConsejos(plan, base, salud).length > 0 ? 1 : 0, 1);

// --- 11. Exportación a Excel con DOM simulado ---
const escrito: { nombre: string; bytes: number } = { nombre: '', bytes: 0 };
(globalThis as any).Blob = class {
  parts: any[];
  constructor(parts: any[]) {
    this.parts = parts;
    escrito.bytes = parts[0]?.byteLength ?? parts[0]?.length ?? 0;
    // DUMP=ruta.xlsx guarda el archivo para inspeccionarlo a mano.
    if (process.env.DUMP) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      import('node:fs').then((fs) => fs.writeFileSync(process.env.DUMP!, new Uint8Array(parts[0])));
    }
  }
};
(globalThis as any).URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} };
(globalThis as any).document = {
  createElement: () => ({ href: '', download: '', click() { escrito.nombre = (this as any).download; } }),
  body: { appendChild: () => {}, removeChild: () => {} },
};

const { exportarExcel } = await import('../src/lib/export-excel');
await exportarExcel({
  input: { ...base, abonoExtraMensual: 200_000 },
  plan: conAbono,
  presupuesto: { ingresoMensual: 5_000_000, gastosFijos: 2_000_000, otrasDeudas: 0 },
  salud,
  consejos: generarConsejos(conAbono, base, salud),
});
check('xlsx generado con contenido', escrito.bytes > 8000 ? 1 : 0, 1);
check('nombre del archivo', /^prestamo-de-referencia-\d{4}-\d{2}-\d{2}\.xlsx$/.test(escrito.nombre) ? 1 : 0, 1);
console.log(`      → ${escrito.nombre} (${(escrito.bytes / 1024).toFixed(1)} KB)`);

console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`);
if (fallos > 0) process.exit(1);
