'use client';

import { useCallback, useEffect, useRef } from 'react';

interface ResizableDividerProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  className?: string;
}

export function ResizableDivider({ direction, onResize, className = '' }: ResizableDividerProps) {
  const isDraggingRef = useRef(false);
  const startPosRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const moveHandlerRef = useRef<((event: PointerEvent) => void) | undefined>(undefined);
  const upHandlerRef = useRef<((event: PointerEvent) => void) | undefined>(undefined);

  const cleanupPointerListeners = useCallback(() => {
    if (moveHandlerRef.current) {
      document.removeEventListener('pointermove', moveHandlerRef.current);
      moveHandlerRef.current = undefined;
    }
    if (upHandlerRef.current) {
      document.removeEventListener('pointerup', upHandlerRef.current);
      document.removeEventListener('pointercancel', upHandlerRef.current);
      upHandlerRef.current = undefined;
    }
    pointerIdRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    return () => {
      cleanupPointerListeners();
    };
  }, [cleanupPointerListeners]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    pointerIdRef.current = e.pointerId;
    startPosRef.current = direction === 'horizontal' ? e.clientY : e.clientX;

    const target = e.currentTarget;
    if (target.setPointerCapture) {
      target.setPointerCapture(e.pointerId);
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!isDraggingRef.current || moveEvent.pointerId !== pointerIdRef.current) {
        return;
      }

      const currentPos = direction === 'horizontal' ? moveEvent.clientY : moveEvent.clientX;
      const delta = currentPos - startPosRef.current;

      if (Math.abs(delta) > 0) {
        onResize(delta);
        startPosRef.current = currentPos;
      }
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerIdRef.current) {
        return;
      }
      isDraggingRef.current = false;
      if (target.releasePointerCapture) {
        try {
          target.releasePointerCapture(upEvent.pointerId);
        } catch {
          // Ignore if capture was already released
        }
      }
      cleanupPointerListeners();
    };

    moveHandlerRef.current = handlePointerMove;
    upHandlerRef.current = handlePointerUp;

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
    document.body.style.cursor = direction === 'horizontal' ? 'ns-resize' : 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [cleanupPointerListeners, direction, onResize]);

  return (
    <div
      className={`${className} ${
        direction === 'horizontal'
          ? 'h-1.5 cursor-ns-resize hover:bg-primary/30 active:bg-primary/50'
          : 'w-1.5 cursor-ew-resize hover:bg-primary/30 active:bg-primary/50'
      } bg-border flex-shrink-0 relative group transition-colors select-none`}
      onPointerDown={handlePointerDown}
      style={{
        touchAction: 'none',
        zIndex: 10,
        position: 'relative',
      }}
    >
      {/* Expanded hit area for easier interaction */}
      <div
        className={`absolute inset-0 ${
          direction === 'horizontal'
            ? '-top-1 -bottom-1'
            : '-left-1 -right-1'
        }`}
      />
      {/* Visual indicator on hover */}
      <div
        className={`absolute ${
          direction === 'horizontal'
            ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-1 group-hover:h-1.5'
            : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-1 group-hover:w-1.5'
        } bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-all pointer-events-none`}
      />
    </div>
  );
}
