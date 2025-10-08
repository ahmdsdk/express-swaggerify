# Contributing to Swaggerify

Thank you for your interest in contributing! 🎉

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/swaggerify.git`
3. Install dependencies: `yarn install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development

```bash
# Build the project
yarn build

# Run in development mode
yarn dev

# Run tests
yarn test

# Lint code
yarn lint

# Format code
yarn format
```

## Project Structure

```
swaggerify/
├── src/
│   ├── index.ts       # Main entry point and public API
│   ├── cli.ts         # CLI tool
│   ├── parser.ts      # Route and controller parsing logic
│   ├── generator.ts   # Swagger endpoint generation
│   └── types.ts       # TypeScript interfaces and types
├── examples/          # Example projects
├── tests/            # Test files
└── docs/             # Additional documentation
```

## Making Changes

1. **Write clear commit messages** using conventional commits:
   - `feat: add new feature`
   - `fix: fix bug`
   - `docs: update documentation`
   - `refactor: refactor code`
   - `test: add tests`

2. **Add tests** for new features

3. **Update documentation** if needed

4. **Follow code style** - run `yarn format` before committing

## Pull Request Process

1. Update the README.md with details of changes if needed
2. Update the CHANGELOG.md with your changes
3. The PR will be merged once you have approval from maintainers

## Testing

Please ensure all tests pass before submitting a PR:

```bash
yarn test
```

## Code Style

We use:
- **ESLint** for linting
- **Prettier** for code formatting
- **TypeScript** strict mode

## Questions?

Feel free to open an issue for any questions or clarifications!

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

