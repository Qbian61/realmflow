import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBlocker } from "react-router-dom";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  InlineAlert,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

type UnsavedEditor = {
  id: string;
  isDirty: () => boolean;
  save: () => Promise<boolean>;
  discard: () => void;
};

type PendingContinuation = {
  action: () => void;
  editorIds?: string[];
  onStay?: () => void;
  editors?: UnsavedEditor[];
};

type UnsavedChangesContextValue = {
  register: (editor: UnsavedEditor) => () => void;
  notify: () => void;
  request: (
    action: () => void,
    editorIds?: string[],
    onStay?: () => void,
    editors?: UnsavedEditor[],
  ) => void;
};

const UnsavedChangesContext =
  createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const { t } = useLocalization();
  const editorsRef = useRef(new Map<string, UnsavedEditor>());
  const [, setRegistryVersion] = useState(0);
  const [pending, setPending] = useState<PendingContinuation>();
  const pendingRef = useRef<PendingContinuation>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const notify = useCallback(() => {
    setRegistryVersion((current) => current + 1);
  }, []);
  const register = useCallback(
    (editor: UnsavedEditor) => {
      editorsRef.current.set(editor.id, editor);
      notify();
      return () => {
        if (editorsRef.current.get(editor.id) === editor) {
          editorsRef.current.delete(editor.id);
          notify();
        }
      };
    },
    [notify],
  );
  const dirtyEditors = useCallback((editorIds?: string[]) => {
    const allowed = editorIds ? new Set(editorIds) : undefined;
    return [...editorsRef.current.values()].filter(
      (editor) => (!allowed || allowed.has(editor.id)) && editor.isDirty(),
    );
  }, []);
  const hasDirtyEditors = dirtyEditors().length > 0;
  const blocker = useBlocker(hasDirtyEditors);
  pendingRef.current = pending;

  const request = useCallback(
    (
      action: () => void,
      editorIds?: string[],
      onStay?: () => void,
      editors?: UnsavedEditor[],
    ) => {
      const candidates =
        editors?.filter((editor) => editor.isDirty()) ??
        dirtyEditors(editorIds);
      if (candidates.length === 0) {
        action();
        return;
      }
      setError("");
      setPending({ action, editorIds, onStay, editors });
    },
    [dirtyEditors],
  );

  useEffect(() => {
    const preventUnsavedExit = (event: BeforeUnloadEvent): void => {
      if (dirtyEditors().length === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnsavedExit);
    return () =>
      window.removeEventListener("beforeunload", preventUnsavedExit);
  }, [dirtyEditors]);

  useEffect(() => {
    const lifecycle = window.realmflow?.appLifecycle;
    if (!lifecycle) return;
    return lifecycle.onCloseRequested(() => {
      if (pendingRef.current) {
        void lifecycle.respondToCloseRequest(false);
        return;
      }
      if (dirtyEditors().length === 0) {
        void lifecycle.respondToCloseRequest(true);
        return;
      }
      setError("");
      setPending({
        action: () => {
          void lifecycle.respondToCloseRequest(true);
        },
        onStay: () => {
          void lifecycle.respondToCloseRequest(false);
        },
      });
    });
  }, [dirtyEditors]);

  const continuePending = (): void => {
    if (pending) {
      const action = pending.action;
      setPending(undefined);
      action();
      return;
    }
    if (blocker.state === "blocked") blocker.proceed();
  };

  const saveAndContinue = async (): Promise<void> => {
    setSaving(true);
    setError("");
    const editors =
      pending?.editors?.filter((editor) => editor.isDirty()) ??
      dirtyEditors(pending?.editorIds);
    try {
      for (const editor of editors) {
        if (!(await editor.save())) {
          setError(t("unsavedChanges.saveFailed"));
          return;
        }
      }
      continuePending();
    } catch {
      setError(t("unsavedChanges.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const discardAndContinue = (): void => {
    const editors =
      pending?.editors?.filter((editor) => editor.isDirty()) ??
      dirtyEditors(pending?.editorIds);
    for (const editor of editors) editor.discard();
    continuePending();
  };

  const stay = (): void => {
    pending?.onStay?.();
    setPending(undefined);
    setError("");
    if (blocker.state === "blocked") blocker.reset();
  };

  const context = useMemo<UnsavedChangesContextValue>(
    () => ({ register, notify, request }),
    [notify, register, request],
  );
  const open = Boolean(pending) || blocker.state === "blocked";

  return (
    <UnsavedChangesContext.Provider value={context}>
      {children}
      <Dialog
        open={open}
        size="compact"
        locked={saving}
        closeOnBackdrop={!saving}
        aria-label={t("unsavedChanges.title")}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !saving) stay();
        }}
      >
        <DialogHeader>
          <h2>{t("unsavedChanges.title")}</h2>
        </DialogHeader>
        <DialogBody>
          <p>{t("unsavedChanges.description")}</p>
          {error ? <InlineAlert tone="danger" title={error} /> : null}
        </DialogBody>
        <DialogFooter>
          <Button data-autofocus disabled={saving} onClick={stay}>
            {t("unsavedChanges.stay")}
          </Button>
          <Button disabled={saving} onClick={discardAndContinue}>
            {t("unsavedChanges.discard")}
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={saving}
            onClick={() => void saveAndContinue()}
          >
            {t("unsavedChanges.saveAndContinue")}
          </Button>
        </DialogFooter>
      </Dialog>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChangesGuard({
  id,
  dirty,
  save,
  discard,
  onStay,
}: {
  id: string;
  dirty: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
  onStay?: () => void;
}): {
  request: (action: () => void) => void;
  requestScoped: (
    action: () => void,
    editor: {
      dirty: boolean;
      save: () => Promise<boolean>;
      discard: () => void;
    },
  ) => void;
} {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error("UnsavedChangesProvider is required");
  }
  const editorRef = useRef({ dirty, save, discard, onStay });
  editorRef.current = { dirty, save, discard, onStay };

  useEffect(
    () =>
      context.register({
        id,
        isDirty: () => editorRef.current.dirty,
        save: () => editorRef.current.save(),
        discard: () => editorRef.current.discard(),
      }),
    [context, id],
  );
  useEffect(() => {
    context.notify();
  }, [context, dirty]);

  return useMemo(
    () => ({
      request: (action: () => void) =>
        context.request(action, [id], () => editorRef.current.onStay?.()),
      requestScoped: (
        action: () => void,
        editor: {
          dirty: boolean;
          save: () => Promise<boolean>;
          discard: () => void;
        },
      ) =>
        context.request(
          action,
          undefined,
          () => editorRef.current.onStay?.(),
          [
            {
              id: `${id}:scoped`,
              isDirty: () => editor.dirty,
              save: editor.save,
              discard: editor.discard,
            },
          ],
        ),
    }),
    [context, id],
  );
}

export function useUnsavedChangesRequest(): {
  request: (action: () => void) => void;
} {
  const context = useContext(UnsavedChangesContext);
  return useMemo(
    () => ({
      request: (action: () => void) => {
        if (context) context.request(action);
        else action();
      },
    }),
    [context],
  );
}
