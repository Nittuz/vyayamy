import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { TodaySkeleton } from './Skeleton';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="layout-main">
        <TodaySkeleton />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
