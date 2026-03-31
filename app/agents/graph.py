from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from app.agents.nodes import companion_agent, memory_agent, planner_agent, tool_agent
from app.agents.state import AgentState


def _route_after_planner(state: AgentState) -> str:
    planner_output = state.get("planner_output", {})
    if planner_output.get("needs_tools"):
        return "tool_agent"
    return "companion_agent"


class AgentOrchestrator:
    def __init__(self) -> None:
        graph = StateGraph(AgentState)
        graph.add_node("planner_agent", planner_agent)
        graph.add_node("tool_agent", tool_agent)
        graph.add_node("companion_agent", companion_agent)
        graph.add_node("memory_agent", memory_agent)

        graph.add_edge(START, "planner_agent")
        graph.add_conditional_edges(
            "planner_agent",
            _route_after_planner,
            {"tool_agent": "tool_agent", "companion_agent": "companion_agent"},
        )
        graph.add_edge("tool_agent", "companion_agent")
        graph.add_edge("companion_agent", "memory_agent")
        graph.add_edge("memory_agent", END)
        self.graph = graph.compile()

    async def prepare(self, state: AgentState) -> AgentState:
        return await self.graph.ainvoke(state)
