import { useCallback, useRef, useState } from "react";

export type AssistantDisclosureState = {
  isOpen: (key: string, defaultOpen: boolean) => boolean;
  setOpen: (key: string, open: boolean) => void;
  toggle: (key: string, defaultOpen: boolean) => void;
  handleKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    key: string,
    defaultOpen: boolean,
  ) => void;
  saveScroll: (key: string, scrollTop: number) => void;
  restoreScroll: (key: string, element: HTMLElement | null) => void;
};

export function useAssistantDisclosureState(): AssistantDisclosureState {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  const scrollPositions = useRef(new Map<string, number>());
  const isOpen = useCallback(
    (key: string, defaultOpen: boolean) => overrides.get(key) ?? defaultOpen,
    [overrides],
  );
  const setOpen = useCallback((key: string, open: boolean): void => {
    setOverrides((current) => {
      const next = new Map(current);
      next.set(key, open);
      return next;
    });
  }, []);
  const toggle = useCallback(
    (key: string, defaultOpen: boolean): void => {
      setOpen(key, !isOpen(key, defaultOpen));
    },
    [isOpen, setOpen],
  );
  const handleKeyDown = useCallback(
    (
      event: React.KeyboardEvent<HTMLButtonElement>,
      key: string,
      defaultOpen: boolean,
    ): void => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setOpen(key, true);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setOpen(key, false);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle(key, defaultOpen);
      }
    },
    [setOpen, toggle],
  );
  const saveScroll = useCallback((key: string, scrollTop: number): void => {
    scrollPositions.current.set(key, scrollTop);
  }, []);
  const restoreScroll = useCallback(
    (key: string, element: HTMLElement | null): void => {
      if (!element) return;
      element.scrollTop = scrollPositions.current.get(key) ?? 0;
    },
    [],
  );

  return {
    isOpen,
    setOpen,
    toggle,
    handleKeyDown,
    saveScroll,
    restoreScroll,
  };
}
