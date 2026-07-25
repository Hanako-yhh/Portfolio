import { useEffect, useRef } from 'react';

interface TrailPoint {
  x: number;
  y: number;
}

interface DustParticle {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  driftPhase: number;
  activity: number;
  trail: TrailPoint[];
}

interface GravityWell {
  x: number;
  y: number;
  spin: -1 | 1;
  radius: number;
}

const desktopParticleLimit = 88;
const mobileParticleLimit = 50;
const desktopInteractionLimit = 7;
const mobileInteractionLimit = 5;
const maximumTrailPoints = 6;

export function IntroStardust() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobileMode = window.innerWidth < 768 || window.matchMedia('(pointer: coarse)').matches;
    const particleLimit = mobileMode ? mobileParticleLimit : desktopParticleLimit;
    const interactionLimit = mobileMode ? mobileInteractionLimit : desktopInteractionLimit;
    const particles: DustParticle[] = [];
    const gravityWells: GravityWell[] = [];
    const pointer = {
      x: 0,
      y: 0,
      previousX: 0,
      previousY: 0,
      velocityX: 0,
      velocityY: 0,
      active: false,
      lastInteraction: 0,
    };
    let width = 1;
    let height = 1;
    let animationFrame = 0;
    let lastFrame = 0;
    let visible = true;
    let randomSeed = 91827;

    const random = () => {
      randomSeed = (randomSeed * 16807) % 2147483647;
      return (randomSeed - 1) / 2147483646;
    };

    const rebuildScene = () => {
      const bounds = host.getBoundingClientRect();
      const nextWidth = Math.max(1, bounds.width);
      const nextHeight = Math.max(1, bounds.height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, mobileMode ? 1.25 : 1.5);
      canvas.width = Math.round(nextWidth * pixelRatio);
      canvas.height = Math.round(nextHeight * pixelRatio);
      canvas.style.width = `${nextWidth}px`;
      canvas.style.height = `${nextHeight}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      if (!particles.length) {
        for (let index = 0; index < particleLimit; index += 1) {
          const homeX = random();
          const homeY = random();
          particles.push({
            homeX,
            homeY,
            x: homeX * nextWidth,
            y: homeY * nextHeight,
            vx: 0,
            vy: 0,
            size: 0.55 + random() * 0.85,
            alpha: 0.22 + random() * 0.48,
            driftPhase: random() * Math.PI * 2,
            activity: 0,
            trail: [],
          });
        }
      } else {
        particles.forEach((particle) => {
          particle.x = particle.homeX * nextWidth;
          particle.y = particle.homeY * nextHeight;
          particle.vx = 0;
          particle.vy = 0;
          particle.trail = [];
        });
      }

      gravityWells.splice(
        0,
        gravityWells.length,
        { x: nextWidth * 0.12, y: nextHeight * 0.22, spin: 1, radius: mobileMode ? 150 : 210 },
        { x: nextWidth * 0.52, y: nextHeight * 0.12, spin: -1, radius: mobileMode ? 135 : 190 },
        { x: nextWidth * 0.9, y: nextHeight * 0.66, spin: 1, radius: mobileMode ? 165 : 230 },
      );
      width = nextWidth;
      height = nextHeight;
    };

    const activateNearestParticles = (x: number, y: number, velocityX: number, velocityY: number) => {
      const influenceRadius = mobileMode ? 118 : 148;
      const nearest = particles
        .map((particle) => ({ particle, distance: Math.hypot(particle.x - x, particle.y - y) }))
        .filter((candidate) => candidate.distance < influenceRadius)
        .sort((left, right) => left.distance - right.distance)
        .slice(0, interactionLimit);

      nearest.forEach(({ particle, distance }) => {
        const influence = 1 - distance / influenceRadius;
        const dx = x - particle.x;
        const dy = y - particle.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        particle.activity = Math.max(particle.activity, 0.72 + influence * 0.28);
        particle.vx += (dx / length) * influence * 0.34 + velocityX * 0.026;
        particle.vy += (dy / length) * influence * 0.34 + velocityY * 0.026;
      });
    };

    const updatePointer = (clientX: number, clientY: number) => {
      const bounds = host.getBoundingClientRect();
      const x = clientX - bounds.left;
      const y = clientY - bounds.top;
      if (x < 0 || x > bounds.width || y < 0 || y > bounds.height) {
        pointer.active = false;
        return;
      }
      const velocityX = pointer.active ? x - pointer.previousX : 0;
      const velocityY = pointer.active ? y - pointer.previousY : 0;
      pointer.x = x;
      pointer.y = y;
      pointer.previousX = x;
      pointer.previousY = y;
      pointer.velocityX = Math.max(-22, Math.min(22, velocityX));
      pointer.velocityY = Math.max(-22, Math.min(22, velocityY));
      pointer.active = true;
      pointer.lastInteraction = Date.now();
      activateNearestParticles(x, y, pointer.velocityX, pointer.velocityY);
    };

    const handlePointerMove = (event: PointerEvent) => updatePointer(event.clientX, event.clientY);
    const handlePointerOut = (event: PointerEvent) => {
      if (!event.relatedTarget) pointer.active = false;
    };
    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (event.gamma == null || event.beta == null || !mobileMode) return;
      const bounds = host.getBoundingClientRect();
      const gamma = Math.max(-28, Math.min(28, event.gamma)) / 28;
      const beta = Math.max(-22, Math.min(22, event.beta - 42)) / 22;
      updatePointer(
        bounds.left + bounds.width * (0.5 + gamma * 0.32),
        bounds.top + bounds.height * (0.46 + beta * 0.2),
      );
    };

    const drawGravityWell = (well: GravityWell) => {
      const gradient = context.createRadialGradient(well.x, well.y, 0, well.x, well.y, 20);
      gradient.addColorStop(0, 'rgba(224,238,255,0.44)');
      gradient.addColorStop(0.1, 'rgba(145,190,231,0.22)');
      gradient.addColorStop(1, 'rgba(60,104,165,0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(well.x, well.y, 20, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(230,242,255,0.64)';
      context.beginPath();
      context.arc(well.x, well.y, 0.8, 0, Math.PI * 2);
      context.fill();
    };

    const render = (now: number) => {
      if (!visible) return;
      animationFrame = reducedMotion ? 0 : window.requestAnimationFrame(render);
      const delta = lastFrame ? Math.min(2, (now - lastFrame) / 16.667) : 1;
      lastFrame = now;
      if (Date.now() - pointer.lastInteraction > 900) pointer.active = false;
      context.clearRect(0, 0, width, height);
      gravityWells.forEach(drawGravityWell);

      particles.forEach((particle) => {
        const homeX = particle.homeX * width + Math.sin(now * 0.00008 + particle.driftPhase) * 2.2;
        const homeY = particle.homeY * height + Math.cos(now * 0.000065 + particle.driftPhase) * 1.7;

        if (!reducedMotion) {
          if (particle.activity > 0.01) {
            const nearestWell = gravityWells.reduce((nearest, well) => {
              const pointerDistance = Math.hypot(pointer.x - well.x, pointer.y - well.y);
              return pointerDistance < nearest.distance ? { well, distance: pointerDistance } : nearest;
            }, { well: gravityWells[0], distance: Number.POSITIVE_INFINITY });
            const wellInfluence = pointer.active
              ? Math.max(0, 1 - nearestWell.distance / nearestWell.well.radius)
              : 0;
            if (wellInfluence > 0) {
              const dx = nearestWell.well.x - particle.x;
              const dy = nearestWell.well.y - particle.y;
              const distance = Math.max(18, Math.hypot(dx, dy));
              const nx = dx / distance;
              const ny = dy / distance;
              particle.vx += (nx * 0.02 - ny * nearestWell.well.spin * 0.055) * wellInfluence * delta;
              particle.vy += (ny * 0.02 + nx * nearestWell.well.spin * 0.055) * wellInfluence * delta;
            }
            particle.trail.push({ x: particle.x, y: particle.y });
            if (particle.trail.length > maximumTrailPoints) particle.trail.shift();
          } else if (particle.trail.length) {
            particle.trail.shift();
          }

          particle.vx += (homeX - particle.x) * 0.00075 * delta;
          particle.vy += (homeY - particle.y) * 0.00075 * delta;
          const drag = 0.935 ** delta;
          particle.vx *= drag;
          particle.vy *= drag;
          particle.x += particle.vx * delta;
          particle.y += particle.vy * delta;
          particle.activity *= 0.958 ** delta;
        }

        if (particle.trail.length > 1 && particle.activity > 0.025) {
          context.strokeStyle = `rgba(137,190,229,${particle.activity * 0.32})`;
          context.lineWidth = 0.9;
          context.beginPath();
          context.moveTo(particle.trail[0].x, particle.trail[0].y);
          for (let index = 1; index < particle.trail.length - 1; index += 1) {
            const current = particle.trail[index];
            const next = particle.trail[index + 1];
            context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
          }
          const lastPoint = particle.trail[particle.trail.length - 1];
          context.lineTo(lastPoint.x, lastPoint.y);
          context.stroke();
        }

        const glow = particle.activity * 0.62;
        context.fillStyle = `rgba(205,228,245,${Math.min(0.92, particle.alpha + glow)})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size + particle.activity * 0.45, 0, Math.PI * 2);
        context.fill();
      });
    };

    rebuildScene();
    const resizeObserver = new ResizeObserver(rebuildScene);
    resizeObserver.observe(host);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !animationFrame) {
        lastFrame = 0;
        animationFrame = window.requestAnimationFrame(render);
      } else if (!visible && animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
    }, { threshold: 0.01 });
    intersectionObserver.observe(host);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerout', handlePointerOut, { passive: true });
    window.addEventListener('deviceorientation', handleDeviceOrientation, { passive: true });
    animationFrame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerout', handlePointerOut);
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    };
  }, []);

  return <canvas className="intro-stardust" ref={canvasRef} aria-hidden="true" />;
}
