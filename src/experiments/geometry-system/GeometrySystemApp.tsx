import { ArrowLeft, Crosshair, Mountain, Waves } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { GeometrySystemExperience } from './GeometrySystemExperience';

export type GeometrySystemPhase = 'overview' | 'focusing' | 'focused' | 'returning';

const phaseLabel: Record<GeometrySystemPhase, string> = {
  overview: 'SYSTEM OVERVIEW',
  focusing: 'APPROACHING TARGET',
  focused: 'ORBITAL OBSERVATION',
  returning: 'RETURNING TO SYSTEM',
};

export function GeometrySystemApp() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const experienceRef = useRef<GeometrySystemExperience | null>(null);
  const [phase, setPhase] = useState<GeometrySystemPhase>('overview');

  useEffect(() => {
    const container = sceneRef.current;
    if (!container) return;

    const experience = new GeometrySystemExperience(container, {
      onPhaseChange: setPhase,
    });
    experienceRef.current = experience;

    return () => {
      experience.dispose();
      experienceRef.current = null;
    };
  }, []);

  const isOverview = phase === 'overview' || phase === 'returning';
  const isFocused = phase === 'focusing' || phase === 'focused';

  return (
    <main className={`geometry-system geometry-system--${phase}`}>
      <div
        className="geometry-system__scene"
        ref={sceneRef}
        aria-label="Varietas 程序化几何行星实验场景"
      />
      <div className="geometry-system__vignette" aria-hidden="true" />
      <div className="geometry-system__scanlines" aria-hidden="true" />

      <header className={`geometry-hud ${isOverview ? 'geometry-hud--visible' : ''}`}>
        <div className="geometry-hud__identity">
          <span>GEOMETRY LAB / 01</span>
          <strong>NOVENTURE</strong>
        </div>
        <div className="geometry-hud__status" aria-live="polite">
          <span className="geometry-hud__signal" aria-hidden="true" />
          <span>{phaseLabel[phase]}</span>
        </div>
        <div className="geometry-hud__technology">
          <span>PROCEDURAL SURFACE</span>
          <span>TEXTURELESS PROTOTYPE</span>
        </div>
      </header>

      <aside
        className={`geometry-focus-panel ${isFocused ? 'geometry-focus-panel--visible' : ''}`}
        aria-hidden={!isFocused}
      >
        <button
          className="geometry-focus-panel__return"
          type="button"
          onClick={() => experienceRef.current?.returnToOverview()}
          disabled={!isFocused}
        >
          <ArrowLeft aria-hidden="true" />
          <span>返回全景</span>
        </button>

        <div className="geometry-focus-panel__heading">
          <span>NOVENTURE C / GEOMETRY STUDY</span>
          <h1>
            Varietas
            <small>多样</small>
          </h1>
          <p>程序化岩质世界 · 山脉、海洋与大气几何实验</p>
        </div>

        <div className="geometry-focus-panel__rule" aria-hidden="true" />

        <p className="geometry-focus-panel__summary">
          当前样板使用动态地形、独立海洋壳层与实时大气光学构成，不依赖行星表面颜色、法线或高度贴图。
        </p>

        <dl className="geometry-focus-panel__features">
          <div>
            <dt><Mountain aria-hidden="true" /> 地形</dt>
            <dd>多频几何位移</dd>
          </div>
          <div>
            <dt><Waves aria-hidden="true" /> 海洋</dt>
            <dd>独立光学壳层</dd>
          </div>
          <div>
            <dt><Crosshair aria-hidden="true" /> 观察</dt>
            <dd>聚焦级细节</dd>
          </div>
        </dl>
      </aside>

      <div className={`geometry-system__hint ${isOverview ? 'geometry-system__hint--visible' : ''}`}>
        <span aria-hidden="true" />
        点击 Varietas 进入几何聚焦观察
      </div>
    </main>
  );
}
