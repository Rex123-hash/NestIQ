import { Component, lazy, Suspense } from 'react'
import { Link, Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout.jsx'
import CursorHalo from './components/ui/CursorHalo.jsx'

const Home = lazy(() => import('./pages/Home.jsx'))
const Results = lazy(() => import('./pages/Results.jsx'))
const NeighborhoodDetail = lazy(() => import('./pages/neighborhood/NeighborhoodDetail.jsx'))
const Compare = lazy(() => import('./pages/Compare.jsx'))
const Saved = lazy(() => import('./pages/Saved.jsx'))
const Alerts = lazy(() => import('./pages/Alerts.jsx'))
const AskNestIQ = lazy(() => import('./pages/AskNestIQ.jsx'))
const SignIn = lazy(() => import('./pages/SignIn.jsx'))

export function RouteFallback() {
  return (
    <div className="grid min-h-[35vh] place-items-center px-6 text-center" role="status" aria-live="polite">
      <div>
        <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
        <p className="mt-3 text-sm font-medium text-ink-soft">Preparing NestIQ…</p>
      </div>
    </div>
  )
}

class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-[45vh] place-items-center px-6 text-center" role="alert">
        <div className="max-w-md rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h1 className="font-serif text-2xl text-ink">This page could not finish loading</h1>
          <p className="mt-2 text-sm text-muted">Your data is safe. Refresh to download the latest NestIQ page files.</p>
          <button type="button" onClick={() => window.location.reload()} className="btn-primary mt-5">Refresh page</button>
        </div>
      </div>
    )
  }
}

function NotFound() {
  return (
    <div className="grid min-h-[70vh] place-items-center px-6 text-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">404</p>
        <h1 className="mt-2 font-serif text-3xl text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-muted">The NestIQ page you requested does not exist.</p>
        <Link to="/" className="btn-primary mt-5 inline-flex">Return home</Link>
      </div>
    </div>
  )
}

function page(Component) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Component />
      </Suspense>
    </RouteErrorBoundary>
  )
}

export default function App() {
  return (
    <>
      <CursorHalo />
    <Routes>
      <Route path="/" element={page(Home)} />
      <Route path="/signin" element={page(SignIn)} />
      <Route element={<AppLayout />}>
        <Route path="/results" element={page(Results)} />
        <Route path="/neighborhood/:id" element={page(NeighborhoodDetail)} />
        <Route path="/neighborhood/:id/:tab" element={page(NeighborhoodDetail)} />
        <Route path="/compare" element={page(Compare)} />
        <Route path="/saved" element={page(Saved)} />
        <Route path="/alerts" element={page(Alerts)} />
        <Route path="/ask" element={page(AskNestIQ)} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  )
}
