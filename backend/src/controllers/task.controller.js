import { z } from 'zod';
import asyncHandler from '../utils/asyncHandler.js';
import * as taskService from '../services/task.service.js';

const uuid = z.string().uuid();
const idParam = z.object({ id: uuid });
const version = z.number().int().min(1);

const title = z.string().trim().min(1).max(200);
const description = z.string().trim().max(2000).nullable();
const priority = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const dueDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date')
  .transform((s) => new Date(s))
  .nullable();

const createBody = z.object({
  boardId: uuid,
  columnId: uuid,
  title,
  description: description.optional(),
  assignedTo: uuid.nullable().optional(),
  priority: priority.optional(),
  dueDate: dueDate.optional(),
});

const updateBody = z
  .object({
    version,
    title: title.optional(),
    description: description.optional(),
    assignedTo: uuid.nullable().optional(),
    priority: priority.optional(),
    dueDate: dueDate.optional(),
  })
  .refine((d) => Object.keys(d).some((k) => k !== 'version'), {
    message: 'Provide at least one field to change',
  });

const moveBody = z.object({
  columnId: uuid,
  index: z.number().int().min(0),
  version,
});

export const list = asyncHandler(async (req, res) => {
  const { boardId } = z.object({ boardId: uuid }).parse(req.query);
  res.json({ tasks: await taskService.listTasks(req.tenant.id, boardId) });
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ task: await taskService.getTask(req.tenant.id, id) });
});

export const create = asyncHandler(async (req, res) => {
  const data = createBody.parse(req.body);
  res.status(201).json({ task: await taskService.createTask(req.tenant, req.user.id, data) });
});

export const update = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = updateBody.parse(req.body);
  res.json({ task: await taskService.updateTask(req.tenant, req.user.id, id, data) });
});

export const move = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = moveBody.parse(req.body);
  res.json({ task: await taskService.moveTask(req.tenant, req.user.id, id, data) });
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const q = z.object({ version: z.coerce.number().int().min(1).optional() }).parse(req.query);
  const task = await taskService.deleteTask(req.tenant, req.user.id, id, q.version);
  res.json({ deleted: true, task });
});

export const activity = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ activity: await taskService.getActivity(req.tenant.id, id) });
});