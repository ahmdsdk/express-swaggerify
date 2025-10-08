# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [Unreleased]

### Planned
- [ ] Support for additional frameworks (Fastify, Koa)
- [ ] Enhanced type inference
- [ ] Response schema generation
- [ ] Query parameter detection
- [ ] Integration with popular testing frameworks
- [ ] GitHub Actions workflow examples
- [ ] More comprehensive test suite

