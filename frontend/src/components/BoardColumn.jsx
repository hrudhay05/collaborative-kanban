import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'

export default function BoardColumn({ column, canDelete, memberNames, onAdd, onDelete, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const [title, setTitle] = useState('')

  async function submit(e) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    setTitle('')
    await onAdd(column.id, t)
  }

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-200/70 p-2">
      <h2 className="px-2 py-1 text-sm font-semibold text-slate-700">
        {column.name} <span className="font-normal text-slate-500">({column.tasks.length})</span>
      </h2>
      <div
        ref={setNodeRef}
        className={`min-h-16 flex-1 space-y-2 rounded p-1 ${isOver ? 'bg-blue-100/60' : ''}`}
      >
        <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {column.tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              canDelete={canDelete}
              memberNames={memberNames}
              onDelete={onDelete}
              onOpen={onOpen}
            />
          ))}
        </SortableContext>
      </div>
      <form onSubmit={submit} className="mt-2 flex gap-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task"
          maxLength={200}
          className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500"
        />
        <button className="rounded bg-blue-600 px-2 text-sm text-white hover:bg-blue-700">Add</button>
      </form>
    </div>
  )
}