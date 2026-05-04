import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ROUTES } from './lib/routes';
import { Login } from './routes/Login';
import { Today } from './routes/Today';
import { WorkoutActive } from './routes/WorkoutActive';
import { History } from './routes/History';
import { HistoryDetail } from './routes/HistoryDetail';
import { Progress } from './routes/Progress';
import { Profile } from './routes/Profile';
import { TrainingPlan } from './routes/TrainingPlan';
import { PlanSetup } from './routes/PlanSetup';
import { PrivacyData } from './routes/PrivacyData';

export function App() {
  return (
    <Routes>
      <Route path={ROUTES.login} element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Today />} />
        <Route path={ROUTES.workoutActive} element={<WorkoutActive />} />
        <Route path={ROUTES.history} element={<History />} />
        <Route path="history/:id" element={<HistoryDetail />} />
        <Route path={ROUTES.progress} element={<Progress />} />
        <Route path={ROUTES.profile} element={<Profile />} />
        <Route path={ROUTES.privacy} element={<PrivacyData />} />
        <Route path={ROUTES.plan} element={<TrainingPlan />} />
        <Route path={ROUTES.planSetup} element={<PlanSetup />} />
        {/* Redirects from legacy paths */}
        <Route path="profile/plan/setup" element={<Navigate to="/plan/setup" replace />} />
        <Route path="profile/plan" element={<Navigate to="/plan" replace />} />
      </Route>
      <Route path="*" element={<Navigate to={ROUTES.today} replace />} />
    </Routes>
  );
}
