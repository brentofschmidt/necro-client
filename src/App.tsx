import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AuthGate } from './components/AuthGate'
import { Login } from './components/Login'
import { Register } from './components/Register'
import { MfaEnroll } from './components/MfaEnroll'
import { MfaChallenge } from './components/MfaChallenge'
import { DashboardRoute } from './components/DashboardRoute'
import { ForgotPassword } from './components/ForgotPassword'
import { ResetPassword } from './components/ResetPassword'

const router = createBrowserRouter([
  {
    element: (
      <div className="app-shell">
        <AuthGate />
      </div>
    ),
    children: [
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '/mfa-enroll', element: <MfaEnroll /> },
      { path: '/mfa', element: <MfaChallenge /> },
      { path: '/', element: <DashboardRoute /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
