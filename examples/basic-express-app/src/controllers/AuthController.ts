import { Request, Response } from 'express';

export class AuthController {
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      
      // Validate credentials
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      // Mock authentication logic
      if (email === 'admin@example.com' && password === 'password') {
        return res.status(200).json({
          success: true,
          data: {
            token: 'mock-jwt-token',
            user: { email, id: '1' }
          }
        });
      }

      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async register(req: Request, res: Response) {
    try {
      const { email, password, username } = req.body;

      // Validate required fields
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      // Mock user creation
      return res.status(201).json({
        success: true,
        data: {
          id: '2',
          email,
          username: username || email.split('@')[0]
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async logout(req: Request, res: Response) {
    try {
      // Mock logout logic
      return res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Refresh token is required'
        });
      }

      // Mock token refresh
      return res.status(200).json({
        success: true,
        data: {
          token: 'new-mock-jwt-token'
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}

export const authController = new AuthController();
