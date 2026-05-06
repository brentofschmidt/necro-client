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
import { PublishArticle } from './components/PublishArticle'
import { PublicProfile } from './components/PublicProfile'
import { GamePage } from './components/GamePage'
import { CharacterPage } from './components/CharacterPage'
import { GuildPage } from './components/GuildPage'
import {
  About,
  BugReports,
  Careers,
  Contact,
  CookiePolicy,
  HelpCenter,
  PrivacyPolicy,
  Status,
  TermsOfService,
} from './components/StaticPages'

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
          { path: '/publish', element: <PublishArticle /> },
          { path: '/u/:userId', element: <PublicProfile /> },
          {
            path: '/g/:gameId/characters/:characterId/:tab?',
            element: <CharacterPage />,
          },
          {
            path: '/g/:gameId/guilds/:guildId',
            element: <GuildPage />,
          },
          { path: '/g/:gameId/:section?/:tab?', element: <GamePage /> },
          { path: '/about', element: <About /> },
          { path: '/contact', element: <Contact /> },
          { path: '/careers', element: <Careers /> },
          { path: '/help', element: <HelpCenter /> },
          { path: '/status', element: <Status /> },
          { path: '/bugs', element: <BugReports /> },
          { path: '/privacy', element: <PrivacyPolicy /> },
          { path: '/terms', element: <TermsOfService /> },
          { path: '/cookies', element: <CookiePolicy /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
