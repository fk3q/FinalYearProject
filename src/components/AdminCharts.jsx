import React, { useMemo, useState } from "react";

const PALETTE = [
  "#4facfe",
  "#34d399",
  "#a78bfa",
  "#fbbf24",
  "#fb7185",
  "#2dd4bf",
  "#f472b6",
  "#60a5fa",
  "#f59e0b",
  "#22d3ee",
];

const colorFor = (idx) => PALETTE[idx % PALETTE.length];

/* ─── Bar chart ──────────────────────────────────────────────────────────── */
export const BarChart = ({ data, xLabel, yLabel, height = 240 }) => {
  const [hover, setHover] = useState(null);
  const padding = { top: 16, right: 12, bottom: 46, left: 40 };
  const width = 560;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  if (!data || data.length === 0) {
    return <p className="adm-empty">No data to chart yet.</p>;
  }

  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const barW = innerW / data.length;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = (max / ticks) * i;
    return { v, y: padding.top + innerH - (v / max) * innerH };
  });

  return (
    <div className="adm-svg-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="adm-svg">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={t.y}
              y2={t.y}
              stroke="rgba(255,255,255,0.06)"
            />
            <text x={padding.left - 6} y={t.y + 3} className="adm-svg-tick" textAnchor="end">
              {Math.round(t.v)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const h = (d.value / max) * innerH;
          const x = padding.left + i * barW + barW * 0.15;
          const y = padding.top + innerH - h;
          const w = barW * 0.7;
          return (
            <g
              key={d.label + i}
              onMouseEnter={() => setHover({ i, ...d })}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                x={x}
                y={y}
                width={w}
                height={Math.max(h, 1)}
                rx={4}
                fill={colorFor(i)}
                opacity={hover && hover.i !== i ? 0.45 : 0.95}
              />
              <text
                x={x + w / 2}
                y={height - padding.bottom + 14}
                className="adm-svg-xlabel"
                textAnchor="end"
                transform={`rotate(-35 ${x + w / 2} ${height - padding.bottom + 14})`}
              >
                {d.label.length > 14 ? d.label.slice(0, 13) + "…" : d.label}
              </text>
            </g>
          );
        })}

        {yLabel && (
          <text
            x={14}
            y={padding.top + innerH / 2}
            className="adm-svg-axis"
            textAnchor="middle"
            transform={`rotate(-90 14 ${padding.top + innerH / 2})`}
          >
            {yLabel}
          </text>
        )}
        {xLabel && (
          <text
            x={padding.left + innerW / 2}
            y={height - 4}
            className="adm-svg-axis"
            textAnchor="middle"
          >
            {xLabel}
          </text>
        )}
      </svg>
      {hover && (
        <div className="adm-tooltip">
          <strong>{hover.label}</strong>: {hover.value}
          {hover.extra ? ` · ${hover.extra}` : ""}
        </div>
      )}
    </div>
  );
};

/* ─── Pie chart ──────────────────────────────────────────────────────────── */
export const PieChart = ({ data, size = 220 }) => {
  const total = useMemo(
    () => (data || []).reduce((s, d) => s + d.value, 0),
    [data]
  );

  if (!data || data.length === 0 || total === 0) {
    return <p className="adm-empty">No data to chart yet.</p>;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;

  let acc = 0;
  const slices = data.map((d, i) => {
    const start = acc / total;
    acc += d.value;
    const end = acc / total;
    const startAng = start * Math.PI * 2 - Math.PI / 2;
    const endAng = end * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAng);
    const y1 = cy + r * Math.sin(startAng);
    const x2 = cx + r * Math.cos(endAng);
    const y2 = cy + r * Math.sin(endAng);
    const large = end - start > 0.5 ? 1 : 0;
    const path =
      data.length === 1
        ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return { path, color: colorFor(i), label: d.label, value: d.value, pct: (d.value / total) * 100 };
  });

  return (
    <div className="adm-pie-row">
      <svg viewBox={`0 0 ${size} ${size}`} className="adm-pie" width={size} height={size}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="#1a1e36" strokeWidth={1} />
        ))}
      </svg>
      <ul className="adm-pie-legend">
        {slices.map((s, i) => (
          <li key={i}>
            <span className="adm-pie-dot" style={{ background: s.color }} />
            <span className="adm-pie-legend-label">{s.label}</span>
            <span className="adm-pie-legend-val">
              {s.value} · {s.pct.toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ─── Histogram ──────────────────────────────────────────────────────────── */
export const Histogram = ({
  values,
  bins = 6,
  xLabel,
  yLabel,
  height = 240,
  formatBin,
}) => {
  const padding = { top: 16, right: 12, bottom: 44, left: 40 };
  const width = 560;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  if (!values || values.length === 0) {
    return <p className="adm-empty">No data to chart yet.</p>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const step = range / bins;

  const buckets = Array.from({ length: bins }, (_, i) => {
    const lo = min + i * step;
    const hi = i === bins - 1 ? max + 0.0001 : lo + step;
    const count = values.filter((v) => v >= lo && v < hi).length;
    return {
      lo,
      hi,
      count,
      label: formatBin ? formatBin(lo, hi) : `${Math.round(lo)}–${Math.round(hi)}`,
    };
  });

  const maxCount = buckets.reduce((m, b) => Math.max(m, b.count), 0) || 1;
  const barW = innerW / bins;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = Math.round((maxCount / ticks) * i);
    return { v, y: padding.top + innerH - (v / maxCount) * innerH };
  });

  return (
    <div className="adm-svg-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="adm-svg">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={t.y}
              y2={t.y}
              stroke="rgba(255,255,255,0.06)"
            />
            <text x={padding.left - 6} y={t.y + 3} className="adm-svg-tick" textAnchor="end">
              {t.v}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const h = (b.count / maxCount) * innerH;
          const x = padding.left + i * barW + 1;
          const y = padding.top + innerH - h;
          const w = barW - 2;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={w}
                height={Math.max(h, b.count > 0 ? 1 : 0)}
                fill={colorFor(i)}
                opacity={0.9}
              />
              {b.count > 0 && (
                <text x={x + w / 2} y={y - 4} className="adm-svg-bar-label" textAnchor="middle">
                  {b.count}
                </text>
              )}
              <text
                x={x + w / 2}
                y={height - padding.bottom + 14}
                className="adm-svg-xlabel"
                textAnchor="middle"
              >
                {b.label}
              </text>
            </g>
          );
        })}
        {xLabel && (
          <text
            x={padding.left + innerW / 2}
            y={height - 4}
            className="adm-svg-axis"
            textAnchor="middle"
          >
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text
            x={14}
            y={padding.top + innerH / 2}
            className="adm-svg-axis"
            textAnchor="middle"
            transform={`rotate(-90 14 ${padding.top + innerH / 2})`}
          >
            {yLabel}
          </text>
        )}
      </svg>
    </div>
  );
};

/* ─── Scatter plot ───────────────────────────────────────────────────────── */
export const ScatterPlot = ({
  points,
  xLabel,
  yLabel,
  height = 280,
  xAccessor = (p) => p.x,
  yAccessor = (p) => p.y,
}) => {
  const [hover, setHover] = useState(null);
  const padding = { top: 16, right: 16, bottom: 44, left: 44 };
  const width = 560;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  if (!points || points.length === 0) {
    return <p className="adm-empty">No data to chart yet.</p>;
  }

  const xs = points.map(xAccessor);
  const ys = points.map(yAccessor);
  const xMax = Math.max(1, ...xs);
  const yMax = Math.max(1, ...ys);

  const toX = (v) => padding.left + (v / xMax) * innerW;
  const toY = (v) => padding.top + innerH - (v / yMax) * innerH;

  const ticks = 4;
  const xTicks = Array.from({ length: ticks + 1 }, (_, i) => (xMax / ticks) * i);
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => (yMax / ticks) * i);

  return (
    <div className="adm-svg-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="adm-svg">
        {yTicks.map((v, i) => (
          <g key={`y${i}`}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={toY(v)}
              y2={toY(v)}
              stroke="rgba(255,255,255,0.06)"
            />
            <text x={padding.left - 6} y={toY(v) + 3} className="adm-svg-tick" textAnchor="end">
              {Math.round(v)}
            </text>
          </g>
        ))}
        {xTicks.map((v, i) => (
          <g key={`x${i}`}>
            <line
              x1={toX(v)}
              x2={toX(v)}
              y1={padding.top}
              y2={padding.top + innerH}
              stroke="rgba(255,255,255,0.04)"
            />
            <text x={toX(v)} y={height - padding.bottom + 16} className="adm-svg-xlabel" textAnchor="middle">
              {Math.round(v)}
            </text>
          </g>
        ))}

        {points.map((p, i) => {
          const cx = toX(xAccessor(p));
          const cy = toY(yAccessor(p));
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={hover === i ? 7 : 5}
              fill={colorFor(i)}
              fillOpacity={0.85}
              stroke="#1a1e36"
              strokeWidth={1}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
            />
          );
        })}

        {xLabel && (
          <text
            x={padding.left + innerW / 2}
            y={height - 4}
            className="adm-svg-axis"
            textAnchor="middle"
          >
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text
            x={14}
            y={padding.top + innerH / 2}
            className="adm-svg-axis"
            textAnchor="middle"
            transform={`rotate(-90 14 ${padding.top + innerH / 2})`}
          >
            {yLabel}
          </text>
        )}
      </svg>
      {hover !== null && points[hover] && (
        <div className="adm-tooltip">
          <strong>{points[hover].label || `#${hover + 1}`}</strong>
          {` · ${xLabel || "x"}=${Math.round(xAccessor(points[hover]))}`}
          {` · ${yLabel || "y"}=${Math.round(yAccessor(points[hover]))}`}
        </div>
      )}
    </div>
  );
};
