import { useEffect, useState } from 'react'
import api from '../services/api'

const toDraft = (t) => ({
  title: t.title,
  description: t.description ?? '',
  priority: t.priority,
  dueDate: t.dueDate ? t.dueDate.slice(0, 10) : '',
  assignedTo: t.assignedTo ?? '',
})

function describe(a) {
  const who = a.user?.name ?? 'Someone'
  const d = a.details ?? {}
  switch (a.action) {
    case 'CREATED':
      return `${who} created this task${d.column ? ` in "${d.column}"` : ''}`
    case 'UPDATED':
      return `${who} edited ${Array.isArray(d.changed) ? d.changed.join(', ') : 'this task'}`
    case 'MOVED':
      return `${who} moved it${d.from && d.to ? ` from "${d.from.name}" to "${d.to.name}"` : ''}`
    case 'DELETED':
      return `${who} deleted this task`
    default:
      return `${who} ${String(a.action).toLowerCase()}`
  }
}

const field =
  'mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm outline-none focus:border-blue-500'

export default function TaskDetails({ task, members, canDelete, onClose, onSaved, onDelete }) {
  const [base, setBase] = useState(task)
  const [draft, setDraft] = useState(() => toDraft(task))
  const [stale, setStale] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [activity, setActivity] = useState([])

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(base))

  useEffect(() => {
    if (task.version === base.version) return
    if (!dirty) {
      setBase(task)
      setDraft(toDraft(task))
      setStale(false)
    } else {
      setStale(true)
    }
  }, [task.version])

  useEffect(() => {
    let cancelled = false
    api
      .get(`/api/tasks/${task.id}/activity`)
      .then((r) => {
        if (!cancelled) setActivity(r.data.activity)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [task.id, task.version])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function loadLatest() {
    setBase(task)
    setDraft(toDraft(task))
    setStale(false)
    setConflict(false)
    setError('')
  }

  async function save(e) {
    e.preventDefault()
    if (!draft.title.trim()) {
      setError('Title is required')
      return
    }
    const b = toDraft(base)
    const changes = {}
    if (draft.title.trim() !== b.title) changes.title = draft.title.trim()
    if (draft.description.trim() !== b.description.trim()) changes.description = draft.description.trim() || null
    if (draft.priority !== b.priority) changes.priority = draft.priority
    if (draft.dueDate !== b.dueDate) changes.dueDate = draft.dueDate || null
    if (draft.assignedTo !== b.assignedTo) changes.assignedTo = draft.assignedTo || null
    if (Object.keys(changes).length === 0) return

    setSaving(true)
    setError('')
    setConflict(false)
    try {
      const { data } = await api.patch(`/api/tasks/${task.id}`, { version: base.version, ...changes })
      setBase(data.task)
      setDraft(toDraft(data.task))
      setStale(false)
      onSaved(data.task)
    } catch (err) {
      if (err.response?.status === 409) {
        setConflict(true)
        const current = err.response.data?.details?.current
        if (current) onSaved(current)
        else api.get(`/api/tasks/${task.id}`).then((r) => onSaved(r.data.task)).catch(() => {})
      } else {
        setError(err.response?.data?.error || 'Could not save changes')
      }
    } finally {
      setSaving(false)
    }
  }

  const knownAssignee = members.some((m) => m.id === draft.assignedTo)

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Task details</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-2xl leading-none text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        {(conflict || stale) && (
          <div
            className={`mt-3 rounded p-2 text-sm ${
              conflict ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {conflict
              ? 'Someone else updated this task, so your changes were not saved.'
              : 'Someone else updated this task while you were editing.'}{' '}
            <button onClick={loadLatest} className="underline">
              Load latest (discard my edits)
            </button>
          </div>
        )}

        <form onSubmit={save} className="mt-4 space-y-3">
          <label className="block text-sm text-slate-600">
            Title
            <input
              className={field}
              value={draft.title}
              maxLength={200}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="block text-sm text-slate-600">
            Description
            <textarea
              className={field}
              rows={4}
              maxLength={2000}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-slate-600">
              Priority
              <select
                className={field}
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
            <label className="block text-sm text-slate-600">
              Due date
              <input
                type="date"
                className={field}
                value={draft.dueDate}
                onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
              />
            </label>
          </div>
          <label className="block text-sm text-slate-600">
            Assignee
            <select
              className={field}
              value={draft.assignedTo}
              onChange={(e) => setDraft({ ...draft, assignedTo: e.target.value })}
            >
              <option value="">Unassigned</option>
              {draft.assignedTo && !knownAssignee && (
                <option value={draft.assignedTo}>Unknown user</option>
              )}
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

          <div className="flex gap-2">
            <button
              disabled={!dirty || saving}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => setDraft(toDraft(base))}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
              >
                Discard
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(task)}
                className="ml-auto rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </div>
        </form>

        <p className="mt-4 text-xs text-slate-500">
          Created {new Date(task.createdAt).toLocaleString()} · Updated{' '}
          {new Date(task.updatedAt).toLocaleString()} · Version {task.version}
        </p>

        <h3 className="mt-5 mb-2 text-sm font-semibold text-slate-700">Activity</h3>
        <ul className="space-y-2">
          {activity.map((a) => (
            <li key={a.id} className="rounded bg-slate-50 p-2 text-sm text-slate-700">
              {describe(a)}
              <div className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</div>
            </li>
          ))}
          {activity.length === 0 && <li className="text-sm text-slate-400">No activity yet.</li>}
        </ul>
      </aside>
    </div>
  )
}