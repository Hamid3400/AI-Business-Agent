from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI
import os

load_dotenv()

app = FastAPI(
    title="AI Business Agent",
    description="AI-powered customer service and business automation platform",
    version="0.1.0"
)

api_key = os.getenv("AI_API_KEY")

if not api_key:
    raise RuntimeError("AI_API_KEY is not configured in the .env file.")

client = OpenAI(api_key=api_key)


class ChatRequest(BaseModel):
    message: str


@app.get("/")
def home():
    return {
        "status": "online",
        "message": "AI Business Agent API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


@app.post("/chat")
def chat(request: ChatRequest):

    if not request.message.strip():
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty."
        )

    try:
        response = client.responses.create(
            model="gpt-5.6-luna",
            instructions=(
                "You are the AI customer service assistant for a business. "
                "Be helpful, professional, clear, and concise. "
                "Answer the customer's question directly. "
                "If you do not know something, say so instead of inventing information."
            ),
            input=request.message.strip()
        )

        return {
            "success": True,
            "message": response.output_text
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="The AI service could not process your request."
        )