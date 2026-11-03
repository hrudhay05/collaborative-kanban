import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';

const DEFAULT_COLUMNS = ['To Do', 'In Progress', 'Testing', 'Done'];

export async function listBoards(tenantId) {
  const boards = await prisma.board.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { tasks: true } } },
  });
  return boards.map(({ _count, ...b }) => ({ ...b, taskCount: _count.tasks }));
}

export async function getBoard(tenantId, boardId) {
  const board = await prisma.board.findFirst({
    where: { id: boardId, tenantId },
    include: {
      columns: {
        where: { tenantId },
        orderBy: { position: 'asc' },
        include: { tasks: { where: { tenantId }, orderBy: { position: 'asc' } } },
      },
    },
  });
  if (!board) throw new AppError(404, 'Board not found');
  return board;
}

export async function createBoard(tenant, userId, { name, description }) {
  return prisma.$transaction(async (tx) => {
    const board = await tx.board.create({
      data: {
        organizationId: tenant.organizationId,
        tenantId: tenant.id,
        name,
        description: description ?? null,
        createdBy: userId,
      },
    });
    await tx.column.createMany({
      data: DEFAULT_COLUMNS.map((colName, i) => ({
        boardId: board.id,
        tenantId: tenant.id,
        name: colName,
        position: i,
      })),
    });
    return tx.board.findUnique({
      where: { id: board.id },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
  });
}

export async function updateBoard(tenantId, boardId, data) {
  const result = await prisma.board.updateMany({ where: { id: boardId, tenantId }, data });
  if (result.count === 0) throw new AppError(404, 'Board not found');
  return prisma.board.findFirst({ where: { id: boardId, tenantId } });
}

export async function deleteBoard(tenantId, boardId) {
  const result = await prisma.board.deleteMany({ where: { id: boardId, tenantId } });
  if (result.count === 0) throw new AppError(404, 'Board not found');
}