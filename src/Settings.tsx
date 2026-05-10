import { Command } from "cmdk";
import { useEffect, useMemo, useRef, useState } from "react";
import HoverWheel, {
  WHEEL_SIZE,
  angleSegment,
  type Segment,
} from "./HoverWheel";

const POSITIONS = [
  "Top right",
  "Right",
  "Bottom right",
  "Bottom left",
  "Left",
  "Top left",
];

const DEFAULT_SEGMENTS: Segment[] = Array.from({ length: 6 }, () => ({
  app: null,
}));

export default function Settings() {
  const [segments, setSegments] = useState<Segment[]>(DEFAULT_SEGMENTS);
  const [apps, setApps] = useState<{ name: string }[]>([]);
  const [iconCache, setIconCache] = useState<Record<string, string | null>>({});
  const [hovered, setHovered] = useState<number | null>(null);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

  useEffect(() => {
    if (!window.wheelAPI) return;
    window.wheelAPI.getConfig().then((c) => setSegments(c.segments));
    window.wheelAPI.listApps().then(setApps);
  }, []);

  // Lazily fetch icons for displayed apps.
  useEffect(() => {
    if (!window.wheelAPI?.getIcon) return;
    const needed = new Set<string>();
    segments.forEach((s) => {
      if (s.app) needed.add(s.app);
    });
    if (pickerSlot !== null) apps.forEach((a) => needed.add(a.name));
    const missing = [...needed].filter((n) => !(n in iconCache));
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(
      missing.map(
        async (name) =>
          [name, await window.wheelAPI!.getIcon(name).catch(() => null)] as const,
      ),
    ).then((entries) => {
      if (cancelled) return;
      setIconCache((prev) => {
        const next = { ...prev };
        for (const [name, url] of entries) next[name] = url;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [segments, apps, pickerSlot, iconCache]);

  const iconUrls = useMemo(
    () => segments.map((s) => (s.app ? iconCache[s.app] ?? null : null)),
    [segments, iconCache],
  );

  const wheelRef = useRef<HTMLDivElement>(null);
  function onMouseMove(e: React.MouseEvent) {
    if (!wheelRef.current) return;
    const r = wheelRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    setHovered(angleSegment(e.clientX - cx, e.clientY - cy));
  }
  function onClick() {
    if (hovered !== null) setPickerSlot(hovered);
  }

  function pick(slot: number, appName: string) {
    const next = [...segments];
    next[slot] = { app: appName };
    setSegments(next);
    window.wheelAPI?.setConfig({ segments: next });
    setPickerSlot(null);
  }

  return (
    <div className="settings">
      <div className="settings-caption">
        {hovered !== null ? (
          <>
            <span className="caption-position">{POSITIONS[hovered]}</span>
            <span className="caption-sep">→</span>
            <span className="caption-app">
              {segments[hovered].app ?? "Empty"}
            </span>
            <span className="caption-hint">
              click to {segments[hovered].app ? "change" : "add"}
            </span>
          </>
        ) : (
          <span className="caption-hint">
            Hover a segment to assign an app
          </span>
        )}
      </div>

      <div
        className="settings-wheel-stage"
        ref={wheelRef}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHovered(null)}
        onClick={onClick}
      >
        <HoverWheel
          x={WHEEL_SIZE / 2}
          y={WHEEL_SIZE / 2}
          hovered={hovered}
          rimSegment={hovered}
          segments={segments}
          iconUrls={iconUrls}
        />
      </div>

      {pickerSlot !== null && (
        <Picker
          slot={pickerSlot}
          current={segments[pickerSlot].app}
          apps={apps}
          iconCache={iconCache}
          onPick={(name) => pick(pickerSlot, name)}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}

function Picker({
  slot,
  current,
  apps,
  iconCache,
  onPick,
  onClose,
}: {
  slot: number;
  current: string | null;
  apps: { name: string }[];
  iconCache: Record<string, string | null>;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <Command label={`Pick app for ${POSITIONS[slot]}`}>
          <div className="picker-header">
            <span className="picker-eyebrow">{POSITIONS[slot]}</span>
            <span className="picker-current">
              {current ? `currently ${current}` : "empty"}
            </span>
          </div>
          <Command.Input placeholder="Search apps…" autoFocus />
          <Command.List>
            <Command.Empty>No apps found.</Command.Empty>
            {apps.map((a) => (
              <Command.Item
                key={a.name}
                value={a.name}
                onSelect={() => onPick(a.name)}
              >
                <span className="picker-icon">
                  {iconCache[a.name] ? (
                    <img src={iconCache[a.name]!} alt="" />
                  ) : (
                    <span className="picker-icon-fallback">
                      {a.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="picker-name">{a.name}</span>
                {a.name === current && (
                  <span className="picker-current-badge">current</span>
                )}
              </Command.Item>
            ))}
          </Command.List>
          <div className="picker-footer">
            <kbd>↵</kbd> Select
            <span className="footer-sep" />
            <kbd>esc</kbd> Cancel
          </div>
        </Command>
      </div>
    </div>
  );
}
