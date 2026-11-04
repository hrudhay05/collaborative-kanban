import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const colors = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-green-100 text-green-700',
}

export function CardBody({ task, canDelete, onDelete, memberNames, onOpen }) {
  const assignee = task.assignedTo ? memberNames?.[task.assignedTo] : null
  return (
    <div
      onClick={() => onOpen?.(task)}
      className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-blue-300"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">{task.title}</p>
        {canDelete && onDelete && (
          <button
            aria-label="Delete task"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onDelete(task)
            }}
            className="text-slate-400 hover:text-red-600"
          >
            ×
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-1.5 py-0.5 ${colors[task.priority]}`}>{task.priority}</span>
        {task.dueDate && <span className="text-slate-500">Due {task.dueDate.slice(0, 10)}</span>}
        {assignee && <span className="ml-auto text-slate-600">{assignee}</span>}
      </div>
    </div>
  )
}

export default function TaskCard(props) {
  const { task } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none">
      <CardBody {...props} />
    </div>
  )
}