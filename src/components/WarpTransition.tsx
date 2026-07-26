import { useEffect, useRef, useState } from 'react';

interface WarpTransitionProps {
  active: boolean;
  direction?: 'forward' | 'reverse';
  ready?: boolean;
  onTravel: () => void;
  onComplete: () => void;
}

interface Photon {
  x: number;
  phase: number;
  densityRank: number;
  speed: number;
  length: number;
  width: number;
  alpha: number;
  hue: number;
  drift: number;
  hyper: boolean;
}

const forwardTravelAt = 455;
const reverseTravelAt = 650;
const forwardExitDuration = 1045;
const reverseExitDuration = 850;
const waitingMessageDelay = 560;

function seededRandom(index: number): number {
  const value = Math.sin(index * 91.733 + 17.319) * 43758.5453;
  return value - Math.floor(value);
}

export function WarpTransition({
  active,
  direction = 'forward',
  ready = true,
  onTravel,
  onComplete,
}: WarpTransitionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onTravelRef = useRef(onTravel);
  const onCompleteRef = useRef(onComplete);
  const readyRef = useRef(ready);
  const [waiting, setWaiting] = useState(false);

  onTravelRef.current = onTravel;
  onCompleteRef.current = onComplete;
  readyRef.current = ready;

  useEffect(() => {
    if (!active) {
      setWaiting(false);
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const travelAt = direction === 'reverse' ? reverseTravelAt : forwardTravelAt;
    const exitDuration = direction === 'reverse' ? reverseExitDuration : forwardExitDuration;
    const canWaitForAssets = direction === 'forward';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let cancelled = false;
      let frame = 0;
      let completionTimer = 0;
      const startedAt = performance.now();
      const waitForReady = (now: number) => {
        if (cancelled) return;
        const canTravel = !canWaitForAssets || readyRef.current;
        if (canTravel) {
          setWaiting(false);
          onTravelRef.current();
          completionTimer = window.setTimeout(() => onCompleteRef.current(), 140);
          return;
        }
        if (now - startedAt > waitingMessageDelay) setWaiting(true);
        frame = window.requestAnimationFrame(waitForReady);
      };
      frame = window.requestAnimationFrame(waitForReady);
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(frame);
        window.clearTimeout(completionTimer);
      };
    }

    let frame = 0;
    let hasTravelled = false;
    let waitingMessageVisible = false;
    let exitStartedAt: number | null = null;
    const startedAt = performance.now();
    const photons: Photon[] = Array.from({ length: 132 }, (_, index) => ({
      x: seededRandom(index) * window.innerWidth,
      phase: seededRandom(index + 151),
      densityRank: index < 10 ? index / 160 : seededRandom(index + 229),
      speed: 0.72 + seededRandom(index + 307) * 0.78,
      length: 34 + seededRandom(index + 463) * 210,
      width: 0.42 + seededRandom(index + 619) * 1.7,
      alpha: 0.2 + seededRandom(index + 773) * 0.74,
      hue: seededRandom(index + 929),
      drift: (seededRandom(index + 1081) - 0.5) * 54,
      hyper: index < 10,
    }));

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * pixelRatio);
      canvas.height = Math.round(window.innerHeight * pixelRatio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const draw = (now: number) => {
      const elapsed = now - startedAt;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const introProgress = Math.min(elapsed / travelAt, 1);
      const canTravel = !canWaitForAssets || readyRef.current;

      if (!hasTravelled && elapsed >= travelAt && canTravel) {
        hasTravelled = true;
        exitStartedAt = now;
        if (waitingMessageVisible) {
          waitingMessageVisible = false;
          setWaiting(false);
        }
        onTravelRef.current();
      }

      const isWaiting = elapsed >= travelAt && !hasTravelled;
      if (
        isWaiting
        && !waitingMessageVisible
        && elapsed - travelAt >= waitingMessageDelay
      ) {
        waitingMessageVisible = true;
        setWaiting(true);
      }

      const exitElapsed = exitStartedAt === null ? 0 : now - exitStartedAt;
      const exitProgress = exitStartedAt === null
        ? 0
        : Math.min(exitElapsed / exitDuration, 1);
      const fadeOut = 1 - exitProgress;
      const intensity = Math.max(0, introProgress * fadeOut);
      const density = 0.08 + Math.pow(intensity, 0.82) * 0.92;
      const velocity = 0.16 + Math.pow(intensity, 1.1) * 0.84;
      const backdropOpacity = exitStartedAt === null
        ? 0.04 + introProgress * 0.78
        : 0.82 * fadeOut;

      context.clearRect(0, 0, width, height);
      context.fillStyle = `rgba(1, 4, 12, ${Math.min(0.88, backdropOpacity)})`;
      context.fillRect(0, 0, width, height);

      const reverse = direction === 'reverse';
      const ambient = context.createLinearGradient(0, reverse ? 0 : height, 0, reverse ? height : 0);
      ambient.addColorStop(0, `rgba(84, 155, 210, ${0.2 * intensity})`);
      ambient.addColorStop(0.45, `rgba(16, 55, 94, ${0.1 * intensity})`);
      ambient.addColorStop(1, 'rgba(2, 7, 16, 0)');
      context.fillStyle = ambient;
      context.fillRect(0, 0, width, height);

      for (const photon of photons) {
        if (photon.densityRank > density) continue;

        const cycleLength = 940 / photon.speed;
        const cycle = ((elapsed + photon.phase * cycleLength) % cycleLength) / cycleLength;
        const forwardHeadY = height * (1.17 - cycle * 1.72);
        const headY = reverse ? height - forwardHeadY : forwardHeadY;
        const trailLength = photon.length * (0.22 + velocity * (photon.hyper ? 1.72 : 1.18));
        const tailY = headY + (reverse ? -trailLength : trailLength);
        const x = photon.x + photon.drift * (cycle - 0.5);
        const passageFade = Math.sin(cycle * Math.PI);
        const densityFade = Math.min(1, (density - photon.densityRank) * 8 + 0.18);
        const opacity = photon.alpha
          * densityFade
          * passageFade
          * (0.24 + velocity * 0.76)
          * fadeOut;
        const color = photon.hue > 0.82
          ? '213, 183, 138'
          : photon.hue > 0.38
            ? '177, 220, 246'
            : '224, 242, 255';
        const gradient = context.createLinearGradient(x, headY, x, tailY);
        gradient.addColorStop(0, `rgba(${color}, ${opacity})`);
        gradient.addColorStop(0.08, `rgba(${color}, ${opacity * 0.9})`);
        gradient.addColorStop(1, `rgba(${color}, 0)`);

        context.save();
        if (photon.hyper) {
          context.shadowColor = `rgba(${color}, ${opacity * 0.72})`;
          context.shadowBlur = 10 + intensity * 14;
        }
        context.beginPath();
        context.moveTo(x, headY);
        context.lineTo(x, tailY);
        context.lineWidth = photon.width * (0.54 + velocity * (photon.hyper ? 1.72 : 1.18));
        context.strokeStyle = gradient;
        context.stroke();
        context.restore();
      }

      const entryFlash = Math.max(0, 1 - Math.abs(elapsed - travelAt) / 150);
      const exitFlash = exitStartedAt === null
        ? 0
        : Math.max(0, 1 - Math.abs(exitProgress - 0.46) / 0.2) * 0.6;
      const flash = Math.max(entryFlash, exitFlash);
      if (flash > 0) {
        const flare = context.createLinearGradient(0, reverse ? 0 : height, 0, reverse ? height : 0);
        flare.addColorStop(0, `rgba(213, 236, 255, ${flash * 0.34})`);
        flare.addColorStop(0.44, `rgba(109, 180, 230, ${flash * 0.14})`);
        flare.addColorStop(1, 'rgba(11, 35, 64, 0)');
        context.fillStyle = flare;
        context.fillRect(0, 0, width, height);
      }

      if (hasTravelled && exitProgress >= 1) {
        onCompleteRef.current();
        return;
      }
      frame = window.requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [active, direction]);

  if (!active) return null;

  return (
    <div
      className={`warp-transition ${waiting ? 'warp-transition--waiting' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={waiting ? '正在校准星图并加载恒星系' : '正在进行星际跃迁'}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="warp-transition__core" aria-hidden="true" />
      <div className="warp-transition__status" aria-hidden={!waiting}>
        <span>STELLAR DATA SYNCHRONIZING</span>
        <strong>正在校准星图</strong>
        <i aria-hidden="true" />
      </div>
    </div>
  );
}
