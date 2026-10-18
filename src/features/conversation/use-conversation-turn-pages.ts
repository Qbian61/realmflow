import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConversationTurnView } from "../../../domain/conversation-turn";

const CONVERSATION_TURN_PAGE_SIZE = 15;

type TurnPageState = {
  sessionId: string;
  turns: ConversationTurnView[];
  nextCursor?: string;
  totalCount: number;
  loading: boolean;
};

export function useConversationTurnPages({
  sessionId,
  liveTurns,
}: {
  sessionId: string;
  liveTurns: readonly ConversationTurnView[];
}): {
  turns: ConversationTurnView[];
  hasEarlierTurns: boolean;
  loadingEarlierTurns: boolean;
  loadEarlierTurns: () => Promise<void>;
} {
  const listTurns = window.realmflow?.business?.listConversationTurns;
  const [page, setPage] = useState<TurnPageState>();
  const requestSequenceRef = useRef(0);
  const loadingCursorRef = useRef<string>();
  const liveTurnsRef = useRef(liveTurns);
  liveTurnsRef.current = liveTurns;
  const fallbackTurns = useMemo(
    () => liveTurns.slice(-CONVERSATION_TURN_PAGE_SIZE),
    [liveTurns],
  );

  useEffect(() => {
    const requestSequence = ++requestSequenceRef.current;
    loadingCursorRef.current = undefined;
    if (!sessionId || !listTurns) {
      setPage(undefined);
      return;
    }
    const initialTurns = liveTurnsRef.current.slice(
      -CONVERSATION_TURN_PAGE_SIZE,
    );
    setPage({
      sessionId,
      turns: initialTurns,
      totalCount: liveTurnsRef.current.length,
      loading: true,
    });
    void listTurns({
      sessionId,
      limit: CONVERSATION_TURN_PAGE_SIZE,
    })
      .then((result) => {
        if (requestSequence !== requestSequenceRef.current) return;
        setPage({
          sessionId,
          turns: result.turns,
          totalCount: result.totalCount,
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
          loading: false,
        });
      })
      .catch(() => {
        if (requestSequence !== requestSequenceRef.current) return;
        setPage({
          sessionId,
          turns: liveTurnsRef.current.slice(-CONVERSATION_TURN_PAGE_SIZE),
          totalCount: liveTurnsRef.current.length,
          loading: false,
        });
      });
    return () => {
      requestSequenceRef.current += 1;
      loadingCursorRef.current = undefined;
    };
  }, [listTurns, sessionId]);

  const activePage = page?.sessionId === sessionId ? page : undefined;
  const turns = useMemo(() => {
    if (!listTurns) return [...liveTurns];
    const base = activePage?.turns ?? fallbackTurns;
    const oldestIndex = base[0]?.index;
    if (oldestIndex === undefined) return base;
    const merged = new Map(base.map((turn) => [turn.id, turn]));
    for (const turn of liveTurns) {
      if (turn.index >= oldestIndex) merged.set(turn.id, turn);
    }
    return [...merged.values()].sort(
      (left, right) => left.index - right.index,
    );
  }, [activePage?.turns, fallbackTurns, listTurns, liveTurns]);

  const loadEarlierTurns = useCallback(async (): Promise<void> => {
    const cursor = activePage?.nextCursor;
    if (!listTurns || !cursor || activePage.loading) return;
    if (loadingCursorRef.current === cursor) return;
    loadingCursorRef.current = cursor;
    const requestSequence = requestSequenceRef.current;
    setPage((current) =>
      current?.sessionId === sessionId
        ? { ...current, loading: true }
        : current,
    );
    try {
      const result = await listTurns({
        sessionId,
        cursor,
        limit: CONVERSATION_TURN_PAGE_SIZE,
      });
      if (requestSequence !== requestSequenceRef.current) return;
      setPage((current) => {
        if (current?.sessionId !== sessionId) return current;
        const merged = new Map(
          [...result.turns, ...current.turns].map((turn) => [turn.id, turn]),
        );
        return {
          sessionId,
          turns: [...merged.values()].sort(
            (left, right) => left.index - right.index,
          ),
          totalCount: result.totalCount,
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
          loading: false,
        };
      });
    } finally {
      if (loadingCursorRef.current === cursor) {
        loadingCursorRef.current = undefined;
      }
      if (requestSequence === requestSequenceRef.current) {
        setPage((current) =>
          current?.sessionId === sessionId
            ? { ...current, loading: false }
            : current,
        );
      }
    }
  }, [activePage, listTurns, sessionId]);

  return {
    turns,
    hasEarlierTurns: Boolean(activePage?.nextCursor),
    loadingEarlierTurns: Boolean(activePage?.loading),
    loadEarlierTurns,
  };
}
