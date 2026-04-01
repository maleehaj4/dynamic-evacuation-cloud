from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import json
import os

# ── Create the FastAPI app ─────────────────────────────────────────────────
# THIS LINE must exist and must not have any import errors above it
app = FastAPI(title="Dynamic Evacuation Cloud API")

# ── Allow React frontend to call this API ──────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Safe zones (hardcoded for now — replace with DB later) ─────────────────
SAFE_ZONES = [
    {"name": "Golconda Grounds",   "lat": 17.3833, "lng": 78.4011},
    {"name": "Parade Grounds",     "lat": 17.4360, "lng": 78.5012},
    {"name": "HICC Grounds",       "lat": 17.4278, "lng": 78.3860},
    {"name": "Nizam Institute",    "lat": 17.4239, "lng": 78.4484},
    {"name": "Gandhi Hospital",    "lat": 17.4440, "lng": 78.4932},
]

# ── WebSocket connections list ──────────────────────────────────────────────
ws_clients: List[WebSocket] = []

# ── Router object (loaded on startup) ──────────────────────────────────────
router = None


# ── Startup: load the graph file ───────────────────────────────────────────
@app.on_event("startup")
async def startup():
    global router
    graph_path = os.path.join(os.path.dirname(__file__), "data", "hyderabad_weighted.graphml")

    if os.path.exists(graph_path):
        try:
            # Only import osmnx if the file actually exists
            import osmnx as ox
            from routing.dijkstra import EvacuationRouter
            router = EvacuationRouter(graph_path)
            print("Graph loaded successfully!")
        except ImportError as e:
            print(f"WARNING: Could not import routing library: {e}")
            print("Run:  pip install osmnx networkx geopy")
        except Exception as e:
            print(f"WARNING: Graph failed to load: {e}")
    else:
        print(f"WARNING: Graph file not found at: {graph_path}")
        print("API will start but /api/route will return an error until graph is loaded.")


# ── Request model ───────────────────────────────────────────────────────────
class RouteRequest(BaseModel):
    origin_lat: float
    origin_lng: float
    algorithm: Optional[str] = "dijkstra"


# ── Health check endpoint ───────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "graph_loaded": router is not None,
    }


# ── Main route endpoint ─────────────────────────────────────────────────────
@app.post("/api/route")
async def get_route(req: RouteRequest):
    if router is None:
        # Return a helpful error instead of crashing
        return {
            "error": "Graph not loaded yet.",
            "fix": "Download hyderabad_weighted.graphml from Google Colab and place it in backend/data/",
            "offline": True,
        }

    result = router.find_route(
        req.origin_lat,
        req.origin_lng,
        SAFE_ZONES,
        req.algorithm,
    )
    return result


# ── Safe zones list ─────────────────────────────────────────────────────────
@app.get("/api/safe-zones")
async def get_safe_zones():
    return {"safe_zones": SAFE_ZONES}


# ── WebSocket for live hazard updates ──────────────────────────────────────
@app.websocket("/ws/updates")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    try:
        while True:
            await ws.receive_text()  # keep-alive ping
    except WebSocketDisconnect:
        ws_clients.remove(ws)


# ── Broadcast hazard to all open browser tabs ───────────────────────────────
async def broadcast_hazard(hazard: dict):
    msg = json.dumps({"type": "HAZARD_UPDATE", "data": hazard})
    for ws in ws_clients:
        await ws.send_text(msg)