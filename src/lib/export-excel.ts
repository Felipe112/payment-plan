/**
 * Exportación a Excel (.xlsx) con ExcelJS.
 *
 * Genera un libro con tres hojas —plan, resumen anual y guía— con estilos,
 * formatos de moneda y paneles congelados, para que el archivo sirva como
 * plantilla de trabajo y no solo como volcado de datos.
 */

import type { Worksheet } from 'exceljs';
import type { DiagnosticoSalud, PlanInput, PlanResult, Presupuesto, Consejo } from './amortization';
import { getMoneda, duracionLegible } from './format';

const COLOR = {
  brand: 'FFD4522C',
  brandSoft: 'FFFBE7DE',
  plum: 'FF7B3FA0',
  plumSoft: 'FFF0E6F7',
  gold: 'FFB98A10',
  goldSoft: 'FFFBF1D9',
  ink: 'FF2E2620',
  inkSoft: 'FF5E5347',
  cream: 'FFFDFBF7',
  band: 'FFF6F1E8',
  line: 'FFE6DCCB',
  white: 'FFFFFFFF',
};

/** Mismo aviso que la página /aviso-legal, condensado para el libro. */
const AVISO_CORTO =
  'Herramienta educativa. No es asesoría financiera, legal ni tributaria, ni una oferta o aprobación de crédito. ' +
  'Las cifras válidas son las de tu contrato y tu entidad financiera.';

const AVISO_LARGO: Array<[string, string]> = [
  ['Naturaleza de este archivo',
    'Plan de Pagos es una herramienta educativa. Este archivo es una simulación construida con los datos que ingresó el usuario, no un documento emitido por una entidad financiera y no tiene valor contractual ni probatorio.'],
  ['Qué no contemplan los cálculos',
    'Se usa el sistema de amortización francés de cuota fija con interés compuesto mensual sobre el saldo. No se modelan redondeos ni días exactos de cada entidad, tasas variables o indexadas (IPC, UVR, IBR, DTF), seguros, comisiones, cuotas de manejo, impuestos, intereses de mora, periodos de gracia, penalidades por prepago ni las reglas legales de imputación de pagos.'],
  ['Prevalece tu entidad',
    'Es esperable que tu entidad muestre valores distintos. Ante cualquier diferencia, prevalece la información oficial de tu entidad financiera. Verifica siempre antes de firmar, prepagar o comprometer dinero.'],
  ['Sin garantías y limitación de responsabilidad',
    'La herramienta se entrega "tal cual", sin garantías de exactitud, integridad ni idoneidad para un propósito determinado. En la máxima medida permitida por la ley, sus autores no responden por daños directos ni indirectos derivados del uso de estos resultados, incluidos sobrecostos financieros, intereses pagados de más o decisiones de endeudamiento.'],
  ['Responsabilidad del usuario',
    'Las decisiones tomadas a partir de este archivo son responsabilidad exclusiva de quien lo usa. Verificar que los datos ingresados sean correctos también le corresponde a quien los ingresa.'],
  ['Aviso completo',
    'La versión vigente y completa del aviso legal está publicada en https://cacharreo.dev'],
];

const borde = (color = COLOR.line) => ({
  top: { style: 'thin' as const, color: { argb: color } },
  left: { style: 'thin' as const, color: { argb: color } },
  bottom: { style: 'thin' as const, color: { argb: color } },
  right: { style: 'thin' as const, color: { argb: color } },
});

export interface ExportOptions {
  input: PlanInput;
  plan: PlanResult;
  presupuesto: Presupuesto;
  salud: DiagnosticoSalud;
  consejos: Consejo[];
}

export async function exportarExcel({ input, plan, presupuesto, salud, consejos }: ExportOptions): Promise<void> {
  const { default: ExcelJS } = await import('exceljs/dist/exceljs.min.js');
  const moneda = getMoneda(input.moneda);
  const dec = moneda.decimales;
  const fmtMoney = dec > 0 ? `"${moneda.simbolo}"#,##0.00` : `"${moneda.simbolo}"#,##0`;
  const fmtPct = '0.00%';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Plan de Pagos · cacharreo.dev';
  wb.lastModifiedBy = 'cacharreo.dev';
  wb.created = new Date();

  /** Firma al pie de una hoja, como enlace real. */
  const firmar = (hoja: Worksheet, fila: number, hasta: string) => {
    hoja.mergeCells(`A${fila}:${hasta}${fila}`);
    const c = hoja.getCell(`A${fila}`);
    c.value = { text: 'Hecho por cacharreo.dev', hyperlink: 'https://cacharreo.dev' };
    c.font = { size: 10, bold: true, color: { argb: COLOR.brand }, underline: true };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    hoja.getRow(fila).height = 22;
  };

  /* ================= Hoja 1 — Plan de pagos ================= */
  const ws = wb.addWorksheet('Plan de pagos', {
    views: [{ state: 'frozen', ySplit: 13, xSplit: 1 }],
    properties: { defaultRowHeight: 18 },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.columns = [
    { key: 'n', width: 9 },
    { key: 'mes', width: 13 },
    { key: 'anio', width: 8 },
    { key: 'cuota', width: 16 },
    { key: 'extra', width: 16 },
    { key: 'interes', width: 16 },
    { key: 'capital', width: 16 },
    { key: 'costos', width: 14 },
    { key: 'pago', width: 16 },
    { key: 'saldo', width: 18 },
    { key: 'acumInt', width: 18 },
    { key: 'acumCap', width: 18 },
  ];

  // --- Título ---
  ws.mergeCells('A1:L1');
  const titulo = ws.getCell('A1');
  titulo.value = `PLAN DE PAGOS  ·  ${input.nombre || 'Mi crédito'}`;
  titulo.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLOR.white } };
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.brand } };
  titulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 34;

  ws.mergeCells('A2:L2');
  const sub = ws.getCell('A2');
  sub.value = `Generado el ${new Date().toLocaleDateString(moneda.locale, { day: 'numeric', month: 'long', year: 'numeric' })}  ·  Moneda ${moneda.codigo}`;
  sub.font = { size: 9, italic: true, color: { argb: COLOR.inkSoft } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.brandSoft } };
  sub.alignment = { vertical: 'middle', indent: 1 };

  // --- Bloque de parámetros (izquierda) y resumen (derecha) ---
  const etiquetaBloque = (celda: string, texto: string, color: string, soft: string) => {
    const c = ws.getCell(celda);
    c.value = texto;
    c.font = { bold: true, size: 10, color: { argb: color } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: soft } };
    c.alignment = { vertical: 'middle', indent: 1 };
  };

  ws.mergeCells('A4:C4');
  etiquetaBloque('A4', 'DATOS DEL CRÉDITO', COLOR.brand, COLOR.brandSoft);
  ws.mergeCells('E4:G4');
  etiquetaBloque('E4', 'RESUMEN DEL PLAN', COLOR.plum, COLOR.plumSoft);
  ws.mergeCells('I4:L4');
  etiquetaBloque('I4', 'TU PRESUPUESTO', COLOR.gold, COLOR.goldSoft);

  const tipoTasaLabel = {
    'mensual': 'Mensual',
    'anual-efectiva': 'Anual efectiva (E.A.)',
    'anual-nominal': 'Anual nominal',
  }[input.tipoTasa];

  const params: Array<[string, string | number, string, string?]> = [
    ['Monto del crédito', input.monto, fmtMoney],
    ['Tasa', input.tasa / 100, fmtPct, tipoTasaLabel],
    ['Tasa mensual efectiva', plan.tasaMensual, '0.0000%'],
    ['Tasa anual efectiva', plan.tasaAnualEfectiva / 100, fmtPct],
    ['Plazo pactado', input.plazoMeses, '0', 'meses'],
    ['Cuota fija', plan.cuotaBase, fmtMoney, input.cuotaPersonalizada > 0 ? 'mensual (dato del banco)' : 'mensual (calculada)'],
    ['Costos mensuales', input.costosMensuales, fmtMoney, 'seguros / admón.'],
  ];

  params.forEach(([label, valor, fmt, nota], idx) => {
    const r = 5 + idx;
    const cl = ws.getCell(`A${r}`);
    cl.value = label;
    cl.font = { size: 10, color: { argb: COLOR.inkSoft } };
    const cv = ws.getCell(`B${r}`);
    cv.value = valor;
    cv.numFmt = fmt;
    cv.font = { size: 10, bold: true, color: { argb: COLOR.ink } };
    cv.border = borde();
    cv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cream } };
    if (nota) {
      const cn = ws.getCell(`C${r}`);
      cn.value = nota;
      cn.font = { size: 9, italic: true, color: { argb: COLOR.inkSoft } };
    }
  });

  const estrategiaLabel = input.estrategia === 'reducir-plazo'
    ? 'Los abonos extra acortan el plazo'
    : 'Los abonos extra bajan la cuota';

  const resumen: Array<[string, string | number, string, string?]> = [
    ['Total a pagar', plan.totalPagado, fmtMoney],
    ['Total intereses', plan.totalIntereses, fmtMoney],
    ['Total abonos extra', plan.totalAbonosExtra, fmtMoney],
    ['Duración real', plan.mesesReales, '0', duracionLegible(plan.mesesReales)],
    ['Última cuota', plan.fechaFinal, '@'],
    ['Intereses ahorrados', plan.interesesAhorrados, fmtMoney, `${plan.mesesAhorrados} meses menos`],
    ['Estrategia', estrategiaLabel, '@'],
  ];

  resumen.forEach(([label, valor, fmt, nota], idx) => {
    const r = 5 + idx;
    const cl = ws.getCell(`E${r}`);
    cl.value = label;
    cl.font = { size: 10, color: { argb: COLOR.inkSoft } };
    const cv = ws.getCell(`F${r}`);
    cv.value = valor;
    cv.numFmt = fmt;
    cv.font = { size: 10, bold: true, color: { argb: COLOR.plum } };
    cv.border = borde();
    cv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cream } };
    if (nota) {
      const cn = ws.getCell(`G${r}`);
      cn.value = nota;
      cn.font = { size: 9, italic: true, color: { argb: COLOR.inkSoft } };
    }
  });

  const presu: Array<[string, string | number, string]> = [
    ['Ingreso mensual', presupuesto.ingresoMensual, fmtMoney],
    ['Gastos fijos', presupuesto.gastosFijos, fmtMoney],
    ['Otras deudas', presupuesto.otrasDeudas, fmtMoney],
    ['Cuota / ingreso', salud.ratioCuota, fmtPct],
    ['Deudas / ingreso', salud.ratioDeudaTotal, fmtPct],
    ['Disponible tras pagar', salud.disponible, fmtMoney],
    ['Diagnóstico', salud.titulo, '@'],
  ];

  presu.forEach(([label, valor, fmt], idx) => {
    const r = 5 + idx;
    const cl = ws.getCell(`I${r}`);
    cl.value = label;
    cl.font = { size: 10, color: { argb: COLOR.inkSoft } };
    ws.mergeCells(`J${r}:L${r}`);
    const cv = ws.getCell(`J${r}`);
    cv.value = valor;
    cv.numFmt = fmt;
    cv.font = { size: 10, bold: true, color: { argb: COLOR.gold } };
    cv.border = borde();
    cv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cream } };
    cv.alignment = { horizontal: 'left', indent: 1 };
  });

  // --- Encabezado de la tabla ---
  const HEAD = [
    '#Cuota', 'Mes', 'Año', 'Cuota', 'Abono extra', 'Intereses', 'Amortización',
    'Costos', 'Pago total', 'Saldo', 'Interés acum.', 'Capital acum.',
  ];
  const filaHead = ws.getRow(13);
  HEAD.forEach((h, idx) => {
    const c = filaHead.getCell(idx + 1);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: COLOR.white } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.brand } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = borde(COLOR.brand);
  });
  filaHead.height = 28;

  // --- Filas del plan ---
  let fila = 14;
  for (const f of plan.filas) {
    const r = ws.getRow(fila);
    const valores = [
      f.n, f.mes, f.anio, f.cuota, f.abonoExtra, f.interes, f.amortizacion,
      f.costos, f.pagoTotal, f.saldo, f.acumInteres, f.acumCapital,
    ];
    valores.forEach((v, idx) => {
      const c = r.getCell(idx + 1);
      c.value = v;
      c.border = borde();
      if (idx === 0) {
        c.numFmt = '0';
        c.alignment = { horizontal: 'center' };
        c.font = { size: 10, bold: true, color: { argb: COLOR.inkSoft } };
      } else if (idx === 1 || idx === 2) {
        c.font = { size: 10, color: { argb: COLOR.inkSoft } };
        c.alignment = { horizontal: idx === 2 ? 'center' : 'left' };
      } else {
        c.numFmt = fmtMoney;
        c.font = { size: 10, color: { argb: idx === 5 ? COLOR.plum : COLOR.ink } };
      }
      if (fila % 2 === 0) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.band } };
      }
      // Resalta los meses con abono extra: son los que mueven la aguja.
      if (f.abonoExtra > 0 && idx === 4) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.goldSoft } };
        c.font = { size: 10, bold: true, color: { argb: COLOR.gold } };
      }
    });
    fila += 1;
  }

  // --- Totales ---
  const rTot = ws.getRow(fila);
  const totales: Array<string | number> = [
    'TOTAL', '', '',
    plan.totalPagado - plan.totalAbonosExtra - plan.totalCostos,
    plan.totalAbonosExtra,
    plan.totalIntereses,
    plan.totalCapital,
    plan.totalCostos,
    plan.totalPagado,
    0, plan.totalIntereses, plan.totalCapital,
  ];
  totales.forEach((v, idx) => {
    const c = rTot.getCell(idx + 1);
    c.value = v;
    c.font = { bold: true, size: 10, color: { argb: COLOR.white } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.ink } };
    c.border = borde(COLOR.ink);
    if (idx >= 3) c.numFmt = fmtMoney;
    if (idx === 0) c.alignment = { horizontal: 'center' };
  });
  rTot.height = 22;

  ws.autoFilter = { from: { row: 13, column: 1 }, to: { row: fila - 1, column: 12 } };

  ws.mergeCells(`A${fila + 2}:L${fila + 2}`);
  const avisoHoja1 = ws.getCell(`A${fila + 2}`);
  avisoHoja1.value = `${AVISO_CORTO} Ver la hoja "Guía y consejos" para el aviso completo.`;
  avisoHoja1.font = { size: 9, italic: true, color: { argb: COLOR.inkSoft } };
  avisoHoja1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  avisoHoja1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.band } };
  ws.getRow(fila + 2).height = 28;

  firmar(ws, fila + 4, 'L');

  /* ================= Hoja 2 — Resumen por año ================= */
  const ws2 = wb.addWorksheet('Resumen por año', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });
  ws2.columns = [
    { key: 'anio', width: 12 },
    { key: 'capital', width: 20 },
    { key: 'interes', width: 20 },
    { key: 'extras', width: 20 },
    { key: 'total', width: 20 },
    { key: 'saldo', width: 22 },
  ];

  ws2.mergeCells('A1:F1');
  const t2 = ws2.getCell('A1');
  t2.value = 'CUÁNTO PAGAS CADA AÑO';
  t2.font = { size: 14, bold: true, color: { argb: COLOR.white } };
  t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.plum } };
  t2.alignment = { vertical: 'middle', indent: 1 };
  ws2.getRow(1).height = 30;

  const HEAD2 = ['Año', 'Capital', 'Intereses', 'Abonos extra', 'Total pagado', 'Saldo a fin de año'];
  const h2 = ws2.getRow(2);
  HEAD2.forEach((h, idx) => {
    const c = h2.getCell(idx + 1);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: COLOR.white } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.plum } };
    c.alignment = { horizontal: 'center' };
    c.border = borde(COLOR.plum);
  });

  plan.resumenAnual.forEach((a, idx) => {
    const r = ws2.getRow(3 + idx);
    const vals = [a.anio, a.capital, a.interes, a.extras, a.capital + a.interes, a.saldoFinal];
    vals.forEach((v, i) => {
      const c = r.getCell(i + 1);
      c.value = v;
      c.border = borde();
      c.numFmt = i === 0 ? '0' : fmtMoney;
      c.font = { size: 10, color: { argb: COLOR.ink } };
      if (i === 0) c.alignment = { horizontal: 'center' };
      if (idx % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.band } };
    });
  });

  firmar(ws2, plan.resumenAnual.length + 4, 'F');

  /* ================= Hoja 3 — Guía ================= */
  const ws3 = wb.addWorksheet('Guía y consejos');
  ws3.columns = [{ key: 'a', width: 4 }, { key: 'b', width: 34 }, { key: 'c', width: 96 }];

  ws3.mergeCells('A1:C1');
  const t3 = ws3.getCell('A1');
  t3.value = 'CÓMO USAR ESTE PLAN';
  t3.font = { size: 14, bold: true, color: { argb: COLOR.white } };
  t3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.gold } };
  t3.alignment = { vertical: 'middle', indent: 1 };
  ws3.getRow(1).height = 30;

  const bloques: Array<[string, string]> = [
    ['Cómo se calcula', 'Cada mes el interés se cobra sobre el saldo pendiente (saldo × tasa mensual). Lo que sobra de la cuota después del interés es la amortización: la parte que sí baja tu deuda.'],
    ['Por qué abonar temprano', 'Al principio casi toda la cuota se va en intereses. Un abono hecho en el mes 6 ahorra mucho más que el mismo abono en el mes 40.'],
    ['Reducir plazo vs. reducir cuota', 'Reducir plazo mantiene la cuota y termina antes: ahorra más intereses. Reducir cuota alivia el mes a mes pero mantiene la duración.'],
    ['Regla del 30 %', 'La cuota de un crédito no debería superar el 30 % de tu ingreso, y todas tus deudas juntas no más del 40 %.'],
    ['Antes de abonar', 'Ten primero un fondo de emergencia de 3 a 6 meses de gastos. Si un imprevisto te obliga a endeudarte de nuevo, el ahorro del abono se pierde.'],
    ['Prioriza por tasa', 'Si tienes varias deudas, abona extra a la de mayor tasa primero. Es lo que más dinero te ahorra en total.'],
    ['Revisa los seguros', 'Los costos mensuales suben tu pago pero no bajan el saldo. Compara opciones: muchas entidades permiten contratar el seguro por fuera.'],
  ];

  let r3 = 3;
  for (const [titulo2, texto] of bloques) {
    const cb = ws3.getCell(`B${r3}`);
    cb.value = titulo2;
    cb.font = { bold: true, size: 11, color: { argb: COLOR.brand } };
    cb.alignment = { vertical: 'top', wrapText: true };
    const cc = ws3.getCell(`C${r3}`);
    cc.value = texto;
    cc.font = { size: 10, color: { argb: COLOR.inkSoft } };
    cc.alignment = { vertical: 'top', wrapText: true };
    ws3.getRow(r3).height = 34;
    r3 += 1;
  }

  if (consejos.length > 0) {
    r3 += 1;
    const ch = ws3.getCell(`B${r3}`);
    ch.value = 'PARA TU CASO';
    ch.font = { bold: true, size: 12, color: { argb: COLOR.plum } };
    r3 += 1;
    for (const c of consejos) {
      const cb = ws3.getCell(`B${r3}`);
      cb.value = c.titulo;
      cb.font = { bold: true, size: 11, color: { argb: COLOR.plum } };
      cb.alignment = { vertical: 'top', wrapText: true };
      const cc = ws3.getCell(`C${r3}`);
      cc.value = c.texto;
      cc.font = { size: 10, color: { argb: COLOR.inkSoft } };
      cc.alignment = { vertical: 'top', wrapText: true };
      ws3.getRow(r3).height = 34;
      r3 += 1;
    }
  }

  if (plan.advertencias.length > 0) {
    r3 += 1;
    const ca = ws3.getCell(`B${r3}`);
    ca.value = 'TEN EN CUENTA';
    ca.font = { bold: true, size: 12, color: { argb: COLOR.gold } };
    r3 += 1;
    for (const a of plan.advertencias) {
      ws3.mergeCells(`B${r3}:C${r3}`);
      const cc = ws3.getCell(`B${r3}`);
      cc.value = a;
      cc.font = { size: 10, italic: true, color: { argb: COLOR.inkSoft } };
      cc.alignment = { vertical: 'top', wrapText: true };
      ws3.getRow(r3).height = 30;
      r3 += 1;
    }
  }

  r3 += 2;
  ws3.mergeCells(`B${r3}:C${r3}`);
  const cabLegal = ws3.getCell(`B${r3}`);
  cabLegal.value = 'AVISO LEGAL Y TÉRMINOS DE USO';
  cabLegal.font = { bold: true, size: 12, color: { argb: COLOR.white } };
  cabLegal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.ink } };
  cabLegal.alignment = { vertical: 'middle', indent: 1 };
  ws3.getRow(r3).height = 26;
  r3 += 1;

  for (const [titulo3, texto] of AVISO_LARGO) {
    const cb = ws3.getCell(`B${r3}`);
    cb.value = titulo3;
    cb.font = { bold: true, size: 10, color: { argb: COLOR.ink } };
    cb.alignment = { vertical: 'top', wrapText: true };
    const cc = ws3.getCell(`C${r3}`);
    cc.value = texto;
    cc.font = { size: 9, color: { argb: COLOR.inkSoft } };
    cc.alignment = { vertical: 'top', wrapText: true };
    ws3.getRow(r3).height = 46;
    r3 += 1;
  }

  firmar(ws3, r3 + 1, 'C');

  /* ================= Descarga ================= */
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = (input.nombre || 'plan-de-pagos')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'plan-de-pagos';
  a.href = url;
  a.download = `${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
