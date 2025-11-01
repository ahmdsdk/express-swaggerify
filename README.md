# Express Swaggerify

🚀 **Auto-generate OpenAPI 3.0 documentation from Express.js routes with intelligent field detection**

[![npm version](https://badge.fury.io/js/express-swaggerify.svg)](https://badge.fury.io/js/express-swaggerify)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- 🔍 **Smart Route Detection** - Parses both single-line and multi-line Express.js route definitions
- 🎯 **Joi Schema Extraction** - Automatically extracts request body schemas from Joi validators (`validate(authSchemas.register)`)
- 🧠 **Intelligent Field Inference** - Analyzes controller code to extract request body fields and types
- 📝 **Auto-Generated Summaries** - Creates meaningful endpoint summaries from route paths and methods
- 🏷️ **Organized by Tags** - Groups endpoints by route file for better organization
- 🔒 **Auth Detection** - Automatically detects authentication middleware
- 📊 **Status Code Analysis** - Extracts HTTP status codes from controller implementations
- 🎯 **Smart Defaults** - Generates appropriate fields based on common patterns (login, payment, etc.)
- 📋 **OpenAPI 3.0 Compliant** - Generates proper OpenAPI 3.0 specification format
- 🚫 **No Manual Documentation** - Zero manual Swagger documentation required!

## 🚀 Quick Start

### Installation

```bash
npm install express-swaggerify
# or
yarn add express-swaggerify
```

### CLI Usage

```bash
# Generate documentation
npx swaggerify generate

# With custom options
npx swaggerify generate --routes-dir ./api/routes --output ./docs/swagger.ts --validators-dir ./src/api/v1/validators

# Validate routes without generating docs
npx swaggerify validate
```

### Programmatic Usage

```typescript
import { swaggerifyRoutes, generateSwaggerDocs } from 'express-swaggerify';

// Generate endpoints from routes
const endpoints = await swaggerifyRoutes({
  routesDir: './src/routes',
  controllersDir: './src/controllers',
  basePath: '/api/v1'
});

// Generate OpenAPI spec
const swaggerSpec = await generateSwaggerDocs(endpoints, {
  title: 'My API',
  version: '1.0.0'
});
```

## 📁 Project Structure

```
your-project/
├── src/
│   ├── routes/
│   │   ├── auth.ts      # → Auth endpoints
│   │   ├── users.ts     # → Users endpoints
│   │   └── payments.ts  # → Payments endpoints
│   └── controllers/
│       ├── AuthController.ts
│       ├── UserController.ts
│       └── PaymentController.ts
└── swagger-docs.ts      # Generated documentation
```

## 🎯 How It Works

### 1. Route Detection

Swaggerify Routes automatically detects Express.js routes:

```typescript
// Single-line routes
router.get('/users', userController.getAllUsers);

// Multi-line routes
router.post(
  '/users',
  authenticate,
  validate(userSchema),
  userController.createUser
);
```

### 2. Joi Schema Extraction (NEW!)

Automatically extracts request body schemas from Joi validators:
- Detects `validate(authSchemas.register)` middleware calls
- Loads and converts Joi schemas to OpenAPI JSON Schema format
- Extracts all validation rules (required, min/max length, patterns, etc.)
- Provides accurate request body documentation from your validation schemas

### 3. Controller Analysis

Analyzes controller methods to extract:
- Request body fields from destructuring: `const { email, password } = req.body`
- HTTP status codes from responses: `res.status(400).json(...)`
- Field types based on usage patterns

### 4. Smart Field Generation

Generates intelligent defaults based on route patterns:

```typescript
// /api/v1/auth/login → email, password fields
// /api/v1/payments/create → amount, currency, description fields
// /api/v1/users → email, username, firstName, lastName fields
```

### 5. OpenAPI 3.0 Generation

Creates proper OpenAPI 3.0 specification with:
- Correct `content.application/json` structure
- Meaningful operation IDs
- Organized tags by route file
- Proper authentication requirements

## 📖 Configuration Options

```typescript
interface SwaggerifyOptions {
  routesDir?: string;           // './src/routes'
  controllersDir?: string;      // './src/controllers'
  outputFile?: string;          // './swagger-docs.ts'
  basePath?: string;            // '/api/v1'
  title?: string;               // 'API Documentation'
  version?: string;             // '1.0.0'
  description?: string;         // 'Auto-generated API documentation'
  servers?: Array<{             // [{ url: 'http://localhost:3000', description: 'Dev' }]
    url: string;
    description: string;
  }>;
  validatorsDir?: string;        // './src/api/v1/validators' - Directory where Joi validators are located
  customSchemas?: Record<string, any>;
  smartDefaults?: boolean;      // true
  fieldTypeInference?: boolean; // true
}
```

## 🎨 Example Output

### Generated Endpoint

```typescript
{
  method: 'POST',
  path: '/api/v1/auth/login',
  summary: 'Login',
  operationId: 'login',
  tags: ['Auth'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'string (email)' },
            password: { type: 'string', description: 'string (password)' }
          },
          required: ['email', 'password']
        }
      }
    }
  },
  responses: {
    '200': {
      description: 'Success',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiResponse' }
        }
      }
    }
  }
}
```

### Generated OpenAPI Spec

```yaml
openapi: 3.0.0
info:
  title: API Documentation
  version: 1.0.0
paths:
  /api/v1/auth/login:
    post:
      summary: Login
      operationId: login
      tags: [Auth]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email:
                  type: string
                  description: string (email)
                password:
                  type: string
                  description: string (password)
              required: [email, password]
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ApiResponse'
```

## 🔧 Integration Examples

### Express.js + Swagger UI

```typescript
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger-docs';

const app = express();

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```

### Next.js API Routes

```typescript
// pages/api/docs.ts
import { swaggerSpec } from '../../../swagger-docs';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.json(swaggerSpec);
}
```

### Package.json Scripts

```json
{
  "scripts": {
    "docs:generate": "swaggerify generate",
    "docs:validate": "swaggerify validate",
    "dev": "npm run docs:generate && nodemon src/index.ts"
  }
}
```

## 🎯 Supported Patterns

### Route Definitions
- ✅ `router.get('/path', handler)`
- ✅ `router.post('/path', middleware, handler)`
- ✅ Multi-line route definitions
- ✅ Path parameters: `/users/:id`
- ✅ Authentication middleware detection

### Controller Methods
- ✅ `async functionName(req, res) { ... }`
- ✅ `const methodName = async (req, res) => { ... }`
- ✅ Request body destructuring: `const { email, password } = req.body`
- ✅ Status code extraction: `res.status(400).json(...)`

### Field Type Inference
- ✅ Email fields: `email` → `string (email)`
- ✅ Password fields: `password` → `string (password)`
- ✅ ID fields: `userId` → `string (uuid)`
- ✅ Numeric fields: `amount`, `price` → `number`
- ✅ Boolean fields: `isActive`, `hasPermission` → `boolean`

## ⚠️ Important Notes

### What Works
Express Swaggerify works best with **static route definitions** that follow standard Express.js patterns. It analyzes your TypeScript/JavaScript files using AST parsing to extract route information.

### Current Limitations
- ❌ **Dynamic route registration** (routes registered in loops or from configuration)
- ❌ **Routes without clear controller references** (inline handlers with complex logic)
- ❌ **Heavily obfuscated or minified code**

### Best Practices
1. Keep route definitions in dedicated route files
2. Use named controller methods (not inline anonymous functions)
3. Use destructuring for request body fields: `const { email } = req.body`
4. Follow consistent naming conventions

For detailed examples, see the [examples/basic-express-app](examples/basic-express-app) directory.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built for the Express.js community
- Inspired by the need for automated API documentation
- Thanks to all contributors and users!

---

**Made with ❤️ by [Ahmad Sadek](https://github.com/ahmadsadek)**
