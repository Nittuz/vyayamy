import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './routes/Login';
import { Today } from './routes/Today';
import { WorkoutStart } from './routes/WorkoutStart';
import { WorkoutActive } from './routes/WorkoutActive';
import { History } from './routes/History';
import { HistoryDetail } from './routes/HistoryDetail';
import { Progress } from './routes/Progress';
import { Profile } from './routes/Profile';
import { Routines } from './routes/Routines';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Today />} />
        <Route path="workout" element={<WorkoutStart />} />
        <Route path="workout/active" element={<WorkoutActive />} />
        <Route path="history" element={<History />} />
        <Route path="history/:id" element={<HistoryDetail />} />
        <Route path="progress" element={<Progress />} />
        <Route path="profile" element={<Profile />} />
        <Route path="profile/routines" element={<Routines />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
