import mermaid as md
from mermaid.graph import Graph

diagram_code = """
graph TD
    A --> B
"""
render = md.Mermaid(diagram_code)
print(dir(render))
# See if there's a url or save method
