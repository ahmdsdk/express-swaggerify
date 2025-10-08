# Quick Start Guide

Get started with Swaggerify in under 5 minutes! ⚡

## Installation

```bash
yarn add swaggerify
# or
npm install swaggerify
```

## Basic Usage

### Step 1: Generate Documentation

Run the CLI tool in your Express.js project:

```bash
npx swaggerify generate
```

This will:
- Scan your `./src/routes` directory
- Analyze controllers in `./src/controllers`
- Generate `swagger-docs.ts` with OpenAPI spec

### Step 2: Use in Your Express App

```typescript
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger-docs';

const app = express();

// Serve Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(3000, () => {
  console.log('API docs available at http://localhost:3000/api-docs');
});
```

### Step 3: View Your Docs

Open your browser and navigate to:
```
http://localhost:3000/api-docs
```

You'll see beautiful, auto-generated API documentation! 🎉

## Project Structure

Your project should look like this:

```
your-project/
├── src/
│   ├── routes/              # Express route files
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   └── products.ts
│   ├── controllers/         # Controller files
│   │   ├── AuthController.ts
│   │   ├── UserController.ts
│   │   └── ProductController.ts
│   └── index.ts
├── swagger-docs.ts          # Auto-generated
└── package.json
```

## Example Route File

```typescript
// src/routes/auth.ts
import { Router } from 'express';
import { authController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/logout', authenticate, authController.logout);

export default router;
```

## Example Controller File

```typescript
// src/controllers/AuthController.ts
import { Request, Response } from 'express';

export class AuthController {
  async login(req: Request, res: Response) {
    const { email, password } = req.body; // Auto-detected!

    // Your logic here

    return res.status(200).json({ // Status code detected!
      success: true,
      token: 'jwt-token'
    });
  }
}

export const authController = new AuthController();
```

## Customization

### Custom Options

```bash
swaggerify generate \
  --routes-dir ./api/routes \
  --controllers-dir ./api/controllers \
  --output ./docs/swagger.ts \
  --base-path /api/v1 \
  --title "My Awesome API" \
  --version "2.0.0"
```

### Package.json Scripts

Add these to your `package.json`:

```json
{
  "scripts": {
    "docs:generate": "swaggerify generate",
    "docs:validate": "swaggerify validate",
    "dev": "yarn docs:generate && nodemon src/index.ts"
  }
}
```

Now `yarn dev` will auto-generate docs before starting your server!

## What Gets Auto-Detected?

✅ HTTP methods (GET, POST, PUT, DELETE, PATCH)
✅ Route paths and parameters
✅ Request body fields from `req.body`
✅ Field types (email, password, number, etc.)
✅ Status codes from `res.status()`
✅ Authentication middleware
✅ Path parameters like `/users/:id`

## Common Patterns

### Login Endpoint
Auto-generates `email` and `password` fields:
```typescript
router.post('/login', authController.login);
```

### Payment Endpoint
Auto-generates `amount`, `currency`, `description` fields:
```typescript
router.post('/payments', paymentController.create);
```

### User CRUD
Auto-generates appropriate fields based on HTTP method:
```typescript
router.get('/users/:id', userController.getById);
router.post('/users', userController.create);
router.put('/users/:id', userController.update);
router.delete('/users/:id', userController.delete);
```

## Next Steps

- Check out the [full documentation](../README.md)
- Explore the [examples](../examples/)
- Learn about [advanced configuration](./ADVANCED.md)

## Troubleshooting

**Q: No routes detected?**
A: Make sure your route files use `router.get()`, `router.post()`, etc.

**Q: Fields not detected?**
A: Ensure your controller uses `const { field1, field2 } = req.body` destructuring.

**Q: Wrong status codes?**
A: Use explicit `res.status(200)` instead of just `res.json()`.

## Support

- 🐛 [Report a bug](https://github.com/ahmadsadek/swaggerify/issues)
- 💡 [Request a feature](https://github.com/ahmadsadek/swaggerify/issues)
- ❓ [Ask a question](https://github.com/ahmadsadek/swaggerify/discussions)

Happy documenting! 🚀

