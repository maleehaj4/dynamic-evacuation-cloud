import networkx as nx
import osmnx as ox
from geopy.distance import distance as geodist
from typing import List, Dict
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class EvacuationRouter:

    def __init__(self, graph_path: str):
        print("Loading road graph...")
        self.G = ox.load_graphml(graph_path)
        self.nodes = list(self.G.nodes())
        print(f"Graph loaded: {len(self.nodes):,} nodes | {len(self.G.edges()):,} edges")

    def find_route(self,
                   origin_lat: float,
                   origin_lng: float,
                   safe_zones: List[Dict],
                   algorithm: str = "dijkstra") -> Dict:
        """
        Find safest evacuation route from origin to nearest safe zone.
        Returns GeoJSON LineString + distance + destination name.
        """

        # Step 1: Find nearest road node to user GPS location
        origin_node = ox.nearest_nodes(self.G, origin_lng, origin_lat)

        # Step 2: Find nearest safe zone by straight-line distance
        nearest_zone = min(
            safe_zones,
            key=lambda z: geodist(
                (origin_lat, origin_lng),
                (z["lat"], z["lng"])
            ).m
        )

        # Step 3: Find nearest road node to that safe zone
        dest_node = ox.nearest_nodes(
            self.G,
            nearest_zone["lng"],
            nearest_zone["lat"]
        )

        # Step 4: Pick edge weight — safe_weight if available, else length
        sample_edge = list(self.G.edges(data=True))[0][2]
        weight = "safe_weight" if "safe_weight" in sample_edge else "length"

        # Step 5: Compute path
        try:
            if algorithm == "astar":
                path = self._astar(origin_node, dest_node, weight)
            else:
                path = nx.shortest_path(
                    self.G,
                    origin_node,
                    dest_node,
                    weight=weight
                )
        except nx.NetworkXNoPath:
            return {
                "error": "No path found between origin and destination.",
                "origin_lat": origin_lat,
                "origin_lng": origin_lng,
                "destination": nearest_zone["name"],
            }
        except nx.NodeNotFound:
            return {
                "error": "Node not found in graph.",
                "origin_lat": origin_lat,
                "origin_lng": origin_lng,
            }

        # Step 6: Build GeoJSON coordinates [lng, lat] from path
        coords = [
            [self.G.nodes[n]["x"], self.G.nodes[n]["y"]]
            for n in path
        ]

        # Step 7: Calculate total distance in km
        total_km = round(
            sum(
                self.G[u][v][0].get("length", 0)
                for u, v in zip(path, path[1:])
            ) / 1000,
            2
        )

        # Step 8: Build simple turn-by-turn directions
        directions = self._build_directions(path, nearest_zone["name"])

        return {
            "route": {
                "type": "LineString",
                "coordinates": coords
            },
            "distance_km": total_km,
            "destination": nearest_zone["name"],
            "node_count": len(path),
            "algorithm": algorithm,
            "directions": directions,
        }

    def _astar(self, src, tgt, weight):
        """A* search using straight-line distance as heuristic."""
        tgt_lat = self.G.nodes[tgt].get("y", 0)
        tgt_lng = self.G.nodes[tgt].get("x", 0)

        def heuristic(n, _):
            n_lat = self.G.nodes[n].get("y", 0)
            n_lng = self.G.nodes[n].get("x", 0)
            return geodist((n_lat, n_lng), (tgt_lat, tgt_lng)).m

        return nx.astar_path(
            self.G,
            src,
            tgt,
            heuristic=heuristic,
            weight=weight
        )

    def _build_directions(self, path: list, destination: str) -> List[str]:
        """Build simple step-by-step directions from the path nodes."""
        directions = [f"Start evacuation route towards {destination}"]

        total_steps = len(path)
        chunk = max(1, total_steps // 5)  # give roughly 5 steps

        for i in range(0, total_steps - 1, chunk):
            u = path[i]
            v = path[min(i + chunk, total_steps - 1)]

            u_lat = self.G.nodes[u].get("y", 0)
            u_lng = self.G.nodes[u].get("x", 0)
            v_lat = self.G.nodes[v].get("y", 0)
            v_lng = self.G.nodes[v].get("x", 0)

            seg_m = geodist((u_lat, u_lng), (v_lat, v_lng)).m

            dlat = v_lat - u_lat
            dlng = v_lng - u_lng
            if abs(dlat) > abs(dlng):
                direction = "North" if dlat > 0 else "South"
            else:
                direction = "East" if dlng > 0 else "West"

            directions.append(f"Head {direction} for {int(seg_m)}m")

        directions.append(f"Arrive at {destination} — Safe Zone")
        return directions
