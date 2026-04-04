import type { FC } from 'hono/jsx';

type StatCardProps = {
  label: string;
  value: string | number;
  delta?: string;
  deltaType?: 'positive' | 'negative';
};

export const StatCard: FC<StatCardProps> = ({ label, value, delta, deltaType }) => {
  return (
    <div class="stat-card">
      <div class="stat-label">{label}</div>
      <div class="stat-value">{value}</div>
      {delta && (
        <div class={`stat-delta ${deltaType ?? ''}`}>{delta}</div>
      )}
    </div>
  );
};
