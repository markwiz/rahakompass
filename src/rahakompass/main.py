"""Local interactive dashboard for the synthetic demo ledger."""
from contextlib import asynccontextmanager, closing
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from typing import Annotated

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator
from starlette.responses import Response

from rahakompass.agents.graph import guidance_graph
from rahakompass.analytics.patterns import seasonal_outlook
from rahakompass.analytics.peers import open_peer_database, peer_benchmarks
from rahakompass.analytics.spending import CATEGORIES, category_totals, monthly_totals
from rahakompass.cache.store import open_store, record_category_feedback
from rahakompass.classification.classifier import suggest_category
from rahakompass.visualization.charts import category_chart

ROOT = Path(__file__).resolve().parents[2]
WEB = Path(__file__).with_name("web")
MONTH = r"^\d{4}-(0[1-9]|1[0-2])$"


@asynccontextmanager
async def lifespan(app: FastAPI):
    source = (ROOT / "data" / "demo_transactions.csv").read_bytes()
    ledger = pd.read_csv(BytesIO(source), dtype={"date": str})
    app.state.ledger = ledger.assign(
        month=ledger["date"].str[:7],
        suggestion=ledger["description"].map(suggest_category),
    )
    app.state.dataset_key = sha256(source).hexdigest()
    months = sorted(app.state.ledger["month"].unique())
    with open_store() as store, closing(open_peer_database(months)) as peers:
        app.state.store = store
        app.state.peers = peers
        expenses = app.state.ledger.loc[app.state.ledger["kind"].eq("Expense")]
        utility_bills = expenses.loc[expenses["description"].eq("City utilities")]
        outlook = seasonal_outlook(monthly_totals(expenses, months[0], months[-1]))
        utilities = seasonal_outlook(monthly_totals(utility_bills, months[0], months[-1]))
        recent_income = app.state.ledger.loc[
            app.state.ledger["kind"].eq("Income") & app.state.ledger["month"].isin(months[-3:]),
            "amount_cents",
        ].sum()
        app.state.planning_income = (int(recent_income) + 1) // 3
        app.state.outlook = outlook
        app.state.utilities = utilities
        app.state.guidance = guidance_graph.invoke({"outlook": outlook, "utilities": utilities})["guidance"]
        yield


app = FastAPI(title="RahaKompass", lifespan=lifespan)


class CategoryEdit(BaseModel):
    category: str | None

    @field_validator("category")
    @classmethod
    def known_category(cls, value: str | None) -> str | None:
        if value is not None and value not in CATEGORIES:
            raise ValueError("Choose an expense category.")
        return value


def correction_key(request: Request, transaction_id: int) -> tuple[str, int]:
    return request.app.state.dataset_key, transaction_id


def effective_expenses(request: Request) -> pd.DataFrame:
    ledger = request.app.state.ledger
    expenses = ledger.loc[ledger["kind"].eq("Expense")].copy()
    with request.app.state.store.transact():
        corrections = [
            request.app.state.store.get(correction_key(request, identifier))
            for identifier in expenses["id"]
        ]
    expenses["original_category"] = expenses["category"]
    expenses["corrected"] = [correction is not None for correction in corrections]
    expenses["category"] = [
        correction or original
        for correction, original in zip(corrections, expenses["original_category"], strict=True)
    ]
    return expenses


def date_range(
    request: Request,
    start: Annotated[str | None, Query(pattern=MONTH)] = None,
    end: Annotated[str | None, Query(pattern=MONTH)] = None,
) -> tuple[str, str]:
    months = request.app.state.ledger["month"]
    first, last = months.min(), months.max()
    start, end = start or first, end or last
    if not first <= start <= end <= last:
        raise HTTPException(422, "Select a date range within the demo history.")
    return start, end


@app.get("/api/dashboard")
def dashboard(request: Request, period: Annotated[tuple[str, str], Depends(date_range)]):
    start, end = period
    ledger = request.app.state.ledger
    expenses = effective_expenses(request)
    selected = expenses.loc[expenses["month"].between(start, end)]
    income = ledger.loc[ledger["month"].between(start, end) & ledger["kind"].eq("Income")]
    first, last = ledger["month"].min(), ledger["month"].max()
    income_cents = int(income["amount_cents"].sum())
    expense_cents = int(-selected["amount_cents"].sum())
    return {
        "first": first,
        "last": last,
        "categories": CATEGORIES,
        "groups": category_totals(selected),
        "trend": monthly_totals(selected, start, end),
        "income_cents": income_cents,
        "income_transactions": income[["date", "description", "amount_cents"]].to_dict("records"),
        "expense_cents": expense_cents,
        "peers": peer_benchmarks(request.app.state.peers, start, end, income_cents, expense_cents),
        "outlook": request.app.state.outlook,
        "utility_outlook": request.app.state.utilities,
        "guidance": request.app.state.guidance,
        "planning_income_cents": request.app.state.planning_income,
        "transactions": selected.sort_values(["date", "id"], ascending=False).drop(
            columns=["month", "kind"]
        ).to_dict("records"),
    }


@app.patch("/api/transactions/{transaction_id}/category", status_code=204)
def change_category(request: Request, transaction_id: int, edit: CategoryEdit):
    ledger = request.app.state.ledger
    matching = ledger.loc[ledger["id"].eq(transaction_id) & ledger["kind"].eq("Expense")]
    if matching.empty:
        raise HTTPException(404, "Expense not found.")
    row = matching.iloc[0]
    record_category_feedback(
        request.app.state.store,
        request.app.state.dataset_key,
        transaction_id,
        row["category"],
        edit.category,
        row["suggestion"],
    )
    return Response(status_code=204)


@app.get("/api/categories.png")
def export_categories(request: Request, period: Annotated[tuple[str, str], Depends(date_range)]):
    expenses = effective_expenses(request)
    selected = expenses.loc[expenses["month"].between(*period)]
    return Response(
        category_chart(category_totals(selected)),
        media_type="image/png",
        headers={"Content-Disposition": 'attachment; filename="rahakompass-categories.png"'},
    )


app.mount("/", StaticFiles(directory=WEB, html=True), name="dashboard")
