import prisma from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { verifyToken } from '../utils/jwt.js';

export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing or malformed Authorization header');
  }

  let payload;
  try {
    payload = verifyToken(header.slice(7));
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }

  // Confirm the user still exists; identity comes only from the verified token
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new AppError(401, 'User no longer exists');

  req.user = user;
  next();
});