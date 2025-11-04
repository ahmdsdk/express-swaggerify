#!/usr/bin/env node

import { Command } from 'commander';
import { swaggerifyRoutes, generateSwaggerDocs, saveSwaggerDocs, SwaggerifyOptions } from './index';

const program = new Command();

program
  .name('swaggerify')
  .description('Auto-generate OpenAPI 3.0 documentation from Express.js routes')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate Swagger documentation from routes')
  .option('-r, --routes-dir <dir>', 'Routes directory', './src/routes')
  .option('-c, --controllers-dir <dir>', 'Controllers directory', './src/controllers')
  .option('--validators-dir <dir>', 'Validators directory', './src/api/v1/validators')
  .option('--schemas-dir <dir>', 'Schemas directory for TypeScript type definitions')
  .option('-o, --output <file>', 'Output file', './swagger-docs.ts')
  .option('-b, --base-path <path>', 'Base API path', '/api/v1')
  .option('-t, --title <title>', 'API title', 'API Documentation')
  .option('-v, --version <version>', 'API version', '1.0.0')
  .option('-d, --description <desc>', 'API description', 'Auto-generated API documentation')
  .option('--no-smart-defaults', 'Disable smart field defaults')
  .option('--no-type-inference', 'Disable field type inference')
  .action(async (options) => {
    try {
      const config: SwaggerifyOptions = {
        routesDir: options.routesDir,
        controllersDir: options.controllersDir,
        validatorsDir: options.validatorsDir,
        schemasDir: options.schemasDir,
        outputFile: options.output,
        basePath: options.basePath,
        title: options.title,
        version: options.version,
        description: options.description,
        smartDefaults: options.smartDefaults,
        fieldTypeInference: options.typeInference,
      };

      const endpoints = await swaggerifyRoutes(config);
      await saveSwaggerDocs(endpoints, config);

      console.log('🎉 Swagger documentation generated successfully!');
    } catch (error) {
      console.error('❌ Error generating documentation:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate route files without generating documentation')
  .option('-r, --routes-dir <dir>', 'Routes directory', './src/routes')
  .option('-c, --controllers-dir <dir>', 'Controllers directory', './src/controllers')
  .action(async (options) => {
    try {
      const config: SwaggerifyOptions = {
        routesDir: options.routesDir,
        controllersDir: options.controllersDir,
        smartDefaults: false, // Don't generate, just validate
      };

      const endpoints = await swaggerifyRoutes(config);
      console.log(`✅ Found ${endpoints.length} valid endpoints`);

      endpoints.forEach(endpoint => {
        console.log(`  ${endpoint.method} ${endpoint.path} - ${endpoint.summary}`);
      });
    } catch (error) {
      console.error('❌ Error validating routes:', (error as Error).message);
      process.exit(1);
    }
  });

program.parse();
