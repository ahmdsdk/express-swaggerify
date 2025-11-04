import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';

// Try to import TypeScript, fallback gracefully if not available
let tsModule: typeof import('typescript') | null = null;
try {
  tsModule = require('typescript');
} catch (error) {
  // TypeScript not available
}

/**
 * Load TypeScript types/interfaces from files and convert them to JSON schemas
 */
export async function loadTypesFromDirectory(
  schemasDir: string
): Promise<Record<string, any>> {
  const schemas: Record<string, any> = {};

  try {
    // Check if TypeScript is available
    if (!tsModule) {
      console.log(`  ⚠️  TypeScript not available. Cannot extract types from ${schemasDir}`);
      console.log(`  💡 Install TypeScript: npm install typescript`);
      return schemas;
    }

    const ts = tsModule;

    const schemasPath = path.join(process.cwd(), schemasDir);
    
    if (!await fs.pathExists(schemasPath)) {
      console.log(`  ⚠️  Schemas directory not found: ${schemasDir}`);
      return schemas;
    }

    // Find all TypeScript files in the schemas directory
    const typeFiles = await glob(`${schemasDir}/**/*.ts`, { cwd: process.cwd() });
    
    if (typeFiles.length === 0) {
      console.log(`  ⚠️  No TypeScript files found in ${schemasDir}`);
      return schemas;
    }

    console.log(`  📚 Found ${typeFiles.length} type file(s) in ${schemasDir}`);

    // Create a TypeScript program to parse all files
    const filePaths = typeFiles.map(f => path.join(process.cwd(), f));
    const program = ts.createProgram(filePaths, {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.CommonJS,
      allowJs: false,
      skipLibCheck: true,
    });

    const checker = program.getTypeChecker();

    // First pass: Collect all type declarations (interfaces and type aliases)
    const typeDeclarations = new Map<string, { node: any; isInterface: boolean }>();
    
    for (const sourceFile of program.getSourceFiles()) {
      // Only process files from our schemas directory
      if (!filePaths.includes(sourceFile.fileName)) {
        continue;
      }

      // Visit all nodes to collect type declarations
      ts.forEachChild(sourceFile, (node) => {
        if (ts.isInterfaceDeclaration(node)) {
          typeDeclarations.set(node.name.text, { node, isInterface: true });
        } else if (ts.isTypeAliasDeclaration(node)) {
          typeDeclarations.set(node.name.text, { node, isInterface: false });
        }
      });
    }

    console.log(`  📋 Found ${typeDeclarations.size} type declaration(s)`);

    // Second pass: Extract schemas with type reference resolution
    for (const sourceFile of program.getSourceFiles()) {
      // Only process files from our schemas directory
      if (!filePaths.includes(sourceFile.fileName)) {
        continue;
      }

      console.log(`  🔍 Processing ${path.relative(process.cwd(), sourceFile.fileName)}`);

      // Visit all nodes in the source file
      ts.forEachChild(sourceFile, (node) => {
        // Extract interface declarations
        if (ts.isInterfaceDeclaration(node)) {
          // Create a visited set with this type already in it to prevent self-reference issues
          const visitedSet = new Set<string>();
          visitedSet.add(node.name.text);
          const schema = extractInterfaceSchema(node, checker, ts, schemas, typeDeclarations, visitedSet);
          if (schema) {
            schemas[node.name.text] = schema;
            console.log(`    ✅ Extracted interface: ${node.name.text}`);
          }
        }
        
        // Extract type aliases (type declarations)
        if (ts.isTypeAliasDeclaration(node)) {
          // Create a visited set with this type already in it to prevent self-reference issues
          const visitedSet = new Set<string>();
          visitedSet.add(node.name.text);
          const schema = extractTypeAliasSchema(node, checker, ts, schemas, typeDeclarations, visitedSet);
          if (schema) {
            schemas[node.name.text] = schema;
            console.log(`    ✅ Extracted type: ${node.name.text}`);
          }
        }
      });
    }

    console.log(`  ✅ Loaded ${Object.keys(schemas).length} type definition(s)`);
    return schemas;
  } catch (error) {
    console.log(`  ⚠️  Error loading types from ${schemasDir}:`, (error as Error).message);
    return schemas;
  }
}

/**
 * Extract JSON schema from a TypeScript interface declaration
 */
function extractInterfaceSchema(
  node: any,
  checker: any,
  ts: typeof import('typescript'),
  extractedSchemas: Record<string, any>,
  typeDeclarations: Map<string, { node: any; isInterface: boolean }>,
  visitedTypes: Set<string>
): any | null {
  try {
    const type = checker.getTypeAtLocation(node);
    // Don't check for type references when extracting the type itself
    // Just extract its properties directly
    return typeToJsonSchema(type, checker, ts, extractedSchemas, typeDeclarations, visitedTypes, false);
  } catch (error) {
    return null;
  }
}

/**
 * Extract JSON schema from a TypeScript type alias declaration
 */
function extractTypeAliasSchema(
  node: any,
  checker: any,
  ts: typeof import('typescript'),
  extractedSchemas: Record<string, any>,
  typeDeclarations: Map<string, { node: any; isInterface: boolean }>,
  visitedTypes: Set<string>
): any | null {
  try {
    const type = checker.getTypeAtLocation(node);
    // Don't check for type references when extracting the type itself
    // Just extract its properties directly
    return typeToJsonSchema(type, checker, ts, extractedSchemas, typeDeclarations, visitedTypes, false);
  } catch (error) {
    return null;
  }
}

/**
 * Convert a TypeScript type to JSON schema
 * Inlines referenced types when they're found in the extracted schemas
 */
function typeToJsonSchema(
  type: any,
  checker: any,
  ts: typeof import('typescript'),
  extractedSchemas: Record<string, any>,
  typeDeclarations: Map<string, { node: any; isInterface: boolean }>,
  visitedTypes: Set<string>, // Track visited types to prevent infinite recursion
  checkForTypeReferences: boolean = true // Whether to check for and inline type references
): any {
  // Check if this type references one of our extracted types FIRST
  // This needs to happen before other type checks
  // Try multiple ways to get the type name
  let typeName: string | undefined;
  
  // Method 1: Get from symbol
  if (type.symbol) {
    typeName = type.symbol.getName();
  }
  
  // Method 2: Get from type string (e.g., "User" from "User")
  const typeString = checker.typeToString(type);
  if (!typeName || !typeDeclarations.has(typeName)) {
    // Extract the type name from the type string (remove generics, arrays, etc.)
    const match = typeString.match(/^([A-Z][a-zA-Z0-9_]*)/);
    if (match && typeDeclarations.has(match[1])) {
      typeName = match[1];
    }
  }
  
  // Method 3: Check if it's an interface/class type
  if (!typeName && type.isClassOrInterface()) {
    typeName = type.symbol?.getName();
  }
  
  // Check if this is a declared type we should inline (only if checkForTypeReferences is true)
  if (checkForTypeReferences && typeName && typeDeclarations.has(typeName)) {
    // Check if we've already extracted this schema - if so, inline it
    if (extractedSchemas[typeName]) {
      // Return the extracted schema (inline it)
      return JSON.parse(JSON.stringify(extractedSchemas[typeName]));
    }
    
    // Check for circular reference
    if (visitedTypes.has(typeName)) {
      // Circular reference detected - return a reference instead
      return { $ref: `#/components/schemas/${typeName}` };
    }
    
    // If not yet extracted, extract it now (but prevent infinite recursion)
    visitedTypes.add(typeName);
    const { node, isInterface } = typeDeclarations.get(typeName)!;
    const referencedSchema = isInterface
      ? extractInterfaceSchema(node, checker, ts, extractedSchemas, typeDeclarations, visitedTypes)
      : extractTypeAliasSchema(node, checker, ts, extractedSchemas, typeDeclarations, visitedTypes);
    
    if (referencedSchema) {
      // Store it for future reference
      extractedSchemas[typeName] = referencedSchema;
      // Return a copy to avoid circular reference issues
      return JSON.parse(JSON.stringify(referencedSchema));
    }
  }

  // Handle primitive types FIRST - before object types
  // Reuse typeString already declared above
  
  // Check TypeScript type flags for more accurate detection
  const flags = type.getFlags();
  if (flags & ts.TypeFlags.Boolean) {
    return { type: 'boolean' };
  }
  if (flags & ts.TypeFlags.String) {
    return { type: 'string' };
  }
  if (flags & ts.TypeFlags.Number) {
    return { type: 'number' };
  }
  
  // Also check type string as fallback
  if (typeString === 'string' || type.isStringLiteral()) {
    return { type: 'string' };
  }
  if (typeString === 'number' || typeString === 'bigint') {
    return { type: 'number' };
  }
  if (typeString === 'boolean') {
    return { type: 'boolean' };
  }
  if (typeString === 'null') {
    return { type: 'null' };
  }
  if (typeString.includes('Date')) {
    return { type: 'string', format: 'date-time' };
  }

  // Handle union types
  if (type.isUnion()) {
    const unionTypes = type.types;
    const enumValues: any[] = [];
    let allStringLiterals = true;

    for (const unionType of unionTypes) {
      if (unionType.isStringLiteral()) {
        enumValues.push(unionType.value);
      } else {
        allStringLiterals = false;
        break;
      }
    }

    if (allStringLiterals && enumValues.length > 0) {
      return {
        type: 'string',
        enum: enumValues,
      };
    }

    // If not all string literals, return first type's schema
    if (unionTypes.length > 0) {
      return typeToJsonSchema(unionTypes[0], checker, ts, extractedSchemas, typeDeclarations, visitedTypes, checkForTypeReferences);
    }
  }

  // Handle array types
  if (type.symbol?.getName() === 'Array' || checker.typeToString(type).includes('[]')) {
    const elementType = (type as any).typeArguments?.[0];
    if (elementType) {
      return {
        type: 'array',
        items: typeToJsonSchema(elementType, checker, ts, extractedSchemas, typeDeclarations, visitedTypes, checkForTypeReferences),
      };
    }
    return {
      type: 'array',
      items: {},
    };
  }

  // Handle object types (interfaces)
  // Always extract properties - don't skip if it's a declared type
  // The declared type check above only handles referencing already-extracted types
  if (type.isClassOrInterface() || type.getSymbol()?.getName() === 'Object') {
    const schema: any = {
      type: 'object',
      properties: {},
      additionalProperties: false,
    };

    // Get all properties
    const properties = type.getProperties();
    const required: string[] = [];

    properties.forEach((prop: any) => {
      const propName = prop.getName();
      const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration!);
      
      // Create a new visited set for this property to allow referencing types
      const propVisitedTypes = new Set(visitedTypes);
      const propSchema = typeToJsonSchema(propType, checker, ts, extractedSchemas, typeDeclarations, propVisitedTypes, true);
      
      // Check if property is optional
      const isOptional = prop.getFlags() & ts.SymbolFlags.Optional;
      if (!isOptional && prop.valueDeclaration) {
        // Check if property has optional modifier (?)
        let hasOptionalModifier = false;
        if (ts.isPropertySignature(prop.valueDeclaration) || ts.isPropertyDeclaration(prop.valueDeclaration)) {
          hasOptionalModifier = prop.valueDeclaration.questionToken !== undefined;
        }
        if (!hasOptionalModifier) {
          required.push(propName);
        }
      }

      schema.properties[propName] = propSchema;
    });

    if (required.length > 0) {
      schema.required = required;
    }

    return schema;
  }

  // Handle nullable types (union with null) - this is handled above in union types, but check again
  if (type.isUnion()) {
    const types = type.types;
    const nonNullTypes = types.filter((t: any) => {
      const typeString = checker.typeToString(t);
      return typeString !== 'null' && !(t.getFlags() & ts.TypeFlags.Null);
    });
    if (nonNullTypes.length === 1 && types.length === 2) {
      const result = typeToJsonSchema(nonNullTypes[0], checker, ts, extractedSchemas, typeDeclarations, visitedTypes, checkForTypeReferences);
      result.nullable = true;
      return result;
    }
  }

  // Handle array types
  if (type.symbol?.getName() === 'Array' || checker.typeToString(type).includes('[]')) {
    const elementType = (type as any).typeArguments?.[0];
    if (elementType) {
      return {
        type: 'array',
        items: typeToJsonSchema(elementType, checker, ts, extractedSchemas, typeDeclarations, visitedTypes, checkForTypeReferences),
      };
    }
  }

  // Handle string literal types
  if (type.isStringLiteral()) {
    return {
      type: 'string',
      enum: [type.value],
    };
  }

  // Handle number literal types
  if (type.isNumberLiteral()) {
    return {
      type: 'number',
      enum: [type.value],
    };
  }

  // Default: return empty object schema
  return { type: 'object' };
}

