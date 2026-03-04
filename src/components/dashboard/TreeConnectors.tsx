import React from 'react';

interface TreeConnectorsProps {
  depth: number;
  step?: number;
  ancestorContinuations: boolean[];
  hasNextSiblingAtCurrentLevel: boolean;
  hasParentConnectorAtCurrentLevel?: boolean;
  lineClassName?: string;
  bleedTop?: number;
  bleedBottom?: number;
}

export function TreeConnectors({
  depth,
  step = 24,
  ancestorContinuations,
  hasNextSiblingAtCurrentLevel,
  hasParentConnectorAtCurrentLevel = true,
  lineClassName = 'stroke-neutral-300/75 group-hover:stroke-neutral-400/85',
  bleedTop = 8,
  bleedBottom = 0,
}: TreeConnectorsProps) {
  if (depth <= 0) return null;

  const currentLevelX = (depth - 1) * step + Math.round(step / 2);
  const strokeWidth = 2;
  const elbowArm = Math.max(6, step - 6);
  const svgWidth = currentLevelX + elbowArm + strokeWidth + 2;
  const yMid = '50%';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ top: -bleedTop, bottom: -bleedBottom }}
    >
      <svg
        className="absolute left-0 top-0 h-full overflow-visible"
        style={{ width: svgWidth }}
      >
        {(() => {
          let nearestActiveLevel = -1;
          for (let i = ancestorContinuations.length - 1; i >= 0; i -= 1) {
            if (ancestorContinuations[i]) {
              nearestActiveLevel = i;
              break;
            }
          }
          if (nearestActiveLevel < 0) return null;
          const x = nearestActiveLevel * step + Math.round(step / 2);
          return (
            <line
              x1={x}
              y1="0%"
              x2={x}
              y2="100%"
              className={lineClassName}
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
              shapeRendering="geometricPrecision"
            />
          );
        })()}

        {hasParentConnectorAtCurrentLevel && (
          <line
            x1={currentLevelX}
            y1="0%"
            x2={currentLevelX}
            y2={yMid}
            className={lineClassName}
            strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke"
            shapeRendering="geometricPrecision"
          />
        )}

        {hasNextSiblingAtCurrentLevel && (
          <line
            x1={currentLevelX}
            y1={yMid}
            x2={currentLevelX}
            y2="100%"
            className={lineClassName}
            strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke"
            shapeRendering="geometricPrecision"
          />
        )}

        <line
          x1={currentLevelX}
          y1={yMid}
          x2={currentLevelX + elbowArm}
          y2={yMid}
          className={lineClassName}
          strokeWidth={strokeWidth}
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
        />
      </svg>
    </div>
  );
}
