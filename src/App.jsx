import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Results from './pages/Results.jsx'
import NeighborhoodDetail from './pages/neighborhood/NeighborhoodDetail.jsx'
import Compare from './pages/Compare.jsx'
import Saved from './pages/Saved.jsx'
import Alerts from './pages/Alerts.jsx'
import AskNestIQ from './pages/AskNestIQ.jsx'
import SignIn from './pages/SignIn.jsx'
import AppLayout from './components/layout/AppLayout.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/signin" element={<SignIn />} />
      <Route element={<AppLayout />}>
        <Route path="/results" element={<Results />} />
        <Route path="/neighborhood/:id" element={<NeighborhoodDetail />} />
        <Route path="/neighborhood/:id/:tab" element={<NeighborhoodDetail />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/ask" element={<AskNestIQ />} />
      </Route>
    </Routes>
  )
}
