/**
 * Motor de amortización.
 *
 * Replica el modelo de la plantilla original y lo extiende:
 *   interés       = saldo × tasa mensual
 *   amortización  = (cuota + abono extra) − interés
 *   saldo         = saldo − amortización
 *
 * Sobre eso añade: conversión de tasas, abonos extra recurrentes con
 * incremento anual, abonos puntuales por cuota, costos mensuales (seguros)
 * y comparación contra el escenario sin abonos.
 */

import { desplazarMes, formatMoney, getMoneda, nombreMes } from './format';

export type TipoTasa = 'mensual' | 'anual-efectiva' | 'anual-nominal';
export type Estrategia = 'reducir-plazo' | 'reducir-cuota';

export interface AbonoPuntual {
  id: string;
  cuota: number;
  monto: number;
  nota: string;
}

export interface PlanInput {
  nombre: string;
  moneda: string;
  monto: number;
  tasa: number;
  tipoTasa: TipoTasa;
  plazoMeses: number;
  /** 0 = calcular la cuota. Si tu banco ya te dio una cuota, escríbela aquí. */
  cuotaPersonalizada: number;
  fechaInicio: string;
  costosMensuales: number;
  abonoExtraMensual: number;
  incrementoAnualPct: number;
  estrategia: Estrategia;
  abonosPuntuales: AbonoPuntual[];
}

export interface PlanRow {
  n: number;
  anio: number;
  mes: string;
  saldoInicial: number;
  cuota: number;
  abonoExtra: number;
  costos: number;
  interes: number;
  amortizacion: number;
  pagoTotal: number;
  saldo: number;
  acumInteres: number;
  acumCapital: number;
  acumPagado: number;
}

export interface ResumenAnual {
  anio: number;
  capital: number;
  interes: number;
  extras: number;
  saldoFinal: number;
}

export interface PlanResult {
  filas: PlanRow[];
  resumenAnual: ResumenAnual[];
  tasaMensual: number;
  tasaAnualEfectiva: number;
  cuotaBase: number;
  /** La cuota cambia a lo largo del plan (pasa con «reducir la cuota»). */
  cuotaVariable: boolean;
  /** Última cuota completa, para poder anunciar el rango. */
  cuotaUltima: number;
  primerPagoTotal: number;
  totalPagado: number;
  totalIntereses: number;
  totalCapital: number;
  totalCostos: number;
  totalAbonosExtra: number;
  mesesReales: number;
  mesesPlan: number;
  mesesAhorrados: number;
  fechaFinal: string;
  /* Escenario sin abonos extra, para medir el ahorro */
  totalSinAbonos: number;
  interesesSinAbonos: number;
  interesesAhorrados: number;
  /* Diagnóstico */
  advertencias: string[];
  error: string | null;
}

const MAX_ITER = 1200; // 100 años: red de seguridad ante entradas absurdas
const EPS = 0.005;

/** Convierte la tasa declarada por el usuario a tasa mensual decimal. */
export function tasaMensualDesde(tasa: number, tipo: TipoTasa): number {
  const t = tasa / 100;
  if (!Number.isFinite(t) || t <= 0) return 0;
  switch (tipo) {
    case 'mensual':
      return t;
    case 'anual-efectiva':
      return Math.pow(1 + t, 1 / 12) - 1;
    case 'anual-nominal':
      return t / 12;
  }
}

/** Cuota fija del sistema francés. */
export function calcularCuota(saldo: number, tasaMensual: number, meses: number): number {
  if (meses <= 0 || saldo <= 0) return 0;
  if (tasaMensual <= 0) return saldo / meses;
  const factor = Math.pow(1 + tasaMensual, -meses);
  return (saldo * tasaMensual) / (1 - factor);
}

interface CorridaOpts {
  conAbonos: boolean;
}

interface Corrida {
  filas: PlanRow[];
  totalPagado: number;
  totalIntereses: number;
  totalCostos: number;
  totalAbonos: number;
  meses: number;
}

function correr(input: PlanInput, i: number, cuotaBase: number, { conAbonos }: CorridaOpts): Corrida {
  const puntuales = new Map<number, number>();
  if (conAbonos) {
    for (const a of input.abonosPuntuales) {
      if (a.cuota > 0 && a.monto > 0) {
        puntuales.set(a.cuota, (puntuales.get(a.cuota) ?? 0) + a.monto);
      }
    }
  }

  const filas: PlanRow[] = [];
  let saldo = input.monto;
  let cuota = cuotaBase;
  let recurrente = conAbonos ? Math.max(0, input.abonoExtraMensual) : 0;
  let acumInteres = 0;
  let acumCapital = 0;
  let acumPagado = 0;
  let totalAbonos = 0;
  let totalCostos = 0;

  for (let n = 1; n <= MAX_ITER && saldo > EPS; n += 1) {
    // El abono recurrente crece una vez cada 12 cuotas.
    if (n > 1 && (n - 1) % 12 === 0 && input.incrementoAnualPct > 0 && conAbonos) {
      recurrente *= 1 + input.incrementoAnualPct / 100;
    }

    const saldoInicial = saldo;
    const interes = saldoInicial * i;
    const extraSolicitado = recurrente + (puntuales.get(n) ?? 0);

    // Nunca pagar de más: el último desembolso se recorta al saldo + interés.
    const techo = saldoInicial + interes;
    let cuotaAplicada = Math.min(cuota, techo);
    let extraAplicado = Math.min(extraSolicitado, Math.max(0, techo - cuotaAplicada));

    const pagoCapitalIntereses = cuotaAplicada + extraAplicado;
    const amortizacion = pagoCapitalIntereses - interes;

    saldo = Math.max(0, saldoInicial - amortizacion);
    acumInteres += interes;
    acumCapital += amortizacion;
    totalAbonos += extraAplicado;
    totalCostos += input.costosMensuales;
    acumPagado += pagoCapitalIntereses + input.costosMensuales;

    const { anio, mes } = desplazarMes(input.fechaInicio, n - 1);

    filas.push({
      n,
      anio,
      mes: nombreMes(mes),
      saldoInicial,
      cuota: cuotaAplicada,
      abonoExtra: extraAplicado,
      costos: input.costosMensuales,
      interes,
      amortizacion,
      pagoTotal: pagoCapitalIntereses + input.costosMensuales,
      saldo,
      acumInteres,
      acumCapital,
      acumPagado,
    });

    // Con "reducir cuota" el abono baja el pago mensual manteniendo el plazo.
    if (conAbonos && input.estrategia === 'reducir-cuota' && extraAplicado > 0 && saldo > EPS) {
      const restantes = input.plazoMeses - n;
      if (restantes > 0) cuota = calcularCuota(saldo, i, restantes);
    }

    // La cuota no cubre ni los intereses: el saldo nunca bajaría.
    if (amortizacion <= 0 && extraAplicado <= 0) break;
  }

  return {
    filas,
    totalPagado: acumPagado,
    totalIntereses: acumInteres,
    totalCostos,
    totalAbonos,
    meses: filas.length,
  };
}

function agruparPorAnio(filas: PlanRow[]): ResumenAnual[] {
  const mapa = new Map<number, ResumenAnual>();
  for (const f of filas) {
    const acc = mapa.get(f.anio) ?? { anio: f.anio, capital: 0, interes: 0, extras: 0, saldoFinal: 0 };
    acc.capital += f.amortizacion;
    acc.interes += f.interes;
    acc.extras += f.abonoExtra;
    acc.saldoFinal = f.saldo;
    mapa.set(f.anio, acc);
  }
  return [...mapa.values()].sort((a, b) => a.anio - b.anio);
}

export function construirPlan(input: PlanInput): PlanResult {
  const advertencias: string[] = [];
  const i = tasaMensualDesde(input.tasa, input.tipoTasa);
  const tasaAnualEfectiva = (Math.pow(1 + i, 12) - 1) * 100;

  const vacio: PlanResult = {
    filas: [], resumenAnual: [], tasaMensual: i, tasaAnualEfectiva,
    cuotaBase: 0, cuotaVariable: false, cuotaUltima: 0, primerPagoTotal: 0, totalPagado: 0, totalIntereses: 0,
    totalCapital: 0, totalCostos: 0, totalAbonosExtra: 0,
    mesesReales: 0, mesesPlan: input.plazoMeses, mesesAhorrados: 0, fechaFinal: '—',
    totalSinAbonos: 0, interesesSinAbonos: 0, interesesAhorrados: 0,
    advertencias, error: null,
  };

  if (input.monto <= 0) return { ...vacio, error: 'Escribe el monto del crédito para ver tu plan.' };
  if (input.plazoMeses <= 0) return { ...vacio, error: 'Escribe el plazo en meses para ver tu plan.' };
  if (input.plazoMeses > 600) return { ...vacio, error: 'El plazo máximo admitido es de 600 meses (50 años).' };

  const cuotaCalculada = calcularCuota(input.monto, i, input.plazoMeses);
  const usaCuotaPropia = input.cuotaPersonalizada > 0;
  const cuotaBase = usaCuotaPropia ? input.cuotaPersonalizada : cuotaCalculada;

  if (usaCuotaPropia) {
    const interesInicial = input.monto * i;
    if (cuotaBase <= interesInicial) {
      const m = getMoneda(input.moneda);
      return {
        ...vacio,
        cuotaBase,
        error:
          `Con una cuota de ${formatMoney(cuotaBase, m)} el saldo nunca bajaría: solo el interés del primer mes ya es ` +
          `${formatMoney(interesInicial, m)}. Para pagar este crédito en ${input.plazoMeses} meses la cuota tendría que ser ` +
          `de ${formatMoney(cuotaCalculada, m)}. Corrige la cuota, o déjala en blanco para que la calculemos.`,
      };
    }
  }
  const conAbonos = correr(input, i, cuotaBase, { conAbonos: true });
  const sinAbonos = correr(input, i, cuotaBase, { conAbonos: false });

  if (conAbonos.filas.length === 0) {
    return { ...vacio, cuotaBase, error: 'No se pudo generar el plan con estos datos.' };
  }

  const ultima = conAbonos.filas[conAbonos.filas.length - 1];
  if (ultima.saldo > EPS) {
    advertencias.push(
      'Con esta cuota el saldo no llega a cero: la cuota apenas cubre los intereses. Revisa la tasa o aumenta el plazo.',
    );
  }

  const mesesAhorrados = Math.max(0, sinAbonos.meses - conAbonos.meses);
  const interesesAhorrados = Math.max(0, sinAbonos.totalIntereses - conAbonos.totalIntereses);

  const { anio, mes } = desplazarMes(input.fechaInicio, conAbonos.meses - 1);
  const fechaFinal = `${nombreMes(mes)} ${anio}`;

  if (usaCuotaPropia) {
    const dif = conAbonos.meses - input.plazoMeses;
    if (dif > 0) {
      advertencias.push(
        `Con la cuota que escribiste el crédito toma ${conAbonos.meses} cuotas, ${dif} más que el plazo pactado. Revisa la cuota o la tasa: puede que el banco incluya seguros dentro de ella.`,
      );
    } else if (dif < 0) {
      advertencias.push(
        `Con la cuota que escribiste el crédito termina en ${conAbonos.meses} cuotas, ${-dif} antes del plazo pactado.`,
      );
    }
  }

  // La última fila suele ser un pago ajustado; se compara con la penúltima.
  const filas = conAbonos.filas;
  const cuotaUltima = filas[Math.max(0, filas.length - 2)].cuota;
  const cuotaVariable = filas.length > 2 && Math.abs(filas[0].cuota - cuotaUltima) > 1;

  if (input.estrategia === 'reducir-cuota' && conAbonos.meses < input.plazoMeses) {
    advertencias.push(
      `Con «reducir la cuota» el plazo debería mantenerse, pero el abono mensual no baja mientras la cuota sí: ` +
      `en la cuota ${conAbonos.meses} el saldo ya es menor que el abono y el crédito se liquida, ` +
      `${input.plazoMeses - conAbonos.meses} cuotas antes. Si solo quieres aliviar el mes a mes, registra el abono ` +
      `como puntual en la tabla en lugar de mensual.`,
    );
  }

  const puntualesFuera = input.abonosPuntuales.filter(
    (a) => a.monto > 0 && a.cuota > conAbonos.meses,
  ).length;
  if (puntualesFuera > 0) {
    advertencias.push(
      `${puntualesFuera} abono(s) puntual(es) quedan después de la última cuota y no se aplicaron. El crédito termina antes.`,
    );
  }

  if (input.costosMensuales > 0) {
    advertencias.push(
      'Los costos mensuales (seguros, administración) suman al pago pero no reducen el saldo.',
    );
  }

  return {
    filas: conAbonos.filas,
    resumenAnual: agruparPorAnio(conAbonos.filas),
    tasaMensual: i,
    tasaAnualEfectiva,
    cuotaBase,
    cuotaVariable,
    cuotaUltima,
    primerPagoTotal: conAbonos.filas[0].pagoTotal,
    totalPagado: conAbonos.totalPagado,
    totalIntereses: conAbonos.totalIntereses,
    totalCapital: conAbonos.totalPagado - conAbonos.totalIntereses - conAbonos.totalCostos,
    totalCostos: conAbonos.totalCostos,
    totalAbonosExtra: conAbonos.totalAbonos,
    mesesReales: conAbonos.meses,
    mesesPlan: input.plazoMeses,
    mesesAhorrados,
    fechaFinal,
    totalSinAbonos: sinAbonos.totalPagado,
    interesesSinAbonos: sinAbonos.totalIntereses,
    interesesAhorrados,
    advertencias,
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Salud financiera                                                   */
/* ------------------------------------------------------------------ */

export interface Presupuesto {
  ingresoMensual: number;
  gastosFijos: number;
  otrasDeudas: number;
}

export type NivelSalud = 'sin-datos' | 'comodo' | 'ajustado' | 'riesgo';

export interface DiagnosticoSalud {
  nivel: NivelSalud;
  ratioCuota: number;      // cuota / ingreso
  ratioDeudaTotal: number; // (cuota + otras deudas) / ingreso
  disponible: number;      // ingreso − gastos − deudas − cuota
  titulo: string;
  mensaje: string;
  capacidadAbono: number;  // margen sugerido para abonar extra
}

/**
 * Regla 28/36 adaptada: la cuota sola no debería pasar del 30 % del ingreso,
 * y todas las deudas juntas no deberían pasar del 40 %.
 */
export function diagnosticar(p: Presupuesto, pagoMensual: number): DiagnosticoSalud {
  if (p.ingresoMensual <= 0 || pagoMensual <= 0) {
    const faltaPlan = p.ingresoMensual > 0 && pagoMensual <= 0;
    return {
      nivel: 'sin-datos',
      ratioCuota: 0,
      ratioDeudaTotal: 0,
      disponible: 0,
      capacidadAbono: 0,
      titulo: faltaPlan ? 'Falta completar el crédito' : 'Agrega tu ingreso mensual',
      mensaje: faltaPlan
        ? 'Completa los datos del crédito arriba y te decimos si la cuota cabe cómodamente en tu presupuesto.'
        : 'Con tu ingreso y gastos calculamos si esta cuota cabe cómodamente en tu presupuesto.',
    };
  }

  const ratioCuota = pagoMensual / p.ingresoMensual;
  const ratioDeudaTotal = (pagoMensual + p.otrasDeudas) / p.ingresoMensual;
  const disponible = p.ingresoMensual - p.gastosFijos - p.otrasDeudas - pagoMensual;
  // Se sugiere destinar la mitad del excedente al abono extra y dejar colchón.
  const capacidadAbono = Math.max(0, disponible * 0.5);

  if (ratioCuota <= 0.3 && ratioDeudaTotal <= 0.4 && disponible > 0) {
    return {
      nivel: 'comodo',
      ratioCuota, ratioDeudaTotal, disponible, capacidadAbono,
      titulo: 'Cuota cómoda',
      mensaje: `La cuota toma el ${(ratioCuota * 100).toFixed(0)} % de tu ingreso y te queda excedente. Puedes destinar parte a abonos extra sin apretarte.`,
    };
  }

  if (ratioCuota <= 0.4 && ratioDeudaTotal <= 0.5 && disponible >= 0) {
    return {
      nivel: 'ajustado',
      ratioCuota, ratioDeudaTotal, disponible, capacidadAbono,
      titulo: 'Presupuesto ajustado',
      mensaje: `La cuota toma el ${(ratioCuota * 100).toFixed(0)} % de tu ingreso. Funciona, pero deja poco margen ante imprevistos: considera ampliar el plazo o reducir el monto.`,
    };
  }

  return {
    nivel: 'riesgo',
    ratioCuota, ratioDeudaTotal, disponible, capacidadAbono,
    titulo: 'Cuota por encima de tu capacidad',
    mensaje: `La cuota toma el ${(ratioCuota * 100).toFixed(0)} % de tu ingreso${disponible < 0 ? ' y tu presupuesto queda en negativo' : ''}. Amplía el plazo, baja el monto o negocia la tasa antes de firmar.`,
  };
}

/* ------------------------------------------------------------------ */
/*  Consejos                                                           */
/* ------------------------------------------------------------------ */

export interface Consejo {
  titulo: string;
  texto: string;
  tono: 'brand' | 'plum' | 'gold';
}

export function generarConsejos(plan: PlanResult, input: PlanInput, salud: DiagnosticoSalud): Consejo[] {
  const consejos: Consejo[] = [];

  if (plan.error || plan.filas.length === 0) return consejos;

  const pctInteres = plan.totalIntereses / (plan.totalPagado || 1);
  if (pctInteres > 0.35) {
    consejos.push({
      titulo: `${(pctInteres * 100).toFixed(0)} % de lo que pagas son intereses`,
      texto: 'Un plazo largo baja la cuota pero encarece mucho el crédito. Cada abono a capital hecho temprano es el que más intereses te ahorra.',
      tono: 'brand',
    });
  }

  if (input.abonoExtraMensual <= 0) {
    const simulado = construirPlan({ ...input, abonoExtraMensual: Math.round(plan.cuotaBase * 0.1) });
    if (simulado.mesesAhorrados > 0) {
      consejos.push({
        titulo: 'Prueba un abono extra del 10 % de la cuota',
        texto: `Abonando un 10 % más cada mes terminarías ${simulado.mesesAhorrados} meses antes. Escribe ese valor en "abono extra mensual" para verlo en la tabla.`,
        tono: 'plum',
      });
    }
  }

  if (input.abonoExtraMensual > 0 && input.incrementoAnualPct <= 0) {
    consejos.push({
      titulo: 'Sube el abono extra cada año',
      texto: 'Si tu ingreso se ajusta anualmente, sube el abono en la misma proporción. Un incremento del 8 % anual acorta el crédito sin que lo sientas.',
      tono: 'gold',
    });
  }

  if (input.estrategia === 'reducir-cuota' && plan.mesesAhorrados === 0 && input.abonoExtraMensual > 0) {
    consejos.push({
      titulo: 'Reducir plazo ahorra más que reducir cuota',
      texto: 'Con "reducir cuota" pagas menos cada mes pero durante el mismo tiempo. Con "reducir plazo" el mismo abono te ahorra bastantes más intereses.',
      tono: 'brand',
    });
  }

  if (salud.nivel === 'comodo' && salud.capacidadAbono > 0 && input.abonoExtraMensual < salud.capacidadAbono) {
    consejos.push({
      titulo: 'Tienes margen para abonar más',
      texto: 'Según tu presupuesto puedes destinar más al abono extra manteniendo un colchón de emergencia. Ajusta el valor y observa cómo cae la fecha final.',
      tono: 'plum',
    });
  }

  if (plan.mesesAhorrados > 0) {
    consejos.push({
      titulo: `Vas a terminar ${plan.mesesAhorrados} meses antes`,
      texto: 'Cuando termines, mantén ese hábito de ahorro: destina la cuota liberada a un fondo de emergencia antes de tomar un crédito nuevo.',
      tono: 'gold',
    });
  }

  consejos.push({
    titulo: 'Antes de abonar, ten tu colchón',
    texto: 'Tres a seis meses de gastos guardados evitan que un imprevisto te obligue a endeudarte otra vez a una tasa peor.',
    tono: 'brand',
  });

  return consejos.slice(0, 4);
}
