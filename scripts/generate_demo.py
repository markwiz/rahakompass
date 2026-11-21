"""Generate a deterministic, entirely synthetic ledger."""
import csv
import random
from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[1] / "data" / "demo_transactions.csv"


def generate():
    randomizer = random.Random(42)
    rows = []

    def add(year, month, day, merchant, category, kind, cents):
        rows.append((f"{year}-{month:02}-{day:02}", merchant, category, kind, cents))

    for index in range(24):
        year, month = 2024 + (index + 10) // 12, (index + 10) % 12 + 1
        add(year, month, 1, "Salary", "Income", "Income", 285000 + index * 150)
        add(year, month, 2, "Rent", "Housing", "Expense", -78000)
        add(year, month, 4, "City utilities", "Utilities", "Expense",
            -randomizer.randint(8500, 12000) - (3500 if month in (11, 12, 1, 2) else 0))
        add(year, month, 5, "Mobile and internet", "Subscriptions", "Expense", -3500)
        add(year, month, 6, "Savings transfer", "Transfers", "Transfer", -15000)
        add(year, month, 6, "Savings transfer received", "Transfers", "Transfer", 15000)
        for merchant, category, frequency, low, high in (
            ("Selver", "Groceries", 8, 1800, 6400),
            ("Rimi", "Groceries", 4, 1100, 4500),
            ("Circle K", "Transport", 3, 3200, 7000),
            ("City transit", "Transport", 3, 200, 1700),
            ("Neighbourhood café", "Dining out", 6, 480, 2600),
            ("Restaurant", "Dining out", 3, 2000, 6000),
            ("Department store", "Shopping", 3, 1800, 9500),
            ("Cinema", "Entertainment", 2, 850, 2700),
            ("Pharmacy", "Health", 2, 700, 4900),
        ):
            for _ in range(frequency):
                add(year, month, randomizer.randint(1, 28), merchant, category,
                    "Expense", -randomizer.randint(low, high))
        if month in (7, 8, 12):
            add(year, month, 20, "Seasonal shopping", "Shopping", "Expense", -16000)
        add(year, month, 22, "Circle K · lunch", "Transport", "Expense", -890)

    with OUTPUT.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, lineterminator="\n")
        writer.writerow(("id", "date", "description", "category", "kind", "amount_cents"))
        for identifier, row in enumerate(sorted(rows), 1):
            writer.writerow((identifier, *row))


if __name__ == "__main__":
    generate()
