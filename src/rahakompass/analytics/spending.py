"""Compute summaries from the effective transaction categories."""
import pandas as pd

CATEGORIES = (
    "Housing", "Groceries", "Dining out", "Transport", "Shopping", "Utilities",
    "Subscriptions", "Entertainment", "Health", "Uncategorized",
)


def category_totals(expenses: pd.DataFrame) -> list[dict]:
    totals = expenses.groupby("category")["amount_cents"].agg(["sum", "size"])
    totals = totals.sort_values("sum")
    return [
        {"category": category, "cents": -int(row["sum"]), "count": int(row["size"])}
        for category, row in totals.iterrows()
    ]


def monthly_totals(expenses: pd.DataFrame, first: str, last: str) -> list[dict]:
    months = pd.period_range(first, last, freq="M").astype(str)
    totals = (-expenses.groupby("month")["amount_cents"].sum()).reindex(months, fill_value=0)
    return [{"month": month, "cents": int(cents)} for month, cents in totals.items()]
