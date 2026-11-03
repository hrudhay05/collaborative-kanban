import 'dotenv/config';

export const env = {
  PORT: process.env.PORT || 5000,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
};

if (!env.JWT_SECRET) {
  throw new Error('JWT_SECRET is missing in backend/.env');
}