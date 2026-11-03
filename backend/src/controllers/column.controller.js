import { z } from 'zod';
import asyncHandler from '../utils/asyncHandler.js';
import * as columnService from '../services/column.service.js';

const idParam = z.object({ id: z.string().uuid() });
const name = z.string().trim().min(1).max(50);

const createBody = z.object({ name });
const updateBody = z
  .object({ name: name.optional(), position: z.number().int().min(0).optional() })
  .refine((d) => d.name !== undefined || d.position !== undefined, {
    message: 'Provide name or position',
  });

export const list = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ columns: await columnService.listColumns(req.tenant.id, id) });
});

export const create = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { name: colName } = createBody.parse(req.body);
  const column = await columnService.createColumn(req.tenant.id, id, colName);
  res.status(201).json({ column });
});

export const update = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = updateBody.parse(req.body);
  res.json({ column: await columnService.updateColumn(req.tenant.id, id, data) });
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  await columnService.deleteColumn(req.tenant.id, id);
  res.json({ deleted: true });
});