"""Render a downloadable copy of the category breakdown."""
from io import BytesIO

import seaborn as sns
from matplotlib.figure import Figure
from matplotlib.ticker import FuncFormatter

CATEGORY_NAMES = {
    "Housing": "Eluase",
    "Groceries": "Toidukaubad",
    "Dining out": "Väljas söömine",
    "Transport": "Transport",
    "Shopping": "Ostud",
    "Utilities": "Kommunaalkulud",
    "Subscriptions": "Tellimused",
    "Entertainment": "Meelelahutus",
    "Health": "Tervis",
    "Uncategorized": "Kategooriata",
}


CATEGORY_COLORS = {
    "Housing": "#6456b1",
    "Groceries": "#157b64",
    "Dining out": "#ac542c",
    "Transport": "#2d6ca6",
    "Shopping": "#a54873",
    "Utilities": "#8a650f",
    "Subscriptions": "#625386",
    "Entertainment": "#34776e",
    "Health": "#947145",
    "Uncategorized": "#68717f",
}


def category_chart(rows: list[dict]) -> bytes:
    figure = Figure(figsize=(8, 4.8), layout="constrained")
    axis = figure.subplots()
    if rows:
        labels = [CATEGORY_NAMES.get(row["category"], row["category"]) for row in rows]
        colors = {
            label: CATEGORY_COLORS.get(row["category"], CATEGORY_COLORS["Uncategorized"])
            for label, row in zip(labels, rows, strict=True)
        }
        sns.barplot(
            x=[row["cents"] / 100 for row in rows],
            y=labels,
            hue=labels,
            palette=colors,
            saturation=1,
            legend=False,
            ax=axis,
        )
    axis.set_axisbelow(True)
    axis.grid(axis="x", color="#e7e0d9")
    sns.despine(ax=axis, left=True)
    axis.set(title="Kulud kategooriate kaupa", xlabel="Summa (eurodes)", ylabel="")
    axis.xaxis.set_major_formatter(FuncFormatter(lambda value, _: f"{value:,.0f}".replace(",", " ") + " €"))
    stream = BytesIO()
    figure.savefig(stream, format="png", dpi=150)
    return stream.getvalue()
