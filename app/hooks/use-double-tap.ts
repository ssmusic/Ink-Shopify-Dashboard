import { useCallback, useRef } from 'react';

export function useDoubleTap<T>(callback: (arg: T) => void, threshold = 300) {
  const lastTap = useRef<number>(0);

  return useCallback((arg: T) => {
    const now = Date.now();
    if (now - lastTap.current < threshold) {
      callback(arg);
      lastTap.current = 0; // Reset
    } else {
      lastTap.current = now;
    }
  }, [callback, threshold]);
}
