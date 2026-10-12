# AI Foundation Module

This module represents the AI foundation for Cero. It is strictly isolated from command execution and OS logic.

## Responsibilities
- **Intent Routing**: Analyzes user input and determines the core intent (e.g., clone repository, search file).
- **Entity Extraction**: Normalizes and extracts structured parameters from natural language (IPs, emails, paths).
- **Tool Selection**: Uses a semantic registry and keyword ranking to inject only relevant Tool schemas into the prompt.
- **Prompt Generation**: Deterministically builds system prompts and context payload for interchangeable LLMs.

## Architecture Guidelines
- **No Execution**: The AI module NEVER runs commands. It returns Workflow JSON.
- **Provider Abstraction**: The `AIProvider` interface allows swapping from Ollama to Gemma or Cloud APIs with zero downstream changes.
- **Strict Typing**: All schemas are defined via Zod.
