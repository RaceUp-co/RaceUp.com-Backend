import type { FC } from 'hono/jsx';

type BarChartProps = {
  title: string;
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
};

export const BarChart: FC<BarChartProps> = ({ title, data, height = 150, color = '#4a9eff' }) => {
  if (data.length === 0) {
    return (
      <div class="chart-container">
        <div class="chart-title">{title}</div>
        <div style="color:#707090;font-size:12px;padding:20px;text-align:center;">Aucune donnee</div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.max(4, Math.floor(600 / data.length) - 2);
  const svgWidth = data.length * (barWidth + 2);

  return (
    <div class="chart-container">
      <div class="chart-title">{title}</div>
      <svg width="100%" viewBox={`0 0 ${svgWidth} ${height + 20}`} style="max-width:100%;">
        {data.map((d, i) => {
          const barHeight = (d.value / maxVal) * height;
          const x = i * (barWidth + 2);
          const y = height - barHeight;
          return (
            <g>
              <rect x={x} y={y} width={barWidth} height={barHeight} fill={color} opacity="0.8">
                <title>{`${d.label}: ${d.value}`}</title>
              </rect>
              {data.length <= 24 && (
                <text
                  x={x + barWidth / 2}
                  y={height + 14}
                  text-anchor="middle"
                  fill="#707090"
                  font-size="8"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
