"""Persist per-transaction corrections in a local disk-backed store."""
import os
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

from diskcache import Cache

from rahakompass.classification.classifier import RULE_VERSION


def open_store() -> Cache:
    path = Path(os.environ.get("RAHAKOMPASS_STATE_DIR", ".cache/rahakompass"))
    return Cache(str(path), eviction_policy="none")


def record_category_feedback(
    store: Cache,
    dataset_key: str,
    transaction_id: int,
    original_category: str,
    category: str | None,
    suggestion: dict[str, str] | None,
) -> None:
    """Keep the current override and its feedback event in the same transaction."""
    key = (dataset_key, transaction_id)
    with store.transact():
        previous = store.get(key)
        if previous == category:
            return
        if category is None:
            store.delete(key)
        else:
            store[key] = category
        store.push(
            {
                "dataset_key": dataset_key,
                "transaction_id": transaction_id,
                "recorded_at": datetime.now(UTC).isoformat(),
                "original_category": original_category,
                "previous_override": previous,
                "selected_category": category,
                "suggested_category": suggestion["category"] if suggestion else None,
                "suggestion_version": RULE_VERSION,
            },
            prefix="category-feedback",
        )


def category_feedback(store: Cache, dataset_key: str) -> Iterator[dict]:
    """Read feedback for a specific ledger in event order."""
    with store.transact():
        events = [
            store[key]
            for key in store.iterkeys()
            if isinstance(key, str) and key.startswith("category-feedback-")
        ]
    return (event for event in events if event["dataset_key"] == dataset_key)
