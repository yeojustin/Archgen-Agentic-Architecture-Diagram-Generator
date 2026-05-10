import google.genai.types as types
from google.adk.agents import LlmAgent, SequentialAgent
from .schemas import GraphData

GEMINI_FLASH_MODEL = "gemini-2.5-flash"
GEMINI_PRO_MODEL = "gemini-2.5-pro"

# ── Agent 1: Architect ──
# Parses the user request into a structured graph (nodes + edges).
architect = LlmAgent(
    name="Architect",
    model=GEMINI_FLASH_MODEL,
    instruction="""
    You are a senior solutions architect. Analyze the user's description
    and/or uploaded image to extract all infrastructure components and
    their connections.

    RULES:
    - Node IDs MUST be lowercase, single-word, snake_case
      (e.g. 'api_gateway', 'user_service', 'postgres_db').
    - Label should be a human-readable name (e.g. 'API Gateway').
    - Type MUST be one of: frontend, backend, database, storage,
      network, ai, security, monitoring, queue, cache.
    - Every edge must reference existing node IDs.
    - Keep the design minimal — only include components that are
      truly necessary for the described use case.
    - Output ONLY valid JSON matching the GraphData schema.
    """,
    output_schema=GraphData,
    output_key="structured_graph"
)

# ── Agent 2: XML Coder ──
# Converts the structured graph into Draw.io compatible XML.
xml_coder = LlmAgent(
    name="XMLCoder",
    model=GEMINI_FLASH_MODEL,
    instruction="""
    Convert the {structured_graph} into valid, uncompressed Draw.io XML.
    - Wrap the entire output in <mxGraphModel> tags.
    - Use <mxCell> elements for each node and edge.
    - Position nodes in a clean top-to-bottom layout with proper spacing.
    - Style nodes with rounded rectangles and color them by type.
    - Output ONLY the raw XML, no markdown fences or explanation.
    """,
    output_key="drawio_xml"
)

# ── Agent 3: Blueprint Writer ──
# Generates a detailed architectural proposal in Markdown.
blueprint_writer = LlmAgent(
    name="BlueprintWriter",
    model=GEMINI_FLASH_MODEL,
    instruction="""
    Based on the {structured_graph}, write a professional architectural
    blueprint proposal in Markdown format.

    Include:
    - **Overview**: 2-3 sentence summary of the system.
    - **Components**: For each node, explain its purpose and technology choices.
    - **Data Flow**: Describe how data moves through the system (follow the edges).
    - **Scalability**: Brief notes on how the system can scale.
    - **Security**: Any security considerations.

    Use proper Markdown with ## headings, bullet points, and **bold** for emphasis.
    Keep it concise but informative.
    """,
    output_key="blueprint"
)

root_agent = SequentialAgent(
    name="ArchGenPipeline",
    sub_agents=[architect, xml_coder, blueprint_writer]
)