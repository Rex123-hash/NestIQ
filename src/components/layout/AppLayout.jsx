import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'

// Shared shell for all authenticated app screens (Results, Detail, Compare,
// Saved, Alerts, Ask NestIQ). Marketing Home page does NOT use this.
export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
