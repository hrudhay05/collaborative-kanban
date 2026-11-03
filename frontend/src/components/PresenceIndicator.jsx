export default function PresenceIndicator({ users, meId }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <span className="h-2 w-2 rounded-full bg-green-500" />
      {users.length} online
      <div className="flex -space-x-1">
        {users.map((u) => (
          <span
            key={u.id}
            title={u.id === meId ? `${u.name} (you)` : u.name}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-white bg-blue-600 text-[10px] font-medium text-white"
          >
            {u.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  )
}