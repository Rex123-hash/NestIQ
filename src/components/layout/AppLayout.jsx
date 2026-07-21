import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import MobileNav from './MobileNav.jsx'

// Shared shell for all authenticated app screens (Results, Detail, Compare,
// Saved, Alerts, Ask NestIQ). Marketing Home page does NOT use this.
export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Below `lg` the sidebar is hidden; this is the only way to reach
            Compare, Saved, Alerts and Ask NestIQ on a phone. */}
        <MobileNav />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
