/** Utilidades de formato numérico, monetario y de fechas. */

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

export interface Moneda {
  codigo: string;
  simbolo: string;
  nombre: string;
  /** Etiqueta corta para el selector, que es angosto. */
  corto: string;
  locale: string;
  decimales: number;
}

export const MONEDAS: Moneda[] = [
  { codigo: 'COP', simbolo: '$', nombre: 'Peso colombiano', corto: 'Colombia', locale: 'es-CO', decimales: 0 },
  { codigo: 'MXN', simbolo: '$', nombre: 'Peso mexicano', corto: 'México', locale: 'es-MX', decimales: 2 },
  { codigo: 'ARS', simbolo: '$', nombre: 'Peso argentino', corto: 'Argentina', locale: 'es-AR', decimales: 2 },
  { codigo: 'CLP', simbolo: '$', nombre: 'Peso chileno', corto: 'Chile', locale: 'es-CL', decimales: 0 },
  { codigo: 'PEN', simbolo: 'S/', nombre: 'Sol peruano', corto: 'Perú', locale: 'es-PE', decimales: 2 },
  { codigo: 'USD', simbolo: '$', nombre: 'Dólar', corto: 'EE. UU.', locale: 'en-US', decimales: 2 },
  { codigo: 'EUR', simbolo: '€', nombre: 'Euro', corto: 'Zona euro', locale: 'es-ES', decimales: 2 },
];

export const getMoneda = (codigo: string): Moneda =>
  MONEDAS.find((m) => m.codigo === codigo) ?? MONEDAS[0];

/** "$ 1.234.567" — formato completo con símbolo. */
export function formatMoney(valor: number, moneda: Moneda): string {
  if (!Number.isFinite(valor)) return '—';
  return new Intl.NumberFormat(moneda.locale, {
    style: 'currency',
    currency: moneda.codigo,
    minimumFractionDigits: moneda.decimales,
    maximumFractionDigits: moneda.decimales,
  }).format(valor);
}

/** "1.234.567" — sin símbolo, para tablas densas. */
export function formatNumber(valor: number, moneda: Moneda, decimales = moneda.decimales): string {
  if (!Number.isFinite(valor)) return '—';
  return new Intl.NumberFormat(moneda.locale, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

/** "1,2 M" — compacto para ejes de gráficas. */
export function formatCompact(valor: number, moneda: Moneda): string {
  if (!Number.isFinite(valor)) return '—';
  return new Intl.NumberFormat(moneda.locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(valor);
}

export function formatPercent(valor: number, decimales = 2): string {
  if (!Number.isFinite(valor)) return '—';
  return `${valor.toFixed(decimales).replace('.', ',')} %`;
}

/**
 * Acepta lo que el usuario escriba: "1.234.567,89", "1,234,567.89", "1234567".
 * El último separador con 1-2 dígitos a la derecha se toma como decimal.
 */
export function parseNumero(entrada: string): number {
  const limpio = entrada.replace(/[^\d.,-]/g, '').trim();
  if (!limpio) return 0;

  const ultimaComa = limpio.lastIndexOf(',');
  const ultimoPunto = limpio.lastIndexOf('.');
  const sepDecimal = Math.max(ultimaComa, ultimoPunto);

  // Un separador con 3 dígitos a la derecha es de miles, no decimal.
  const digitosDerecha = sepDecimal === -1 ? 0 : limpio.length - sepDecimal - 1;
  const esDecimal = sepDecimal !== -1 && digitosDerecha > 0 && digitosDerecha <= 2;

  const normalizado = esDecimal
    ? limpio.slice(0, sepDecimal).replace(/[.,]/g, '') + '.' + limpio.slice(sepDecimal + 1)
    : limpio.replace(/[.,]/g, '');

  const n = Number.parseFloat(normalizado);
  return Number.isFinite(n) ? n : 0;
}

/** Suma `offset` meses a un "YYYY-MM" y devuelve {anio, mes (0-11)}. */
export function desplazarMes(inicio: string, offset: number): { anio: number; mes: number } {
  const [anioStr, mesStr] = inicio.split('-');
  const anioBase = Number.parseInt(anioStr, 10) || new Date().getFullYear();
  const mesBase = (Number.parseInt(mesStr, 10) || 1) - 1;
  const total = anioBase * 12 + mesBase + offset;
  return { anio: Math.floor(total / 12), mes: ((total % 12) + 12) % 12 };
}

export const nombreMes = (mes: number) => MESES[((mes % 12) + 12) % 12];

/** "Marzo 2029" */
export function etiquetaFecha(inicio: string, offset: number): string {
  const { anio, mes } = desplazarMes(inicio, offset);
  return `${nombreMes(mes)} ${anio}`;
}

/** "4 años y 3 meses" */
export function duracionLegible(meses: number): string {
  if (meses <= 0) return '0 meses';
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  const partes: string[] = [];
  if (a > 0) partes.push(`${a} ${a === 1 ? 'año' : 'años'}`);
  if (m > 0) partes.push(`${m} ${m === 1 ? 'mes' : 'meses'}`);
  return partes.join(' y ');
}

export const mesActualISO = (): string => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
};
