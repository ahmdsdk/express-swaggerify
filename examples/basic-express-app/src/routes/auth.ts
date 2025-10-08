import { Router } from 'express';
import { authController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { loginSchema, registerSchema } from '../schemas/authSchemas';

const router = Router();

// Login endpoint
router.post(
  '/login',
  validate(loginSchema),
  authController.login
);

// Register endpoint
router.post(
  '/register',
  validate(registerSchema),
  authController.register
);

// Logout endpoint
router.post(
  '/logout',
  authenticate,
  authController.logout
);

// Refresh token endpoint
router.post(
  '/refresh',
  authController.refreshToken
);

export default router;
