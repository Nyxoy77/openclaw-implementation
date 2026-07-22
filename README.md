# nyxoy-claw

An open-source clone of Openclaw, a command-line tool integrating AI capabilities with a focus on terminal user interface.

## Features
- AI-driven prompts and responses using the @openrouter/ai-sdk-provider
- Wakeup command to trigger agent actions
- Customizable modes in the `modes/` directory
- Modular architecture with agent tools and CLI commands

## Getting Started
1. Install dependencies:
   ```bash
   bun install
   ```

2. Run the application:
   ```bash
   bun index.ts
   ```

3. Use the Wakeup command:
   ```bash
   openclaw Wakeup
   ```

## Project Structure
```
nyxoy-claw/
├── ai/              # AI agent configuration and models
├── modes/           # Different modes for the application
├── terminal_ui_Interface/ # Terminal interface components
├── package.json     # Project dependencies
└── index.ts         # Main entry point
```

## Dependencies
- `@clack/core`
- `@openrouter/ai-sdk-provider`
- `ai` (custom AI module)
- `commander` for CLI handling

## Contributing
Contributions are welcome! Please check the CONTRIBUTING.md file for guidelines.

## License
MIT