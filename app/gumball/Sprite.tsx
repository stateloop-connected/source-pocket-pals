import { useId } from 'react';
import type { Creature } from './collection';
import crops from './creature-crops.json';
export function Sprite({
  creature,
  shiny = false,
  className = '',
}: {
  creature: Creature;
  shiny?: boolean;
  className?: string;
}) {
  const c = crops.sprites[creature.index],
    id = `sprite-${useId().replace(/:/g, '')}`;
  return (
    <span
      className={`sprite ${shiny ? 'sprite-shiny' : ''} ${className}`}
      role="img"
      aria-label={`${shiny ? 'Shiny ' : ''}${creature.name}`}
    >
      <svg
        viewBox={`${c.x} ${c.y} ${c.width} ${c.height}`}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <clipPath id={id}>
            <rect x={c.x} y={c.y} width={c.width} height={c.height} />
          </clipPath>
        </defs>
        <image
          href="./pixel/pals.png"
          width="1254"
          height="1254"
          clipPath={`url(#${id})`}
        />
      </svg>
    </span>
  );
}
