# RahaKompass

An interactive spending dashboard for a synthetic household ledger. The demo covers
November 2024 through October 2026 and includes Circle K lunch purchases deliberately
assigned to Transport so you can exercise category correction.

```bash
uv sync --locked
uv run --no-sync uvicorn rahakompass.main:app --reload
```

In the managed cloud workspace, run `export UV_CACHE_DIR=/workspace/.rahakompass-uv-cache`
before running uv commands. Add `--host 0.0.0.0` to Uvicorn when using a cloud port preview.

Open http://127.0.0.1:8000 locally. Select a date range, then click a category or a
monthly bar to filter the expense table. Search for Circle K, edit a lunch
transaction to Dining out, and watch the category totals update. Each correction
applies to one transaction and can be restored to its original category.

The planning panel compares a calendar-aware scikit-learn Ridge model with the
same month last year. It shows recent spending and the next three forecast
months for total expenses and the demo's City utilities bill series. The
calendar model uses a cyclical month feature and a November–February indicator.
Both models are tested on rolling one- to three-month forecasts within the
latest 12 months and the lower-error forecast is shown. Two synthetic years
provide a limited evaluation.

LangGraph produces planning notes from forecast results and recent averages.
It flags rises larger than the selected model's historical mean absolute error.
That rule is a planning signal, not a prediction interval. The savings scenario
uses average category spending within the selected dates and assumes unchanged
income and other expenses.

DiskCache persists corrections in `.cache/rahakompass` by default. Set
`RAHAKOMPASS_STATE_DIR` to use a different local state directory. The dashboard
is a local, single-user demo. Use the synthetic ledger when exposing it to others.

Regenerate the demo ledger with `uv run --no-sync python scripts/generate_demo.py`.
The source CSV at `data/transactions.csv` is separate from the synthetic demo ledger.

## Category suggestions and feedback

Circle K descriptions with a food or fuel cue offer a suggested category in the
edit dialog. A generic description or conflicting cues leave the decision to the
customer. Choosing a suggestion fills the field and the customer saves it
explicitly.

The local DiskCache store saves edits and restores as feedback events alongside
the current override. The events contain a dataset fingerprint, transaction ID,
timestamp, prior and selected labels, and the suggestion and rule version.
They omit transaction descriptions, amounts, and account details.
The internal Python reader is `category_feedback(store, dataset_key)` in
`rahakompass.cache.store`. A null selected label records a restore and should
remove that transaction's customer label from a training set.

For a future model, join the latest active feedback to approved ledger features
in the internal environment. Start with a scikit-learn text baseline, evaluate on
later periods and held-out merchants, and leave low-confidence cases for review.
Suggestions should remain optional. Add customer-level data isolation and define
how feedback can be retained and used before working with real bank data.

## Household comparison

The dashboard compares the selected period with 144 synthetic households in a
local SQLite database rebuilt at startup. Switch between lower, similar, and
higher income groups, or look at the subset of lower-income households with more
income left after expenses. Groups with fewer than 10 households are hidden.
Select a comparison category to inspect your own expenses for the same period.
The benchmark uses simulated budgets and illustrates the interaction only.

### Savings goals

Set a target and deadline within the three-month forecast, and choose a category
to protect. The goal planner compares projected cash left over with a
higher-spending scenario. It assumes monthly income stays at the average of the
three most recent recorded months. When there is a shortfall, it compares a
single-category cut with a distributed cut and shows any amount still needed.
Example cuts use the selected period's spending averages and are capped at 25%
per eligible category. The user can save a chosen plan and its monthly spending
limits, then record actual savings for each month. The plan and progress use
local browser storage when available.

## Finantsülevaated

Avalehel saab koostada aasta- või kvartaliülevaate. Eelmise aasta võrdlus kasutab
täpselt samu kuid. Kui võrdlusperioodi andmed on osalised, kuvatakse ainult
valitud periood ja selgitus. Ülevaates on sissetulekud, kulud, ülejääk, suurim
kulukategooria ja võrdluse korral suurim muutus kategooriate lõikes. Ülevaate
nupud avavad valitud perioodi tehingud. Kasutajaliides on eesti keeles.

### Vaated ja tehingute avamine

Avaleht, aruanded, tehingud, plaan ja võrdlus on eraldi vaated ning nende vahel
saab liikuda ka brauseri tagasi- ja edasinupuga. Diagrammi, aruande või
võrdlustabeli valik avab tehingute vaate koos kuu või kategooria filtriga.
Tehinguid saab filtreerida, otsida ja järjestada.

### Kuuaruanne ja rahaabiline

Avalehelt saab avada viimase andmetes oleva kuu aruande. Kuu-, kvartali- ja
aastaaruannete CSV sisaldab kokkuvõtet ning kategooriate summasid. Võrdlusaruanne
näitab ka eelmise aasta perioodi ja summade muutusi. Võrdlusdiagrammil avab iga
tulp vastava perioodi tehingud.

Rahaabilise vestlusakna saab avada igas vaates. Küsimustes saab nimetada
kaupmehe, kategooria ja ajavahemiku ning küsida kulude summat, arvu, keskmist
või suurimat tehingut. Vestlus kasutab ainult RahaKompassi tehinguandmeid ja
töötab näidisfailis ilma välise mudelita. Sama perioodi eelmise aastaga võrreldes
näitab abiline tehingute arvu ja keskmise summa arvutuslikku mõju. Mõlema perioodi
tehingud saab vastusest avada. Vestlus püsib kuni lehe uuesti laadimiseni.
Link Swedbanki avalehele ei edasta küsimust ega tehinguid.

Avaleht avaneb viimase andmetes oleva kuu koondvaatega. Kaart „Mis muutus?“
võrdleb valitud perioodi viimast kuud eelmise aasta sama kuuga. Nupp „Selgita
muutust“ avab Rahaabilises suurima kategooriamuutuse, selle arvutusliku
jaotuse ja mõlema perioodi tehingud.

Avalehe korduvmaksete kaart kontrollib viimast kuut kuud. Võrdlusse lähevad
sama kirjeldusega kulud, mis on vähemalt kolmel järjestikusel kuul esinenud
ühe maksena kuus kuni seitsmepäevase kuupäevaerinevusega. Kasv kuvatakse,
kui makse suurenes vähemalt 1 € ja 5%. Kaardilt saab avada mõlema kuu maksed.

Plaani maksekalender hindab eluaseme-, kommunaal- ja tellimusmaksete kuupäeva ja
summat viimase kolme järjestikuse kuu maksete mediaani järgi. Kui maksekuupäevad erinevad, kuvatakse ka vahemik.
Palgapäevaks kasutatakse summalt suurimat korduvat laekumist. Kalendri
vaikekuupäev on demo järgmise kuu teine päev. Kasutaja saab muuta arve
kuupäeva ja summat valitud planeerimiskuupäeva jaoks, kuni demo uuesti laadib.

Avalehel kuvatakse kuu põhinäitajad ja suurim muutus. Diagrammid ja korduvmaksed
avanevad pealkirjale vajutades. Plaani vaates on eraldi avatavad säästuplaan,
palgapäevaeelsete maksete kalender ja kuluprognoos.
