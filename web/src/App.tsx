import { BrowserRouter, Route, Routes } from 'react-router'
import { t } from './i18n'
import Home from './screens/Home'
import Placeholder from './screens/Placeholder'

// No bottom nav: everything starts from Home (design/HANDOFF.md).
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signin" element={<Placeholder title={t('signin.title')} mascot="question" />} />
        <Route path="/reports" element={<Placeholder title={t('reports.title')} />} />
        <Route path="/matches/:id" element={<Placeholder title={t('match.title')} mascot="happy" />} />
        <Route path="/chats" element={<Placeholder title={t('chats.title')} />} />
        <Route path="/chats/:id" element={<Placeholder title={t('chats.title')} />} />
        <Route path="/profile" element={<Placeholder title={t('profile.title')} mascot="portrait" />} />
        <Route path="*" element={<Placeholder title={t('notFound.title')} mascot="question" zarqa={t('notFound.zarqa')} back={false} />} />
      </Routes>
    </BrowserRouter>
  )
}
