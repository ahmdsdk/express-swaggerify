// Simple validation schemas
// In a real app, use Joi, Zod, Yup, or similar validation library

export const loginSchema = {
  required: ['email', 'password'],
  fields: {
    email: {
      type: 'email'
    },
    password: {
      type: 'string',
      minLength: 6
    }
  }
};

export const registerSchema = {
  required: ['email', 'password'],
  fields: {
    email: {
      type: 'email'
    },
    password: {
      type: 'string',
      minLength: 6
    },
    username: {
      type: 'string',
      minLength: 3
    }
  }
};

