import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { AppShell } from './components/AppShell';
import { Loading } from './components/ui';
import { BrowsePage } from './pages/BrowsePage';
import { DashboardPage } from './pages/DashboardPage';
import { ItemDetailPage } from './pages/ItemDetailPage';
import { ItemFormPage } from './pages/ItemFormPage';
import { AllItemsPage } from './pages/AllItemsPage';
import { LoginPage } from './pages/LoginPage';
import { SearchPage } from './pages/SearchPage';
import { SpaceFormPage } from './pages/SpaceFormPage';

function Protected() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <main className="standalone-state">
        <Loading label="正在打开你的物品档案…" />
      </main>
    );
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <AppShell />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route index element={<DashboardPage />} />
        <Route path="browse/:id?" element={<BrowsePage />} />
        <Route path="spaces/new" element={<SpaceFormPage />} />
        <Route path="items/new" element={<ItemFormPage />} />
        <Route path="items" element={<AllItemsPage />} />
        <Route path="items/:id/edit" element={<ItemFormPage />} />
        <Route path="items/:id" element={<ItemDetailPage />} />
        <Route path="search" element={<SearchPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
