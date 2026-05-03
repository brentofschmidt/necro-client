import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AuthGate } from './components/AuthGate'
import { AuthLayout } from './components/AuthLayout'
import { AppLayout } from './components/AppLayout'
import { Login } from './components/Login'
import { Register } from './components/Register'
import { MfaEnroll } from './components/MfaEnroll'
import { MfaChallenge } from './components/MfaChallenge'
import { Home } from './components/Home'
import { ForgotPassword } from './components/ForgotPassword'
import { ResetPassword } from './components/ResetPassword'
import { AccountSettings } from './components/AccountSettings'

const router = createBrowserRouter([
  {
    element: <AuthGate />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <Login /> },
          { path: '/register', element: <Register /> },
          { path: '/forgot-password', element: <ForgotPassword /> },
          { path: '/reset-password', element: <ResetPassword /> },
          { path: '/mfa-enroll', element: <MfaEnroll /> },
          { path: '/mfa', element: <MfaChallenge /> },
        ],
      },
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/play', element: <Home /> },
          { path: '/social', element: <Home /> },
          { path: '/account', element: <AccountSettings /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
