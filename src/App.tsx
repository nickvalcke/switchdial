import { useEffect, useRef, useState } from "react";
import HoverWheel, {
  angleSegment,
  hitTestSegment,
  type Segment,
} from "./HoverWheel";
import Settings from "./Settings";

declare global {
  interface Window {
    wheelAPI?: {
      onOpened: (
        cb: (point: { x: number; y: number }) => void,
      ) => () => void;
      onCursor: (cb: (delta: { dx: number; dy: number }) => void) => () => void;
      onCommit: (cb: () => void) => () => void;
      hide: () => void;
      launch: (appName: string) => void;
      getIcon: (appName: string) => Promise<string | null>;
      getConfig: () => Promise<{ segments: Segment[] }>;
      setConfig: (config: { segments: Segment[] }) => void;
      onConfigChanged: (
        cb: (config: { segments: Segment[] }) => void,
      ) => () => void;
      listApps: () => Promise<{ name: string }[]>;
    };
  }
}

type Origin = { x: number; y: number };

const DEFAULT_SEGMENTS: Segment[] = Array.from({ length: 6 }, () => ({
  app: null,
}));

function isSettingsRoute() {
  return typeof window !== "undefined" && window.location.hash === "#settings";
}

export default function App() {
  if (isSettingsRoute()) return <Settings />;
  return <Wheel />;
}

function Wheel() {
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [rimSegment, setRimSegment] = useState<number | null>(null);
  const [segments, setSegments] = useState<Segment[]>(DEFAULT_SEGMENTS);
  const [iconUrls, setIconUrls] = useState<(string | null)[]>(() =>
    Array(DEFAULT_SEGMENTS.length).fill(null),
  );
  const hoveredRef = useRef<number | null>(null);
  hoveredRef.current = hovered;
  const segmentsRef = useRef<Segment[]>(segments);
  segmentsRef.current = segments;

  const isElectron = typeof window !== "undefined" && !!window.wheelAPI;

  useEffect(() => {
    if (isElectron) document.body.classList.add("electron");
    return () => document.body.classList.remove("electron");
  }, [isElectron]);

  // Load config and react to changes; refetch icons whenever segments change.
  useEffect(() => {
    if (!window.wheelAPI) return;
    window.wheelAPI.getConfig().then((c) => setSegments(c.segments));
    return window.wheelAPI.onConfigChanged((c) => setSegments(c.segments));
  }, []);

  useEffect(() => {
    if (!window.wheelAPI?.getIcon) return;
    let cancelled = false;
    Promise.all(
      segments.map((s) =>
        s.app ? window.wheelAPI!.getIcon(s.app).catch(() => null) : null,
      ),
    ).then((urls) => {
      if (!cancelled) setIconUrls(urls);
    });
    return () => {
      cancelled = true;
    };
  }, [segments]);

  // Electron: gesture is driven entirely by IPC from the main process.
  // Listeners are registered once; current `segments` are read via ref so
  // we don't tear down + re-add listeners on every config change.
  useEffect(() => {
    if (!window.wheelAPI) return;
    const offOpen = window.wheelAPI.onOpened((point) => {
      setOrigin(point);
      setHovered(null);
      setRimSegment(null);
    });
    const offCursor = window.wheelAPI.onCursor(({ dx, dy }) => {
      setHovered(hitTestSegment(dx, dy));
      setRimSegment(angleSegment(dx, dy));
    });
    const offCommit = window.wheelAPI.onCommit(() => {
      const h = hoveredRef.current;
      const target = h !== null ? segmentsRef.current[h].app : null;
      if (target) window.wheelAPI?.launch(target);
      else window.wheelAPI?.hide();
      setOrigin(null);
      setHovered(null);
      setRimSegment(null);
    });
    return () => {
      offOpen();
      offCursor();
      offCommit();
    };
  }, []);

  // Browser fallback: native mouse drives the wheel — wheel always centered.
  useEffect(() => {
    if (window.wheelAPI) return;
    setOrigin({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const center = () => ({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    function onMove(e: MouseEvent) {
      const c = center();
      setHovered(hitTestSegment(e.clientX - c.x, e.clientY - c.y));
      setRimSegment(angleSegment(e.clientX - c.x, e.clientY - c.y));
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div className="stage">
      {origin && (
        <HoverWheel
          x={origin.x}
          y={origin.y}
          hovered={hovered}
          rimSegment={rimSegment}
          segments={segments}
          iconUrls={iconUrls}
        />
      )}
    </div>
  );
}
