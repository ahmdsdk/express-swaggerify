import { Request, Response, NextFunction } from 'express';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'No authorization header provided'
      });
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }

    // Mock token validation - in a real app, verify JWT here
    if (token === 'mock-jwt-token') {
      // Attach user to request (in a real app, decode from JWT)
      (req as any).user = { id: '1', email: 'admin@example.com' };
      return next();
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

