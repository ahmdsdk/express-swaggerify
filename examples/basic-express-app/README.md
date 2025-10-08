# Basic Express App Example

This is a basic example showing how to use `express-swaggerify` with an Express.js application.

## Structure

```
src/
├── controllers/
│   └── AuthController.ts    # Controller with business logic
├── middleware/
│   ├── auth.ts              # Authentication middleware
│   └── validation.ts        # Validation middleware
├── routes/
│   └── auth.ts              # Route definitions
└── schemas/
    └── authSchemas.ts       # Validation schemas
```

## How It Works

1. **Routes** (`src/routes/auth.ts`): Define Express routes with middleware
2. **Controllers** (`src/controllers/AuthController.ts`): Handle the business logic
3. **Middleware**: Authentication and validation logic
4. **Swaggerify**: Analyzes routes and controllers to generate OpenAPI docs

## Supported Route Patterns

Express Swaggerify works with routes that follow these patterns:

### ✅ Supported

```typescript
// Single-line routes
router.get('/users', controller.getUsers);
router.post('/users', controller.createUser);

// Multi-line routes with middleware
router.post(
  '/login',
  validate(schema),
  controller.login
);

// With authentication
router.get(
  '/profile',
  authenticate,
  controller.getProfile
);

// Path parameters
router.get('/users/:id', controller.getUser);
router.put('/users/:id', controller.updateUser);
```

### ❌ Not Supported (Yet)

```typescript
// Dynamic route registration
routes.forEach(route => {
  router[route.method](route.path, route.handler);
});

// Route definitions spread across multiple files without clear imports
```

## Field Detection

The tool analyzes controller methods to detect fields:

```typescript
async login(req: Request, res: Response) {
  const { email, password } = req.body;  // ← Detected automatically
  // ...
}
```

It also uses smart defaults based on route names:
- `/login` → email, password
- `/register` → email, password, username
- `/payment` → amount, currency
- etc.

## Generate Documentation

```bash
# Install dependencies
yarn install

# Generate Swagger docs
yarn docs:generate
```

This will create a `swagger-docs.ts` file with your OpenAPI specification.

## Next Steps

1. Add more routes in `src/routes/`
2. Create corresponding controllers
3. Run `yarn docs:generate`
4. Integrate with Swagger UI in your main app

