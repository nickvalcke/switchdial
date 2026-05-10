// 1:1 reimplementation of the switchdial wheel for the landing page.
// Hover-only — clicks do nothing.

const VIEW = 600;
const C = VIEW / 2;
const OUTER_R = 242;
const RIM_GAP_R = 226;
const SEGMENT_OUTER_R = 222; // RIM_GAP_R - 4
const RIM_INNER_R = 230; //     RIM_GAP_R + 4
const INNER_OUTER_R = 114.5;
const INNER_INNER_R = 104.5;
const ICON_R = (INNER_OUTER_R + SEGMENT_OUTER_R) / 2;

const SEGMENT_COUNT = 6;
const SEGMENT_DEG = 360 / SEGMENT_COUNT;
const WHEEL_SIZE = 360;
const SCALE = WHEEL_SIZE / VIEW;

// Easter egg: a customized example so visitors see what the dial looks like
// after they've assigned their own apps. Real macOS app icons baked into
// landing/icons/ so the preview matches what you'd actually see.
const SEGMENTS = [
  { app: "Figma", icon: "icons/figma.png" },
  { app: "Spotify", icon: "icons/spotify.png" },
  { app: "Slack", icon: "icons/slack.png" },
  { app: "Conductor", icon: "icons/conductor.png" },
  { app: "Chrome", icon: "icons/chrome.png" },
  { app: "Claude", icon: "icons/claude.png" },
];

const SVG_NS = "http://www.w3.org/2000/svg";

function polar(r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
}

function wedgePath(segment, innerR, outerR) {
  const start = segment * SEGMENT_DEG;
  const end = start + SEGMENT_DEG;
  const [x1, y1] = polar(innerR, start);
  const [x2, y2] = polar(outerR, start);
  const [x3, y3] = polar(outerR, end);
  const [x4, y4] = polar(innerR, end);
  return `M ${x1} ${y1} L ${x2} ${y2} A ${outerR} ${outerR} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${innerR} ${innerR} 0 0 0 ${x1} ${y1} Z`;
}

function angleSegment(dx, dy) {
  if (dx === 0 && dy === 0) return null;
  const rad = Math.atan2(dx, -dy);
  const deg = ((rad * 180) / Math.PI + 360) % 360;
  return Math.floor(deg / SEGMENT_DEG) % SEGMENT_COUNT;
}

function hitTestSegment(dx, dy) {
  const dist = Math.hypot(dx, dy);
  if (dist < INNER_OUTER_R * SCALE) return null;
  return angleSegment(dx, dy);
}

function buildDial() {
  const dial = document.getElementById("dial");
  const svg = dial.querySelector(".dial-svg");
  const rimSvg = dial.querySelector(".rim-hover-svg");

  let html = `<circle cx="${C}" cy="${C}" r="${OUTER_R}" fill="#232323"/>`;
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    html += `<path class="wedge-inner" data-segment="${i}" d="${wedgePath(i, INNER_OUTER_R, SEGMENT_OUTER_R)}"/>`;
  }
  html += `<circle cx="${C}" cy="${C}" r="${RIM_GAP_R}" fill="none" stroke="#1C1C1C" stroke-width="8"/>`;
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const angle = i * SEGMENT_DEG;
    const [x1, y1] = polar(INNER_OUTER_R, angle);
    const [x2, y2] = polar(SEGMENT_OUTER_R, angle);
    html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#343434"/>`;
  }
  html += `<circle cx="${C}" cy="${C}" r="${INNER_OUTER_R}" fill="#1C1C1C" stroke="#343434"/>`;
  html += `<circle cx="${C}" cy="${C}" r="${INNER_INNER_R}" fill="#1C1C1C" stroke="#343434"/>`;
  svg.innerHTML = html;

  rimSvg.innerHTML = `<path d="${wedgePath(0, RIM_INNER_R, OUTER_R)}" fill="#525252"/>`;

  // Icons placed via absolute positioning so we don't need foreignObject.
  SEGMENTS.forEach((seg, i) => {
    const angle = i * SEGMENT_DEG + SEGMENT_DEG / 2;
    const rad = ((angle - 90) * Math.PI) / 180;
    const cx = WHEEL_SIZE / 2 + ICON_R * SCALE * Math.cos(rad);
    const cy = WHEEL_SIZE / 2 + ICON_R * SCALE * Math.sin(rad);
    const div = document.createElement("div");
    div.className = "dial-icon";
    div.dataset.segment = String(i);
    div.style.left = `${cx}px`;
    div.style.top = `${cy}px`;
    div.innerHTML = seg.icon
      ? `<img src="${seg.icon}" alt="${seg.app}"/>`
      : `<span class="dial-icon-fallback">${seg.app.charAt(0)}</span>`;
    dial.appendChild(div);
  });
}

function attachHover() {
  const dial = document.getElementById("dial");
  const rimSvg = dial.querySelector(".rim-hover-svg");
  const label = dial.querySelector(".dial-label");
  const wedges = dial.querySelectorAll(".wedge-inner");
  const icons = dial.querySelectorAll(".dial-icon");

  rimSvg.style.opacity = "0";

  let lastSegment = null;
  let rotation = 0;

  function update(clientX, clientY) {
    const r = dial.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const angSeg = angleSegment(dx, dy);
    const hovered = hitTestSegment(dx, dy);

    wedges.forEach((w, i) =>
      w.classList.toggle("is-hovered", i === hovered),
    );
    icons.forEach((ic, i) =>
      ic.classList.toggle("is-hovered", i === hovered),
    );

    if (angSeg !== null) {
      if (lastSegment === null) {
        rimSvg.style.transition = "none";
        rotation = angSeg * SEGMENT_DEG;
        rimSvg.style.transform = `rotate(${rotation}deg)`;
        void rimSvg.offsetHeight;
        rimSvg.style.transition = "";
      } else if (angSeg !== lastSegment) {
        const target = angSeg * SEGMENT_DEG;
        let delta = target - (rotation % 360);
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        rotation += delta;
        rimSvg.style.transform = `rotate(${rotation}deg)`;
      }
      rimSvg.style.opacity = "1";
    }
    lastSegment = angSeg;

    label.textContent =
      hovered !== null ? SEGMENTS[hovered].app : "Enter";
  }

  function reset() {
    wedges.forEach((w) => w.classList.remove("is-hovered"));
    icons.forEach((ic) => ic.classList.remove("is-hovered"));
    rimSvg.style.opacity = "0";
    label.textContent = "Enter";
    lastSegment = null;
  }

  // Mouse
  dial.addEventListener("mousemove", (e) => update(e.clientX, e.clientY));
  dial.addEventListener("mouseleave", reset);

  // Touch — non-passive so we can preventDefault and stop the page from
  // scrolling under the finger while dragging on the dial.
  dial.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      const t = e.touches[0];
      update(t.clientX, t.clientY);
    },
    { passive: false },
  );
  dial.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      const t = e.touches[0];
      update(t.clientX, t.clientY);
    },
    { passive: false },
  );
  dial.addEventListener("touchend", reset);
  dial.addEventListener("touchcancel", reset);
}

buildDial();
attachHover();
