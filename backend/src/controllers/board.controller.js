import { z } from 'zod';
import asyncHandler from '../utils/asyncHandler.js';
import * as boardService from '../services/board.service.js';

const idParam = z.object({ id: z.string().uuid() });
const name = z.string().trim().min(1).max(100);
const description = z.string().trim().max(500).nullable();

const createBody = z.object({ name, description: description.optional() });
const updateBody = z
  .object({ name: name.optional(), description: description.optional() })
  .refine((d) => d.name !== undefined || d.description !== undefined, {
    message: 'Provide name or description',
  });

export const list = asyncHandler(async (req, res) => {
  res.json({ boards: await boardService.listBoards(req.tenant.id) });
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ board: await boardService.getBoard(req.tenant.id, id) });
});

export const create = asyncHandler(async (req, res) => {
  const data = createBody.parse(req.body);
  const board = await boardService.createBoard(req.tenant, req.user.id, data);
  res.status(201).json({ board });
});

export const update = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = updateBody.parse(req.body);
  res.json({ board: await boardService.updateBoard(req.tenant.id, id, data) });
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  await boardService.deleteBoard(req.tenant.id, id);
  res.json({ deleted: true });
});