import { RouteInfo, ControllerInfo, SimpleEndpointConfig, SmartField, SwaggerifyOptions } from './types';
import { loadJoiSchemaFromValidator } from './joiExtractor';

export async function generateSwaggerEndpoint(
  route: RouteInfo,
  controllerInfo?: ControllerInfo,
  routeFileName?: string,
  options: SwaggerifyOptions = {},
  routeFilePath?: string
): Promise<string> {
  const methodLower = route.method.toLowerCase();
  const pathSegments = route.path.split('/').filter(Boolean);
  const operationId = route.controllerMethod;

  // Generate summary from method name and path
  let summary: string;

  if (route.controllerMethod === 'unknown' || route.controllerMethod === 'bind' || route.controllerMethod === 'anonymous') {
    // Generate summary from path and method
    const pathParts = route.path.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1] || 'endpoint';

    // Convert path to readable format
    summary = lastPart
      .replace(/[-_]/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase()
      .replace(/^\w/, c => c.toUpperCase());

    // Add method context
    if (route.method === 'GET') {
      summary = `Get ${summary}`;
    } else if (route.method === 'POST') {
      summary = `Create ${summary}`;
    } else if (route.method === 'PUT') {
      summary = `Update ${summary}`;
    } else if (route.method === 'PATCH') {
      summary = `Update ${summary}`;
    } else if (route.method === 'DELETE') {
      summary = `Delete ${summary}`;
    }
  } else {
    // Use controller method name
    summary = route.controllerMethod
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase()
      .replace(/^\w/, c => c.toUpperCase());
  }

  const description = `${route.method} ${route.path}`;

  // Get status codes from controller analysis
  const statusCodes = controllerInfo?.statusCodes || [200, 400, 500];
  if (route.hasAuth && !statusCodes.includes(401)) {
    statusCodes.push(401);
  }

  // Detect path parameters
  const pathParams = (route.path.match(/\{(\w+)\}/g) || []).map(param =>
    param.slice(1, -1)
  );

  let endpoint = `  {\n`;
  endpoint += `    method: '${route.method}',\n`;
  endpoint += `    path: '${route.path}',\n`;
  endpoint += `    summary: '${summary}',\n`;
  endpoint += `    operationId: '${operationId}',\n`;

  if (description) {
    endpoint += `    description: '${description}',\n`;
  }

  // Use route file name to determine tag, fallback to path segment
  let tag = 'API';
  if (routeFileName) {
    // Convert filename like 'auth.ts' to 'Auth'
    tag = routeFileName.replace('.ts', '').replace(/^\w/, c => c.toUpperCase());
  } else if (pathSegments.length > 2) {
    tag = pathSegments[2] || 'API'; // Use the actual route name (e.g., 'auth', 'payments')
  }

  endpoint += `    tags: ['${tag}'],\n`;

  // Add path parameters if any
  if (pathParams.length > 0) {
    endpoint += `    parameters: [\n`;
    pathParams.forEach(param => {
      endpoint += `      {\n`;
      endpoint += `        name: '${param}',\n`;
      endpoint += `        in: 'path',\n`;
      endpoint += `        required: true,\n`;
      endpoint += `        schema: { type: 'string' },\n`;
      endpoint += `        description: '${param} parameter',\n`;
      endpoint += `      },\n`;
    });
    endpoint += `    ],\n`;
  }

  // Add request body for POST/PUT/PATCH (OpenAPI 3.0 format)
  if (['POST', 'PUT', 'PATCH'].includes(route.method)) {
    endpoint += `    requestBody: {\n`;
    endpoint += `      required: true,\n`;
    endpoint += `      content: {\n`;
    endpoint += `        'application/json': {\n`;

    // Try to load Joi schema first (highest priority)
    let joiSchemaObj: any = null;
    if (route.validatorSchema) {
      joiSchemaObj = await loadJoiSchemaFromValidator(
        route.validatorSchema,
        routeFilePath,
        options.validatorsDir
      );
    }

    if (joiSchemaObj && joiSchemaObj.schema) {
      // Use Joi schema - convert to OpenAPI format
      const schemaStr = JSON.stringify(joiSchemaObj.schema, null, 12);
      // Indent each line properly for the endpoint string
      const indentedSchema = schemaStr.split('\n').map((line: string, idx: number) => {
        if (idx === 0) return line; // First line, no extra indent
        return '            ' + line;
      }).join('\n');
      endpoint += `          schema: ${indentedSchema},\n`;
    } else {
      // If a validator was specified but extraction failed, don't use smart defaults
      const hasValidator = !!route.validatorSchema;
      
      // Fallback to controller inference and smart defaults (only if no validator was specified)
      endpoint += `          schema: {\n`;
      endpoint += `            type: 'object',\n`;

      // Combine controller fields with smart defaults, avoiding duplicates
      let allFields: Array<{
        name: string;
        type: string;
        description: string;
        required: boolean;
      }> = [];
      const fieldMap = new Map<string, any>();

      // Add controller-detected fields first (higher priority)
      if (
        controllerInfo?.requestBodyFields &&
        controllerInfo.requestBodyFields.length > 0
      ) {
        controllerInfo.requestBodyFields.forEach(field => {
          const swaggerType = mapToSwaggerType(field.type);
          fieldMap.set(field.name, {
            name: field.name,
            type: swaggerType,
            description: field.type,
            required: field.required,
          });
        });
      } else if (controllerInfo?.requestBodyType) {
        // Fallback to basic field parsing
        const fields = controllerInfo.requestBodyType
          .split(',')
          .map(f => f.trim());
        fields.forEach(field => {
          const inferredType = inferFieldType(field, [], 0);
          const swaggerType = mapToSwaggerType(inferredType);
          fieldMap.set(field, {
            name: field,
            type: swaggerType,
            description: inferredType,
            required: true,
          });
        });
      }

      // Add smart defaults for missing fields if enabled AND no validator was specified
      // If validator was specified but extraction failed, we don't want to add incorrect defaults
      if (options.smartDefaults !== false && !hasValidator) {
        const smartFields = generateSmartDefaults(route);
        smartFields.forEach(field => {
          if (!fieldMap.has(field.name)) {
            fieldMap.set(field.name, field);
          }
        });
      }

      // Convert map to array
      allFields = Array.from(fieldMap.values());

      if (allFields.length > 0) {
        endpoint += `            properties: {\n`;
        allFields.forEach(field => {
          endpoint += `              ${field.name}: { type: '${field.type}', description: '${field.description}' },\n`;
        });
        endpoint += `            },\n`;
        const requiredFields = allFields
          .filter(f => f.required)
          .map(f => `'${f.name}'`);
        endpoint += `            required: [${requiredFields.join(', ')}],\n`;
      } else {
        endpoint += `            properties: {\n`;
        endpoint += `              // TODO: Add request body properties from ${route.controllerMethod}\n`;
        endpoint += `            },\n`;
      }

      endpoint += `          },\n`;
    }

    endpoint += `        },\n`;
    endpoint += `      },\n`;
    endpoint += `    },\n`;
  }

  // Add responses based on actual status codes found
  endpoint += `    responses: {\n`;

  statusCodes.sort().forEach(code => {
    let description = 'Success';
    let schemaType = 'ApiResponse';

    if (code >= 400) {
      schemaType = 'ErrorResponse';
      if (code === 400) description = 'Bad request';
      else if (code === 401) description = 'Unauthorized';
      else if (code === 403) description = 'Forbidden';
      else if (code === 404) description = 'Not found';
      else if (code === 409) description = 'Conflict';
      else if (code === 500) description = 'Internal server error';
      else description = 'Error';
    } else if (code === 201) {
      description = 'Created';
    } else if (code === 204) {
      description = 'No content';
    }

    endpoint += `      '${code}': {\n`;
    endpoint += `        description: '${description}',\n`;
    endpoint += `        content: {\n`;
    endpoint += `          'application/json': {\n`;
    endpoint += `            schema: { $ref: '#/components/schemas/${schemaType}' },\n`;
    endpoint += `          },\n`;
    endpoint += `        },\n`;
    endpoint += `      },\n`;
  });

  endpoint += `    },\n`;

  // Add noAuth flag
  endpoint += `    noAuth: ${!route.hasAuth},\n`;
  endpoint += `  }`;

  return endpoint;
}

function mapToSwaggerType(typeString: string): string {
  // Map inferred types to Swagger/OpenAPI types
  if (typeString.includes('number')) return 'number';
  if (typeString.includes('boolean')) return 'boolean';
  if (typeString.includes('date')) return 'string';
  if (typeString.includes('email')) return 'string';
  if (typeString.includes('password')) return 'string';
  if (typeString.includes('uuid')) return 'string';
  return 'string'; // Default fallback
}

function inferFieldType(fieldName: string, lines: string[], startLine: number): string {
  // Look for usage patterns in the method to infer type
  const fieldUsage = lines.slice(startLine).join('\n');

  // Common type patterns
  if (fieldName.toLowerCase().includes('email')) return 'string (email)';
  if (fieldName.toLowerCase().includes('password')) return 'string (password)';
  if (fieldName.toLowerCase().includes('id')) return 'string (uuid)';
  if (fieldName.toLowerCase().includes('age') || fieldName.toLowerCase().includes('count')) return 'number';
  if (fieldName.toLowerCase().includes('price') || fieldName.toLowerCase().includes('amount')) return 'number';
  if (fieldName.toLowerCase().includes('date') || fieldName.toLowerCase().includes('time')) return 'string (date)';
  if (fieldName.toLowerCase().includes('is') || fieldName.toLowerCase().includes('has')) return 'boolean';

  // Check for specific usage patterns
  if (fieldUsage.includes(`parseInt(${fieldName})`) || fieldUsage.includes(`Number(${fieldName})`)) {
    return 'number';
  }
  if (fieldUsage.includes(`${fieldName}.toLowerCase()`) || fieldUsage.includes(`${fieldName}.trim()`)) {
    return 'string';
  }
  if (fieldUsage.includes(`${fieldName} === true`) || fieldUsage.includes(`${fieldName} === false`)) {
    return 'boolean';
  }

  // Default to string
  return 'string';
}

function generateSmartDefaults(route: RouteInfo): SmartField[] {
  const fields: SmartField[] = [];
  const path = route.path.toLowerCase();
  const method = route.method.toLowerCase();
  const operationId = route.controllerMethod.toLowerCase();

  // Common patterns based on route analysis
  if (path.includes('login') || operationId.includes('login')) {
    fields.push(
      {
        name: 'email',
        type: 'string',
        description: 'User email address',
        required: true,
      },
      {
        name: 'password',
        type: 'string',
        description: 'User password',
        required: true,
      }
    );
  }

  if (path.includes('register') || operationId.includes('register')) {
    fields.push(
      {
        name: 'email',
        type: 'string',
        description: 'User email address',
        required: true,
      },
      {
        name: 'password',
        type: 'string',
        description: 'User password',
        required: true,
      },
      {
        name: 'username',
        type: 'string',
        description: 'Username',
        required: false,
      }
    );
  }

  if (path.includes('payment') || operationId.includes('payment')) {
    fields.push(
      {
        name: 'amount',
        type: 'number',
        description: 'Payment amount in cents',
        required: true,
      },
      {
        name: 'currency',
        type: 'string',
        description: 'Currency code (e.g., usd)',
        required: false,
      },
      {
        name: 'description',
        type: 'string',
        description: 'Payment description',
        required: false,
      }
    );
  }

  if (path.includes('user') && (method === 'post' || method === 'put')) {
    fields.push(
      {
        name: 'email',
        type: 'string',
        description: 'User email',
        required: false,
      },
      {
        name: 'username',
        type: 'string',
        description: 'Username',
        required: false,
      },
      {
        name: 'firstName',
        type: 'string',
        description: 'First name',
        required: false,
      },
      {
        name: 'lastName',
        type: 'string',
        description: 'Last name',
        required: false,
      }
    );
  }

  if (path.includes('transaction')) {
    fields.push(
      {
        name: 'amount',
        type: 'number',
        description: 'Transaction amount',
        required: true,
      },
      {
        name: 'description',
        type: 'string',
        description: 'Transaction description',
        required: false,
      }
    );
  }

  // Generic fallbacks based on HTTP method
  if (method === 'post' && fields.length === 0) {
    fields.push({
      name: 'data',
      type: 'object',
      description: 'Request data',
      required: true,
    });
  }

  return fields;
}
