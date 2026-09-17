# AI Agent

## 1. Overview

The AI Agent is the core intelligence layer of the AI Business Agent Platform.

It receives a customer message, sends the message to the configured AI model through the OpenAI API, and returns an AI-generated response.

## 2. Current Architecture

Customer
    |
    v
POST /chat
    |
    v
FastAPI Backend
    |
    v
OpenAI API
    |
    v
AI Model
    |
    v
AI Response
    |
    v
Customer

## 3. Technologies

- Python
- FastAPI
- Uvicorn
- OpenAI API
- python-dotenv
- Pydantic

## 4. Environment Configuration

The application reads the AI API key from the `.env` file.

The real API key is stored locally and must never be committed to GitHub.

Example:

AI_API_KEY=your_api_key_here

The `.env` file is excluded through `.gitignore`.

## 5. API Endpoints

### GET /

Checks whether the application is running.

Expected response:

```json
{
  "status": "online",
  "message": "AI Business Agent API is running"
}