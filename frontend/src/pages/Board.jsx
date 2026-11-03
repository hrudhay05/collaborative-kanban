import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import Navbar from '../components/Navbar'
import BoardColumn from '../components/BoardColumn'
import { CardBody } from '../components/TaskCard'
import { useWorkspace } from '../context/WorkspaceContext'
import api from '../services/api'

async function fetchBoard(id) {
  const { data } = await api.get(`/api/boards/${id}`)
  const b = data.board
  return {
    board: { id: b.id, name: b.name, description: b.description },
    columns: [...b.columns]
      .sort((x, y) => x.position - y.position)
      .map((c) => ({
        id: c.id,
        name: c.name,
        tasks: [...c.tasks].sort((x, y) => x.position - y.position),
      })),
  }
}

const findContainer = (cols, itemId) =>
  cols.find((c) => c.id === itemId)?.id ??
  cols.find((c) => c.tasks.some((t) => t.id === itemId))?.id

export default function Board() {
  const { id } = useParams()
  const { tenantId, role } = useWorkspace()
  const [board, setBoard] = useState(null)
  const [columns, setColumns] = useState([])
  const [status, setStatus] = useState('loading')
  const [notice, setNotice] = useState('')
  const [activeTask, setActiveTask] = useState(null)
  const columnsRef = useRef([])
  const snapshot = useRef([])
  columnsRef.current = columns

  const canDelete = role === 'TENANT_ADMIN' || role === 'ORG_ADMIN'
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    setStatus('loading')
    setBoard(null)
    setColumns([])
    setNotice('')
    fetchBoard(id)
      .then((r) => {
        if (cancelled) return
        setBoard(r.board)
        setColumns(r.columns)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [id, tenantId])

  function onDragStart({ active }) {
    snapshot.current = columnsRef.current
    setActiveTask(columnsRef.current.flatMap((c) => c.tasks).find((t) => t.id === active.id) || null)
  }

  function onDragOver({ active, over }) {
    if (!over) return
    setColumns((prev) => {
      const from = findContainer(prev, active.id)
      const to = findContainer(prev, over.id)
      if (!from || !to || from === to) return prev
      const task = prev.find((c) => c.id === from).tasks.find((t) => t.id === active.id)
      const toTasks = prev.find((c) => c.id === to).tasks
      const overIndex = toTasks.findIndex((t) => t.id === over.id)
      const at = overIndex >= 0 ? overIndex : toTasks.length
      return prev.map((c) => {
        if (c.id === from) return { ...c, tasks: c.tasks.filter((t) => t.id !== active.id) }
        if (c.id === to) {
          const tasks = [...c.tasks]
          tasks.splice(at, 0, { ...task, columnId: to })
          return { ...c, tasks }
        }
        return c
      })
    })
  }

  async function onDragEnd({ active, over }) {
    setActiveTask(null)
    const before = snapshot.current
    if (!over) {
      setColumns(before)
      return
    }

    let cols = columnsRef.current
    const toId = findContainer(cols, active.id)
    const toTasks = cols.find((c) => c.id === toId).tasks
    const oldIndex = toTasks.findIndex((t) => t.id === active.id)
    const overIndex = toTasks.findIndex((t) => t.id === over.id)
    const newIndex = overIndex >= 0 && over.id !== active.id ? overIndex : oldIndex
    if (newIndex !== oldIndex) {
      cols = cols.map((c) =>
        c.id === toId ? { ...c, tasks: arrayMove(c.tasks, oldIndex, newIndex) } : c,
      )
      setColumns(cols)
    }

    const fromId = findContainer(before, active.id)
    const fromIndex = before.find((c) => c.id === fromId).tasks.findIndex((t) => t.id === active.id)
    if (fromId === toId && fromIndex === newIndex) return

    const task = before.flatMap((c) => c.tasks).find((t) => t.id === active.id)
    try {
      const { data } = await api.patch(`/api/tasks/${task.id}/move`, {
        columnId: toId,
        index: newIndex,
        version: task.version,
      })
      setColumns((prev) =>
        prev.map((c) => ({
          ...c,
          tasks: c.tasks.map((t) => (t.id === data.task.id ? { ...t, ...data.task } : t)),
        })),
      )
    } catch (err) {
      setNotice(
        err.response?.status === 409
          ? 'Someone else changed this task. The board was refreshed.'
          : 'Move failed. The board was refreshed.',
      )
      setColumns(before)
      try {
        setColumns((await fetchBoard(id)).columns)
      } catch {
        /* keep the snapshot */
      }
    }
  }

  async function addTask(columnId, title) {
    try {
      const { data } = await api.post('/api/tasks', { boardId: id, columnId, title })
      setColumns((prev) =>
        prev.map((c) => (c.id === columnId ? { ...c, tasks: [...c.tasks, data.task] } : c)),
      )
    } catch {
      setNotice('Could not create the task')
    }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return
    try {
      await api.delete(`/api/tasks/${task.id}`, { params: { version: task.version } })
      setColumns((prev) =>
        prev.map((c) => ({ ...c, tasks: c.tasks.filter((t) => t.id !== task.id) })),
      )
    } catch (err) {
      setNotice(
        err.response?.status === 409
          ? 'This task was changed by someone else. The board was refreshed.'
          : 'Could not delete the task',
      )
      fetchBoard(id).then((r) => setColumns(r.columns)).catch(() => {})
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Navbar />
      <main className="p-4">
        <Link to="/" className="text-sm text-blue-600 hover:underline">← All boards</Link>

        {status === 'loading' && <p className="mt-4 text-slate-500">Loading board...</p>}
        {status === 'error' && (
          <p className="mt-4 text-red-600">Board not found in this tenant.</p>
        )}

        {status === 'ready' && board && (
          <>
            <h1 className="mt-2 text-xl font-semibold text-slate-800">{board.name}</h1>
            {board.description && <p className="text-sm text-slate-500">{board.description}</p>}
            {notice && (
              <p className="mt-3 rounded bg-amber-50 p-2 text-sm text-amber-800">
                {notice}{' '}
                <button onClick={() => setNotice('')} className="underline">Dismiss</button>
              </p>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDragCancel={() => {
                setActiveTask(null)
                setColumns(snapshot.current)
              }}
            >
              <div className="mt-4 flex items-start gap-4 overflow-x-auto pb-4">
                {columns.map((col) => (
                  <BoardColumn
                    key={col.id}
                    column={col}
                    canDelete={canDelete}
                    onAdd={addTask}
                    onDelete={deleteTask}
                  />
                ))}
              </div>
              <DragOverlay>{activeTask ? <CardBody task={activeTask} /> : null}</DragOverlay>
            </DndContext>
          </>
        )}
      </main>
    </div>
  )
}