"""Build evidence-backed forecast guidance using a small LangGraph workflow."""
from typing import TypedDict

from langgraph.graph import END, START, StateGraph


class GuidanceState(TypedDict, total=False):
    outlook: dict | None
    utilities: dict | None
    guidance: dict


def collect_evidence(state: GuidanceState) -> dict:
    outlook, utilities = state["outlook"], state["utilities"]
    if outlook is None or utilities is None:
        return {"guidance": {}}
    typical = round(sum(row["cents"] for row in outlook["recent"][-3:]) / 3)
    recent_utilities = round(sum(row["cents"] for row in utilities["recent"][-3:]) / 3)
    return {"guidance": {"recent_spending": typical, "recent_utilities": recent_utilities}}


def assess_outlook(state: GuidanceState) -> dict:
    guidance = state["guidance"]
    if not guidance:
        return {}
    outlook, utilities = state["outlook"], state["utilities"]
    peak = max(outlook["months"], key=lambda row: row["cents"])
    utility_peak = max(utilities["months"], key=lambda row: row["cents"])
    change = peak["cents"] - guidance["recent_spending"]
    utility_change = utility_peak["cents"] - guidance["recent_utilities"]
    return {"guidance": {
        "spending_watch": peak if change > max(outlook["errors"][outlook["method"]], 0) else None,
        "utility_watch": utility_peak if utility_change > utilities["errors"][utilities["method"]] else None,
        **guidance,
    }}


workflow = StateGraph(GuidanceState)
workflow.add_node("collect_evidence", collect_evidence)
workflow.add_node("assess_outlook", assess_outlook)
workflow.add_edge(START, "collect_evidence")
workflow.add_edge("collect_evidence", "assess_outlook")
workflow.add_edge("assess_outlook", END)
guidance_graph = workflow.compile()
