import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import { resolveTenantAccess } from './access.service.js';

const GAP = 1000;
const MAX_POSITION = 2_000_000_000;

// Where would a task land at `index` among `list`? null means no integer gap is left.
function slotPosition(list, index) {
  if (list.length === 0) return GAP;
  if (index >= list.length) {
    const p = list[list.length - 1].position + GAP;
    return p <= MAX_POSITION ? p : null;
  }
  const next = list[index].position;
  const prev = index === 0 ? 0 : list[index - 1].position;
  const mid = Math.floor((prev + next) / 2);
  return mid > prev && mid < next ? mid : null;
}

// Server decides the order. Rebalances the column to 1000, 2000, ... when gaps run out.
async function placeAt(tx, tenantId, columnId, excludeTaskId, index) {
  const list = await tx.task.findMany({
    where: { columnId, tenantId, ...(excludeTaskId ? { id: { not: excludeTaskId } } : {}) },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: { id: true, position: true },
  });
  const i = Math.max(0, Math.min(index, list.length));
  let pos = slotPosition(list, i);
  if (pos === null) {
    for (let k = 0; k < list.length; k++) {
      list[k].position = (k + 1) * GAP;
      await tx.task.updateMany({
        where: { id: list[k].id, tenantId },
        data: { position: list[k].position },
      });
    }
    pos = slotPosition(list, i);
  }
  return pos;
}

// Lock column rows in a fixed order so concurrent moves cannot deadlock
async function lockColumns(tx, tenantId, columnIds) {
  const ids = [...new Set(columnIds)].sort();
  for (const id of ids) {
    await tx.$queryRaw`SELECT id FROM "columns" WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid FOR UPDATE`;
  }
}

async function throwStaleOrMissing(db, tenantId, taskId) {
  const current = await db.task.findFirst({ where: { id: taskId, tenantId } });
  if (!current) throw new AppError(404, 'Task not found');
  throw new AppError(409, 'Task was modified by someone else', { current });
}

const log = (tx, tenantId, userId, taskId, action, details) =>
  tx.activityLog.create({
    data: { tenantId, userId, entityType: 'TASK', entityId: taskId, action, details },
  });

async function assertAssignee(tenant, assignedTo) {
  if (!assignedTo) return;
  const access = await resolveTenantAccess(assignedTo, tenant.id);
  if (!access) throw new AppError(400, 'Assignee does not belong to this tenant');
}

export async function listTasks(tenantId, boardId) {
  const board = await prisma.board.findFirst({ where: { id: boardId, tenantId }, select: { id: true } });
  if (!board) throw new AppError(404, 'Board not found');
  return prisma.task.findMany({
    where: { boardId, tenantId },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
}

export async function getTask(tenantId, taskId) {
  const task = await prisma.task.findFirst({ where: { id: taskId, tenantId } });
  if (!task) throw new AppError(404, 'Task not found');
  return task;
}

export async function createTask(tenant, userId, data) {
  await assertAssignee(tenant, data.assignedTo);
  return prisma.$transaction(async (tx) => {
    const column = await tx.column.findFirst({
      where: { id: data.columnId, boardId: data.boardId, tenantId: tenant.id },
    });
    if (!column) throw new AppError(404, 'Board or column not found');

    await lockColumns(tx, tenant.id, [column.id]);
    const position = await placeAt(tx, tenant.id, column.id, null, Number.MAX_SAFE_INTEGER);

    const task = await tx.task.create({
      data: {
        boardId: data.boardId,
        columnId: column.id,
        tenantId: tenant.id,
        title: data.title,
        description: data.description,
        assignedTo: data.assignedTo,
        priority: data.priority,
        dueDate: data.dueDate,
        position,
      },
    });
    await log(tx, tenant.id, userId, task.id, 'CREATED', {
      title: task.title,
      columnId: column.id,
      column: column.name,
    });
    return task;
  });
}

export async function updateTask(tenant, userId, taskId, { version, ...fields }) {
  const data = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  await assertAssignee(tenant, data.assignedTo);

  return prisma.$transaction(async (tx) => {
    // The version in the WHERE clause is the optimistic lock
    const result = await tx.task.updateMany({
      where: { id: taskId, tenantId: tenant.id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) await throwStaleOrMissing(tx, tenant.id, taskId);

    const task = await tx.task.findUnique({ where: { id: taskId } });
    await log(tx, tenant.id, userId, taskId, 'UPDATED', {
      changed: Object.keys(data),
      version: task.version,
    });
    return task;
  });
}

export async function moveTask(tenant, userId, taskId, { columnId, index, version }) {
  return prisma.$transaction(async (tx) => {
    const first = await tx.task.findFirst({ where: { id: taskId, tenantId: tenant.id } });
    if (!first) throw new AppError(404, 'Task not found');

    const dest = await tx.column.findFirst({
      where: { id: columnId, boardId: first.boardId, tenantId: tenant.id },
    });
    if (!dest) throw new AppError(404, 'Column not found on this board');

    await lockColumns(tx, tenant.id, [first.columnId, dest.id]);

    // Re-read after the locks: someone may have changed the task while we waited
    const task = await tx.task.findFirst({ where: { id: taskId, tenantId: tenant.id } });
    if (!task) throw new AppError(404, 'Task not found');
    if (task.version !== version) {
      throw new AppError(409, 'Task was modified by someone else', { current: task });
    }

    const position = await placeAt(tx, tenant.id, dest.id, task.id, index);

    const result = await tx.task.updateMany({
      where: { id: task.id, tenantId: tenant.id, version },
      data: { columnId: dest.id, position, version: { increment: 1 } },
    });
    if (result.count === 0) await throwStaleOrMissing(tx, tenant.id, task.id);

    const updated = await tx.task.findUnique({ where: { id: task.id } });
    const fromColumn = await tx.column.findUnique({
      where: { id: task.columnId },
      select: { id: true, name: true },
    });
    await log(tx, tenant.id, userId, task.id, 'MOVED', {
      from: fromColumn,
      to: { id: dest.id, name: dest.name },
      position,
      version: updated.version,
    });
    return updated;
  });
}

export async function deleteTask(tenant, userId, taskId, version) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id: taskId, tenantId: tenant.id } });
    if (!task) throw new AppError(404, 'Task not found');
    if (version !== undefined && task.version !== version) {
      throw new AppError(409, 'Task was modified by someone else', { current: task });
    }

    const result = await tx.task.deleteMany({
      where: { id: taskId, tenantId: tenant.id, ...(version !== undefined ? { version } : {}) },
    });
    if (result.count === 0) await throwStaleOrMissing(tx, tenant.id, taskId);

    await log(tx, tenant.id, userId, taskId, 'DELETED', {
      title: task.title,
      columnId: task.columnId,
    });
    return task;
  });
}

// History stays readable after a task is deleted (logs have no FK to tasks)
export async function getActivity(tenantId, taskId) {
  const logs = await prisma.activityLog.findMany({
    where: { tenantId, entityType: 'TASK', entityId: taskId },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, name: true } } },
  });
  if (logs.length === 0) throw new AppError(404, 'Task not found');
  return logs;
}