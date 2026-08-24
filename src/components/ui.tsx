import { useEffect, useId, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { formatNumber, parseNumero, type Moneda } from '../lib/format';

/* ------------------------------------------------------------------ */
/*  Tarjeta                                                            */
/* ------------------------------------------------------------------ */

/** Paso de la rampa de sección (--rampa-1 … --rampa-6). */
export type Paso = 1 | 2 | 3 | 4 | 5 | 6;

export function Card({
  title, subtitle, icon, paso, actions, children, id,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  paso?: Paso;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  // Un solo custom property gobierna el borde superior y el icono.
  const estilo = paso ? ({ '--paso': `var(--rampa-${paso})` } as CSSProperties) : undefined;
  return (
    <section className="card" id={id} style={estilo}>
      <header className="card__head">
        {icon && <span className="card__icon" aria-hidden="true">{icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="card__title">{title}</h2>
          {subtitle && <p className="card__sub">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Campos                                                             */
/* ------------------------------------------------------------------ */

interface BaseFieldProps {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}

function FieldShell({ label, hint, children }: BaseFieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}

/**
 * Campo numérico tolerante: acepta "1.200.000", "1200000" o "1,2".
 * Mientras se escribe conserva el texto crudo; al salir del campo lo formatea.
 */
export function NumberField({
  label, value, onChange, moneda, prefix, suffix, hint, min = 0, max, decimales,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  moneda: Moneda;
  prefix?: string;
  suffix?: string;
  hint?: string;
  min?: number;
  max?: number;
  decimales?: number;
}) {
  const dec = decimales ?? moneda.decimales;
  const bonito = (n: number) => (n === 0 ? '' : formatNumber(n, moneda, dec));
  const [texto, setTexto] = useState(() => bonito(value));
  const [enfocado, setEnfocado] = useState(false);

  // Si el valor cambia desde fuera (preset, reset) y el campo no está en uso.
  useEffect(() => {
    if (!enfocado) setTexto(bonito(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, moneda.codigo, enfocado]);

  const commit = (raw: string) => {
    let n = parseNumero(raw);
    if (Number.isFinite(min)) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    onChange(n);
    return n;
  };

  return (
    <FieldShell label={label} hint={hint}>
      {(id) => (
        <div className="input-wrap">
          {prefix && <span className="input-wrap__affix input-wrap__affix--left">{prefix}</span>}
          <input
            id={id}
            className={`input${prefix ? ' input--pad-left' : ''}${suffix ? ' input--pad-right' : ''}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={texto}
            placeholder="0"
            onFocus={() => setEnfocado(true)}
            onChange={(e) => { setTexto(e.target.value); commit(e.target.value); }}
            onBlur={(e) => { const n = commit(e.target.value); setEnfocado(false); setTexto(bonito(n)); }}
          />
          {suffix && <span className="input-wrap__affix input-wrap__affix--right">{suffix}</span>}
        </div>
      )}
    </FieldShell>
  );
}

export function TextField({
  label, value, onChange, placeholder, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          className="input"
          style={{ fontFamily: 'var(--font-sans)' }}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </FieldShell>
  );
}

export function MonthField({
  label, value, onChange, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      {(id) => (
        <input id={id} className="input" type="month" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </FieldShell>
  );
}

export function SelectField<T extends string>({
  label, value, onChange, options, hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  hint?: string;
}) {
  return (
    <FieldShell label={label} hint={hint}>
      {(id) => (
        <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </FieldShell>
  );
}

export function Segmented<T extends string>({
  label, value, onChange, options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; hint?: string }>;
}) {
  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      <span className="field__label">{label}</span>
      <div className="segments" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="segment"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            title={o.hint}
          >
            {o.label}
          </button>
        ))}
      </div>
      {options.find((o) => o.value === value)?.hint && (
        <span className="field__hint">{options.find((o) => o.value === value)!.hint}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Métricas                                                           */
/* ------------------------------------------------------------------ */

export function StatTile({
  label, value, detail, accent = 'ink', big = false,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: 'ink' | 'brand' | 'plum' | 'gold' | 'ok';
  big?: boolean;
}) {
  const color = {
    ink: 'var(--ink)',
    brand: 'var(--brand)',
    plum: 'var(--plum)',
    gold: 'var(--gold-strong)',
    ok: 'var(--ok)',
  }[accent];
  return (
    <div className={`stat${big ? ' stat--big' : ''}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value num" style={{ color }}>{value}</span>
      {detail && <span className="stat__detail">{detail}</span>}
    </div>
  );
}
