import { BrowserRouter, Route, Routes } from 'react-router'
import { GuestOnly, RequireSession, SessionProvider } from './auth/SessionProvider'
import { t } from './i18n'
import Home from './screens/Home'
import Placeholder from './screens/Placeholder'
import Profile from './screens/Profile'
import ReportDetail from './screens/ReportDetail'
import Reports from './screens/Reports'
import SignIn from './screens/SignIn'
import Welcome from './screens/Welcome'

// No bottom nav: everything starts from Home (design/HANDOFF.md).
export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/signin" element={<GuestOnly><SignIn /></GuestOnly>} />
          <Route path="/welcome" element={<RequireSession><Welcome /></RequireSession>} />
          <Route path="/" element={<RequireSession><Home /></RequireSession>} />
          <Route path="/reports" element={<RequireSession><Reports /></RequireSession>} />
          <Route path="/reports/:id" element={<RequireSession><ReportDetail /></RequireSession>} />
          <Route path="/matches/:id" element={<RequireSession><Placeholder title={t('match.title')} mascot="happy" /></RequireSession>} />
          <Route path="/chats" element={<RequireSession><Placeholder title={t('chats.title')} /></RequireSession>} />
          <Route path="/chats/:id" element={<RequireSession><Placeholder title={t('chats.title')} /></RequireSession>} />
          <Route path="/profile" element={<RequireSession><Profile /></RequireSession>} />
          <Route path="/tips" element={<RequireSession><Placeholder title={t('profile.tips')} /></RequireSession>} />
          <Route path="/help" element={<RequireSession><Placeholder title={t('profile.help')} /></RequireSession>} />
          <Route path="*" element={<Placeholder title={t('notFound.title')} mascot="question" zarqa={t('notFound.zarqa')} back={false} />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}
