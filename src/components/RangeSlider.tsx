/**
 * RangeSlider — slider dual-thumb para seleccionar un rango [start, end] entero.
 *
 * Características:
 *  - Dos thumbs draggeables con pointer events (funciona touch + mouse).
 *  - Track con rango lleno entre los thumbs (visualiza la ventana).
 *  - Click en el track mueve el thumb más cercano.
 *  - Keyboard: ArrowLeft/Right (±1), Shift+Arrow (±12), Home/End (extremos).
 *  - Tooltip sobre cada thumb al hover/drag (usa `formatValue`).
 *  - Constraint: start + minWindow ≤ end. Cuando un thumb choca con el otro,
 *    clampea (no intercambia).
 *
 * Se usa para definir la ventana temporal del FanChart y del ProfilePreview,
 * compartiendo el mismo estado del store para sincronización automática.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type RangeSliderProps = {
  /** Valor mínimo (inclusive). Enteros. */
  min: number;
  /** Valor máximo (inclusive). Enteros. */
  max: number;
  /** Posición actual del thumb de inicio. */
  start: number;
  /** Posición actual del thumb de fin. */
  end: number;
  /** Ancho mínimo de la ventana (end − start). Default 6. */
  minWindow?: number;
  /** Callback al cambiar el rango. Se dispara durante drag y en keyboard. */
  onChange: (start: number, end: number) => void;
  /** Formatea el valor para mostrarlo en tooltips. Default: `${v}`. */
  formatValue?: (value: number) => string;
  /** ARIA labels accesibilidad. */
  ariaLabelStart?: string;
  ariaLabelEnd?: string;
};

type DragTarget = 'start' | 'end' | null;

export default function RangeSlider({
  min,
  max,
  start,
  end,
  minWindow = 6,
  onChange,
  formatValue,
  ariaLabelStart = 'Inicio del rango',
  ariaLabelEnd = 'Fin del rango',
}: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const [hoverThumb, setHoverThumb] = useState<DragTarget>(null);

  const fmt = formatValue ?? ((v: number) => String(v));
  const span = Math.max(1, max - min);

  const pctStart = ((start - min) / span) * 100;
  const pctEnd = ((end - min) / span) * 100;

  /** Convierte clientX → valor del rango, clampado al [min, max]. */
  const xToValue = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return min;
      const rect = el.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(min + pct * span);
    },
    [min, span],
  );

  const commit = useCallback(
    (target: DragTarget, value: number) => {
      if (target === 'start') {
        const clamped = Math.max(min, Math.min(value, end - minWindow));
        if (clamped !== start) onChange(clamped, end);
      } else if (target === 'end') {
        const clamped = Math.min(max, Math.max(value, start + minWindow));
        if (clamped !== end) onChange(start, clamped);
      }
    },
    [end, max, min, minWindow, onChange, start],
  );

  // --- Handlers de pointer para los thumbs (drag) ---------------------------

  const onThumbPointerDown = useCallback(
    (target: 'start' | 'end') => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setDragging(target);
    },
    [],
  );

  const onThumbPointerMove = useCallback(
    (target: 'start' | 'end') => (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragging !== target) return;
      commit(target, xToValue(e.clientX));
    },
    [commit, dragging, xToValue],
  );

  const onThumbPointerUp = useCallback(
    (target: 'start' | 'end') => (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragging !== target) return;
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {
        /* noop — captura puede estar liberada */
      }
      setDragging(null);
    },
    [dragging],
  );

  // --- Click en el track (no en los thumbs): mueve el thumb más cercano ----

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const v = xToValue(e.clientX);
      const closer: 'start' | 'end' =
        Math.abs(v - start) <= Math.abs(v - end) ? 'start' : 'end';
      commit(closer, v);
    },
    [commit, end, start, xToValue],
  );

  // --- Keyboard ------------------------------------------------------------

  const onThumbKeyDown = useCallback(
    (target: 'start' | 'end') => (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 12 : 1;
      let handled = true;
      const current = target === 'start' ? start : end;
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          commit(target, current - step);
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          commit(target, current + step);
          break;
        case 'Home':
          commit(target, min);
          break;
        case 'End':
          commit(target, max);
          break;
        case 'PageDown':
          commit(target, current - 12);
          break;
        case 'PageUp':
          commit(target, current + 12);
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    },
    [commit, end, max, min, start],
  );

  // Si el usuario suelta fuera del elemento, por si acaso, liberar drag.
  useEffect(() => {
    if (!dragging) return;
    const onUp = (): void => setDragging(null);
    globalThis.addEventListener('pointerup', onUp);
    globalThis.addEventListener('pointercancel', onUp);
    return () => {
      globalThis.removeEventListener('pointerup', onUp);
      globalThis.removeEventListener('pointercancel', onUp);
    };
  }, [dragging]);

  const showTooltipStart = dragging === 'start' || hoverThumb === 'start';
  const showTooltipEnd = dragging === 'end' || hoverThumb === 'end';

  return (
    <div className="relative select-none py-3">
      {/* Track clickable */}
      <div
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        className="relative h-8 flex items-center cursor-pointer"
      >
        {/* Rail (línea gris de fondo) */}
        <div className="absolute left-0 right-0 h-2 rounded-full bg-mercantil-line dark:bg-mercantil-dark-line" />
        {/* Rango seleccionado (naranja) */}
        <div
          className="absolute h-2 rounded-full bg-mercantil-orange"
          style={{ left: `${pctStart}%`, right: `${100 - pctEnd}%` }}
        />

        {/* Thumb de inicio */}
        <Thumb
          position={pctStart}
          color="navy"
          active={dragging === 'start' || hoverThumb === 'start'}
          ariaLabel={ariaLabelStart}
          ariaValueMin={min}
          ariaValueMax={end - minWindow}
          ariaValueNow={start}
          ariaValueText={fmt(start)}
          tooltip={showTooltipStart ? fmt(start) : null}
          onPointerDown={onThumbPointerDown('start')}
          onPointerMove={onThumbPointerMove('start')}
          onPointerUp={onThumbPointerUp('start')}
          onPointerCancel={onThumbPointerUp('start')}
          onPointerEnter={() => setHoverThumb('start')}
          onPointerLeave={() => setHoverThumb((t) => (t === 'start' ? null : t))}
          onKeyDown={onThumbKeyDown('start')}
        />

        {/* Thumb de fin */}
        <Thumb
          position={pctEnd}
          color="orange"
          active={dragging === 'end' || hoverThumb === 'end'}
          ariaLabel={ariaLabelEnd}
          ariaValueMin={start + minWindow}
          ariaValueMax={max}
          ariaValueNow={end}
          ariaValueText={fmt(end)}
          tooltip={showTooltipEnd ? fmt(end) : null}
          onPointerDown={onThumbPointerDown('end')}
          onPointerMove={onThumbPointerMove('end')}
          onPointerUp={onThumbPointerUp('end')}
          onPointerCancel={onThumbPointerUp('end')}
          onPointerEnter={() => setHoverThumb('end')}
          onPointerLeave={() => setHoverThumb((t) => (t === 'end' ? null : t))}
          onKeyDown={onThumbKeyDown('end')}
        />
      </div>
    </div>
  );
}

type ThumbProps = {
  position: number; // % 0..100
  color: 'navy' | 'orange';
  active: boolean;
  ariaLabel: string;
  ariaValueMin: number;
  ariaValueMax: number;
  ariaValueNow: number;
  ariaValueText: string;
  tooltip: string | null;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
};

function Thumb(props: ThumbProps) {
  const borderColor =
    props.color === 'navy' ? 'border-mercantil-navy' : 'border-mercantil-orange';
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={props.ariaLabel}
      aria-valuemin={props.ariaValueMin}
      aria-valuemax={props.ariaValueMax}
      aria-valuenow={props.ariaValueNow}
      aria-valuetext={props.ariaValueText}
      className={[
        'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
        'h-5 w-5 rounded-full bg-white dark:bg-mercantil-dark-panel shadow-md',
        'border-2 transition-transform duration-75',
        borderColor,
        props.active ? 'scale-125 shadow-lg' : 'hover:scale-110',
        'cursor-grab active:cursor-grabbing',
        'focus:outline-none focus:ring-2 focus:ring-mercantil-orange focus:ring-offset-2',
        'touch-none',
      ].join(' ')}
      style={{ left: `${props.position}%` }}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
      onPointerEnter={props.onPointerEnter}
      onPointerLeave={props.onPointerLeave}
      onKeyDown={props.onKeyDown}
    >
      {props.tooltip != null && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-mercantil-ink px-2 py-1 text-[11px] font-semibold text-white shadow-lg pointer-events-none">
          {props.tooltip}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 bg-mercantil-ink" />
        </div>
      )}
    </div>
  );
}
