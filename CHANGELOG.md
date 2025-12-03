# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.5] - 2025-12-03

### Changed
- 🔐 Verified npm publish using granular access token

## [1.2.4] - 2025-12-03

### Changed
- 🔧 Removed self-referential `express-swaggerify` devDependency and cleaned up development setup

## [1.2.3] - 2025-11-19

### Fixed
- 🐛 Fixed nullable field formatting in OpenAPI schemas - now correctly uses `nullable: true` instead of `type: ['string', 'null']`
- ✅ Improved `cleanJsonSchema` function to properly convert Joi's nullable types to OpenAPI 3.0 format
- 🔧 Fixed enum arrays containing `null` to use `nullable: true` property instead of including null in enum values

## [1.0.2] - 2024-10-08

### Fixed
- 🐛 Fixed schema references in generated endpoints to use proper OpenAPI `$ref` format
- 🐛 Changed from `schemas.ApiResponse` to `{ $ref: '#/components/schemas/ApiResponse' }`

## [1.0.1] - 2024-10-08

### Fixed
- ✅ Added missing middleware files (auth.ts, validation.ts) to example app
- ✅ Added missing schema files (authSchemas.ts) to example app
- ✅ Created comprehensive example README with usage instructions

### Changed
- 📝 Updated main README with important notes about supported patterns
- 📝 Added limitations and best practices section
- 📝 Clarified what route patterns work vs. don't work

## [1.0.0] - 2024-10-08

### Added
- 🎉 Initial release of Swaggerify
- 🔍 Smart route detection for Express.js applications
- 🧠 Intelligent field type inference from controller code
- 📝 Auto-generated endpoint summaries
- 🏷️ Tag-based endpoint organization by route file
- 🔒 Automatic authentication middleware detection
- 📊 HTTP status code extraction from controllers
- 🎯 Smart default field generation for common patterns
- 📋 OpenAPI 3.0 compliant specification generation
- 💻 CLI tool for command-line usage
- 📚 Comprehensive documentation and examples
- ✅ Multi-line route definition support
- 🔄 Path parameter detection and documentation

### Features
- Parses both single-line and multi-line Express.js routes
- Analyzes controller methods to extract request body fields
- Generates meaningful operation IDs
- Supports custom schemas and configuration
- Validates routes without generating documentation
- Exports programmatic API for integration

### Documentation
- Detailed README with usage examples
- Example Express.js application
- Contributing guidelines
- MIT License

## [1.2.0] - 2025-01-XX

### Added
- 🎉 **TypeScript Type Extraction** - Automatically extracts TypeScript interfaces and type aliases from a types directory
- 📦 New `--schemas-dir` CLI option to specify directory containing TypeScript type definitions
- 🔄 Automatic conversion of TypeScript types to OpenAPI JSON schemas
- 🔗 **Type Inlining** - Referenced types are automatically inlined into parent types
- ✅ Support for extracting interfaces, type aliases, unions, arrays, and primitive types
- 🔧 Proper handling of optional properties, nullable types, and circular references

### Changed
- Enhanced schema generation to support TypeScript type extraction
- Improved type detection using TypeScript compiler API
- Better boolean type detection using TypeScript type flags

### Technical
- Added `typeExtractor.ts` module for TypeScript type parsing and conversion
- Uses TypeScript compiler API to parse and extract type definitions
- Supports nested type references with automatic inlining
- Handles circular references gracefully with `$ref` fallback

## [1.1.1] - 2025-11-01

### Fixed
- 🐛 Prevent smart defaults from being applied when a validator is specified but extraction fails
- ✅ Avoid adding incorrect fields when Joi schema extraction is attempted but unsuccessful
- 🔧 Fixed route parsing to properly handle nested parentheses in multi-line route definitions
- 🔧 Improved validator detection to correctly parse `validate()` calls with complex middleware chains
- 🔄 Replaced `joi-to-json-schema` with `joi-to-json` package for Joi 18.x compatibility
- ✅ Joi schema extraction now working correctly - extracts accurate request body schemas from validators

## [1.1.0] - 2025-11-01

### Added
- 🎉 **Joi Schema Extraction** - Automatically extracts request body schemas from Joi validators
- 📦 Support for extracting schemas from `validate(authSchemas.register)` middleware calls
- 🔄 Automatic conversion of Joi schemas to OpenAPI 3.0 JSON Schema format
- 🎯 Smart schema loading with multiple validator directory search paths
- 📝 New `--validators-dir` CLI option to specify validator directory location
- ✅ Graceful fallback to controller inference if Joi schema not found
- 🔧 Integration with `joi-to-json-schema` for accurate schema conversion

### Changed
- Enhanced route parser to detect and extract validator schema references
- Updated generator to prioritize Joi schemas over inferred fields
- Improved request body schema generation with proper OpenAPI 3.0 formatting

### Technical
- Added `joiExtractor.ts` module for schema loading and conversion
- Uses `ts-node` for dynamic TypeScript module loading
- Supports nested schema objects (e.g., `authSchemas.register`)
- Handles multiple validator file naming conventions

## [Unreleased]

### Planned
- [ ] Support for additional frameworks (Fastify, Koa)
- [ ] Enhanced type inference
- [ ] Response schema generation
- [ ] Query parameter detection
- [ ] Integration with popular testing frameworks
- [ ] GitHub Actions workflow examples
- [ ] More comprehensive test suite

