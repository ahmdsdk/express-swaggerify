import * as fs from 'fs-extra';
import * as path from 'path';
// joi-to-json exports a parse function for converting Joi to JSON Schema
const joiToJsonParse = require('joi-to-json');

/**
 * Load and convert Joi schema from validator files
 * This uses ts-node to dynamically load TypeScript validator modules
 */
export async function loadJoiSchemaFromValidator(
  schemaRef: string,
  routeFilePath?: string,
  validatorsDir?: string
): Promise<{ schema: any } | null> {
  try {
    // Parse schema reference (e.g., "authSchemas.register" -> "authSchemas" and "register")
    const parts = schemaRef.split('.');
    if (parts.length < 2) {
      return null;
    }

    const schemaGroup = parts[0]; // e.g., "authSchemas"
    const schemaName = parts[parts.length - 1]; // e.g., "register"

    // Try to find validator file
    const possibleValidatorFiles = [
      path.join(process.cwd(), validatorsDir || 'src/api/v1/validators', `${schemaGroup.replace('Schemas', '')}.ts`),
      path.join(process.cwd(), validatorsDir || 'src/api/v1/validators', `${schemaGroup.toLowerCase().replace('schemas', '')}.ts`),
      path.join(process.cwd(), 'src', 'validators', `${schemaGroup.replace('Schemas', '')}.ts`),
    ];

    // Also try to resolve from route file location
    if (routeFilePath) {
      const routeDir = path.dirname(routeFilePath);
      possibleValidatorFiles.push(
        path.join(routeDir, '..', 'validators', `${schemaGroup.replace('Schemas', '')}.ts`),
        path.join(routeDir, '..', '..', 'validators', `${schemaGroup.replace('Schemas', '')}.ts`),
        path.join(routeDir, 'validators', `${schemaGroup.replace('Schemas', '')}.ts`),
      );
    }

    let validatorFile: string | null = null;
    for (const file of possibleValidatorFiles) {
      if (await fs.pathExists(file)) {
        validatorFile = file;
        break;
      }
    }

    if (!validatorFile) {
      console.log(`  ⚠️  Validator file not found for ${schemaRef}`);
      return null;
    }

    console.log(`  ✅ Found validator file: ${validatorFile} for ${schemaRef}`);

    // Use ts-node to dynamically require the TypeScript module
    // We need to register ts-node with the project's tsconfig
    let tsNode: any;
    try {
      tsNode = require('ts-node');
    } catch (error) {
      console.log(`  ⚠️  ts-node not found. Please install ts-node to use Joi schema extraction: npm install -D ts-node`);
      return null;
    }

    const tsConfigPath = path.join(process.cwd(), 'tsconfig.json');

    // Register ts-node if not already registered
    // Check if ts-node is already registered by checking if .ts files can be required
    if (!(global as any).__tsNodeRegistered) {
      try {
        tsNode.register({
          project: (await fs.pathExists(tsConfigPath)) ? tsConfigPath : undefined,
          transpileOnly: true,
          compilerOptions: {
            module: 'commonjs',
          },
        });
        (global as any).__tsNodeRegistered = true;
      } catch (error) {
        // ts-node might already be registered, continue
      }
    }

    // Dynamically require the validator module
    // Remove .ts extension and resolve the module
    const modulePath = validatorFile.replace(/\.ts$/, '');
    const validatorModule = require(modulePath);

    // Extract the schema from the module
    // Handle both: export const authSchemas = { register: Joi.object(...) }
    // and: export const register = Joi.object(...)
    let joiSchema: any = null;

    if (validatorModule[schemaGroup] && validatorModule[schemaGroup][schemaName]) {
      // Pattern: authSchemas.register
      joiSchema = validatorModule[schemaGroup][schemaName];
    } else if (validatorModule[schemaName]) {
      // Pattern: direct export
      joiSchema = validatorModule[schemaName];
    } else {
      // Try to find by removing 'Schemas' suffix
      const groupWithoutSchemas = schemaGroup.replace('Schemas', '');
      if (validatorModule[groupWithoutSchemas] && validatorModule[groupWithoutSchemas][schemaName]) {
        joiSchema = validatorModule[groupWithoutSchemas][schemaName];
      }
    }

    if (!joiSchema) {
      console.log(`  ⚠️  Schema ${schemaName} not found in ${schemaGroup} from ${validatorFile}`);
      return null;
    }

    console.log(`  ✅ Found Joi schema: ${schemaName} in ${schemaGroup}`);

    // Verify it's actually a Joi schema before converting
    if (!joiSchema || (typeof joiSchema !== 'object' && typeof joiSchema !== 'function')) {
      console.log(`  ⚠️  Schema ${schemaName} is not a valid Joi schema object`);
      return null;
    }

    // Convert Joi schema to JSON Schema (OpenAPI compatible)
    try {
      // Use 'open-api-3.1' for OpenAPI 3.1 or 'open-api' for OpenAPI 3.0
      const jsonSchema = joiToJsonParse(joiSchema, 'open-api-3.1', {}, {
        required: true, // Include required fields
      });

      // The result is already an OpenAPI-compatible schema
      // Clean it up to ensure proper format
      const openApiSchema = cleanJsonSchema(jsonSchema);

      return { schema: openApiSchema };
    } catch (error) {
      console.log(`  ⚠️  Error converting Joi schema ${schemaRef} to JSON Schema:`, (error as Error).message);
      return null;
    }

  } catch (error) {
    console.log(`  ⚠️  Error loading Joi schema for ${schemaRef}:`, (error as Error).message);
    return null;
  }
}

/**
 * Clean and normalize JSON Schema to be OpenAPI 3.0 compatible
 */
function cleanJsonSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const cleaned: any = {};

  // Handle nullable types: convert type: ['string', 'null'] to type: 'string', nullable: true
  if (schema.type !== undefined) {
    if (Array.isArray(schema.type)) {
      // Check if array contains 'null'
      const hasNull = schema.type.includes('null');
      const nonNullTypes = schema.type.filter((t: any) => t !== 'null');

      if (hasNull && nonNullTypes.length === 1) {
        // Convert ['string', 'null'] to type: 'string', nullable: true
        cleaned.type = nonNullTypes[0];
        cleaned.nullable = true;
      } else if (hasNull && nonNullTypes.length > 1) {
        // Multiple non-null types with null: keep as oneOf
        cleaned.oneOf = [
          ...nonNullTypes.map((t: any) => ({ type: t })),
          { type: 'null' }
        ];
      } else {
        // No null, just use the types as-is
        cleaned.type = schema.type;
      }
    } else {
      cleaned.type = schema.type;
    }
  }

  if (schema.properties !== undefined) {
    cleaned.properties = {};
    Object.keys(schema.properties).forEach(key => {
      cleaned.properties[key] = cleanJsonSchema(schema.properties[key]);
    });
  }

  if (schema.required !== undefined && Array.isArray(schema.required)) {
    cleaned.required = schema.required;
  }

  if (schema.items !== undefined) {
    cleaned.items = cleanJsonSchema(schema.items);
  }

  // Copy format, pattern, minLength, maxLength, minimum, maximum
  if (schema.format !== undefined) cleaned.format = schema.format;
  if (schema.pattern !== undefined) cleaned.pattern = schema.pattern;
  if (schema.minLength !== undefined) cleaned.minLength = schema.minLength;
  if (schema.maxLength !== undefined) cleaned.maxLength = schema.maxLength;
  if (schema.minimum !== undefined) cleaned.minimum = schema.minimum;
  if (schema.maximum !== undefined) cleaned.maximum = schema.maximum;

  // Handle enum: remove null from enum array and set nullable instead
  if (schema.enum !== undefined) {
    if (Array.isArray(schema.enum) && schema.enum.includes(null)) {
      cleaned.enum = schema.enum.filter((v: any) => v !== null);
      cleaned.nullable = true;
    } else {
      cleaned.enum = schema.enum;
    }
  }

  if (schema.default !== undefined) cleaned.default = schema.default;
  if (schema.description !== undefined) cleaned.description = schema.description;
  if (schema.example !== undefined) cleaned.example = schema.example;

  // Preserve nullable if explicitly set
  if (schema.nullable !== undefined) cleaned.nullable = schema.nullable;

  // Handle oneOf/anyOf/allOf
  if (schema.oneOf !== undefined) {
    cleaned.oneOf = schema.oneOf.map((s: any) => cleanJsonSchema(s));
  }
  if (schema.anyOf !== undefined) {
    cleaned.anyOf = schema.anyOf.map((s: any) => cleanJsonSchema(s));
  }
  if (schema.allOf !== undefined) {
    cleaned.allOf = schema.allOf.map((s: any) => cleanJsonSchema(s));
  }

  return cleaned;
}
