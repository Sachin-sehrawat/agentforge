import { useCallback, useRef } from 'react';

/**
 * Returns an onPointerDown handler that lets the user drag a node by its header.
 *
 * @param {(updater: (prev: {x:number,y:number}) => {x:number,y:number}) => void} onMove
 * @param {number} zoom - current canvas zoom level; pointer movement is divided by this
 * @param {() => void} [onDragEnd] - called once when the pointer is released
 */
export function useNodeDrag(onMove, zoom = 1, onDragEnd) {
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      dragging.current = true;
      e.preventDefault();

      const onPointerMove = (ev) => {
        if (!dragging.current) return;
        onMove((prev) => ({
          x: Math.max(0, prev.x + ev.movementX / zoom),
          y: Math.max(0, prev.y + ev.movementY / zoom),
        }));
      };
      const onPointerUp = () => {
        dragging.current = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        onDragEnd?.();
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [onMove, zoom, onDragEnd]
  );

  return onPointerDown;
}
