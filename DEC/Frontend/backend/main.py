from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import json
import os

app = FastAPI(title="Dynamic Evacuation Cloud API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SAFE_ZONES = [
    {"name": "Golconda Grounds",  "lat": 17.3833, "lng": 78.4011},
    {"name": "Parade Grounds",    "lat": 17.4360, "lng": 78.5012},
    {"name": "HICC Grounds",      "lat": 17.4278, "lng": 78.3860},
    {"name": "Nizam Institute",   "lat": 17.4239, "lng": 78.4484},
    {"name": "Gandhi Hospital",   "lat": 17.4440, "lng": 78.4932},
]

ws_clients: List[WebSocket] = []
router = None

GRAPH_FILE_ID = "1ntl1z5aVAZ6JIWIM4zz6kNwA4n06pgBF"
GRAPH_PATH    = "data/hyderabad_weighted.graphml"


def download_graph():
    """Download graph from Google Drive if not already present."""
    if os.path.exists(GRAPH_PATH):
        print("Graph file already exists — skipping download.")
        return True

    os.makedirs("data", exist_ok=True)
    print("Downloading graph from Google Drive...")

    try:
        import requests
        # Step 1: get the download URL (handles large file confirmation)
        session  = requests.Session()
        url      = f"https://drive.google.com/uc?export=download&id={GRAPH_FILE_ID}"
        response = session.get(url, stream=True)

        # Step 2: handle Google's virus-scan warning for large files
        token = None
        for key, value in response.cookies.items():
            if key.startswith("download_warning"):
                token = value
                break

        if token:
            url      = f"https://drive.google.com/uc?export=download&id={GRAPH_FILE_ID}&confirm={token}"
            response = session.get(url, stream=True)

        # Step 3: save the file
        with open(GRAPH_PATH, "wb") as f:
            for chunk in response.iter_content(chunk_size=32768):
                if chunk:
                    f.write(chunk)

        size_mb = os.path.getsize(GRAPH_PATH) / (1024 * 1024)
        print(f"Downloaded! File size: {size_mb:.1f} MB")
        return True

    except Exception as e:
        print(f"ERROR downloading graph: {e}")
        return False


@app.on_event("startup")
async def startup():
    global router
    success = download_graph()
    if success and os.path.exists(GRAPH_PATH):
        try:
            import osmnx as ox
            from routing.dijkstra import EvacuationRouter
            router = EvacuationRouter(GRAPH_PATH)
            print("Router ready!")
        except Exception as e:
            print(f"WARNING: Could not load router: {e}")
    else:
        print("WARNING: Graph not available. /api/route will return error.")


class RouteRequest(BaseModel):
    origin_lat: float
    origin_lng: float
    algorithm:  Optional[str] = "dijkstra"


@app.get("/api/health")
async def health():
    return {"status": "ok", "graph_loaded": router is not None}


@app.post("/api/route")
async def get_route(req: RouteRequest):
    if router is None:
        return {"error": "Graph not loaded yet. Try again in 2 minutes."}
    result = router.find_route(
        req.origin_lat, req.origin_lng, SAFE_ZONES, req.algorithm
    )
    return result


@app.get("/api/safe-zones")
async def get_safe_zones():
    return {"safe_zones": SAFE_ZONES}


@app.websocket("/ws/updates")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_clients.remove(ws)
