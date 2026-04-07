from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import json, os, asyncio

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
    {"name": "Hussain Sagar Flood", "lat": 17.4239, "lng": 78.4738, "radius_m": 1000, "severity": 0.9, "type": "Flood"},
    {"name": "Old City Industrial",  "lat": 17.3616, "lng": 78.4747, "radius_m": 800,  "severity": 0.8, "type": "Chemical"},
    {"name": "Malkajgiri Fire Zone", "lat": 17.4454, "lng": 78.5279, "radius_m": 600,  "severity": 0.7, "type": "Fire"},
]

ws_clients: List[WebSocket] = []
router     = None
GRAPH_PATH = "data/hyderabad_mini.graphml"


def apply_safety_weights(G):
    from geopy.distance import distance as geodist
    for u, v, data in G.edges(data=True):
        node        = G.nodes[u]
        node_lat    = node.get("y", 0)
        node_lng    = node.get("x", 0)
        max_penalty = 0
        for hz in HAZARD_ZONES:
            dist_m = geodist((node_lat, node_lng), (hz["lat"], hz["lng"])).meters
            if dist_m < hz["radius_m"]:
                penalty     = hz["severity"] * (1 - dist_m / hz["radius_m"])
                max_penalty = max(max_penalty, penalty)
        data["safe_weight"] = (
            0.3 * data.get("length", 100) +
            0.5 * max_penalty * 10000 +
            0.2 * data.get("travel_time", 30)
        )
    return G


def build_graph():
    import osmnx as ox
    os.makedirs("data", exist_ok=True)

    if os.path.exists(GRAPH_PATH):
        size_mb = os.path.getsize(GRAPH_PATH) / (1024 * 1024)
        if size_mb > 0.5:
            print(f"Loading cached graph ({size_mb:.1f} MB)...")
            G = ox.load_graphml(GRAPH_PATH)
            print(f"Graph ready: {len(G.nodes):,} nodes")
            return G

    print("Downloading mini Hyderabad graph (2km radius)...")
    G = ox.graph_from_point(
        center_point=(17.4239, 78.4738),
        dist=2000,
        network_type="drive",
        simplify=True,
    )
    G = ox.add_edge_speeds(G)
    G = ox.add_edge_travel_times(G)
    print(f"Downloaded: {len(G.nodes):,} nodes | {len(G.edges):,} edges")
    G = apply_safety_weights(G)
    ox.save_graphml(G, filepath=GRAPH_PATH)
    print("Saved!")
    return G


@app.on_event("startup")
async def startup():
    global router
    try:
        G = build_graph()
        from routing.dijkstra import EvacuationRouter
        router       = EvacuationRouter.__new__(EvacuationRouter)
        router.G     = G
        router.nodes = list(G.nodes())
        print(f"Router ready — {len(router.nodes):,} nodes.")
    except Exception as e:
        print(f"WARNING: {e}")


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
        "safe_zones":   len(SAFE_ZONES),
        "hazard_zones": len(HAZARD_ZONES),
    }


@app.post("/api/route")
async def get_route(req: RouteRequest):
    if router is None:
        return {"error": "Graph still loading. Wait 1 minute and try again."}
    try:
        result = router.find_route(
            req.origin_lat, req.origin_lng, SAFE_ZONES, req.algorithm
        )
        # Add hazard warnings to the response
        result["hazard_warnings"] = check_hazards_on_route(
            result.get("route", {}).get("coordinates", [])
        )
        return result
    except Exception as e:
        return {"error": str(e)}


def check_hazards_on_route(coordinates):
    """Check which hazard zones the route passes near."""
    from geopy.distance import distance as geodist
    warnings = []
    for coord in coordinates[::5]:  # check every 5th point for speed
        lng, lat = coord[0], coord[1]
        for hz in HAZARD_ZONES:
            dist_m = geodist((lat, lng), (hz["lat"], hz["lng"])).meters
            if dist_m < hz["radius_m"] * 2:
                if not any(w["name"] == hz["name"] for w in warnings):
                    warnings.append({
                        "name":     hz["name"],
                        "type":     hz["type"],
                        "distance": round(dist_m),
                    })
    return warnings


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
