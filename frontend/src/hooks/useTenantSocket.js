import { useEffect, useRef, useState } from 'react'
import { getSocket } from '../services/socket'

const EVENTS = ['task:created', 'task:updated', 'task:moved', 'task:deleted', 'board:updated']

export default function useTenantSocket(tenantId, handlers) {
  const [online, setOnline] = useState([])
  const [lost, setLost] = useState(false)
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    if (!tenantId) return
    const socket = getSocket()
    setOnline([])

    const join = () =>
      socket.emit('tenant:join', { tenantId }, (res) => {
        if (res?.ok) {
          setOnline(res.online)
          ref.current.onJoined?.()
        } else {
          ref.current.onDenied?.()
        }
      })

    const onConnect = () => {
      setLost(false)
      join()
    }
    const onLost = () => setLost(true)
    const onPresence = (p) => {
      if (p.tenantId === tenantId) setOnline(p.users)
    }
    const listeners = EVENTS.map((ev) => [ev, (payload) => ref.current.onEvent?.(ev, payload)])

    socket.on('connect', onConnect)
    socket.on('disconnect', onLost)
    socket.on('connect_error', onLost)
    socket.on('presence:update', onPresence)
    listeners.forEach(([ev, fn]) => socket.on(ev, fn))

    if (socket.connected) join()
    else socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onLost)
      socket.off('connect_error', onLost)
      socket.off('presence:update', onPresence)
      listeners.forEach(([ev, fn]) => socket.off(ev, fn))
      if (socket.connected) socket.emit('tenant:leave', { tenantId })
    }
  }, [tenantId])

  return { online, lost }
}