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

HAZARD_ZONES = [
    {"name": "Hussain Sagar Flood", "lat": 17.4239, "lng": 78.4738, "radius_m": 1000, "severity": 0.9},
    {"name": "Old City Industrial",  "lat": 17.3616, "lng": 78.4747, "radius_m": 800,  "severity": 0.8},
    {"name": "Malkajgiri Fire Zone", "lat": 17.4454, "lng": 78.5279, "radius_m": 600,  "severity": 0.7},
    {"name": "Tarnaka Flood Risk",   "lat": 17.4285, "lng": 78.5284, "radius_m": 500,  "severity": 0.6},
]

ws_clients: List[WebSocket] = []
router    = None
graph_ref = None  # keep graph in memory

GRAPH_PATH = "data/hyderabad_weighted.graphml"


def apply_safety_weights(G):
    """Apply safety weights to all road edges based on proximity to hazard zones."""
    from geopy.distance import distance as geodist
    print("Applying safety weights to road edges...")
    for u, v, data in G.edges(data=True):
        node     = G.nodes[u]
        node_lat = node.get("y", 0)
        node_lng = node.get("x", 0)

        max_penalty = 0
        for hz in HAZARD_ZONES:
            dist_m = geodist((node_lat, node_lng), (hz["lat"], hz["lng"])).meters
            if dist_m < hz["radius_m"]:
                penalty     = hz["severity"] * (1 - dist_m / hz["radius_m"])
                max_penalty = max(max_penalty, penalty)

        dist   = data.get("length",      100)
        time   = data.get("travel_time",  30)
        hazard = max_penalty * 10000

        data["safe_weight"] = 0.3 * dist + 0.5 * hazard + 0.2 * time

    print("Safety weights applied!")
    return G


def load_or_build_graph():
    """Load graph from disk if exists, otherwise download from OpenStreetMap."""
    import osmnx as ox

    os.makedirs("data", exist_ok=True)

    # Use cached graph if available
    if os.path.exists(GRAPH_PATH):
        size_mb = os.path.getsize(GRAPH_PATH) / (1024 * 1024)
        if size_mb > 1:
            print(f"Loading cached graph ({size_mb:.1f} MB)...")
            G = ox.load_graphml(GRAPH_PATH)
            print(f"Graph loaded: {len(G.nodes):,} nodes | {len(G.edges):,} edges")
            return G

    # Download fresh from OpenStreetMap
    print("Downloading Hyderabad road network from OpenStreetMap...")
    print("This takes 3-5 minutes on first startup...")

    # Use bounding box — faster and smaller than full city
    bbox = (17.50, 17.32, 78.56, 78.38)  # north, south, east, west
    G = ox.graph_from_bbox(bbox, network_type="drive")
    G = ox.add_edge_speeds(G)
    G = ox.add_edge_travel_times(G)

    print(f"Downloaded: {len(G.nodes):,} nodes | {len(G.edges):,} edges")

    # Apply safety weights
    G = apply_safety_weights(G)

    # Save for next startup (faster reload)
    print("Saving graph to disk for faster future startups...")
    ox.save_graphml(G, filepath=GRAPH_PATH)
    print("Graph saved!")

    return G


@app.on_event("startup")
async def startup():
    global router, graph_ref
    try:
        G = load_or_build_graph()
        graph_ref = G

        from routing.dijkstra import EvacuationRouter
        router = EvacuationRouter.__new__(EvacuationRouter)
        router.G     = G
        router.nodes = list(G.nodes())
        print(f"Router ready! {len(router.nodes):,} nodes loaded.")

    except Exception as e:
        print(f"WARNING: Could not load router: {e}")
        print("API running — /api/route will return error until graph loads.")


class RouteRequest(BaseModel):
    origin_lat: float
    origin_lng: float
    algorithm:  Optional[str] = "dijkstra"


@app.get("/api/health")
async def health():
    return {
        "status":       "ok",
        "graph_loaded": router is not None,
        "node_count":   len(router.nodes) if router else 0,
    }


@app.post("/api/route")
async def get_route(req: RouteRequest):
    if router is None:
        return {
            "error": "Graph is still loading. Wait 3-5 minutes and try again.",
            "graph_loaded": False,
        }
    result = router.find_route(
        req.origin_lat,
        req.origin_lng,
        SAFE_ZONES,
        req.algorithm,
    )
    return result


@app.get("/api/safe-zones")
async def get_safe_zones():
    return {"safe_zones": SAFE_ZONES}


@app.get("/api/hazard-zones")
async def get_hazard_zones():
    return {"hazard_zones": HAZARD_ZONES}


@app.websocket("/ws/updates")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_clients.remove(ws)


async def broadcast_hazard(hazard: dict):
    msg = json.dumps({"type": "HAZARD_UPDATE", "data": hazard})
    for ws in ws_clients:
        await ws.send_text(msg)
