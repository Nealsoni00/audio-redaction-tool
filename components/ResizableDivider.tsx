'use client';

import { useCallback, useRef } from 'react';

interface ResizableDividerProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  className?: string;
}

export function ResizableDivider({ direction, onResize, className = '' }: ResizableDividerProps) {
  const isDraggingRef = useRef(false);
  const startPosRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startPosRef.current = direction === 'horizontal' ? e.clientY : e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const currentPos = direction === 'horizontal' ? moveEvent.clientY : moveEvent.clientX;
      const delta = currentPos - startPosRef.current;

      if (Math.abs(delta) > 0) {
        onResize(delta);
        startPosRef.current = currentPos;
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = direction === 'horizontal' ? 'ns-resize' : 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [direction, onResize]);

  return (
    <div
      className={`${className} ${
        direction === 'horizontal'
          ? 'h-1 cursor-ns-resize hover:bg-primary/20 active:bg-primary/40 transition-colors'
          : 'w-1 cursor-ew-resize hover:bg-primary/20 active:bg-primary/40 transition-colors'
      } bg-border flex-shrink-0 relative group`}
      onMouseDown={handleMouseDown}
    >
      {/* Visual indicator on hover */}
      <div
        className={`absolute ${
          direction === 'horizontal'
            ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-1 group-hover:h-1.5'
            : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-1 group-hover:w-1.5'
        } bg-primary/60 rounded-full opacity-0 group-hover:opacity-100 transition-all pointer-events-none`}
      />
    </div>
  );
}
