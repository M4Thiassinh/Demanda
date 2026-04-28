import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAppStore from './store/useAppStore'
import RolePage    from './pages/RolePage'
import RevisionPage from './pages/RevisionPage'
import AdminPage   from './pages/AdminPage'

function ProtectedRoute({ children, requiredRole }) {
  const role = useAppStore((s) => s.role)
  const depId = useAppStore((s) => s.depId)

  if (!role) return <Navigate to="/" replace />
  if (requiredRole === 'operador' && !depId) return <Navigate to="/" replace />
  if (requiredRole && role !== requiredRole) return <Navigate to="/" replace />

  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RolePage />} />
        <Route
          path="/revision"
          element={
            <ProtectedRoute requiredRole="operador">
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
