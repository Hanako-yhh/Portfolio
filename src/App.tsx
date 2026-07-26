import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FocusReturnInteraction } from './components/FocusReturnInteraction';
import { IntroStardust } from './components/IntroStardust';
import { SystemInteractionGuide } from './components/SystemInteractionGuide';
import { WarpTransition } from './components/WarpTransition';
import { withBase, withoutBase } from './config/paths';
import { planets, visualOrbitPeriod, type PlanetData } from './data/system';
import {
  NoventureExperience,
  type ExperiencePhase,
  type PlanetScreenGuide,
} from './scene/NoventureExperience';

type SiteRoute =
  | { kind: 'site' }
  | { kind: 'planet'; planet: PlanetData };

type WarpDestination = 'system' | 'intro';

const systemGuideStorageKey = 'noventure:system-interaction-guide-seen';

function hasSeenSystemInteractionGuide(): boolean {
  try {
    return window.sessionStorage.getItem(systemGuideStorageKey) === '1';
  } catch {
    return false;
  }
}

function rememberSystemInteractionGuide(): void {
  try {
    window.sessionStorage.setItem(systemGuideStorageKey, '1');
  } catch {
    // The in-memory state still keeps the guide one-time for this page lifecycle.
  }
}

function getRoute(): SiteRoute {
  const match = withoutBase(window.location.pathname).match(/^\/planets\/([^/]+)\/?$/);
  const planet = match ? planets.find((candidate) => candidate.id === match[1]) : null;
  return planet ? { kind: 'planet', planet } : { kind: 'site' };
}

function formatNovTime(seconds: number): string {
  const monthsPerYear = 16;
  const daysPerMonth = 40;
  const referencePlanet = planets.find((planet) => planet.id === 'haven') ?? planets[0];
  const referenceYearSeconds = visualOrbitPeriod(referencePlanet.orbitalPeriodDays);
  const elapsedNovDays = Math.floor((seconds / referenceYearSeconds) * monthsPerYear * daysPerMonth);
  const baseDayIndex = ((102 * monthsPerYear + 13) * daysPerMonth + 18) + elapsedNovDays;
  const year = Math.floor(baseDayIndex / (monthsPerYear * daysPerMonth));
  const dayWithinYear = baseDayIndex % (monthsPerYear * daysPerMonth);
  const month = Math.floor(dayWithinYear / daysPerMonth) + 1;
  const day = (dayWithinYear % daysPerMonth) + 1;
  return `${year}Y · ${month}M · ${day}D`;
}

interface IntroPageProps {
  onEnter: () => void;
  onOpenDetail: (planet: PlanetData) => void;
}

function IntroPage({ onEnter, onOpenDetail }: IntroPageProps) {
  const projectNavRef = useRef<HTMLElement>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const capabilities = [
    {
      index: '01',
      title: '界面结构',
      description: '梳理复杂业务页面的信息优先级，建立清晰、易感知、可拓展的布局系统。',
    },
    {
      index: '02',
      title: '交互体验',
      description: '关注关键流程、状态反馈和异常路径，让用户在高频任务中减少判断成本。',
    },
    {
      index: '03',
      title: '视觉规范',
      description: '制定颜色、排版、组件、间距与状态规范，确保界面在不同场景下稳定统一。',
    },
    {
      index: '04',
      title: '协作落地',
      description: '通过设计文档、标注与组件资产连接产品、研发与测试，提高交付确定性。',
    },
  ];
  const softwareTools = [
    {
      id: 'figma',
      name: 'Figma',
      description: '界面与原型',
      iconPath: withBase('assets/software/figma.svg'),
    },
    {
      id: 'codex',
      name: 'Codex',
      description: '设计工程协作',
      iconPath: withBase('assets/software/codex.webp'),
    },
    {
      id: 'mastergo',
      name: 'MasterGo',
      description: '协同与交付',
      iconPath: withBase('assets/software/mastergo.png'),
    },
  ];

  useEffect(() => {
    if (!projectMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!projectNavRef.current?.contains(event.target as Node)) setProjectMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProjectMenuOpen(false);
    };
    window.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [projectMenuOpen]);

  return (
    <section className="intro-page" aria-labelledby="intro-title">
      <div className="intro-page__stars" aria-hidden="true" />
      <IntroStardust />
      <nav
        className={`intro-project-nav ${projectMenuOpen ? 'intro-project-nav--open' : ''}`}
        aria-label="项目详情页"
        ref={projectNavRef}
      >
        <button
          className="intro-project-nav__trigger"
          type="button"
          aria-expanded={projectMenuOpen}
          aria-controls="intro-project-menu"
          onClick={() => setProjectMenuOpen((open) => !open)}
        >
          <span>项目</span>
          <i aria-hidden="true" />
        </button>
        <div className="intro-project-nav__items" id="intro-project-menu" aria-hidden={!projectMenuOpen}>
          {planets.map((planet, index) => (
            <button
              key={planet.id}
              type="button"
              tabIndex={projectMenuOpen ? 0 : -1}
              onClick={() => {
                setProjectMenuOpen(false);
                onOpenDetail(planet);
              }}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>项目名称</strong>
              <small>{planet.name}</small>
            </button>
          ))}
        </div>
      </nav>
      <p className="intro-page__brand">YANN Portfolio</p>
      <div className="intro-page__content">
        <div className="intro-profile">
          <div className="intro-profile__heading">
            <h1 id="intro-title">
              <span>杨泓濠</span>
              <em>Yann</em>
            </h1>
            <span className="intro-profile__direction">UI / UX Design</span>
          </div>
          <p className="intro-page__summary">
            关注结构、秩序与可用性的 UI 设计师。擅长将复杂业务信息整理成清晰界面，
            并通过细致的视觉规范提升产品的可信度与效率。
          </p>

          <div className="resume-entry resume-entry--profile">
            <div>
              <span>RESUME</span>
              <strong>简历查看入口</strong>
            </div>
            <p>履历与完整简历将在下一阶段接入。</p>
            <span aria-hidden="true">↗</span>
          </div>

          <div className="intro-concept">
            <span>NOVENTURE / PORTFOLIO CONCEPT</span>
            <p>
              Noventure 是这份作品集的概念与主题：以创新为驱动力，以探索为方法。
              每一颗行星代表一段设计实践，也是一片等待被理解的新领域。
            </p>
          </div>
        </div>

        <aside className="intro-capabilities" aria-labelledby="capabilities-title">
          <header>
            <span>01 / CAPABILITIES</span>
            <h2 id="capabilities-title">个人能力</h2>
            <p>从需求理解到界面落地，保持信息层级、交互路径、视觉语言与工程实现之间的连续性。</p>
          </header>

          <div className="capability-grid">
            {capabilities.map((capability) => (
              <article className="capability-card" key={capability.index}>
                <span>{capability.index}</span>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
              </article>
            ))}
          </div>

          <section className="software-stack" aria-labelledby="software-stack-title">
            <header>
              <span>TOOLS / SOFTWARE</span>
              <h3 id="software-stack-title">掌握软件</h3>
            </header>
            <div className="software-stack__items">
              {softwareTools.map((tool) => (
                <article className="software-tool" key={tool.id}>
                  <span className="software-tool__icon-frame" aria-hidden="true">
                    <img
                      className={`software-tool__icon software-tool__icon--${tool.id}`}
                      src={tool.iconPath}
                      alt=""
                    />
                  </span>
                  <span className="software-tool__copy">
                    <strong>{tool.name}</strong>
                    <small>{tool.description}</small>
                  </span>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <div className="intro-page__bottom-glow" aria-hidden="true" />
      <button className="intro-page__enter" type="button" onClick={onEnter} aria-label="进入 Noventure 恒星系">
        <span>启航</span>
        <ArrowDown aria-hidden="true" />
      </button>
    </section>
  );
}

interface StellarSystemPageProps {
  initialFocusId: string | null;
  onOpenDetail: (planet: PlanetData) => void;
  onReturnIntro: () => void;
  showInteractionGuide: boolean;
  onDismissInteractionGuide: () => void;
}

function StellarSystemPage({
  initialFocusId,
  onOpenDetail,
  onReturnIntro,
  showInteractionGuide,
  onDismissInteractionGuide,
}: StellarSystemPageProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const experienceRef = useRef<NoventureExperience | null>(null);
  const [phase, setPhase] = useState<ExperiencePhase>('overview');
  const [focusedPlanet, setFocusedPlanet] = useState<PlanetData | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [guideTargets, setGuideTargets] = useState<PlanetScreenGuide[]>([]);

  useEffect(() => {
    if (!sceneRef.current) return;
    const experience = new NoventureExperience(sceneRef.current);
    experienceRef.current = experience;
    experience.setInteractionGuideActive(showInteractionGuide);
    const unsubscribe = experience.subscribe((snapshot) => {
      setPhase(snapshot.phase);
      setFocusedPlanet(snapshot.focusedPlanet);
      setElapsed(snapshot.elapsedSeconds);
    });
    const focusFrame = initialFocusId
      ? window.requestAnimationFrame(() => experience.focusPlanetById(initialFocusId))
      : 0;
    return () => {
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
      unsubscribe();
      experience.dispose();
      experienceRef.current = null;
    };
  }, [initialFocusId]);

  useEffect(() => {
    const experience = experienceRef.current;
    if (!experience) return;
    experience.setInteractionGuideActive(showInteractionGuide);
    if (!showInteractionGuide) {
      setGuideTargets([]);
      return;
    }

    let frame = window.requestAnimationFrame(() => {
      setGuideTargets(experience.getPlanetScreenGuides());
    });
    const updateTargets = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setGuideTargets(experience.getPlanetScreenGuides());
      });
    };
    window.addEventListener('resize', updateTargets);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateTargets);
    };
  }, [showInteractionGuide]);

  const hudVisible = phase === 'overview' || phase === 'returning';
  const panelVisible = Boolean((phase === 'focusing' || phase === 'focused') && focusedPlanet);

  return (
    <section
      className={`system-page app app--${phase} ${showInteractionGuide ? 'system-page--guide' : ''}`}
      id="system"
      aria-label="Noventure 恒星系"
    >
      <div className="scene" ref={sceneRef} />
      <div className="film-overlay" aria-hidden="true" />

      <div className={`system-page__return-zone ${hudVisible ? 'system-page__return-zone--active' : ''}`}>
        <button className="system-page__return" type="button" onClick={onReturnIntro} aria-label="返回作者介绍页">
          <ArrowUp aria-hidden="true" />
          <span>BACK TO INTRO</span>
        </button>
      </div>

      <header className={`top-hud ${hudVisible ? 'top-hud--visible' : ''}`}>
        <div className="top-hud__brand">
          <span className="top-hud__eyebrow">PORTFOLIO SYSTEM</span>
          <strong>NOVENTURE</strong>
        </div>
        <div className="top-hud__divider" aria-hidden="true" />
        <div className="top-hud__meta">
          <span>Yann Yang</span>
          <span>UI Designer</span>
        </div>
        <div className="top-hud__clock">
          <span>NOV TIME</span>
          <time>{formatNovTime(elapsed)}</time>
        </div>
      </header>

      <FocusReturnInteraction
        visible={panelVisible}
        onReturn={() => experienceRef.current?.returnToOverview()}
      />

      <SystemInteractionGuide
        visible={showInteractionGuide}
        targets={guideTargets}
        onDismiss={onDismissInteractionGuide}
      />

      <div className={`focus-panel ${panelVisible ? 'focus-panel--visible' : ''}`} onPointerUp={(event) => event.stopPropagation()}>
        {focusedPlanet && (
          <>
            <div className="focus-panel__index">
              <span>{focusedPlanet.name}</span>
              <small>{focusedPlanet.conceptLabel}</small>
            </div>
            <h1>项目名称</h1>
            <p className="focus-panel__kind">项目时间</p>
            <div className="focus-panel__rule" aria-hidden="true" />
            <p className="focus-panel__placeholder">
              每颗行星对应一项设计实践。当前案例页以纵向文档骨架展示，项目背景、过程与成果将在后续补充。
            </p>
            <div className="focus-panel__actions">
              <button className="focus-panel__detail" type="button" onClick={() => onOpenDetail(focusedPlanet)}>
                <span>查看项目</span>
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>

      <nav className="planet-access" aria-label="选择行星">
        {planets.map((planet) => (
          <button key={planet.id} type="button" onClick={() => experienceRef.current?.focusPlanetById(planet.id)} disabled={phase !== 'overview'}>
            聚焦 {planet.name}
          </button>
        ))}
      </nav>

      <div className={`interaction-hint ${phase === 'overview' ? 'interaction-hint--visible' : ''}`}>
        拖拽探索 · 点击行星查看项目 · 小范围缩放
      </div>
    </section>
  );
}

function SkeletonLine({ width = '100%' }: { width?: string }) {
  return <span className="document-skeleton__line" style={{ width }} aria-hidden="true" />;
}

function PlanetDocumentPage({ planet, page, title }: { planet: PlanetData; page: number; title: string }) {
  return (
    <article className="document-page" style={{ '--planet-accent': planet.palette[1] } as React.CSSProperties}>
      <header className="document-page__header">
        <div>
          <span>NOVENTURE PROJECT ARCHIVE</span>
          <strong>{planet.catalogName.toUpperCase()}</strong>
        </div>
        <span>{String(page).padStart(2, '0')}</span>
      </header>

      <div className="document-page__title">
        <span>{planet.name.toUpperCase()} · {planet.conceptLabel} / CASE STUDY</span>
        <h2>{title}</h2>
      </div>

      {page === 1 ? (
        <div className="document-cover-placeholder">
          <div className="document-cover-placeholder__planet" aria-hidden="true" />
          <div className="document-cover-placeholder__caption">
            <SkeletonLine width="74%" />
            <SkeletonLine width="48%" />
          </div>
        </div>
      ) : (
        <div className="document-grid">
          <section className="document-skeleton">
            <SkeletonLine width="38%" />
            <SkeletonLine />
            <SkeletonLine width="92%" />
            <SkeletonLine width="84%" />
            <SkeletonLine width="61%" />
            <div className="document-skeleton__chart" aria-hidden="true">
              <i /><i /><i /><i /><i /><i />
            </div>
          </section>
          <section className="document-skeleton">
            <div className="document-skeleton__image" aria-hidden="true" />
            <SkeletonLine width="72%" />
            <SkeletonLine />
            <SkeletonLine width="78%" />
          </section>
        </div>
      )}

      <footer className="document-page__footer">
        <span>PROJECT CONTENT PLACEHOLDER</span>
        <span>NOVENTURE · 2026</span>
      </footer>
    </article>
  );
}

function PlanetDetailPage({ planet, onBack }: { planet: PlanetData; onBack: () => void }) {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${planet.name} — Noventure Archive`;
    return () => { document.title = 'Noventure'; };
  }, [planet]);

  const pageTitles = ['项目概览', '设计过程', '方案与成果'];

  return (
    <main className="document-viewer">
      <header className="document-toolbar">
        <button type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          返回星系
        </button>
        <div>
          <span>{planet.catalogName.toUpperCase()}</span>
          <strong>{planet.name}<small>{planet.conceptLabel}</small></strong>
        </div>
        <span className="document-toolbar__status">CASE STUDY · DRAFT</span>
      </header>

      <div className="document-stack" aria-label={`${planet.name} 项目案例占位文档`}>
        {pageTitles.map((title, index) => (
          <PlanetDocumentPage key={title} planet={planet} page={index + 1} title={title} />
        ))}
      </div>
    </main>
  );
}

function App() {
  const [route, setRoute] = useState<SiteRoute>(() => getRoute());
  const [resumePlanetId, setResumePlanetId] = useState<string | null>(() => window.history.state?.planetId ?? null);
  const [hasSeenSystemGuide, setHasSeenSystemGuide] = useState(hasSeenSystemInteractionGuide);
  const [warpDestination, setWarpDestination] = useState<WarpDestination | null>(null);
  const [activeSection, setActiveSection] = useState<'intro' | 'system'>(() => (
    window.history.state?.planetId ? 'system' : 'intro'
  ));

  useEffect(() => {
    window.history.scrollRestoration = 'manual';
    const handlePopState = () => {
      const nextRoute = getRoute();
      if (nextRoute.kind === 'site') {
        const previousPlanet = window.history.state?.planetId ?? resumePlanetId;
        if (previousPlanet) setResumePlanetId(previousPlanet);
      }
      setRoute(nextRoute);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [resumePlanetId]);

  useEffect(() => {
    if (route.kind !== 'site' || !resumePlanetId) return;
    setActiveSection('system');
  }, [route, resumePlanetId]);

  const openDetail = (planet: PlanetData) => {
    setResumePlanetId(planet.id);
    window.history.pushState(
      { fromNoventure: true, planetId: planet.id },
      '',
      withBase(`planets/${planet.id}`),
    );
    setRoute({ kind: 'planet', planet });
  };

  const returnToSystem = () => {
    if (window.history.state?.fromNoventure) {
      window.history.back();
      return;
    }
    window.history.replaceState(
      { planetId: route.kind === 'planet' ? route.planet.id : null },
      '',
      withBase(),
    );
    setRoute({ kind: 'site' });
  };

  if (route.kind === 'planet') return <PlanetDetailPage planet={route.planet} onBack={returnToSystem} />;

  return (
    <main
      className={`site-shell site-shell--view-${activeSection} ${warpDestination ? `site-shell--warping site-shell--warping-to-${warpDestination}` : ''}`}
    >
      <div
        className="site-view site-view--intro"
        aria-hidden={activeSection !== 'intro'}
        inert={activeSection !== 'intro'}
      >
        <IntroPage
          onEnter={() => {
            if (!warpDestination) setWarpDestination('system');
          }}
          onOpenDetail={openDetail}
        />
      </div>
      <div
        className="site-view site-view--system"
        aria-hidden={activeSection !== 'system'}
        inert={activeSection !== 'system'}
      >
        <StellarSystemPage
          initialFocusId={resumePlanetId}
          onOpenDetail={openDetail}
          onReturnIntro={() => {
            if (!warpDestination) setWarpDestination('intro');
          }}
          showInteractionGuide={!hasSeenSystemGuide && !resumePlanetId}
          onDismissInteractionGuide={() => {
            rememberSystemInteractionGuide();
            setHasSeenSystemGuide(true);
          }}
        />
      </div>
      <WarpTransition
        active={Boolean(warpDestination)}
        direction={warpDestination === 'intro' ? 'reverse' : 'forward'}
        onTravel={() => {
          if (warpDestination === 'system') {
            setActiveSection('system');
          } else if (warpDestination === 'intro') {
            setActiveSection('intro');
          }
        }}
        onComplete={() => setWarpDestination(null)}
      />
    </main>
  );
}

export default App;
