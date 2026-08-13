# Recipe technique sources

Recipe **technique** is taken from well-reviewed, tested sources — not generated. This is the same
rule that already governs macros: numbers come from USDA, never from a model. Jason asked for it on
2026-08-13, the day a step reading `Simmer 40 min.` with no heat level burned a chili to the bottom
of the pan.

## The split — this is the load-bearing part

|                | Comes from                     | Why                                                                                                                                                                                   |
| -------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Technique**  | a tested, well-reviewed source | heat per stage, covered/uncovered, stir frequency, doneness cues, resting. This is where the recipes were weak and where thousands of reviewers have already found the failure modes. |
| **Quantities** | **us**                         | targeted to 1800 kcal / 150 g protein and built around what is in the fridge. Source recipes are sized for families and would break both the macros and the portion count.            |
| **Macros**     | **USDA**, pinned by `fdc_id`   | unchanged. See `feedback_mrbridge_resolver_needs_fdc_pins`.                                                                                                                           |

Adopting a source's _amounts_ is the failure mode to avoid. Take how it is cooked, not how much.

Record the provenance in `recipes.metadata.technique_source`:

```json
{
  "url": "https://…",
  "title": "…",
  "rating": 4.86,
  "reviews": 357,
  "taken": "heat levels per stage, covered simmer, stir frequency",
  "not_taken": "quantities and ingredient list — those stay macro-targeted",
  "recorded_on": "2026-08-13"
}
```

## Source policy

**Prefer** publications that test and explain: America's Test Kitchen / Cook's Illustrated, NYT
Cooking, Once Upon a Chef, The Kitchn. They publish the _reason_ a parameter is what it is, which is
what makes a technique transferable to a different quantity.

**Avoid** SEO recipe farms. A search for chili technique returned nine results, of which the vague,
mutually-contradictory ones were mostly aggregators recycling each other. Rating alone is not the
filter — a tested method with stated reasoning is.

**Serious Eats and Bon Appétit block our crawler** and cannot be fetched. Both are otherwise
excellent; if a Kenji method is wanted it has to be entered by hand.

## Sourced parameters

Everything below was read off the source, not recalled.

### Braise / chili — [Once Upon a Chef, Classic Beef Chili](https://www.onceuponachef.com/recipes/classic-beef-chili.html) (4.86★, 357 reviews)

Brown **HIGH**; aromatics **MEDIUM**, stirring frequently 4–6 min; bloom the spices 1–2 min before
any liquid; simmer **LOW and COVERED**. Do not drain the rendered liquid. Thin with water if it
tightens; finish uncovered to thicken. Their simmer is 2 h and they note longer is better.

### Pan-seared chicken breast — [ATK](https://www.americastestkitchen.com/recipes/5861-pan-seared-chicken-breasts) · [The Kitchn](https://www.thekitchn.com/how-to-cook-golden-juicy-chicken-breast-on-the-stove-248171)

Oil in the skillet over **MEDIUM-HIGH until smoking**; 3–4 min to brown the first side; flip, **drop
to MEDIUM**, 3–4 min more; **165°F** internal; rest 3–5 min.
Cold-start variant ([ATK](https://www.americastestkitchen.com/recipes/16150-cold-start-pan-seared-chicken-breasts)):
oiled chicken into an unheated dry skillet, **HIGH** 2 min, flip every 2 min, drop to **MEDIUM** to
**155°F**, rest 10 min — juicier, and the better option for meal prep.

### Roasted vegetables — [ATK](https://www.americastestkitchen.com/articles/8018-how-to-roast-any-vegetable) · [The Kitchn](https://www.thekitchn.com/how-to-roast-any-vegetable-101221)

**425°F**, single layer with space between. **Crowding steams instead of roasting** — split across
two sheets rather than pile one. Stir every 10–15 min. Done when easily pierced and showing charred
edges. Times at 425°F:

| Family                                              | Time          |
| --------------------------------------------------- | ------------- |
| Roots — potato, sweet potato, carrot, beet          | **30–45 min** |
| Winter squash                                       | 20–60 min     |
| Crucifers — broccoli, cauliflower, Brussels sprouts | **15–25 min** |
| Soft — zucchini, bell pepper                        | 10–20 min     |
| Thin — asparagus, green beans                       | 10–20 min     |

This immediately corrected our Roast Chicken recipe: sweet potato had been written at 25–30 min,
under the 30–45 the root-vegetable row calls for.

### Rice, absorption — [ATK water:rice ratio](https://www.americastestkitchen.com/articles/1692-nailing-the-perfect-ratio-of-water-to-rice) · [The Kitchn](https://www.thekitchn.com/how-to-cook-rice-on-the-stove-44333)

Rinse under cool water to shed loose starch. Bring to a boil, then **reduce to LOW and COVER**.
White **18–20 min**; brown **45 min**. **Do not peek** — lifting the lid changes both the time and
the absorption. Rest off the heat, lid on, **10 min**.

### Pan-seared steak — [ATK](https://www.americastestkitchen.com/recipes/12368-pan-seared-strip-steaks) · [Once Upon a Chef](https://www.onceuponachef.com/recipes/how-to-cook-steak-on-the-stovetop.html) · [The Kitchn](https://www.thekitchn.com/how-to-sear-a-steak-23733871)

Heavy pan — cast iron or stainless — preheated over **HIGH** until it just smokes (~10 min for cast
iron). 3–4 min a side for a 1–1½″ cut. Pull at **125–130°F** for medium-rare. Rest **5–10 min**.

### Roasted salmon — [ATK](https://www.americastestkitchen.com/recipes/4127-oven-roasted-salmon) · [The Kitchn](https://www.thekitchn.com/how-to-cook-salmon-in-the-oven-cooking-lessons-from-the-kitchn-204559)

**425°F**, skin-side down on a lined sheet, **12–15 min**, until opaque and it flakes. **125–130°F**
for medium; 145°F is the food-safety figure if you want it fully done.

### Pan-fried tofu — [The Kitchn](https://www.thekitchn.com/how-to-make-crispy-tofu-without-deepfrying-cooking-lessons-from-the-kitchn-201265) · [ATK](https://www.americastestkitchen.com/articles/7718-how-to-cook-tofu-that-stays-intact)

Press first — wet tofu will not brown. **MEDIUM-HIGH until the oil shimmers**; the tofu should
sizzle on contact, and if it does not, the pan is not ready. Single layer, **4–5 min a side**, and
**wait until it releases from the pan** before turning it — forcing it early is what tears it.

## Enforcement

`web/scripts/audit-recipes.ts` reports `timed-step-no-heat`: any step of 3 minutes or more with no
heat cue. Burner levels, oven temperatures, `off the heat`, and unambiguous plain-English cues
(`screaming hot pan`, `boiling water`) all count. **`simmer`, `boil` and `saute` do not** — they name
a target state without saying what to set the burner to, which is exactly the gap that caused the
burn.

Steps that are timed but genuinely unheated — resting, pressing tofu, thawing, brining, tempering —
are exempt. They were 17 of the first 69 hits, and a check that cries wolf gets ignored.
