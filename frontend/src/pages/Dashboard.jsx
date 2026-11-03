import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import { useWorkspace } from '../context/WorkspaceContext'
import api from '../services/api'

export default function Dashboard() {
  const { tenantId, currentTenant, loading: wsLoading, error: wsError } = useWorkspace()
  const [boards, setBoards] = useState([])
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    setBoards([])
    if (!tenantId) {
      setStatus('idle')
      return
    }
    let cancelled = false
    setStatus('loading')
    api
      .get('/api/boards')
      .then((res) => {
        if (cancelled) return
        setBoards(res.data.boards)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [tenantId])

  return (
    <div className="min-h-screen bg-slate-100">
      <Navbar />
      <main className="mx-auto max-w-4xl p-6">
        {wsLoading && <p className="text-slate-500">Loading workspace...</p>}
        {wsError && <p className="text-red-600">{wsError}</p>}
        {!wsLoading && !currentTenant && !wsError && (
          <p className="text-slate-500">You have no tenants in this organization.</p>
        )}

        {currentTenant && (
          <>
            <h1 className="mb-4 text-xl font-semibold text-slate-800">
              {currentTenant.name} boards
            </h1>
            {status === 'loading' && <p className="text-slate-500">Loading boards...</p>}
            {status === 'error' && <p className="text-red-600">Could not load boards</p>}
            {status === 'ready' && boards.length === 0 && (
              <p className="text-slate-500">No boards yet.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {boards.map((b) => (
                <div key={b.id} className="rounded-lg bg-white p-4 shadow-sm">
                  <h2 className="font-medium text-slate-800">{b.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{b.description || 'No description'}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}