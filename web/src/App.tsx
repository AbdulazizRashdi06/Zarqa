import { BrowserRouter, Route, Routes } from 'react-router'
import { GuestOnly, RequireSession, SessionProvider } from './auth/SessionProvider'
import { t } from './i18n'
import Admin from './screens/Admin'
import Info from './screens/Info'
import Chat from './screens/Chat'
import Chats from './screens/Chats'
import Home from './screens/Home'
import Match from './screens/Match'
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
          <Route path="/matches/:id" element={<RequireSession><Match /></RequireSession>} />
          <Route path="/chats" element={<RequireSession><Chats /></RequireSession>} />
          <Route path="/chats/:id" element={<RequireSession><Chat /></RequireSession>} />
          <Route path="/profile" element={<RequireSession><Profile /></RequireSession>} />
          <Route path="/admin" element={<RequireSession><Admin /></RequireSession>} />
          {(['terms', 'privacy', 'help', 'tips'] as const).map(page => <Route key={page} path={`/${page}`} element={<Info page={page} />} />)}
          <Route path="*" element={<Placeholder title={t('notFound.title')} mascot="question" zarqa={t('notFound.zarqa')} back={false} />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}
