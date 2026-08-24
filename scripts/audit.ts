import { construirPlan, diagnosticar, calcularCuota, tasaMensualDesde } from '../src/lib/amortization';
import type { PlanInput } from '../src/lib/amortization';

const base: PlanInput = {
  nombre: 'Auditoría', moneda: 'COP', monto: 20_000_000, tasa: 1.4, tipoTasa: 'mensual',
  plazoMeses: 60, cuotaPersonalizada: 0, fechaInicio: '2026-02', costosMensuales: 0,
  abonoExtraMensual: 0, incrementoAnualPct: 0, estrategia: 'reducir-plazo', abonosPuntuales: [],
};
const r = (n: number) => Math.round(n);
const co = (n: number) => r(n).toLocaleString('es-CO');
const halla: string[] = [];
const flag = (t: string) => { halla.push(t); console.log('  ⚠  ' + t); };

console.log('\n=== 1. Identidades contables (10 escenarios) ===');
const escenarios: Array<[string, Partial<PlanInput>]> = [
  ['base',                {}],
  ['E.A. 25%',            { tasa: 25, tipoTasa: 'anual-efectiva' }],
  ['nominal 18%',         { tasa: 18, tipoTasa: 'anual-nominal' }],
  ['abono 200k plazo',    { abonoExtraMensual: 200_000 }],
  ['abono 200k cuota',    { abonoExtraMensual: 200_000, estrategia: 'reducir-cuota' }],
  ['incremento 8%',       { abonoExtraMensual: 200_000, incrementoAnualPct: 8 }],
  ['puntual 5M cuota 12', { abonosPuntuales: [{ id: 'a', cuota: 12, monto: 5_000_000, nota: '' }] }],
  ['seguros 90k',         { costosMensuales: 90_000 }],
  ['cuota del banco',     { cuotaPersonalizada: 700_000 }],
  ['vivienda 180M',       { monto: 180_000_000, tasa: 12.5, tipoTasa: 'anual-efectiva', plazoMeses: 180, costosMensuales: 120_000 }],
];
for (const [nom, parche] of escenarios) {
  const p = construirPlan({ ...base, ...parche });
  if (p.error) { flag(`${nom}: error inesperado -> ${p.error}`); continue; }
  const sumaInteres = p.filas.reduce((a, f) => a + f.interes, 0);
  const sumaCapital = p.filas.reduce((a, f) => a + f.amortizacion, 0);
  const sumaPagos   = p.filas.reduce((a, f) => a + f.pagoTotal, 0);
  const sumaCostos  = p.filas.reduce((a, f) => a + f.costos, 0);
  const ok = [
    ['capital = monto',        Math.abs(sumaCapital - (base.monto ?? 0) * 0 + 0) >= 0 && Math.abs(sumaCapital - ({ ...base, ...parche }).monto) < 1],
    ['saldo final 0',          Math.abs(p.filas[p.filas.length - 1].saldo) < 0.01],
    ['Σinterés = total',       Math.abs(sumaInteres - p.totalIntereses) < 0.01],
    ['Σpagos = totalPagado',   Math.abs(sumaPagos - p.totalPagado) < 0.01],
    ['Σcostos = totalCostos',  Math.abs(sumaCostos - p.totalCostos) < 0.01],
    ['cap+int+cost = pagado',  Math.abs(p.totalCapital + p.totalIntereses + p.totalCostos - p.totalPagado) < 0.01],
    ['resumen anual = filas',  Math.abs(p.resumenAnual.reduce((a, x) => a + x.capital, 0) - sumaCapital) < 0.01],
    ['saldo encadena',         p.filas.every((f, i) => i === 0 || Math.abs(f.saldoInicial - p.filas[i - 1].saldo) < 0.01)],
    ['interés = saldo×tasa',   p.filas.every((f) => Math.abs(f.interes - f.saldoInicial * p.tasaMensual) < 0.01)],
    ['sin pago de más',        p.filas.every((f) => f.amortizacion <= f.saldoInicial + 0.01)],
  ] as Array<[string, boolean]>;
  const fallos = ok.filter(([, v]) => !v).map(([k]) => k);
  console.log(`  ${fallos.length ? 'FALLA' : 'OK   '} ${nom.padEnd(20)} ${p.mesesReales} cuotas` + (fallos.length ? ` -> ${fallos.join(', ')}` : ''));
  fallos.forEach((f) => flag(`${nom}: ${f}`));
}

console.log('\n=== 2. Validaciones de entrada ===');
const casos: Array<[string, Partial<PlanInput>, boolean]> = [
  ['monto 0',            { monto: 0 }, true],
  ['monto negativo',     { monto: -100 }, true],
  ['plazo 0',            { plazoMeses: 0 }, true],
  ['plazo negativo',     { plazoMeses: -5 }, true],
  ['plazo 601',          { plazoMeses: 601 }, true],
  ['plazo 600',          { plazoMeses: 600 }, false],
  ['tasa 0',             { tasa: 0 }, false],
  ['tasa negativa',      { tasa: -5 }, false],
  ['cuota < interés',    { cuotaPersonalizada: 100_000 }, true],
  ['costos negativos',   { costosMensuales: -50_000 }, false],
  ['abono negativo',     { abonoExtraMensual: -50_000 }, false],
  ['puntual negativo',   { abonosPuntuales: [{ id: 'a', cuota: 5, monto: -1_000_000, nota: '' }] }, false],
  ['puntual cuota 0',    { abonosPuntuales: [{ id: 'a', cuota: 0, monto: 1_000_000, nota: '' }] }, false],
];
for (const [nom, parche, esperaError] of casos) {
  const p = construirPlan({ ...base, ...parche });
  const hubo = Boolean(p.error);
  const bien = hubo === esperaError;
  console.log(`  ${bien ? 'OK   ' : 'REVISAR'} ${nom.padEnd(20)} error=${hubo}` + (p.error ? `  "${p.error.slice(0, 52)}…"` : ''));
  if (!bien) flag(`validación ${nom}: error=${hubo}, esperado=${esperaError}`);
  if (!hubo && !p.error) {
    if (p.filas.some((f) => f.interes < -0.001)) flag(`${nom}: interés negativo`);
    if (p.filas.some((f) => f.abonoExtra < -0.001)) flag(`${nom}: abono negativo aplicado`);
    if (p.filas.some((f) => f.saldo < -0.001)) flag(`${nom}: saldo negativo`);
  }
}

console.log('\n=== 3. Coherencia entre estrategias ===');
const plazo = construirPlan({ ...base, abonoExtraMensual: 200_000, estrategia: 'reducir-plazo' });
const cuota = construirPlan({ ...base, abonoExtraMensual: 200_000, estrategia: 'reducir-cuota' });
console.log(`  reducir-plazo: ${plazo.mesesReales} cuotas, interés ${co(plazo.totalIntereses)}, ahorro ${co(plazo.interesesAhorrados)}`);
console.log(`  reducir-cuota: ${cuota.mesesReales} cuotas, interés ${co(cuota.totalIntereses)}, ahorro ${co(cuota.interesesAhorrados)}`);
if (plazo.totalIntereses > cuota.totalIntereses) flag('reducir-plazo debería costar menos intereses que reducir-cuota');
// Con un abono MENSUAL fijo sobre una cuota que baja, «reducir-cuota» termina antes:
// es correcto. Lo que se exige es que el plan lo advierta en lugar de callarlo.
if (cuota.mesesReales < base.plazoMeses && !cuota.advertencias.some((a) => a.includes('reducir la cuota'))) {
  flag('reducir-cuota termina antes del plazo y no lo advierte');
}
// Con un abono PUNTUAL sí debe respetar el plazo pactado.
const puntualCuota = construirPlan({
  ...base, estrategia: 'reducir-cuota',
  abonosPuntuales: [{ id: 'a', cuota: 6, monto: 3_000_000, nota: '' }],
});
console.log(`  puntual 3M en cuota 6 (reducir-cuota): ${puntualCuota.mesesReales} cuotas, cuota final ${co(puntualCuota.cuotaUltima)}`);
if (puntualCuota.mesesReales !== base.plazoMeses) flag(`abono puntual con reducir-cuota debería mantener ${base.plazoMeses} cuotas, dio ${puntualCuota.mesesReales}`);
if (puntualCuota.cuotaUltima >= puntualCuota.cuotaBase) flag('abono puntual con reducir-cuota debería bajar la cuota');

console.log('\n=== 4. Qué muestra la cabecera con reducir-cuota ===');
const primera = cuota.filas[0].pagoTotal;
const ultima = cuota.filas[cuota.filas.length - 1].pagoTotal;
console.log(`  primera cuota ${co(primera)} · última cuota ${co(ultima)} · diferencia ${co(primera - ultima)}`);
// La cabecera solo puede decir "Tu cuota mensual" si la cuota es realmente fija.
if (Math.abs(primera - ultima) > 1 && !cuota.cuotaVariable) {
  flag(`el pago varía (${co(primera)} -> ${co(ultima)}) pero cuotaVariable=false: la cabecera diría "Tu cuota mensual"`);
}
const fija = construirPlan({ ...base, abonoExtraMensual: 200_000, estrategia: 'reducir-plazo' });
if (fija.cuotaVariable) flag('reducir-plazo mantiene la cuota fija, cuotaVariable no debería ser true');
console.log(`  cuotaVariable -> reducir-cuota: ${cuota.cuotaVariable} · reducir-plazo: ${fija.cuotaVariable}`);

console.log('\n=== 5. Diagnóstico de presupuesto sin plan válido ===');
const sinPlan = diagnosticar({ ingresoMensual: 5_000_000, gastosFijos: 2_000_000, otrasDeudas: 0 }, 0);
console.log(`  pago 0 con ingreso 5M -> nivel="${sinPlan.nivel}"  "${sinPlan.mensaje.slice(0, 60)}…"`);
if (sinPlan.nivel !== 'sin-datos') flag(`sin plan válido el diagnóstico dice "${sinPlan.nivel}" en vez de "sin-datos"`);

console.log('\n=== 6. Coherencia de tasas ===');
for (const [t, tipo] of [[1.4, 'mensual'], [25, 'anual-efectiva'], [18, 'anual-nominal']] as const) {
  const i = tasaMensualDesde(t, tipo);
  const ea = (Math.pow(1 + i, 12) - 1) * 100;
  const p = construirPlan({ ...base, tasa: t, tipoTasa: tipo });
  const coincide = Math.abs(p.tasaAnualEfectiva - ea) < 1e-9;
  console.log(`  ${coincide ? 'OK   ' : 'FALLA'} ${String(t).padStart(5)} ${tipo.padEnd(15)} mensual ${(i * 100).toFixed(4)}%  E.A. ${ea.toFixed(2)}%`);
  if (!coincide) flag(`tasaAnualEfectiva incoherente para ${t} ${tipo}`);
}
const cAlt = calcularCuota(20_000_000, tasaMensualDesde(1.4, 'mensual'), 60);
if (Math.abs(cAlt - construirPlan(base).cuotaBase) > 0.01) flag('calcularCuota y construirPlan discrepan');

console.log(`\n${halla.length === 0 ? 'SIN HALLAZGOS' : `${halla.length} HALLAZGO(S)`}`);
