import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';
import { extractRoutes, analyzeControllerMethod } from './parser';
import { generateSwaggerEndpoint } from './generator';
import { SwaggerifyOptions, SimpleEndpointConfig } from './types';

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

  // Parse router mounting structure from index.ts
  const routerMounts = await parseRouterMounts(routesDir, basePath);

  const allEndpoints: string[] = [];

  for (const routeFile of routeFiles) {
    const fileName = path.basename(routeFile, '.ts');
    const routePath = path.join(process.cwd(), routeFile);

    console.log(`📝 ${fileName}`);

    try {
      const routeContent = await fs.readFile(routePath, 'utf-8');
      
      // Get the correct base path for this route file
      const routeBasePath = routerMounts.get(fileName) || basePath;
      const routes = extractRoutes(routeContent, routeBasePath);

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
        if (controllerContent) {
          controllerInfo = analyzeControllerMethod(controllerContent, route.controllerMethod);
        }

        endpoints.push(generateSwaggerEndpoint(route, controllerInfo, fileName, options));
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
    
    // Parse router.use() statements to understand mounting structure
    const routerUseRegex = /router\.use\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*(\w+)Routes\s*\)/g;
    let match;
    
    while ((match = routerUseRegex.exec(indexContent)) !== null) {
      const mountPath = match[1]; // e.g., '/auth', '/users'
      const routeName = match[2]; // e.g., 'auth', 'users'
      
      // Combine base path with mount path
      const fullPath = `${basePath}${mountPath}`;
      
      // Map route file name to its full base path
      routerMounts.set(routeName, fullPath);
      
      console.log(`🔗 Found router mount: ${routeName} → ${fullPath}`);
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
  const possibleControllerNames = [
    `${routeFileName}Controller.ts`,
    `${routeFileName}.controller.ts`,
    `${routeFileName}.ts`
  ];

  for (const controllerName of possibleControllerNames) {
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
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            error: { type: 'string' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
          },
        },
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

export const swaggerSpec = ${JSON.stringify(swaggerSpec, null, 2)};

export const endpoints: any[] = ${JSON.stringify(endpoints, null, 2)};
`;

  await fs.writeFile(outputFile, content, 'utf-8');
  console.log(`✅ Saved Swagger documentation to ${outputFile}`);
}
