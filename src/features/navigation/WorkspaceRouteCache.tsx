import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { type Location, useLocation } from "react-router-dom";

type WorkspaceRouteCacheProps = {
  children: (location: Location) => ReactNode;
  shouldCache: (location: Location) => boolean;
};

type CachedRoute = {
  key: string;
  location: Location;
  container: HTMLDivElement;
};

const WorkspacePageActivityContext = createContext(true);

export function useWorkspacePageActive(): boolean {
  return useContext(WorkspacePageActivityContext);
}

export function getWorkspaceRouteCacheKey(
  location: Pick<Location, "pathname" | "search">,
): string {
  return `${location.pathname}${location.search}`;
}

export function WorkspaceRouteCache({
  children,
  shouldCache,
}: WorkspaceRouteCacheProps): JSX.Element {
  const location = useLocation();
  const currentKey = getWorkspaceRouteCacheKey(location);
  const currentIsCacheable = shouldCache(location);
  const hostRef = useRef<HTMLDivElement>(null);
  const [cachedRoutes, setCachedRoutes] = useState<CachedRoute[]>(() =>
    currentIsCacheable ? [createCachedRoute(currentKey, location)] : [],
  );
  const currentCandidate = useMemo(
    () => createCachedRoute(currentKey, location),
    [currentKey],
  );

  useEffect(() => {
    if (!currentIsCacheable) return;
    setCachedRoutes((current) => {
      const index = current.findIndex((route) => route.key === currentKey);
      if (index < 0) return [...current, currentCandidate];
      if (current[index].location === location) return current;
      return current.map((route, routeIndex) =>
        routeIndex === index ? { ...route, location } : route,
      );
    });
  }, [currentCandidate, currentIsCacheable, currentKey, location]);

  const visibleRoutes = useMemo(() => {
    if (!currentIsCacheable) return cachedRoutes;
    const index = cachedRoutes.findIndex((route) => route.key === currentKey);
    if (index < 0) return [...cachedRoutes, currentCandidate];
    return cachedRoutes.map((route, routeIndex) =>
      routeIndex === index ? { ...route, location } : route,
    );
  }, [
    cachedRoutes,
    currentCandidate,
    currentIsCacheable,
    currentKey,
    location,
  ]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    for (const route of visibleRoutes) {
      if (route.container.parentElement !== host) {
        host.appendChild(route.container);
      }
      route.container.hidden = !(
        currentIsCacheable && route.key === currentKey
      );
    }
  }, [currentIsCacheable, currentKey, visibleRoutes]);

  return (
    <div className="workspace-route-cache">
      <div className="workspace-route-cache-host" ref={hostRef} />
      {visibleRoutes.map((route) => {
        const active = currentIsCacheable && route.key === currentKey;
        return createPortal(
          <section className="workspace-route-panel" data-route-key={route.key}>
            <WorkspacePageActivityContext.Provider value={active}>
              {children(route.location)}
            </WorkspacePageActivityContext.Provider>
          </section>,
          route.container,
          route.key,
        );
      })}
      {!currentIsCacheable ? (
        <section className="workspace-route-panel">
          <WorkspacePageActivityContext.Provider value>
            {children(location)}
          </WorkspacePageActivityContext.Provider>
        </section>
      ) : null}
    </div>
  );
}

function createCachedRoute(key: string, location: Location): CachedRoute {
  const container = document.createElement("div");
  container.className = "workspace-route-container";
  return { key, location, container };
}
