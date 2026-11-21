"""Synthetic household benchmarks backed by a local SQLite database."""
import random
import sqlite3
from statistics import median

from rahakompass.analytics.spending import CATEGORIES

MIN_GROUP_SIZE = 10
SPENDING = (
    (58_000, 104_000), (23_000, 47_000), (6_000, 31_000), (9_000, 31_000),
    (5_000, 34_000), (7_000, 15_000), (1_500, 6_000), (2_000, 19_000),
    (2_000, 13_000), (0, 0),
)
GROUPS = ("lower", "similar", "higher")


def open_peer_database(months: list[str]) -> sqlite3.Connection:
    """Build a deterministic demo benchmark using monthly synthetic totals."""
    database = sqlite3.connect(":memory:", check_same_thread=False)
    database.execute("""
        CREATE TABLE peer_month (
            household INTEGER NOT NULL,
            month TEXT NOT NULL,
            income INTEGER NOT NULL,
            PRIMARY KEY (household, month)
        )
    """)
    database.execute("""
        CREATE TABLE peer_category (
            household INTEGER NOT NULL,
            month TEXT NOT NULL,
            category TEXT NOT NULL,
            spending INTEGER NOT NULL,
            PRIMARY KEY (household, month, category)
        )
    """)
    randomizer = random.Random(646)
    incomes = []
    spending = []
    for household in range(144):
        salary = randomizer.randrange(190_000, 405_000, 1000)
        budget = [randomizer.randint(low, high) for low, high in SPENDING]
        # Include lower-income households with lower fixed and discretionary costs.
        if household < 32:
            salary = randomizer.randrange(231_000, 253_000, 1000)
            budget = [amount * 62 // 100 for amount in budget]
        for index, month in enumerate(months):
            incomes.append((household, month, salary + index * 120))
            for category, typical in zip(CATEGORIES, budget, strict=True):
                variation = randomizer.randint(85, 115)
                spending.append((household, month, category, typical * variation // 100))
    with database:
        database.executemany("INSERT INTO peer_month VALUES (?, ?, ?)", incomes)
        database.executemany("INSERT INTO peer_category VALUES (?, ?, ?, ?)", spending)
    database.execute("PRAGMA query_only = ON")
    return database


def peer_benchmarks(
    database: sqlite3.Connection,
    start: str,
    end: str,
    own_income: int,
    own_spending: int,
) -> dict:
    if own_income <= 0:
        return {}
    spending_by_household = {}
    for household, category, spending in database.execute("""
        SELECT household, category, SUM(spending)
        FROM peer_category WHERE month BETWEEN ? AND ?
        GROUP BY household, category
    """, (start, end)):
        spending_by_household.setdefault(household, {})[category] = spending

    groups = {group: [] for group in (*GROUPS, "lower_more_left")}
    own_surplus = own_income - own_spending
    for household, income in database.execute("""
        SELECT household, SUM(income) FROM peer_month
        WHERE month BETWEEN ? AND ? GROUP BY household
    """, (start, end)):
        spending = spending_by_household[household]
        surplus = income - sum(spending.values())
        if income * 100 < own_income * 90:
            group = "lower"
        elif income * 100 > own_income * 110:
            group = "higher"
        else:
            group = "similar"
        record = (income, surplus, spending)
        groups[group].append(record)
        if group == "lower" and surplus > own_surplus:
            groups["lower_more_left"].append(record)

    return {
        group: {
            "count": len(records),
            "median_income": round(median(income for income, _, _ in records)),
            "median_surplus": round(median(surplus for _, surplus, _ in records)),
            "median_surplus_rate": round(median(
                100 * surplus / income for income, surplus, _ in records
            ), 1),
            "more_left_count": sum(surplus > own_surplus for _, surplus, _ in records),
            "categories": {
                category: round(median(spending[category] for _, _, spending in records))
                for category in CATEGORIES
            },
        }
        for group, records in groups.items()
        if len(records) >= MIN_GROUP_SIZE
    }
