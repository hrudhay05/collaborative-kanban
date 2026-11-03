import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [tenants, setTenants] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/api/tenants')
      .then((res) => setTenants(res.data.tenants))
      .catch(() => setError('Could not load tenants'))
  }, [])

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{user.name}</h1>
          <p className="text-sm text-slate-500">{user.email}</p>
        </div>
        <button onClick={logout} className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100">
          Log out
        </button>
      </div>
      <h2 className="mt-8 mb-2 font-medium text-slate-700">Your tenants</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="space-y-2">
        {tenants.map((x) => {
          const t = x.tenant ?? x
          return (
            <li key={t.id} className="flex justify-between rounded bg-white p-3 shadow-sm">
              <span>{t.name}</span>
              <span className="text-xs text-slate-500">{x.role ?? t.role}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}