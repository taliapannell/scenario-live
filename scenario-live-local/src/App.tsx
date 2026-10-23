import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import SignIn from './pages/SignIn'
import PresenterPage from './pages/Presenter'
import ConversationPage from './pages/Conversation'
import Insights from './pages/Insights'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/presenter" replace />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/presenter" element={<PresenterPage />} />
        <Route path="/conversation/:userId" element={<ConversationPage />} />
        <Route path="/insights/:sessionId" element={<Insights />} />
        <Route path="*" element={<Navigate to="/presenter" replace />} />
      </Routes>
    </Router>
  )
}

export default App
