import { RouteInfo, ControllerInfo, FieldInfo } from './types';
import * as path from 'path';
import * as fs from 'fs-extra';

export function extractRoutes(
  fileContent: string,
  basePath: string,
  routeFilePath?: string,
  validatorsDir?: string
): RouteInfo[] {
  const routes: RouteInfo[] = [];

  // Use a more comprehensive regex that handles both single-line and multi-line routes
  // This regex matches router.METHOD followed by parentheses that may span multiple lines
  const routeRegex =
    /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]([\s\S]*?)\);?/g;

  let match;
  while ((match = routeRegex.exec(fileContent)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    const middlewareAndHandler = match[3];

    const fullPath =
      basePath + routePath.replace(/:\w+/g, match => `{${match.substring(1)}}`);

    // Extract middleware from the full middleware and handler string
    const middleware: string[] = [];
    let validatorSchema: string | undefined;

    if (middlewareAndHandler.includes('authenticate'))
      middleware.push('authenticate');
    if (middlewareAndHandler.includes('requireAdmin'))
      middleware.push('requireAdmin');
    if (middlewareAndHandler.includes('validate')) {
      const validateMatch = middlewareAndHandler.match(/validate\(([^)]+)\)/);
      if (validateMatch) {
        const schemaRef = validateMatch[1].trim();
        middleware.push(`validate(${schemaRef})`);
        validatorSchema = schemaRef; // Store schema reference for Joi extraction
      }
    }

    const hasAuth = middleware.some(
      m => m.includes('authenticate') || m.includes('requireAdmin')
    );

    // Extract handler name (look for controller.method or anonymous functions)
    let handlerName = 'unknown';
    let controllerMethod = 'unknown';

    // Look for controller.method patterns
    const handlerMatch = middlewareAndHandler.match(/(\w+\.[\w.]+)/g);
    if (handlerMatch) {
      handlerName = handlerMatch[handlerMatch.length - 1];
      controllerMethod = handlerName.split('.').pop() || handlerName;
    } else {
      // Handle anonymous functions like (req, res) => { ... }
      if (
        middlewareAndHandler.includes('(req, res)') ||
        middlewareAndHandler.includes('(req,res)')
      ) {
        // Generate a meaningful operationId based on method and path
        controllerMethod = generateOperationId(method, routePath);
        handlerName = 'anonymous';
      }
    }

    // If we still don't have a good controllerMethod, generate one
    if (controllerMethod === 'unknown' || controllerMethod === 'bind') {
      controllerMethod = generateOperationId(method, routePath);
    }

    routes.push({
      method,
      path: fullPath,
      handlerName,
      controllerMethod,
      hasAuth,
      middleware,
      validatorSchema,
    });
  }

  return routes;
}

function generateOperationId(method: string, routePath: string): string {
  // Convert route path to a meaningful operation ID
  // Remove leading slash and replace slashes and special chars with camelCase
  const cleanPath = routePath
    .replace(/^\//, '') // Remove leading slash
    .replace(/[{}]/g, '') // Remove path parameters like {id}
    .replace(/[^a-zA-Z0-9/]/g, '') // Remove special characters except slashes
    .split('/') // Split by slashes
    .filter(Boolean) // Remove empty parts
    .map((part, index) =>
      index === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join('');

  // Combine method with path
  const operationId = method.toLowerCase() + cleanPath.charAt(0).toUpperCase() + cleanPath.slice(1);

  return operationId;
}

export function analyzeControllerMethod(
  controllerContent: string,
  methodName: string
): ControllerInfo {
  const lines = controllerContent.split('\n');
  const statusCodes: number[] = [];
  let requestBodyType: string | undefined;
  let requestBodyFields: FieldInfo[] = [];
  let responseType: string | undefined;
  let inMethod = false;
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Find method definition
    if (
      line.includes(`${methodName}`) &&
      (line.includes('async') || line.includes('='))
    ) {
      inMethod = true;
    }

    if (inMethod) {
      // Count braces to track method scope
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      // Extract status codes from res.status()
      const statusMatch = line.match(/res\.status\((\d+)\)/);
      if (statusMatch) {
        const code = parseInt(statusMatch[1]);
        if (!statusCodes.includes(code)) {
          statusCodes.push(code);
        }
      }

      // Extract request body usage with enhanced field analysis
      if (line.includes('req.body')) {
        const bodyMatch = line.match(/const\s+{([^}]+)}\s*=\s*req\.body/);
        if (bodyMatch) {
          requestBodyType = bodyMatch[1]
            .split(',')
            .map(s => s.trim())
            .join(', ');

          // Parse individual fields with type inference
          const fields = bodyMatch[1].split(',').map(s => s.trim());
          requestBodyFields = fields.map(field => {
            const cleanField = field.trim();
            return {
              name: cleanField,
              type: inferFieldType(cleanField, lines, i),
              required: true // Assume required for now, could be enhanced
            };
          });
        }
      }

      // End of method
      if (inMethod && braceCount === 0 && line.includes('}')) {
        break;
      }
    }
  }

  // Default to 200 if no status codes found
  if (statusCodes.length === 0) {
    statusCodes.push(200);
  }

  return { requestBodyType, requestBodyFields, responseType, statusCodes };
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
