import { createContext, useContext, useEffect, useState } from 'react'
import api from '../services/api'
import { useAuth } from './AuthContext'

const WorkspaceContext = createContext(null)
export const useWorkspace = () => useContext(WorkspaceContext)

export function WorkspaceProvider({ children }) {
  const { user } = useAuth()
  const [organizations, setOrganizations] = useState([])
  const [tenants, setTenants] = useState([])
  const [orgId, setOrgId] = useState(null)
  const [tenantId, setTenantId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function choose(nextOrgId, nextTenantId) {
    if (nextTenantId) localStorage.setItem('tenantId', nextTenantId)
    else localStorage.removeItem('tenantId')
    if (nextOrgId) localStorage.setItem('orgId', nextOrgId)
    else localStorage.removeItem('orgId')
    setOrgId(nextOrgId)
    setTenantId(nextTenantId)
  }

  useEffect(() => {
       if (!user) {
      setOrganizations([])
      setTenants([])
      setOrgId(null)
      setTenantId(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([api.get('/api/organizations'), api.get('/api/tenants')])
      .then(([o, t]) => {
        if (cancelled) return
        const orgs = o.data.organizations
        const tens = t.data.tenants
        setOrganizations(orgs)
        setTenants(tens)

        const savedOrg = orgs.find((x) => x.id === localStorage.getItem('orgId'))
        const org = savedOrg || orgs.find((x) => tens.some((y) => y.organizationId === x.id)) || orgs[0]
        const orgTenants = org ? tens.filter((y) => y.organizationId === org.id) : []
        const savedTenant = orgTenants.find((x) => x.id === localStorage.getItem('tenantId'))
        choose(org?.id ?? null, (savedTenant || orgTenants[0])?.id ?? null)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your organizations')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  function selectOrg(id) {
    const first = tenants.filter((t) => t.organizationId === id)[0]
    choose(id, first?.id ?? null)
  }

  function selectTenant(id) {
    choose(orgId, id)
  }

  const orgTenants = tenants.filter((t) => t.organizationId === orgId)
  const currentOrg = organizations.find((o) => o.id === orgId) || null
  const currentTenant = orgTenants.find((t) => t.id === tenantId) || null

  return (
    <WorkspaceContext.Provider
      value={{
        organizations, orgTenants, currentOrg, currentTenant,
        orgId, tenantId, role: currentTenant?.role ?? null,
        loading, error, selectOrg, selectTenant,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}