import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

async function assertBoard(db, tenantId, boardId) {
  const board = await db.board.findFirst({ where: { id: boardId, tenantId }, select: { id: true } });
  if (!board) throw new AppError(404, 'Board not found');
}

export async function listColumns(tenantId, boardId) {
  await assertBoard(prisma, tenantId, boardId);
  return prisma.column.findMany({
    where: { boardId, tenantId },
    orderBy: { position: 'asc' },
  });
}

// Server decides the position: new columns always go at the end
export async function createColumn(tenantId, boardId, name) {
  return prisma.$transaction(async (tx) => {
    await assertBoard(tx, tenantId, boardId);
    const agg = await tx.column.aggregate({
      where: { boardId, tenantId },
      _max: { position: true },
    });
    const position = (agg._max.position ?? -1) + 1;
    return tx.column.create({ data: { boardId, tenantId, name, position } });
  });
}

export async function updateColumn(tenantId, columnId, { name, position }) {
  return prisma.$transaction(async (tx) => {
    const col = await tx.column.findFirst({ where: { id: columnId, tenantId } });
    if (!col) throw new AppError(404, 'Column not found');

    if (name !== undefined) {
      await tx.column.update({ where: { id: col.id }, data: { name } });
    }

    if (position !== undefined) {
      const siblings = await tx.column.findMany({
        where: { boardId: col.boardId, tenantId },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      const ids = siblings.map((c) => c.id).filter((id) => id !== col.id);
      ids.splice(Math.min(position, ids.length), 0, col.id);
      for (let i = 0; i < ids.length; i++) {
        await tx.column.update({ where: { id: ids[i] }, data: { position: i } });
      }
    }

    return tx.column.findUnique({ where: { id: col.id } });
  });
}

export async function deleteColumn(tenantId, columnId) {
  const col = await prisma.column.findFirst({
    where: { id: columnId, tenantId },
    include: { _count: { select: { tasks: true } } },
  });
  if (!col) throw new AppError(404, 'Column not found');
  if (col._count.tasks > 0) {
    throw new AppError(409, 'Column still has tasks. Move or delete them first');
  }
  await prisma.column.deleteMany({ where: { id: columnId, tenantId } });
}