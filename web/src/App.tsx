import { BrowserRouter, Route, Routes, useNavigate } from 'react-router'
import { GuestOnly, RequireSession, SessionProvider } from './auth/SessionProvider'
import { useSession } from './auth/session'
import { BigButton } from './components/ui'
import { t } from './i18n'
import Home from './screens/Home'
import Placeholder from './screens/Placeholder'
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
          <Route path="/reports" element={<RequireSession><Placeholder title={t('reports.title')} /></RequireSession>} />
          <Route path="/matches/:id" element={<RequireSession><Placeholder title={t('match.title')} mascot="happy" /></RequireSession>} />
          <Route path="/chats" element={<RequireSession><Placeholder title={t('chats.title')} /></RequireSession>} />
          <Route path="/chats/:id" element={<RequireSession><Placeholder title={t('chats.title')} /></RequireSession>} />
          <Route path="/profile" element={<RequireSession><ProfileStub /></RequireSession>} />
          <Route path="*" element={<Placeholder title={t('notFound.title')} mascot="question" zarqa={t('notFound.zarqa')} back={false} />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  )
}

/** Until the Profile screen lands (step 3): just sign out. */
function ProfileStub() {
  const { signOut } = useSession()
  const navigate = useNavigate()
  return (
    <Placeholder
      title={t('profile.title')}
      mascot="portrait"
      action={<BigButton variant="dark" label="Sign out" onClick={() => signOut().then(() => navigate('/signin', { replace: true }))} />}
    />
  )
}
