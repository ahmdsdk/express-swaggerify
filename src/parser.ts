import { RouteInfo, ControllerInfo, FieldInfo } from './types';
import * as path from 'path';
import * as fs from 'fs-extra';

// Try to import TypeScript, fallback gracefully if not available
let tsModule: typeof import('typescript') | null = null;
try {
  tsModule = require('typescript');
} catch (error) {
  // TypeScript not available
}

export function extractRoutes(
  fileContent: string,
  basePath: string,
  routeFilePath?: string,
  validatorsDir?: string
): RouteInfo[] {
  const routes: RouteInfo[] = [];

  // Use a regex to find router.METHOD( calls, then manually parse to handle nested parentheses
  const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;

  let match;
  while ((match = routeRegex.exec(fileContent)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    const startPos = match.index + match[0].length; // Position after the path string

    // Now find the matching closing parenthesis for router.METHOD(
    // Start with parenCount = 1 because we're already inside router.METHOD(
    let parenCount = 1;
    let endPos = fileContent.length;
    for (let i = startPos; i < fileContent.length; i++) {
      if (fileContent[i] === '(') parenCount++;
      else if (fileContent[i] === ')') {
        parenCount--;
        if (parenCount === 0) {
          endPos = i;
          break;
        }
      }
    }

    // Extract the middleware and handler section (inside the router.METHOD parentheses)
    let middlewareAndHandler = fileContent.substring(startPos, endPos);

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
      // Match validate() calls - handle multi-line cases and nested calls
      // Look for validate( followed by content until the matching closing paren
      const validateStart = middlewareAndHandler.indexOf('validate(');
      if (validateStart !== -1) {
        let parenCount = 0;
        let start = validateStart + 'validate('.length;
        let end = start;

        // Find the matching closing parenthesis
        for (let i = start; i < middlewareAndHandler.length; i++) {
          if (middlewareAndHandler[i] === '(') parenCount++;
          else if (middlewareAndHandler[i] === ')') {
            if (parenCount === 0) {
              end = i;
              break;
            }
            parenCount--;
          }
        }

        if (end > start) {
          const schemaRef = middlewareAndHandler.substring(start, end).trim().replace(/\s+/g, ' ');
          middleware.push(`validate(${schemaRef})`);
          validatorSchema = schemaRef; // Store schema reference for Joi extraction
        }
      }
    }

    const hasAuth = middleware.some(
      m => m.includes('authenticate') || m.includes('requireAdmin')
    );

    // Extract handler name (look for controller.method or anonymous functions)
    let handlerName = 'unknown';
    let controllerMethod = 'unknown';

    // Look for controller.method pattern specifically in the LAST argument
    // Prefer the last property access before optional .bind(...)
    const matches = Array.from(middlewareAndHandler.matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)(?=\s*(?:\.bind\s*\(|,|\)|$))/g));
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      const obj = last[1];
      const meth = last[2];
      handlerName = `${obj}.${meth}`;
      controllerMethod = meth;
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
  methodName: string,
  controllerFilePath?: string,
  availableTypeNames?: Set<string>
): ControllerInfo {
  const lines = controllerContent.split('\n');
  const statusCodes: number[] = [];
  let requestBodyType: string | undefined;
  let requestBodyFields: FieldInfo[] = [];
  let responseType: string | undefined;
  let inMethod = false;
  let braceCount = 0;

  // Build candidate method names (original and without HTTP verb prefix)
  const methodCandidates: string[] = [methodName];
  const stripped = methodName.replace(/^(get|post|put|patch|delete)/i, '');
  if (stripped && stripped !== methodName) {
    methodCandidates.push(stripped);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Find method definition
    if ((line.includes('async') || line.includes('=')) && methodCandidates.some(c => line.toLowerCase().includes(c.toLowerCase()))) {
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

  // Extract response types using TypeScript compiler API if available
  const responseTypesByStatus = tsModule && controllerFilePath
    ? extractResponseTypesFromMethod(controllerContent, controllerFilePath, methodName, availableTypeNames)
    : undefined;

  if (responseTypesByStatus && responseTypesByStatus.size > 0) {
    console.log(`  📊 Extracted response types for ${methodName}:`, Array.from(responseTypesByStatus.entries()).map(([code, type]) => `${code}: ${type}`).join(', '));
    // Ensure statusCodes includes any discovered statuses (e.g., 200 from res.json without res.status)
    for (const code of responseTypesByStatus.keys()) {
      if (!statusCodes.includes(code)) {
        statusCodes.push(code);
      }
    }
  }

  return { requestBodyType, requestBodyFields, responseType, statusCodes, responseTypesByStatus };
}

/**
 * Extract response types for each status code using TypeScript compiler API
 */
function extractResponseTypesFromMethod(
  controllerContent: string,
  controllerFilePath: string,
  methodName: string,
  availableTypeNames?: Set<string>
): Map<number, string> | undefined {
  if (!tsModule) {
    return undefined;
  }

  const ts = tsModule;
  const responseTypes = new Map<number, string>();

  try {
    // Helper: detect response envelope types dynamically by shape (success: boolean, and data or error)
    const isResponseEnvelopeType = (t: any): boolean => {
      if (!t || typeof t.getProperties !== 'function') return false;
      const props = t.getProperties();
      const byName: Record<string, any> = {};
      for (const p of props) {
        byName[p.getName()] = p;
      }
      const successSym = byName['success'];
      if (!successSym) return false;
      const successType = checker.getTypeOfSymbolAtLocation(successSym, successSym.valueDeclaration || successSym.declarations?.[0] || sourceFile);
      const successTypeStr = checker.typeToString(successType);
      const hasDataOrError = Boolean(byName['data'] || byName['error']);
      return hasDataOrError && successTypeStr === 'boolean';
    };
    // Create a TypeScript program for the controller file
    const program = ts.createProgram([controllerFilePath], {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.CommonJS,
      allowJs: false,
      skipLibCheck: true,
    });

    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(controllerFilePath);

    if (!sourceFile) {
      return undefined;
    }

    // Find the method declaration (try original and without HTTP verb)
    const methodCandidates: string[] = [methodName];
    const stripped = methodName.replace(/^(get|post|put|patch|delete)/i, '');
    if (stripped && stripped !== methodName) methodCandidates.push(stripped);
    let methodNode: any = null;
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isClassDeclaration(node)) {
        // Traverse class members
        ts.forEachChild(node, (member) => {
          if (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) {
            const name = member.name?.getText(sourceFile);
            if (name && methodCandidates.some(c => name.toLowerCase() === c.toLowerCase())) {
              methodNode = member;
            }
          }
        });
      } else if (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) {
        const name = node.name?.getText(sourceFile);
        if (name && methodCandidates.some(c => name.toLowerCase() === c.toLowerCase())) {
          methodNode = node;
        }
      }
    });

    if (!methodNode) {
      console.log(`  ⚠️  Method ${methodName} not found in ${controllerFilePath}`);
      return undefined;
    }

    // If this is a class property with an arrow function, use the function node for params/body
    let functionNode: any = methodNode;
    if (ts.isPropertyDeclaration(methodNode) && methodNode.initializer && (ts.isArrowFunction(methodNode.initializer) || ts.isFunctionExpression(methodNode.initializer))) {
      functionNode = methodNode.initializer;
    }

    // Collect potential Response parameter names (e.g., res)
    const responseParamNames = new Set<string>();
    if (((ts.isMethodDeclaration(functionNode) || ts.isFunctionLike(functionNode)) && (functionNode as any).parameters)) {
      (functionNode as any).parameters.forEach((param: any) => {
        const paramName = param.name?.getText(sourceFile);
        if (paramName && ts.isIdentifier(param.name)) {
          if (param.type) {
            const pType = checker.getTypeAtLocation(param.type);
            const pTypeStr = checker.typeToString(pType);
            if (/Response/i.test(pTypeStr)) {
              responseParamNames.add(paramName);
            }
          }
        }
      });
      // Heuristic: if not detected by type, assume second param is response
      if (responseParamNames.size === 0 && (functionNode as any).parameters.length >= 2) {
        const second = (functionNode as any).parameters[1];
        if (second && ts.isIdentifier(second.name)) {
          responseParamNames.add(second.name.getText(sourceFile));
        }
      }
    }

    // Check if method has a return type annotation (e.g., Promise<ApiResponse<User>>)
    if (ts.isMethodDeclaration(methodNode) && methodNode.type) {
      const returnType = checker.getTypeAtLocation(methodNode.type);
      const returnTypeString = checker.typeToString(returnType);
      // Try to extract type name from return type
      const returnTypeMatch = returnTypeString.match(/([A-Z][a-zA-Z0-9]+)/);
      if (returnTypeMatch) {
        const extractedReturnType = returnTypeMatch[1];
        const builtInTypes = ['Promise', 'Object', 'Partial', 'Pick', 'Omit', 'Record'];
        if (!builtInTypes.includes(extractedReturnType)) {
          // If we have a return type, we could use it as a default for all status codes
          // But let's not do that - let's extract from actual res.status() calls instead
        }
      }
    }

    // First pass: Collect all variable declarations in the method with their types and initializers
    const variableTypes = new Map<string, string>();
    const variableDeclarations = new Map<string, any[]>();
    const collectVariables = (node: any) => {
      if (ts.isVariableDeclaration(node)) {
        const varName = node.name?.getText(sourceFile);
        if (varName && ts.isIdentifier(node.name)) {
          // Store the declaration node so we can examine its initializer later (keep all decls)
          const list = variableDeclarations.get(varName) || [];
          list.push(node);
          variableDeclarations.set(varName, list);
          
          // Check if there's an explicit type annotation
          if (node.type) {
            const type = checker.getTypeAtLocation(node.type);
            const typeString = checker.typeToString(type);
            
            // Extract full type name
            // Try to get the full type name, not just the first word
            const symbol = type.getSymbol();
              if (symbol) {
                const symbolName = symbol.getName();
                const builtInTypes = ['Object', 'Promise', 'Partial', 'Pick', 'Omit', 'Record'];
                if (!builtInTypes.includes(symbolName)) {
                  variableTypes.set(varName, symbolName);
                }
              } else {
              // Fallback to regex matching for complex types
              const typeMatch = typeString.match(/([A-Z][a-zA-Z0-9]+)/);
              if (typeMatch) {
                const extractedType = typeMatch[1];
                const builtInTypes = ['Object', 'Promise', 'Partial', 'Pick', 'Omit', 'Record'];
                if (!builtInTypes.includes(extractedType)) {
                  variableTypes.set(varName, extractedType);
                }
              }
            }
          } else {
            // Infer type from initializer
            if (node.initializer) {
              const type = checker.getTypeAtLocation(node.initializer);
              const typeString = checker.typeToString(type);
              const symbol = type.getSymbol();
              if (symbol) {
                const symbolName = symbol.getName();
                const builtInTypes = ['Object', 'Promise', 'Partial', 'Pick', 'Omit', 'Record'];
                if (!builtInTypes.includes(symbolName)) {
                  variableTypes.set(varName, symbolName);
                }
              } else {
                const typeMatch = typeString.match(/([A-Z][a-zA-Z0-9]+)/);
                if (typeMatch) {
                  const extractedType = typeMatch[1];
                  const builtInTypes = ['Object', 'Promise', 'Partial', 'Pick', 'Omit', 'Record'];
                  if (!builtInTypes.includes(extractedType)) {
                  variableTypes.set(varName, extractedType);
                  }
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, collectVariables);
    };

    collectVariables(functionNode);

    // Second pass: Find all res.status(code).json(...) expressions
    const visit = (node: any) => {
      // Look for res.status().json() patterns
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        
        // Check if this is a .json() call
        if (ts.isPropertyAccessExpression(expression) && expression.name?.getText() === 'json') {
          const objectExpr = expression.expression;
          // Handle res.json(...) without explicit status
          if (ts.isPropertyAccessExpression(objectExpr)) {
            const baseExpr = objectExpr.expression;
            if (ts.isIdentifier(baseExpr)) {
              const baseName = baseExpr.getText(sourceFile);
              if (responseParamNames.has(baseName)) {
                const statusCode = 200;
                const jsonArg = node.arguments[0];
                if (jsonArg) {
                  let extractedType: string | undefined;

                  // If it's an identifier, check if we have its type from variable declarations
                  if (ts.isIdentifier(jsonArg)) {
                    const varName = jsonArg.getText(sourceFile);
                    extractedType = variableTypes.get(varName);

                    // If we found ApiResponse (generic), try to find a more specific type by examining the initializer
                    if (extractedType === 'ApiResponse' && variableDeclarations.has(varName)) {
                      const decls = (variableDeclarations.get(varName) || []).filter(d => d.pos <= node.pos);
                      let varDecl = decls.sort((a, b) => b.pos - a.pos)[0];
                      if (!varDecl) {
                        const all = variableDeclarations.get(varName)!;
                        varDecl = all[all.length - 1];
                      }
                      // First, check if the variable has a more specific type annotation
                      if (varDecl.type) {
                        const typeAnnotation = checker.getTypeAtLocation(varDecl.type);
                        const typeAnnotationString = checker.typeToString(typeAnnotation);
                        const typeMatch = typeAnnotationString.match(/([A-Z][a-zA-Z0-9]+)/);
                        if (typeMatch) {
                          const annotatedType = typeMatch[1];
                          const builtInTypes = ['Object', 'Promise', 'Partial', 'Pick', 'Omit', 'Record', 'ApiResponse'];
                          if (!builtInTypes.includes(annotatedType) && availableTypeNames && availableTypeNames.has(annotatedType)) {
                            extractedType = annotatedType;
                          }
                        }
                      }
                      // If we still have ApiResponse, check the initializer structure
                      if (extractedType === 'ApiResponse' && varDecl.initializer) {
                        if (ts.isObjectLiteralExpression(varDecl.initializer)) {
                          const dataPropertyNames: string[] = [];
                          varDecl.initializer.properties.forEach((prop: any) => {
                            if (ts.isPropertyAssignment(prop)) {
                              const propName = prop.name?.getText(sourceFile);
                              if (propName === 'data' && prop.initializer) {
                                if (ts.isObjectLiteralExpression(prop.initializer)) {
                                  prop.initializer.properties.forEach((dataProp: any) => {
                                    if (ts.isPropertyAssignment(dataProp)) {
                                      const dataPropName = dataProp.name?.getText(sourceFile);
                                      if (dataPropName) {
                                        dataPropertyNames.push(dataPropName);
                                      }
                                    }
                                  });
                                } else if (ts.isIdentifier(prop.initializer)) {
                                  const dataVarName = prop.initializer.getText(sourceFile);
                                  const dataVarType = variableTypes.get(dataVarName);
                                  if (dataVarType && availableTypeNames && availableTypeNames.has(dataVarType)) {
                                    extractedType = dataVarType;
                                  }
                                }
                              }
                            }
                          });
                          if (dataPropertyNames.length > 0 && availableTypeNames && availableTypeNames.size > 0 && extractedType === 'ApiResponse') {
                            for (const typeName of availableTypeNames) {
                              if (typeName === 'ApiResponse' || typeName === 'ErrorResponse') continue;
                              const typeNameLower = typeName.toLowerCase();
                              for (const propName of dataPropertyNames) {
                                const propNameCapitalized = propName.charAt(0).toUpperCase() + propName.slice(1);
                                if (typeNameLower.includes(propName.toLowerCase()) || typeName.includes(propNameCapitalized)) {
                                  extractedType = typeName;
                                  break;
                                }
                              }
                              if (extractedType !== 'ApiResponse') break;
                            }
                          }
                        }
                      }
                    }
                  }

                  // If we didn't find it from variables, try to infer from the expression type
                  if (!extractedType) {
                    const type = checker.getTypeAtLocation(jsonArg);
                    const symbol = type.getSymbol();
                    if (symbol) {
                      const symbolName = symbol.getName();
                      const builtInTypes = ['Object', 'Promise', 'Partial', 'Pick', 'Omit', 'Record'];
                      if (symbolName && symbolName[0] === symbolName[0].toUpperCase() && !builtInTypes.includes(symbolName)) {
                        const typeDecl = symbol.getDeclarations()?.[0];
                        if (typeDecl && (ts.isInterfaceDeclaration(typeDecl) || ts.isTypeAliasDeclaration(typeDecl))) {
                          extractedType = symbolName;
                        }
                      }
                    }
                    if (!extractedType && ts.isObjectLiteralExpression(jsonArg)) {
                      jsonArg.properties.forEach((prop: any) => {
                        if (ts.isPropertyAssignment(prop)) {
                          const propName = prop.name?.getText(sourceFile);
                          if (propName === 'data' && prop.initializer) {
                            const dataType = checker.getTypeAtLocation(prop.initializer);
                            const dataSymbol = dataType.getSymbol();
                            if (dataSymbol) {
                              const symbolName = dataSymbol.getName();
                              const builtInTypes = ['Object', 'Promise', 'Partial', 'Pick', 'Omit', 'Record'];
                              if (symbolName && symbolName[0] === symbolName[0].toUpperCase() && !builtInTypes.includes(symbolName)) {
                                const typeDecl = dataSymbol.getDeclarations()?.[0];
                                if (typeDecl && (ts.isInterfaceDeclaration(typeDecl) || ts.isTypeAliasDeclaration(typeDecl))) {
                                  if (!availableTypeNames || availableTypeNames.has(symbolName)) {
                                    extractedType = symbolName;
                                  }
                                }
                              }
                            }
                          }
                        }
                      });
                    }
                  }

                  if (extractedType) {
                    if (!availableTypeNames || availableTypeNames.has(extractedType)) {
                      responseTypes.set(statusCode, extractedType);
                    }
                  }
                }
              }
            }
          }
          
          // Check if objectExpr is a .status() call
          if (ts.isCallExpression(objectExpr)) {
            const statusExpression = objectExpr.expression;
            if (ts.isPropertyAccessExpression(statusExpression) && statusExpression.name?.getText() === 'status') {
              // Get the status code argument
              const statusArg = objectExpr.arguments[0];
              if (statusArg && ts.isNumericLiteral(statusArg)) {
                const statusCode = parseInt(statusArg.text);

                // For error statuses, always treat as ErrorResponse and skip inference
                if (statusCode >= 400) {
                  responseTypes.set(statusCode, 'ErrorResponse');
                  return;
                }

                // Get the argument passed to .json()
                const jsonArg = node.arguments[0];
                if (jsonArg) {
                  let extractedType: string | undefined;
                  
                  // If it's an identifier, check if we have its type from variable declarations
                  if (ts.isIdentifier(jsonArg)) {
                    const varName = jsonArg.getText(sourceFile);
                    extractedType = variableTypes.get(varName);
                    
                    // If we found ApiResponse (generic), try to find a more specific type by examining the initializer
                    if (extractedType === 'ApiResponse' && variableDeclarations.has(varName)) {
                      // Pick the nearest preceding declaration for this variable relative to the current call site
                      const decls = (variableDeclarations.get(varName) || []).filter(d => d.pos <= node.pos);
                      let varDecl = decls.sort((a, b) => b.pos - a.pos)[0];
                      if (!varDecl) {
                        // Fallback to last seen declaration
                        const all = variableDeclarations.get(varName)!;
                        varDecl = all[all.length - 1];
                      }
                      
                      // First, check if the variable has a more specific type annotation
                      if (varDecl.type) {
                        const typeAnnotation = checker.getTypeAtLocation(varDecl.type);
                        const typeAnnotationString = checker.typeToString(typeAnnotation);
                        
                        // Extract type name from annotation
                        const typeMatch = typeAnnotationString.match(/([A-Z][a-zA-Z0-9]+)/);
                        if (typeMatch) {
                          const annotatedType = typeMatch[1];
                          const builtInTypes = ['Object', 'Promise', 'Partial', 'Pick', 'Omit', 'Record', 'ApiResponse'];
                          if (!builtInTypes.includes(annotatedType) && availableTypeNames && availableTypeNames.has(annotatedType)) {
                            extractedType = annotatedType;
                          }
                        }
                      }
                      
                      // If we still have ApiResponse, check the initializer structure
                      if (extractedType === 'ApiResponse' && varDecl.initializer) {
                        // Analyze the initializer to find a more specific type
                        const initializerType = checker.getTypeAtLocation(varDecl.initializer);
                        const initializerTypeString = checker.typeToString(initializerType);
                        
                        // If the initializer is an object literal, extract its structure
                        if (ts.isObjectLiteralExpression(varDecl.initializer)) {
                          const dataPropertyNames: string[] = [];
                          varDecl.initializer.properties.forEach((prop: any) => {
                            if (ts.isPropertyAssignment(prop)) {
                              const propName = prop.name?.getText(sourceFile);
                              if (propName === 'data' && prop.initializer) {
                                // Check if data is an object literal
                                if (ts.isObjectLiteralExpression(prop.initializer)) {
                                  prop.initializer.properties.forEach((dataProp: any) => {
                                    if (ts.isPropertyAssignment(dataProp)) {
                                      const dataPropName = dataProp.name?.getText(sourceFile);
                                      if (dataPropName) {
                                        dataPropertyNames.push(dataPropName);
                                      }
                                    }
                                  });
                                } else if (ts.isIdentifier(prop.initializer)) {
                                  // If data is a variable reference (e.g., data: user), get its type
                                  const dataVarName = prop.initializer.getText(sourceFile);
                                  const dataVarType = variableTypes.get(dataVarName);
                                  if (dataVarType && availableTypeNames && availableTypeNames.has(dataVarType)) {
                                    extractedType = dataVarType;
                                  }
                                }
                              }
                            }
                          });
                          
                          // Dynamic structural matching: pick best envelope candidate by data keys overlap
                          if (dataPropertyNames.length > 0 && extractedType === 'ApiResponse') {
                            let bestName: string | undefined;
                            let bestScore = 0;
                            // Build envelope candidates from program source files
                            const candidateMap = new Map<string, string[]>();
                            for (const sf of program.getSourceFiles()) {
                              ts.forEachChild(sf, (n) => {
                                if (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) {
                                  if (!n.name) return;
                                  const t = checker.getTypeAtLocation(n);
                                  if (isResponseEnvelopeType(t)) {
                                    const props = t.getProperties();
                                    const byName: Record<string, any> = {} as any;
                                    for (const p of props) byName[p.getName()] = p;
                                    const dataSym = byName['data'];
                                    const keys: string[] = [];
                                    if (dataSym) {
                                      const dt = checker.getTypeOfSymbolAtLocation(dataSym, dataSym.valueDeclaration || dataSym.declarations?.[0] || sf);
                                      for (const dp of dt.getProperties()) keys.push(dp.getName());
                                    }
                                    candidateMap.set(n.name.getText(sf), keys);
                                  }
                                }
                              });
                            }
                            for (const [name, keys] of candidateMap.entries()) {
                              if (name === 'ApiResponse' || name === 'ErrorResponse') continue;
                              const overlap = keys.filter(k => dataPropertyNames.includes(k)).length;
                              if (overlap > bestScore) {
                                bestScore = overlap;
                                bestName = name;
                              }
                            }
                            if (bestName && (!availableTypeNames || availableTypeNames.has(bestName))) {
                              extractedType = bestName;
                            }
                          }
                        }
                      }
                    }
                  }
                  
                  // If we didn't find it from variables, try to infer from the expression type
                  if (!extractedType) {
                    const type = checker.getTypeAtLocation(jsonArg);
                    const typeString = checker.typeToString(type);
                    
                    // Try multiple strategies to extract type name
                    // Strategy 1: Check if it's a named type (interface/type alias)
                    const symbol = type.getSymbol();
                    if (symbol) {
                      const symbolName = symbol.getName();
                      const builtInTypes = ['Object', 'Promise', 'Partial', 'Pick', 'Omit', 'Record'];
                      // Check if symbol name is valid and not built-in
                      if (symbolName && symbolName[0] === symbolName[0].toUpperCase() && !builtInTypes.includes(symbolName)) {
                        // Additional check: make sure it's not an anonymous object type
                        const typeDecl = symbol.getDeclarations()?.[0];
                        if (typeDecl && (ts.isInterfaceDeclaration(typeDecl) || ts.isTypeAliasDeclaration(typeDecl))) {
                          const declared = checker.getDeclaredTypeOfSymbol(symbol);
                          if (declared && isResponseEnvelopeType(declared)) {
                            extractedType = symbolName;
                          }
                        }
                      }
                    }
                    
                    // Strategy 2: Try regex matching on type string (for generics like ApiResponse<User>)
                    if (!extractedType) {
                      const typeNameMatch = typeString.match(/([A-Z][a-zA-Z0-9]+)/);
                      if (typeNameMatch) {
                        const candidateType = typeNameMatch[1];
                        const builtInTypes = ['Object', 'Promise', 'Partial', 'Pick', 'Omit', 'Record'];
                        if (!builtInTypes.includes(candidateType)) {
                          // Verify it's actually a declared type
                          const symbol = type.getSymbol();
                          if (symbol && symbol.getName() === candidateType) {
                            const declared = checker.getDeclaredTypeOfSymbol(symbol);
                            if (declared && isResponseEnvelopeType(declared)) {
                              extractedType = candidateType;
                            }
                          }
                        }
                      }
                    }
                    
                    // Strategy 3: For object literals with 'data' property, try to extract the data type
                    if (!extractedType && ts.isObjectLiteralExpression(jsonArg)) {
                      // Look for a 'data' property and try to get its type
                      jsonArg.properties.forEach((prop: any) => {
                        if (ts.isPropertyAssignment(prop)) {
                          const propName = prop.name?.getText(sourceFile);
                          if (propName === 'data' && prop.initializer) {
                            const dataType = checker.getTypeAtLocation(prop.initializer);
                            const dataTypeString = checker.typeToString(dataType);
                            
                            // First try to get the symbol name if it's a declared type
                            const dataSymbol = dataType.getSymbol();
                            if (dataSymbol) {
                              const symbolName = dataSymbol.getName();
                              const builtInTypes = ['Object', 'Promise', 'Partial', 'Pick', 'Omit', 'Record'];
                              if (symbolName && symbolName[0] === symbolName[0].toUpperCase() && !builtInTypes.includes(symbolName)) {
                                const typeDecl = dataSymbol.getDeclarations()?.[0];
                                if (typeDecl && (ts.isInterfaceDeclaration(typeDecl) || ts.isTypeAliasDeclaration(typeDecl))) {
                                  // Only treat as response schema if the declared type has response envelope shape
                                  const declared = checker.getDeclaredTypeOfSymbol(dataSymbol);
                                  if (declared && isResponseEnvelopeType(declared)) {
                                    if (!availableTypeNames || availableTypeNames.has(symbolName)) {
                                      extractedType = symbolName;
                                    }
                                  }
                                }
                              }
                            }
                            
                            // Do not regex-match data types; avoid misclassifying domain models as response schemas
                          }
                        }
                      });
                    }
                  }
                  
                  if (extractedType) {
                    if (!availableTypeNames || availableTypeNames.has(extractedType)) {
                      responseTypes.set(statusCode, extractedType);
                    }
                  }
                }
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(functionNode);
    
    if (responseTypes.size === 0) {
      console.log(`  ⚠️  No response types extracted for ${methodName} - object literals may not have explicit types`);
    }
  } catch (error) {
    // Log error for debugging
    console.log(`  ⚠️  Could not extract response types for ${methodName}:`, (error as Error).message);
    if ((error as Error).stack) {
      console.log(`  Stack:`, (error as Error).stack?.split('\n').slice(0, 3).join('\n'));
    }
  }

  return responseTypes.size > 0 ? responseTypes : undefined;
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
  if (fieldName.toLowerCase().startsWith('is') || fieldName.toLowerCase().startsWith('has')) return 'boolean';

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
