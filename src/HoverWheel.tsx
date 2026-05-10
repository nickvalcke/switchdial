import { useEffect, useRef } from "react";

// Proportions taken directly from the Figma frame (126:405).
const VIEW = 600;
const C = VIEW / 2;
const OUTER_R = 242;
const RIM_GAP_R = 226;
const INNER_OUTER_R = 114.5;
const INNER_INNER_R = 104.5;

// Inner edge of the rim gap — dividers stop here and the hover wedge splits
// into an inner part (segment area) and an outer part (rim) at this radius.
const SEGMENT_OUTER_R = RIM_GAP_R - 4;
const RIM_INNER_R = RIM_GAP_R + 4;

// Where each icon sits along the segment's radial midline.
const ICON_R = (INNER_OUTER_R + SEGMENT_OUTER_R) / 2;

export const WHEEL_SIZE = 360;
export const SEGMENT_COUNT = 6;
const SEGMENT_DEG = 360 / SEGMENT_COUNT;

const FILL_RING = "#232323";
const FILL_BG = "#1C1C1C";
const STROKE_DIVIDER = "#343434";

export type Segment = { app: string | null; label?: string };

// 0° points up, angle increases clockwise.
function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
}

function wedgePath(segment: number, innerR: number, outerR: number): string {
  const start = segment * SEGMENT_DEG;
  const end = start + SEGMENT_DEG;
  const [x1, y1] = polar(innerR, start);
  const [x2, y2] = polar(outerR, start);
  const [x3, y3] = polar(outerR, end);
  const [x4, y4] = polar(innerR, end);
  return [
    `M ${x1} ${y1}`,
    `L ${x2} ${y2}`,
    `A ${outerR} ${outerR} 0 0 1 ${x3} ${y3}`,
    `L ${x4} ${y4}`,
    `A ${innerR} ${innerR} 0 0 0 ${x1} ${y1}`,
    "Z",
  ].join(" ");
}

// Hit-test in screen pixels relative to the wheel center.
// Inside the inner circle is a deadzone; beyond it the hitbox is radially
// infinite, so dragging past the rim still selects by angle.
export function hitTestSegment(dx: number, dy: number): number | null {
  const dist = Math.hypot(dx, dy);
  if (dist < INNER_OUTER_R * (WHEEL_SIZE / VIEW)) return null;
  return angleSegment(dx, dy);
}

// Pure angle-based segment, no deadzone. Returns null only at exact center.
export function angleSegment(dx: number, dy: number): number | null {
  if (dx === 0 && dy === 0) return null;
  const rad = Math.atan2(dx, -dy);
  const deg = (((rad * 180) / Math.PI) + 360) % 360;
  return Math.floor(deg / SEGMENT_DEG) % SEGMENT_COUNT;
}

type Props = {
  x: number;
  y: number;
  hovered: number | null;
  rimSegment: number | null;
  segments: Segment[];
  iconUrls?: (string | null)[];
};

export default function HoverWheel({
  x,
  y,
  hovered,
  rimSegment,
  segments,
  iconUrls,
}: Props) {
  const scale = WHEEL_SIZE / VIEW;

  const rotationRef = useRef(0);
  const lastRimRef = useRef<number | null>(null);

  let rimRotation = rotationRef.current;
  if (rimSegment !== null) {
    if (lastRimRef.current === null) {
      rimRotation = rimSegment * SEGMENT_DEG;
    } else if (rimSegment !== lastRimRef.current) {
      const target = rimSegment * SEGMENT_DEG;
      let delta = target - (rotationRef.current % 360);
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      rimRotation = rotationRef.current + delta;
    }
  }

  useEffect(() => {
    lastRimRef.current = rimSegment;
    rotationRef.current = rimRotation;
  });

  return (
    <div
      className="hover-wheel"
      style={{
        left: x - WHEEL_SIZE / 2,
        top: y - WHEEL_SIZE / 2,
        width: WHEEL_SIZE,
        height: WHEEL_SIZE,
      }}
    >
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        width={WHEEL_SIZE}
        height={WHEEL_SIZE}
      >
        <circle cx={C} cy={C} r={OUTER_R} fill={FILL_RING} />

        {segments.map((_, i) => (
          <path
            key={i}
            className={`wedge-inner${hovered === i ? " is-hovered" : ""}`}
            d={wedgePath(i, INNER_OUTER_R, SEGMENT_OUTER_R)}
          />
        ))}

        <circle
          cx={C}
          cy={C}
          r={RIM_GAP_R}
          fill="none"
          stroke={FILL_BG}
          strokeWidth={8}
        />

        {Array.from({ length: SEGMENT_COUNT }).map((_, i) => {
          const angle = i * SEGMENT_DEG;
          const [x1, y1] = polar(INNER_OUTER_R, angle);
          const [x2, y2] = polar(SEGMENT_OUTER_R, angle);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={STROKE_DIVIDER}
            />
          );
        })}

        <circle
          cx={C}
          cy={C}
          r={INNER_OUTER_R}
          fill={FILL_BG}
          stroke={STROKE_DIVIDER}
        />
        <circle
          cx={C}
          cy={C}
          r={INNER_INNER_R}
          fill={FILL_BG}
          stroke={STROKE_DIVIDER}
        />
      </svg>

      {rimSegment !== null && (
        <svg
          className="rim-hover-svg"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          width={WHEEL_SIZE}
          height={WHEEL_SIZE}
          style={{ transform: `rotate(${rimRotation}deg)` }}
        >
          <path d={wedgePath(0, RIM_INNER_R, OUTER_R)} fill="#525252" />
        </svg>
      )}

      {segments.map((seg, i) => {
        const angle = i * SEGMENT_DEG + SEGMENT_DEG / 2;
        const rad = ((angle - 90) * Math.PI) / 180;
        const cx = WHEEL_SIZE / 2 + ICON_R * scale * Math.cos(rad);
        const cy = WHEEL_SIZE / 2 + ICON_R * scale * Math.sin(rad);
        const url = iconUrls?.[i];
        const isEmpty = !seg.app;
        return (
          <div
            key={i}
            className={`wheel-icon${hovered === i ? " is-hovered" : ""}${
              isEmpty ? " is-empty" : ""
            }`}
            style={{ left: cx, top: cy }}
          >
            {isEmpty ? (
              <span className="wheel-icon-empty">+</span>
            ) : url ? (
              <img className="wheel-icon-img" src={url} alt={seg.app!} />
            ) : (
              <span className="wheel-icon-fallback">
                {seg.app!.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        );
      })}

      <div className="wheel-label">
        {hovered != null
          ? (segments[hovered].label ?? segments[hovered].app ?? "Empty")
          : "Enter"}
      </div>
    </div>
  );
}
