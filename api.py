"""
FastAPI backend that bridges the frontend to the ADK agents.
Run with: uv run uvicorn api:app --reload --port 8001
"""
import os
import json
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / "create_arch_agent" / ".env")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types as genai_types
from create_arch_agent.agent import root_agent

app = FastAPI(title="ArchGen API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

session_service = InMemorySessionService()
runner = Runner(agent=root_agent, app_name="archgen", session_service=session_service)

# Capture the original API key (from Vercel env or .env) to prevent cross-user leakage
INITIAL_API_KEY = os.environ.get("GOOGLE_API_KEY")


class ChatRequest(BaseModel):
    message: str
    api_key: str | None = None


@app.post("/api/chat")
async def chat(request: ChatRequest):
    # Restore/Set authentication
    if request.api_key == 'app_default':
        if INITIAL_API_KEY:
            os.environ["GOOGLE_API_KEY"] = INITIAL_API_KEY
        else:
            # If no server-side key, remove any stale keys from previous requests
            if "GOOGLE_API_KEY" in os.environ:
                del os.environ["GOOGLE_API_KEY"]
    elif request.api_key and request.api_key.strip():
        os.environ["GOOGLE_API_KEY"] = request.api_key.strip()

    user_id = "default_user"
    session = await session_service.create_session(app_name="archgen", user_id=user_id)
    session_id = session.id

    content = genai_types.Content(
        role="user",
        parts=[genai_types.Part(text=request.message)],
    )

    agent_texts = []
    try:
        async for event in runner.run_async(
            user_id=user_id, session_id=session_id, new_message=content
        ):
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        agent_texts.append(part.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    session = await session_service.get_session(
        app_name="archgen", user_id=user_id, session_id=session_id
    )
    state = session.state if session else {}

    graph = state.get("structured_graph")
    if graph and hasattr(graph, "model_dump"):
        graph = graph.model_dump()
    elif graph and isinstance(graph, str):
        try:
            graph = json.loads(graph)
        except json.JSONDecodeError:
            pass

    return {
        "structured_graph": graph,
        "drawio_xml": state.get("drawio_xml", ""),
        "blueprint": state.get("blueprint", ""),
        "agent_response": "\n\n".join(agent_texts) if agent_texts else "Done.",
    }
