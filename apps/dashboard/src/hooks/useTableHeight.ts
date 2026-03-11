import { useState, useEffect, useRef } from 'react';

/**
 * Measures a wrapper element and computes the available height for an antd Table body.
 * Subtracts table header (~39px) and pagination (~56px) from the wrapper's height.
 * Uses ResizeObserver to stay in sync with layout changes.
 */
export function useTableHeight(overhead = 95) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setHeight(Math.max(el.clientHeight - overhead, 100));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [overhead]);

  return { ref, height };
}
