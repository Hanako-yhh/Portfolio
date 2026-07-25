import type { PlanetScreenGuide } from '../scene/NoventureExperience';

interface SystemInteractionGuideProps {
  visible: boolean;
  targets: PlanetScreenGuide[];
  onDismiss: () => void;
}

export function SystemInteractionGuide({ visible, targets, onDismiss }: SystemInteractionGuideProps) {
  if (!visible) return null;

  return (
    <button
      className="system-interaction-guide"
      type="button"
      onClick={onDismiss}
      aria-label="关闭行星交互提示并启动恒星系"
    >
      <span className="system-interaction-guide__status">
        <span>INTERACTION TARGETS IDENTIFIED</span>
        <strong>细线框选的行星可以点击交互</strong>
        <small>点击任意位置启动恒星系</small>
      </span>

      {targets.filter((target) => target.visible).map((target) => (
        <span
          className={`system-interaction-guide__target system-interaction-guide__target--${target.labelSide}`}
          key={target.id}
          style={{
            left: target.x,
            top: target.y,
            width: target.width,
            height: target.height,
          }}
        >
          <span className="system-interaction-guide__label">
            <strong>项目名称</strong>
            <span className="system-interaction-guide__time">项目时间</span>
            <span className="system-interaction-guide__planet">
              {target.name}
              <em>{target.conceptLabel}</em>
            </span>
          </span>
        </span>
      ))}
    </button>
  );
}
