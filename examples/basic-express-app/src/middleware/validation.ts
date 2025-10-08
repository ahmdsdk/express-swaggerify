import { Request, Response, NextFunction } from 'express';

export const validate = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Simple validation - in a real app, use Joi, Zod, or similar
      const errors: string[] = [];

      if (schema.required) {
        for (const field of schema.required) {
          if (!req.body[field]) {
            errors.push(`${field} is required`);
          }
        }
      }

      if (schema.fields) {
        for (const [field, rules] of Object.entries(schema.fields)) {
          const value = req.body[field];
          const fieldRules = rules as any;

          if (value && fieldRules.type === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
              errors.push(`${field} must be a valid email`);
            }
          }

          if (value && fieldRules.minLength && value.length < fieldRules.minLength) {
            errors.push(`${field} must be at least ${fieldRules.minLength} characters`);
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          errors
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  };
};

