import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface FocusReturnInteractionProps {
  visible: boolean;
  onReturn: () => void;
  label?: string;
  ariaLabel?: string;
  lineSpacing?: number;
  triggerRadius?: number;
  maxLineLength?: number;
  retractionDuration?: number;
  className?: string;
}

export function FocusReturnInteraction({
  visible,
  onReturn,
  label = '返航',
  ariaLabel = '返回全景',
  lineSpacing = 4,
  triggerRadius = 40,
  maxLineLength = 128,
  retractionDuration = 680,
  className = '',
}: FocusReturnInteractionProps) {
  const zoneRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef(0);
  const lineStateRef = useRef({ pointerY: 0, maxLength: maxLineLength });
  const interactionActiveRef = useRef(false);
  const [hintActive, setHintActive] = useState(false);

  const clearLines = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const drawLines = useCallback((pointerY: number, length: number, retraction = 1) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const centeredMobileLayout = window.matchMedia('(max-width: 767px)').matches;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const renderWidth = Math.max(1, Math.round(bounds.width * pixelRatio));
    const renderHeight = Math.max(1, Math.round(bounds.height * pixelRatio));
    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      canvas.width = renderWidth;
      canvas.height = renderHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    for (let lineY = 0; lineY <= bounds.height; lineY += lineSpacing) {
      const distance = Math.abs(lineY - pointerY);
      if (distance >= triggerRadius) continue;
      const proximity = 1 - distance / triggerRadius;
      const strength = proximity ** 2.35;
      const lineLength = Math.min(length, bounds.width - 2) * strength * retraction;
      const alpha = strength * retraction;
      if (lineLength < 0.5 || alpha < 0.01) continue;
      const lineStart = centeredMobileLayout ? (bounds.width - lineLength) * 0.5 : bounds.width - lineLength;
      const lineEnd = centeredMobileLayout ? (bounds.width + lineLength) * 0.5 : bounds.width;
      const gradient = context.createLinearGradient(lineStart, 0, lineEnd, 0);
      if (centeredMobileLayout) {
        gradient.addColorStop(0, `rgba(142, 181, 211, ${0.08 * alpha})`);
        gradient.addColorStop(0.5, `rgba(194, 219, 237, ${0.82 * alpha})`);
        gradient.addColorStop(1, `rgba(142, 181, 211, ${0.08 * alpha})`);
      } else {
        gradient.addColorStop(0, `rgba(194, 219, 237, ${0.82 * alpha})`);
        gradient.addColorStop(1, `rgba(142, 181, 211, ${0.08 * alpha})`);
      }
      context.strokeStyle = gradient;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(lineStart, lineY + 0.5);
      context.lineTo(lineEnd, lineY + 0.5);
      context.stroke();
    }
  }, [lineSpacing, triggerRadius]);

  const retractLines = useCallback(() => {
    if (window.matchMedia('(max-width: 767px)').matches) return;
    if (!interactionActiveRef.current) return;
    interactionActiveRef.current = false;
    setHintActive(false);
    if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
    const startedAt = performance.now();
    const animateRetraction = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / retractionDuration);
      const retraction = (1 - progress) ** 2;
      drawLines(lineStateRef.current.pointerY, lineStateRef.current.maxLength, retraction);
      if (progress < 1) {
        animationRef.current = window.requestAnimationFrame(animateRetraction);
      } else {
        animationRef.current = 0;
        clearLines();
      }
    };
    animationRef.current = window.requestAnimationFrame(animateRetraction);
  }, [clearLines, drawLines, retractionDuration]);

  const activateAt = useCallback((pointerY: number) => {
    const zone = zoneRef.current;
    if (!zone) return;
    interactionActiveRef.current = true;
    setHintActive(true);
    if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
    lineStateRef.current = { pointerY, maxLength: maxLineLength };
    zone.style.setProperty('--return-label-y', `${pointerY}px`);
    zone.style.setProperty('--return-label-offset', `${maxLineLength + 14}px`);
    drawLines(pointerY, maxLineLength);
  }, [drawLines, maxLineLength]);

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (window.matchMedia('(max-width: 767px)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    activateAt(Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)));
  };

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (!interactionActiveRef.current || !zoneRef.current) return;
      const bounds = zoneRef.current.getBoundingClientRect();
      const outside = event.clientX > bounds.right
        || event.clientX < bounds.left
        || event.clientY < bounds.top
        || event.clientY > bounds.bottom;
      if (outside) retractLines();
    };
    window.addEventListener('pointermove', handleWindowPointerMove, true);
    return () => window.removeEventListener('pointermove', handleWindowPointerMove, true);
  }, [retractLines]);

  useEffect(() => {
    if (!visible) {
      interactionActiveRef.current = false;
      setHintActive(false);
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      animationRef.current = 0;
      clearLines();
      return;
    }
    if (!window.matchMedia('(max-width: 767px)').matches) return;

    const drawPersistentLines = () => {
      const bounds = canvasRef.current?.getBoundingClientRect();
      if (bounds) activateAt(bounds.height / 2);
    };
    const frame = window.requestAnimationFrame(drawPersistentLines);
    window.addEventListener('resize', drawPersistentLines);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', drawPersistentLines);
    };
  }, [activateAt, clearLines, visible]);

  useEffect(() => () => {
    if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
  }, []);

  return (
    <button
      ref={zoneRef}
      className={`focus-return-zone ${visible ? 'focus-return-zone--visible' : ''} ${hintActive ? 'focus-return-zone--active' : ''} ${className}`.trim()}
      type="button"
      aria-label={ariaLabel}
      tabIndex={visible ? 0 : -1}
      onClick={onReturn}
      onPointerMove={handlePointerMove}
      onPointerLeave={retractLines}
      onFocus={() => {
        if (window.matchMedia('(max-width: 767px)').matches) return;
        const bounds = zoneRef.current?.getBoundingClientRect();
        if (bounds) activateAt(bounds.height / 2);
      }}
      onBlur={retractLines}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <canvas className="focus-return-zone__line-field" ref={canvasRef} aria-hidden="true" />
      <span className="focus-return-zone__prompt" aria-hidden="true">{label}</span>
    </button>
  );
}
