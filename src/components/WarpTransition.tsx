import { useEffect, useRef } from 'react';

interface WarpTransitionProps {
  active: boolean;
  direction?: 'forward' | 'reverse';
  onTravel: () => void;
  onComplete: () => void;
}

interface Photon {
  x: number;
  start: number;
  densityRank: number;
  speed: number;
  length: number;
  width: number;
  alpha: number;
  hue: number;
  drift: number;
}

interface HyperPhoton {
  x: number;
  startMs: number;
  durationMs: number;
  length: number;
  width: number;
  alpha: number;
  hue: number;
  drift: number;
}

const duration = 1500;
const forwardTravelAt = 455;
const reverseTravelAt = 650;

function seededRandom(index: number): number {
  const value = Math.sin(index * 91.733 + 17.319) * 43758.5453;
  return value - Math.floor(value);
}

export function WarpTransition({
  active,
  direction = 'forward',
  onTravel,
  onComplete,
}: WarpTransitionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onTravelRef = useRef(onTravel);
  const onCompleteRef = useRef(onComplete);

  onTravelRef.current = onTravel;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onTravelRef.current();
      const reducedTimer = window.setTimeout(() => onCompleteRef.current(), 140);
      return () => window.clearTimeout(reducedTimer);
    }

    let frame = 0;
    let hasTravelled = false;
    const startedAt = performance.now();
    const travelAt = direction === 'reverse' ? reverseTravelAt : forwardTravelAt;
    const fullWarpDuration = duration - travelAt;
    const photons: Photon[] = Array.from({ length: 124 }, (_, index) => ({
      x: seededRandom(index) * window.innerWidth,
      start: index < 9 ? 0 : seededRandom(index + 151) * 0.18,
      densityRank: index < 9 ? index / 140 : seededRandom(index + 229),
      speed: 0.82 + seededRandom(index + 307) * 0.72,
      length: 28 + seededRandom(index + 463) * 170,
      width: 0.45 + seededRandom(index + 619) * 1.55,
      alpha: 0.22 + seededRandom(index + 773) * 0.72,
      hue: seededRandom(index + 929),
      drift: (seededRandom(index + 1081) - 0.5) * 46,
    }));
    const hyperStarts = [70, 205, 345, 495, 655, 815, 935];
    const hyperPhotons: HyperPhoton[] = hyperStarts.map((startMs, index) => ({
      x: (0.08 + seededRandom(index + 1301) * 0.84) * window.innerWidth,
      startMs,
      durationMs: 92 + seededRandom(index + 1453) * 26,
      length: 210 + seededRandom(index + 1601) * 260,
      width: 1.1 + seededRandom(index + 1753) * 1.8,
      alpha: 0.72 + seededRandom(index + 1901) * 0.26,
      hue: seededRandom(index + 2053),
      drift: (seededRandom(index + 2203) - 0.5) * 54,
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
      const progress = Math.min(elapsed / duration, 1);
      const width = window.innerWidth;
      const height = window.innerHeight;
      const introProgress = Math.min(elapsed / travelAt, 1);
      const fullWarpProgress = Math.max(0, Math.min((elapsed - travelAt) / fullWarpDuration, 1));
      const motionProgress = elapsed < travelAt
        ? introProgress * 0.18
        : 0.18 + fullWarpProgress * 0.82;
      const rhythm = Math.sin(motionProgress * Math.PI);
      const density = 0.07 + Math.pow(rhythm, 1.35) * 0.93;
      const velocity = 0.12 + Math.pow(rhythm, 1.55) * 0.88;
      const veil = Math.sin(Math.min(motionProgress / 0.9, 1) * Math.PI);
      const backdropOpacity = elapsed < travelAt
        ? 0.04 + introProgress * 0.52
        : 0.56 + (1 - fullWarpProgress) * 0.24;

      context.clearRect(0, 0, width, height);
      context.fillStyle = `rgba(1, 4, 12, ${Math.min(0.86, backdropOpacity)})`;
      context.fillRect(0, 0, width, height);

      const reverse = direction === 'reverse';
      const ambient = context.createLinearGradient(0, reverse ? 0 : height, 0, reverse ? height : 0);
      ambient.addColorStop(0, `rgba(84, 155, 210, ${0.18 * veil})`);
      ambient.addColorStop(0.45, `rgba(16, 55, 94, ${0.09 * veil})`);
      ambient.addColorStop(1, 'rgba(2, 7, 16, 0)');
      context.fillStyle = ambient;
      context.fillRect(0, 0, width, height);

      for (const photon of photons) {
        if (photon.densityRank > density) continue;

        const localProgress = Math.max(0, (motionProgress - photon.start) / (1 - photon.start));
        if (localProgress <= 0) continue;

        const eased = localProgress * localProgress * (3 - 2 * localProgress);
        const forwardHeadY = height * (1.13 - eased * 1.62 * photon.speed);
        const headY = reverse ? height - forwardHeadY : forwardHeadY;
        const trailLength = photon.length * (0.16 + velocity * 1.42);
        const tailY = headY + (reverse ? -trailLength : trailLength);
        const x = photon.x + photon.drift * localProgress;
        const densityFade = Math.min(1, (density - photon.densityRank) * 9 + 0.16);
        const opacity = photon.alpha
          * densityFade
          * Math.min(localProgress * 5, 1)
          * (0.28 + velocity * 0.72);
        const color = photon.hue > 0.82 ? '213, 183, 138' : photon.hue > 0.38 ? '177, 220, 246' : '224, 242, 255';
        const gradient = context.createLinearGradient(x, headY, x, tailY);
        gradient.addColorStop(0, `rgba(${color}, ${opacity})`);
        gradient.addColorStop(0.08, `rgba(${color}, ${opacity * 0.9})`);
        gradient.addColorStop(1, `rgba(${color}, 0)`);

        context.beginPath();
        context.moveTo(x, headY);
        context.lineTo(x, tailY);
        context.lineWidth = photon.width * (0.54 + velocity * 1.22);
        context.strokeStyle = gradient;
        context.stroke();
      }

      const fullWarpElapsed = elapsed - travelAt;
      for (const photon of hyperPhotons) {
        const localProgress = (fullWarpElapsed - photon.startMs) / photon.durationMs;
        if (localProgress < 0 || localProgress > 1) continue;

        const eased = localProgress * localProgress * (3 - 2 * localProgress);
        const forwardHeadY = height * (1.16 - eased * 2.08);
        const headY = reverse ? height - forwardHeadY : forwardHeadY;
        const x = photon.x + photon.drift * eased;
        const pulse = Math.sin(localProgress * Math.PI);
        const trailLength = photon.length * (0.68 + pulse * 0.58);
        const tailY = headY + (reverse ? -trailLength : trailLength);
        const color = photon.hue > 0.78 ? '225, 195, 154' : '211, 240, 255';
        const gradient = context.createLinearGradient(x, headY, x, tailY);
        gradient.addColorStop(0, `rgba(${color}, ${photon.alpha * pulse})`);
        gradient.addColorStop(0.06, `rgba(${color}, ${photon.alpha * pulse * 0.92})`);
        gradient.addColorStop(0.42, `rgba(${color}, ${photon.alpha * pulse * 0.28})`);
        gradient.addColorStop(1, `rgba(${color}, 0)`);

        context.save();
        context.shadowColor = `rgba(${color}, ${pulse * 0.72})`;
        context.shadowBlur = 10 + pulse * 14;
        context.beginPath();
        context.moveTo(x, headY);
        context.lineTo(x, tailY);
        context.lineWidth = photon.width * (0.8 + pulse * 0.75);
        context.strokeStyle = gradient;
        context.stroke();
        context.restore();
      }

      const transitionFlash = Math.max(0, 1 - Math.abs(elapsed - travelAt) / 135);
      const warpFlash = Math.max(0, 1 - Math.abs(fullWarpProgress - 0.48) / 0.19);
      const flash = Math.max(transitionFlash, warpFlash * 0.62);
      if (flash > 0) {
        const flare = context.createLinearGradient(0, reverse ? 0 : height, 0, reverse ? height : 0);
        flare.addColorStop(0, `rgba(213, 236, 255, ${flash * 0.34})`);
        flare.addColorStop(0.44, `rgba(109, 180, 230, ${flash * 0.14})`);
        flare.addColorStop(1, 'rgba(11, 35, 64, 0)');
        context.fillStyle = flare;
        context.fillRect(0, 0, width, height);
      }

      if (!hasTravelled && elapsed >= travelAt) {
        hasTravelled = true;
        onTravelRef.current();
      }

      if (progress < 1) {
        frame = window.requestAnimationFrame(draw);
      } else {
        onCompleteRef.current();
      }
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
    <div className="warp-transition" aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="warp-transition__core" />
    </div>
  );
}
