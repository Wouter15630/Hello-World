# What the original PDF gets wrong

For the owners. Every short link in the old *Abruzzo Puro Guide* PDF was followed to
where it actually lands. These are the things worth fixing in the PDF too — and a note
to any future editor **not** to "helpfully" undo them, because they are deliberate.

1. **"Ristorante Da Stefano", the lunch tip at the gorge, does not exist.** Its link is a
   Google *search*, not a pinned place, and it resolves to a Pizzeria Stefano about 100 km
   away near L'Aquila. Pennadomo village has one bar, on Via Maiella. **Removed from the guide.**

2. **"Ristorante Il Corvo" is now "Siparjum, spettacolo di sapori".** Same address in Atessa,
   new name, new chef. At 4.9 it is now the **highest-rated place in the entire guide.**

3. **Chalet Valentino's lunch link was a copy-paste of the Marina Beach Club link.** It was
   also listed twice at two different ratings (4.3 and 3.5). Google now shows 3.4. Corrected
   and de-duplicated.

4. **"Quick panini stops" and "Olivieri Supermarket" are the same shop.** Merged into one entry.

5. **Il Corallo was filed under lunch but only serves lunch on Sunday.** Every other day it
   opens at 20:00. Its rating has also risen from 4.4 to 4.8. It carries a warning now.

6. **In Arte Pizza and Pecora Matta were filed under lunch and both open at 19:00** (evenings
   only). Flagged accordingly.

7. **The Roccaraso links pointed at a bar and a hotel,** not at the village centre and the
   lifts. Corrected to Roccaraso centre and the Aremogna ski area.

8. **Gole di Pennadomo is 4.5, not 4.8. Panzotto is 3.9, not 4.0.** Ratings corrected.

9. **The counts in the PDF are off.** "14x Lunch" contained 14 entries numbered 1 to 15 with
   7 missing; "10x Dinner" contained 15. The guide now holds a clean, de-duplicated set.

10. **Six places close on Monday,** and Zappacosta now shows Monday lunch only. Every
    Monday-closed place has a warning so nobody drives to a locked door.

---

The guest-facing page deliberately does **not** show any of this — a guest does not care
which link was broken. It lives here so you can fix the PDF and so the migration is auditable.
Each place still records what the original guide called it (the `pdf` field in
`data/places.seed.json`).
