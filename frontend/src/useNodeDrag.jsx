import { useCallback, useRef } from 'react';

/**
 * Returns an onPointerDown handler that, when attached to a node's header,
 * lets the user drag the node around by updating its position via `onMove`.
 *
 * @param {(updater: (prev: {x:number,y:number}) => {x:number,y:number}) => void} onMove
 */
export function useNodeDrag(onMove) {
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      dragging.current = true;
      e.preventDefault();

      const onPointerMove = (ev) => {
        if (!dragging.current) return;
        onMove((prev) => ({
          x: Math.max(0, prev.x + ev.movementX),
          y: Math.max(0, prev.y + ev.movementY),
        }));
      };
      const onPointerUp = () => {
        dragging.current = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [onMove]
  );

  return onPointerDown;
}
