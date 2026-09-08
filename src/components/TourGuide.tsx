import { useCallback, useEffect, useRef, useState } from 'react';

interface PasoTour {
  id: string;
  titulo: string;
  texto: string;
}

const PASOS: PasoTour[] = [
  {
    id: 'resumen',
    titulo: 'Tu resultado, en vivo',
    texto: 'Aquí ves tu cuota mensual, cuánto pagas en total y cuánto te ahorras. Todo se recalcula al instante mientras escribes, sin botones de por medio.',
  },
  {
    id: 'credito',
    titulo: '1 · Datos del crédito',
    texto: 'Escribe el monto, la tasa y el plazo tal como salen en tu carta de aprobación o extracto. ¿No tienes uno a mano? Usa un preset para empezar rápido.',
  },
  {
    id: 'abonos',
    titulo: '2 · Abonos extra',
    texto: 'Si vas a meterle plata extra al crédito, decide aquí qué hace ese abono: bajar la cuota o terminar antes. Ahí está el verdadero ahorro.',
  },
  {
    id: 'presupuesto',
    titulo: '3 · ¿Cabe en tu presupuesto?',
    texto: 'Opcional, pero importante: cuenta tus ingresos y gastos para ver un semáforo de qué tan sano es este crédito para ti.',
  },
  {
    id: 'graficas',
    titulo: '4 · Cómo se comporta tu deuda',
    texto: 'La línea muestra cómo baja tu saldo mes a mes. Las barras, cuánto de cada año se va en intereses.',
  },
  {
    id: 'consejos',
    titulo: '5 · Para tu caso',
    texto: 'Lecturas automáticas sobre tus propios números: no son consejos genéricos.',
  },
  {
    id: 'tabla',
    titulo: '6 · Tu plan de pagos',
    texto: 'Cuota por cuota. Toca el "+" en cualquier fila para registrar un abono puntual (una prima, un bono). Cuando quieras, descárgalo en Excel.',
  },
];

const CLAVE_VISTO = 'plan-de-pagos:tour-visto';

/**
 * Tour sin overlay: en vez de recortar la pantalla (frágil al hacer scroll o
 * redimensionar), resalta la sección con un contorno y la centra con
 * scrollIntoView. El panel de texto va fijo abajo, igual en cualquier tamaño
 * de pantalla, así que no hay matemática de posicionamiento que se rompa
 * en teléfonos angostos.
 */
export function TourGuide() {
  const [activo, setActivo] = useState(false);
  const [paso, setPaso] = useState(0);
  const [pasosDisponibles, setPasosDisponibles] = useState<PasoTour[]>([]);
  const [avisoNuevo, setAvisoNuevo] = useState(false);
  const objetivoRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(CLAVE_VISTO)) setAvisoNuevo(true);
    } catch {
      /* modo privado: simplemente no se muestra el aviso de "nuevo" */
    }
  }, []);

  const limpiarObjetivo = () => {
    objetivoRef.current?.classList.remove('tour-objetivo');
    objetivoRef.current = null;
  };

  const iluminar = useCallback((id: string) => {
    limpiarObjetivo();
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('tour-objetivo');
    objetivoRef.current = el;
    el.scrollIntoView({ behavior: 'smooth', block: id === 'resumen' ? 'start' : 'center' });
  }, []);

  const terminar = useCallback(() => {
    limpiarObjetivo();
    setActivo(false);
  }, []);

  const iniciar = () => {
    // Gráficas y consejos solo existen si el plan actual es válido: se arma
    // la ruta con lo que de verdad está en pantalla en este momento.
    const disponibles = PASOS.filter((p) => document.getElementById(p.id));
    if (disponibles.length === 0) return;
    setPasosDisponibles(disponibles);
    setPaso(0);
    setActivo(true);
    setAvisoNuevo(false);
    try { window.localStorage.setItem(CLAVE_VISTO, '1'); } catch { /* noop */ }
    iluminar(disponibles[0].id);
  };

  const ir = useCallback((i: number) => {
    setPasosDisponibles((actuales) => {
      if (i < 0) return actuales;
      if (i >= actuales.length) { terminar(); return actuales; }
      setPaso(i);
      iluminar(actuales[i].id);
      return actuales;
    });
  }, [iluminar, terminar]);

  useEffect(() => {
    if (!activo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') terminar();
      if (e.key === 'ArrowRight') ir(paso + 1);
      if (e.key === 'ArrowLeft') ir(paso - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activo, paso, ir, terminar]);

  // Si el usuario navega fuera del tour (recarga, etc.) el resalte no debe quedar pegado.
  useEffect(() => () => limpiarObjetivo(), []);

  const actual = pasosDisponibles[paso];

  return (
    <>
      <button
        type="button"
        className="tour-fab"
        onClick={iniciar}
        aria-label="Iniciar tour guiado de la herramienta"
        title="Tour guiado"
      >
        <span aria-hidden="true">🧭</span>
        {avisoNuevo && <span className="tour-fab__badge">Tour</span>}
      </button>

      {activo && actual && (
        <div className="tour-panel" role="dialog" aria-modal="false" aria-label="Tour guiado">
          <div className="tour-panel__cabeza">
            <span className="tour-panel__paso">Paso {paso + 1} de {pasosDisponibles.length}</span>
            <button type="button" className="tour-panel__cerrar" onClick={terminar} aria-label="Cerrar tour">×</button>
          </div>
          <h3 className="tour-panel__titulo">{actual.titulo}</h3>
          <p className="tour-panel__texto">{actual.texto}</p>
          <div className="tour-panel__dots" role="presentation">
            {pasosDisponibles.map((p, i) => (
              <span key={p.id} className={`tour-dot${i === paso ? ' tour-dot--activo' : ''}`} />
            ))}
          </div>
          <div className="tour-panel__acciones">
            <button type="button" className="btn btn--quiet" onClick={terminar}>Saltar</button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {paso > 0 && <button type="button" className="btn btn--ghost" onClick={() => ir(paso - 1)}>Atrás</button>}
              <button type="button" className="btn btn--primary" onClick={() => ir(paso + 1)}>
                {paso + 1 === pasosDisponibles.length ? 'Terminar' : 'Siguiente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
