# Plan de Pagos

Plantilla web para diseñar un plan de pagos de un crédito: calcula la cuota, simula abonos
extra, avisa si la cuota cabe en tu presupuesto y exporta todo a Excel.

Nace de una plantilla de hoja de cálculo real y conserva su modelo de cálculo, con el
mismo encadenamiento por fila:

```
interés       = saldo × tasa mensual
amortización  = (cuota + abono extra) − interés
saldo         = saldo − amortización
```

## Arrancar

Requiere **Node ≥ 20.10** y **pnpm ≥ 10** (el proyecto fija `packageManager`, así que
Corepack toma la versión correcta solo).

```bash
corepack enable            # o: brew install pnpm
pnpm install
pnpm dev                   # http://localhost:4321
```

| Script | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Sitio estático en `dist/` |
| `pnpm preview` | Sirve `dist/` |
| `pnpm check` | Diagnóstico de tipos de Astro/TS |
| `pnpm verify` | Suite de verificación del motor de amortización y del exportador |

`esbuild` y `sharp` están declarados en `pnpm.onlyBuiltDependencies` porque pnpm 10 bloquea
los scripts de instalación por defecto y ambos los necesitan.

## Qué hace la herramienta

**1 · Tu crédito.** Monto, tasa (mensual, anual efectiva o anual nominal), plazo, mes de la
primera cuota y costos mensuales tipo seguro. Hay presets de vivienda, vehículo, libre
inversión y tarjeta para empezar rápido.

Si el banco ya te dio una cuota distinta a la que sale del cálculo, se puede escribir en
**«Cuota que te dio el banco»** y el plan se recalcula con esa cuota, avisando cuántas
cuotas toma realmente. (Es el caso de la plantilla original: una cuota de 569.081 sobre
20.000.000 al 1,4 % liquida el crédito en 49 cuotas, no en 60.)

**2 · Abonos extra.** Un abono recurrente mensual con incremento anual opcional, más
abonos puntuales que se registran fila por fila en la tabla con el botón `+`. Dos
estrategias:

- **Reducir el plazo** — la cuota no cambia y el crédito termina antes. Ahorra más intereses.
- **Reducir la cuota** — se recalcula la cuota sobre el saldo y el plazo restante.

**3 · Presupuesto.** Ingreso, gastos fijos y otras deudas. Aplica una versión de la regla
28/36: la cuota sola no debería pasar del 30 % del ingreso, y todas las deudas juntas no
del 40 %. De ahí sale también el abono extra sugerido (la mitad del excedente, para dejar
colchón).

**4 · Gráficas.** Saldo mes a mes —con la curva punteada del escenario sin abonos cuando
hay abonos— y capital vs. intereses por año.

**5 · Consejos.** Se generan a partir de tus propios números, no son texto fijo.

**6 · Tabla.** Cuota por cuota, con filtros y totales. Es la misma que baja a Excel.

## Exportar a Excel

El botón *Descargar en Excel* genera un `.xlsx` con [ExcelJS](https://github.com/exceljs/exceljs)
—cargado solo al hacer clic, no pesa en la carga inicial— con tres hojas:

1. **Plan de pagos** — bloques de datos, resumen y presupuesto arriba; la tabla completa
   abajo con panel congelado, autofiltro, formato de moneda, meses con abono resaltados y
   fila de totales.
2. **Resumen por año** — capital, intereses, abonos y saldo a fin de cada año.
3. **Guía y consejos** — cómo leer el plan, más los consejos de tu caso y las advertencias.

## Stack y decisiones

- **Astro 5** con una única isla de React (`client:load`). El resto es HTML estático.
- **Sin framework de CSS.** Un sistema de tokens en `src/styles/global.css` y componentes
  en `src/styles/app.css`. La plantilla es solo de tema claro, a propósito: es la que se
  lee mejor impresa y la que menos fricción genera con lectores no técnicos.
- **Paleta cálida** (terracota `#d4522c`, ciruela `#7b3fa0`, mostaza `#b98a10`) sobre crema,
  deliberadamente lejos del verde y el azul de las apps financieras. Los tres colores de
  serie están validados para daltonismo (ΔE 25,4 a visión normal, 22,9 en protanopía) y
  todo el texto pasa WCAG AA.
- **Nada sale del navegador.** Los datos viven en `localStorage`; no hay backend ni
  analítica. El archivo de Excel se arma en el cliente.

## Estructura

```
src/
  components/
    PaymentPlanApp.tsx   isla de React: estado, secciones y exportación
    Charts.tsx           gráficas SVG con hover (sin librerías)
    PlanTable.tsx        tabla con filtros y abonos puntuales en línea
    ui.tsx               tarjeta, campos, segmentos, métricas
  lib/
    amortization.ts      motor de cálculo, diagnóstico y consejos
    export-excel.ts      generación del .xlsx
    format.ts            monedas, fechas y parseo tolerante de números
  layouts/Layout.astro   cabecera, pie y metadatos
  pages/index.astro      landing + isla
scripts/verify.ts        suite de verificación (pnpm verify)
```

## Publicar en GitHub Pages

El sitio es estático, así que Pages lo sirve tal cual. El workflow está en
`.github/workflows/deploy.yml` y se dispara en cada push a `main` (o a mano desde la
pestaña **Actions**). Antes de publicar corre `check`, `audit`, `verify` y `build`: si
alguno falla, no se despliega.

**Activarlo una sola vez:** en el repo, *Settings → Pages → Build and deployment →
Source: **GitHub Actions***. No hace falta rama `gh-pages` ni tocar nada más.

### Rutas

Astro necesita saber en qué URL vive el sitio, porque de eso dependen los enlaces internos
y las rutas de los assets. El workflow lo inyecta con dos variables:

| Dónde se publica | `SITE_URL` | `BASE_PATH` |
|---|---|---|
| `felipe112.github.io/payment-plan/` (por defecto) | `https://felipe112.github.io` | `/payment-plan` |
| Dominio propio, p. ej. `plan.cacharreo.dev` | `https://plan.cacharreo.dev` | `/` |

Todos los enlaces internos cuelgan de `import.meta.env.BASE_URL`, así que funcionan en
ambos casos sin tocar el código. En local, sin variables, se construye en la raíz.

**Para usar un dominio propio:** pon el dominio en *Settings → Pages → Custom domain*,
crea `public/CNAME` con el dominio dentro, y cambia en el workflow `BASE_PATH` a `/` y
`SITE_URL` a tu dominio.

### Costos

Para un repositorio **público**, todo esto es gratis y sin límite de minutos: los runners
estándar de GitHub Actions no se cobran en repos públicos, y Pages tampoco. Los topes de
Pages son de uso, no de dinero: 1 GB de sitio publicado y 100 GB de tráfico al mes (este
sitio pesa unos pocos MB). Si el repo fuera **privado**, Pages exige plan de pago (Pro,
Team o Enterprise) y Actions consume de la cuota mensual del plan.

GitHub prohíbe usar Pages como hosting de un negocio o comercio electrónico. Una
plantilla educativa y gratuita no entra en ese supuesto.

## Aviso

Los cálculos son una estimación educativa bajo el sistema de amortización francés. Las
entidades financieras aplican redondeos, días exactos, seguros y comisiones que pueden
mover las cifras. Confirma siempre con tu banco antes de tomar una decisión.
