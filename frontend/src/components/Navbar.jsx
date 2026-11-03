import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'

const select = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { organizations, orgTenants, orgId, tenantId, role, selectOrg, selectTenant } = useWorkspace()

  return (
    <header className="flex flex-wrap items-center gap-3 border-b bg-white px-4 py-3">
      <span className="font-semibold text-slate-800">Kanban</span>

      <label className="flex items-center gap-1 text-xs text-slate-500">
        Organization
        <select className={select} value={orgId ?? ''} onChange={(e) => selectOrg(e.target.value)}>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1 text-xs text-slate-500">
        Tenant
        <select className={select} value={tenantId ?? ''} onChange={(e) => selectTenant(e.target.value)}>
          {orgTenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>

      {role && <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{role}</span>}

      <div className="ml-auto flex items-center gap-3 text-sm">
        <span className="text-slate-600">{user.name}</span>
        <button onClick={logout} className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100">
          Log out
        </button>
      </div>
    </header>
  )
}