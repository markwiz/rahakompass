"""Explainable category suggestions for mixed-purpose transactions."""
import re

RULE_VERSION = "circle-k-description-v1"
CIRCLE_K = re.compile(r"\bcircle\s+k\b", re.IGNORECASE)
CUES = (
    ("Dining out", re.compile(r"\b(?:lunch|sandwich|coffee|hot dog|meal)\b", re.IGNORECASE),
     "The description mentions food or drink."),
    ("Transport", re.compile(r"\b(?:fuel|diesel|petrol|charging)\b", re.IGNORECASE),
     "The description mentions fueling or charging."),
)


def suggest_category(description: str) -> dict[str, str] | None:
    if not CIRCLE_K.search(description):
        return None
    matches = [
        {"category": category, "reason": reason, "version": RULE_VERSION}
        for category, pattern, reason in CUES
        if pattern.search(description)
    ]
    return matches[0] if len(matches) == 1 else None
