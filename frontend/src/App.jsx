import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAppStore from './store/useAppStore'
import ErrorBoundary from './components/ErrorBoundary'
import RolePage    from './pages/RolePage'
import RevisionPage from './pages/RevisionPage'
import AdminPage   from './pages/AdminPage'
import InfaltablesPage from './pages/InfaltablesPage'
import AreasProductivasPage from './pages/AreasProductivasPage'

function ProtectedRoute({ children, requiredRole, requireDep }) {
  const role = useAppStore((s) => s.role)
  const depId = useAppStore((s) => s.depId)

  if (!role) return <Navigate to="/" replace />
  const roles = Array.isArray(requiredRole) ? requiredRole : requiredRole ? [requiredRole] : []
  if (roles.length && !roles.includes(role)) return <Navigate to="/" replace />
  if (requireDep && !depId) return <Navigate to="/" replace />

  return children
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RolePage />} />
        <Route
          path="/revision"
          element={
            <ProtectedRoute requiredRole={['operador', 'toma_stock']} requireDep>
              <RevisionPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/areas-productivas"
          element={
            <ProtectedRoute requiredRole="produccion">
              <AreasProductivasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/infaltables"
          element={
            <ProtectedRoute requiredRole="infaltables">
              <InfaltablesPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
