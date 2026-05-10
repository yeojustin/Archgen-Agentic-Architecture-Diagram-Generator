from pydantic import BaseModel, Field
from typing import List

class Node(BaseModel):
    id: str = Field(description="Unique identifier for the node")
    label: str = Field(description="Display text (e.g., Load Balancer)")
    type: str = Field(description="Component type for styling")

class Edge(BaseModel):
    source: str = Field(description="ID of source node")
    target: str = Field(description="ID of target node")

class GraphData(BaseModel):
    nodes: List[Node]
    edges: List[Edge]