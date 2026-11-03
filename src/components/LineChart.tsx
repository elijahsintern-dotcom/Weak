export interface Series {
  name: string;
  color: string;
  points: { x: number; y: number }[];
}

const W = 340;
const H = 190;
const PAD = { l: 36, r: 10, t: 10, b: 24 };

function niceTicks(min: number, max: number, n = 4): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  for (let v = start; v <= end + step * 0.001; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/** Small dependency-free SVG line chart with dated x axis. */
export function LineChart({ series, unit = '' }: { series: Series[]; unit?: string }) {
  const pts = series.flatMap((s) => s.points);
  if (pts.length === 0) return <div className="empty small">Not enough data to chart yet.</div>;
  let xMin = Math.min(...pts.map((p) => p.x));
  let xMax = Math.max(...pts.map((p) => p.x));
  if (xMin === xMax) {
    xMin -= 86400000;
    xMax += 86400000;
  }
  const yt = niceTicks(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)));
  const yMin = yt[0];
  const yMax = yt[yt.length - 1];
  const X = (x: number) => PAD.l + ((x - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
  const Y = (y: number) => H - PAD.b - ((y - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);
  const months: number[] = [];
  const d0 = new Date(xMin);
  const cur = new Date(d0.getFullYear(), d0.getMonth() + 1, 1);
  while (cur.getTime() <= xMax) {
    months.push(cur.getTime());
    cur.setMonth(cur.getMonth() + 1);
  }
  const step = Math.max(1, Math.ceil(months.length / 5));
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.name).join(', ')}>
        {yt.map((v) => (
          <g key={v}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={Y(v)} y2={Y(v)} />
            <text x={PAD.l - 6} y={Y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {months.filter((_, i) => i % step === 0).map((m) => (
          <text key={m} x={X(m)} y={H - 6} textAnchor="middle">
            {new Date(m).toLocaleDateString(undefined, { month: 'short' })}
          </text>
        ))}
        {series.map((s) => {
          const sorted = [...s.points].sort((a, b) => a.x - b.x);
          return (
            <g key={s.name}>
              <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" points={sorted.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} />
              {sorted.map((p, i) => (
                <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={2.6} fill={s.color}>
                  <title>{`${new Date(p.x).toLocaleDateString()}: ${p.y}${unit}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 ? (
        <div className="legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const SERIES_COLORS = ['#e8c547', '#4a8fd9', '#4fa36b', '#d9534f', '#c89be8', '#d8d8d8', '#e39b5b'];
