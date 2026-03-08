import './Skeleton.css';

type SkeletonProps = {
  width?: string;
  height?: string;
  borderRadius?: string;
};

export function Skeleton({
  width = '100%',
  height = '16px',
  borderRadius = 'var(--radius-sm)',
}: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <Skeleton width="60%" height="18px" />
      <Skeleton width="40%" height="14px" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function TodaySkeleton() {
  return (
    <div className="skeleton-today" aria-hidden="true">
      <div className="skeleton-today-header">
        <Skeleton width="200px" height="34px" borderRadius="var(--radius-sm)" />
        <Skeleton width="140px" height="14px" />
      </div>
      <Skeleton height="44px" borderRadius="var(--radius-button)" />
      <div className="skeleton-card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
        <Skeleton width="80px" height="12px" />
        <div className="skeleton-week-strip">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} width="28px" height="28px" borderRadius="var(--radius-full)" />
          ))}
        </div>
      </div>
      <Skeleton width="80px" height="20px" />
      <SkeletonList count={3} />
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="skeleton-detail" aria-hidden="true">
      <Skeleton width="80px" height="14px" />
      <div className="skeleton-card" style={{ padding: 'var(--space-5)' }}>
        <Skeleton width="180px" height="28px" borderRadius="var(--radius-sm)" />
        <Skeleton width="120px" height="14px" />
        <div className="skeleton-stats-row">
          <Skeleton width="60px" height="20px" />
          <Skeleton width="60px" height="20px" />
          <Skeleton width="60px" height="20px" />
        </div>
      </div>
      <SkeletonList count={2} />
    </div>
  );
}
