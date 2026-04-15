"use client";

import { useEffect, useState } from "react";

interface KeyboardState {
  isKeyboardOpen: boolean;
  viewportHeight: number;
}

export function useKeyboardOpen(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({
    isKeyboardOpen: false,
    viewportHeight: 0,
  });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      setState({
        isKeyboardOpen: vv.height < window.innerHeight - 100,
        viewportHeight: vv.height,
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return state;
}
