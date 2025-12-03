import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';
import { extractRoutes, analyzeControllerMethod } from './parser';
import { generateSwaggerEndpoint } from './generator';
import { SwaggerifyOptions, SimpleEndpointConfig } from './types';
import { loadTypesFromDirectory } from './typeExtractor';

export { SwaggerifyOptions, SimpleEndpointConfig } from './types';

export async function swaggerifyRoutes(options: SwaggerifyOptions = {}): Promise<SimpleEndpointConfig[]> {
  const {
    routesDir = './src/routes',
    controllersDir = './src/controllers',
    basePath = '/api/v1',
    smartDefaults = true,
    fieldTypeInference = true
  } = options;

  console.log('\n🚀 Swaggerify Routes\n');
  console.log('='.repeat(80));

  // Find all route files
  const routeFiles = await glob(`${routesDir}/**/*.ts`, { cwd: process.cwd() });

  if (routeFiles.length === 0) {
    console.log('❌ No route files found in', routesDir);
    return [];
  }

  console.log('📁 Processing route files...\n');

  // Load types first if schemasDir is provided
  let availableTypeNames: Set<string> = new Set();
  if (options.schemasDir) {
    console.log(`📚 Loading type definitions from ${options.schemasDir}...`);
    const extractedSchemas = await loadTypesFromDirectory(options.schemasDir);
    availableTypeNames = new Set(Object.keys(extractedSchemas));
    console.log(`  ✅ Loaded ${availableTypeNames.size} type definition(s)\n`);
  }

  // Parse router mounting structure from index.ts
  const routerMounts = await parseRouterMounts(routesDir, basePath);

  const allEndpoints: string[] = [];

  for (const routeFile of routeFiles) {
    const fileName = path.basename(routeFile, '.ts');
    const routePath = path.join(process.cwd(), routeFile);

    console.log(`📝 ${fileName}`);

    try {
      const routeContent = await fs.readFile(routePath, 'utf-8');

      // Convert camelCase fileName to kebab-case for route matching
      // e.g., spatialRooms -> spatial-rooms
      const kebabFileName = fileName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

      // Get the correct base path for this route file
      // Try both the original fileName and the kebab-case version
      const routeBasePath = routerMounts.get(fileName) || routerMounts.get(kebabFileName) || basePath;
      console.log(`  🎯 Using base path: ${routeBasePath} for ${fileName}`);
      const routes = extractRoutes(routeContent, routeBasePath, routePath, options.validatorsDir);

      if (routes.length === 0) {
        console.log(`  ⚠️  No routes found`);
        continue;
      }

      // Find corresponding controller file
      const controllerFile = findControllerFile(routeFile, controllersDir);
      let controllerContent: string | undefined;

      if (controllerFile && await fs.pathExists(controllerFile)) {
        controllerContent = await fs.readFile(controllerFile, 'utf-8');
        console.log(`  📋 Controller: ${path.basename(controllerFile)}`);
      }

      const endpoints: string[] = [];

      for (const route of routes) {
        let controllerInfo;
        if (controllerContent && controllerFile) {
          controllerInfo = analyzeControllerMethod(
            controllerContent, 
            route.controllerMethod, 
            controllerFile,
            availableTypeNames
          );
        }

        const endpointStr = await generateSwaggerEndpoint(route, controllerInfo, fileName, options, routePath);
        endpoints.push(endpointStr);
      }

      console.log(`  ✅ Generated ${endpoints.length} endpoints`);
      allEndpoints.push(...endpoints);

    } catch (error) {
      console.log(`  ❌ Error processing ${fileName}:`, (error as Error).message);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\n✨ Generated ${allEndpoints.length} total endpoint definitions\n`);

  // Convert string endpoints to actual objects
  const endpointObjects: SimpleEndpointConfig[] = allEndpoints.map(endpointStr => {
    // This is a simplified conversion - in a real implementation you'd want proper parsing
    return eval(`(${endpointStr})`) as SimpleEndpointConfig;
  });

  return endpointObjects;
}

async function parseRouterMounts(routesDir: string, basePath: string): Promise<Map<string, string>> {
  const routerMounts = new Map<string, string>();

  // Look for index.ts in the routes directory
  const indexPath = path.join(process.cwd(), routesDir, 'index.ts');

  if (!await fs.pathExists(indexPath)) {
    console.log('⚠️  No index.ts found in routes directory, using default base path');
    return routerMounts;
  }

  try {
    const indexContent = await fs.readFile(indexPath, 'utf-8');

    console.log('📄 Index file content preview:');
    console.log(indexContent.split('\n').slice(10, 20).join('\n'));

    // Parse router.use() statements to understand mounting structure
    const routerUseRegex = /router\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)Routes\s*\)/g;
    let match;

    while ((match = routerUseRegex.exec(indexContent)) !== null) {
      const mountPath = match[1]; // e.g., '/auth', '/users'
      const routeVariable = match[2]; // e.g., 'auth', 'user' (from authRoutes, userRoutes)

      // Combine base path with mount path
      const fullPath = `${basePath}${mountPath}`;

      // Extract the route name from the mount path (remove leading slash)
      const routeName = mountPath.substring(1); // e.g., 'auth', 'users'

      // Map the route name to its full base path
      routerMounts.set(routeName, fullPath);

      console.log(`🔗 Found router mount: ${routeName} → ${fullPath} (from ${routeVariable}Routes)`);
    }

    // If no router mounts found, add default mappings for common patterns
    if (routerMounts.size === 0) {
      console.log('⚠️  No router mounts found, using default patterns');

      // Common route file patterns
      const commonRoutes = ['auth', 'users', 'payments', 'transactions', 'health', 'docs', 'test'];
      commonRoutes.forEach(routeName => {
        routerMounts.set(routeName, `${basePath}/${routeName}`);
      });
    }

  } catch (error) {
    console.log('⚠️  Error parsing router mounts:', (error as Error).message);
  }

  return routerMounts;
}

function findControllerFile(routeFilePath: string, controllersDir: string): string | undefined {
  const routeFileName = path.basename(routeFilePath, '.ts');
  const candidates: string[] = [];

  const addNamesFor = (name: string) => {
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    candidates.push(
      `${name}Controller.ts`,
      `${cap}Controller.ts`,
      `${name}.controller.ts`,
      `${cap}.controller.ts`,
      `${name}.ts`,
      `${cap}.ts`
    );
  };

  // original name
  addNamesFor(routeFileName);

  // naive singularization
  if (routeFileName.endsWith('ies')) {
    addNamesFor(routeFileName.slice(0, -3) + 'y');
  } else if (routeFileName.endsWith('s')) {
    addNamesFor(routeFileName.slice(0, -1));
  }

  for (const controllerName of candidates) {
    const controllerPath = path.join(process.cwd(), controllersDir, controllerName);
    if (fs.existsSync(controllerPath)) {
      return controllerPath;
    }
  }

  return undefined;
}

export async function generateSwaggerDocs(
  endpoints: SimpleEndpointConfig[],
  options: SwaggerifyOptions = {}
): Promise<any> {
  const {
    title = 'API Documentation',
    version = '1.0.0',
    description = 'Auto-generated API documentation',
    servers = [{ url: 'http://localhost:3000', description: 'Development server' }]
  } = options;

  const paths: any = {};

  endpoints.forEach(endpoint => {
    const path = endpoint.path;
    const method = endpoint.method.toLowerCase();

    if (!paths[path]) {
      paths[path] = {};
    }

    const pathItem: any = {
      summary: endpoint.summary,
      operationId: endpoint.operationId,
      tags: endpoint.tags || ['API'],
    };

    if (endpoint.description) {
      pathItem.description = endpoint.description;
    }

    if (endpoint.parameters && endpoint.parameters.length > 0) {
      pathItem.parameters = endpoint.parameters;
    }

    if (endpoint.requestBody) {
      pathItem.requestBody = endpoint.requestBody;
    }

    if (endpoint.responses) {
      pathItem.responses = endpoint.responses;
    }

    // Add security if not explicitly marked as noAuth
    if (!endpoint.noAuth) {
      pathItem.security = [{ bearerAuth: [] }];
    }

    paths[path][method] = pathItem;
  });

  // Load TypeScript types from schemasDir if specified
  let extractedSchemas: Record<string, any> = {};
  if (options.schemasDir) {
    console.log(`\n📚 Loading type definitions from ${options.schemasDir}...`);
    extractedSchemas = await loadTypesFromDirectory(options.schemasDir);
  }

  // Helper: resolve $ref like '#/components/schemas/TypeName' -> 'TypeName'
  const resolveRef = (ref: string | undefined): string | undefined => {
    if (!ref) return undefined;
    const match = ref.match(/#\/components\/schemas\/(.+)$/);
    return match ? match[1] : undefined;
  };

  // Helper: generate example from a schema object (very simple, depth-limited)
  const generateExampleFromSchema = (schemaObj: any, depth: number = 0): any => {
    // Allow deeper nesting (e.g., ApiResponseWithUser.data.user.userProfile)
    if (!schemaObj || depth > 8) return {};
    if (schemaObj.$ref) {
      const name = resolveRef(schemaObj.$ref) || schemaObj.$ref;
      const target = name && extractedSchemas[name];
      return target ? generateExampleFromSchema(target, depth + 1) : {};
    }
    const type = schemaObj.type;
    if (type === 'string') {
      if (schemaObj.enum && schemaObj.enum.length > 0) return schemaObj.enum[0];
      if (schemaObj.format === 'date-time') return new Date().toISOString();
      if (schemaObj.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
      return schemaObj.example ?? 'string';
    }
    if (type === 'number' || type === 'integer') return schemaObj.example ?? 0;
    if (type === 'boolean') return schemaObj.example ?? true;
    if (type === 'array') {
      const itemsSchema = schemaObj.items || {};
      // Direct primitives for clearer examples
      if (itemsSchema.$ref) {
        const name = resolveRef(itemsSchema.$ref) || itemsSchema.$ref;
        const target = name && extractedSchemas[name];
        if (target) {
          const itemEx = generateExampleFromSchema(target, depth + 1);
          // If the resolved type has enum values, return multiple enum values
          if (target.type === 'string' && target.enum && target.enum.length > 0) {
            return target.enum.slice(0, 3);
          }
          if (target.type === 'number' && target.enum && target.enum.length > 0) {
            return target.enum.slice(0, 3);
          }
          return [itemEx];
        }
        return ['string'];
      }
      if (itemsSchema.type === 'string') {
        // Check for enum values first
        if (itemsSchema.enum && itemsSchema.enum.length > 0) {
          // Return array with multiple enum values to show it's an array
          return itemsSchema.enum.slice(0, 3); // Show up to 3 enum values
        }
        return [itemsSchema.example ?? 'string'];
      }
      if (itemsSchema.type === 'number' || itemsSchema.type === 'integer') {
        // Check for enum values
        if (itemsSchema.enum && itemsSchema.enum.length > 0) {
          return itemsSchema.enum.slice(0, 3);
        }
        return [itemsSchema.example ?? 0];
      }
      if (itemsSchema.type === 'boolean') return [itemsSchema.example ?? true];
      if (itemsSchema.type === 'object' && itemsSchema.properties) {
        return [generateExampleFromSchema(itemsSchema, depth + 1)];
      }
      // Fallback to string items
      return ['string'];
    }
    if (type === 'object' || schemaObj.properties) {
      const obj: any = {};
      const props = schemaObj.properties || {};
      for (const key of Object.keys(props)) {
        obj[key] = generateExampleFromSchema(props[key], depth + 1);
      }
      return obj;
    }
    return {};
  };

  // Post-process responses to add examples when we know the extracted type
  for (const p of Object.keys(paths)) {
    for (const m of Object.keys(paths[p])) {
      const op = paths[p][m];
      
      // Generate examples for request bodies
      if (op.requestBody?.content?.['application/json']?.schema) {
        const reqContent = op.requestBody.content['application/json'];
        const reqSchema = reqContent.schema;
        const refName = resolveRef(reqSchema.$ref);
        if (refName && extractedSchemas[refName]) {
          // Build example from the referenced schema
          reqContent.example = generateExampleFromSchema(extractedSchemas[refName]);
        } else if (reqSchema && !reqSchema.$ref) {
          // Direct schema object (not a $ref)
          reqContent.example = generateExampleFromSchema(reqSchema);
        }
      }
      
      // Generate examples for responses
      if (!op.responses) continue;
      for (const sc of Object.keys(op.responses)) {
        const resp = op.responses[sc];
        const content = resp.content?.['application/json'];
        if (!content || !content.schema) continue;
        const schema = content.schema;
        const refName = resolveRef(schema.$ref);
        if (refName && extractedSchemas[refName]) {
          // Build example from the referenced schema
          const example = generateExampleFromSchema(extractedSchemas[refName]);
          // Attach
          content.example = example;
        } else if (schema && !schema.$ref) {
          // Direct schema object (not a $ref)
          content.example = generateExampleFromSchema(schema);
        }
      }
    }
  }

  return {
    openapi: '3.0.0',
    info: {
      title,
      version,
      description,
    },
    servers,
    components: {
      schemas: {
        // ApiResponse: {
        //   type: 'object',
        //   properties: {
        //     success: { type: 'boolean' },
        //     data: { type: 'object' },
        //     error: { type: 'string' },
        //   },
        // },
        // ErrorResponse: {
        //   type: 'object',
        //   properties: {
        //     success: { type: 'boolean', example: false },
        //     error: { type: 'string' },
        //   },
        // },
        ...extractedSchemas,
        ...options.customSchemas,
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token',
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths,
  };
}

export async function saveSwaggerDocs(
  endpoints: SimpleEndpointConfig[],
  options: SwaggerifyOptions = {}
): Promise<void> {
  const { outputFile = './swagger-docs.ts' } = options;

  const swaggerSpec = await generateSwaggerDocs(endpoints, options);

  const content = `// Auto-generated Swagger documentation
// Generated by express-swaggerify
// Generated at ${new Date().toISOString()}

export const swaggerSpec = ${JSON.stringify(swaggerSpec, null, 2)};

export const endpoints: any[] = ${JSON.stringify(endpoints, null, 2)};
`;

  await fs.writeFile(outputFile, content, 'utf-8');
  console.log(`✅ Saved Swagger documentation to ${outputFile}`);
}
