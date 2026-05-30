#!/usr/bin/env python3
"""
validate_growth_curves.py
=========================
Plots the Kiviste 1997 Chapman-Richards height growth curves for Norway
spruce across all supported kasvukohatüüp site types, and also shows the
inverse function (age from height) for a quick sanity check.

Usage:
    pip install matplotlib
    python validate_growth_curves.py
    # → saves spruce_growth_curves.png
"""

import math
import matplotlib.pyplot as plt
import matplotlib.cm as cm
import numpy as np

from spruce_age_estimator import (
    SPRUCE_B, SPRUCE_C, SITE_TYPE_PARAMS, age_to_height, height_to_age
)

# ── Select representative site types to plot ─────────────────────────────────
SHOW_TYPES = {
    "N":  "Naadi (Ia, H∞=36 m)",
    "JK": "Jänesekapsa (I, H∞=34 m)",
    "JM": "Jänesekapsa-mustika (I-II, H∞=32 m)",
    "M":  "Mustika (II, H∞=28 m)",
    "P":  "Pohla (III, H∞=24 m)",
    "KS": "Kõdusoo (III, H∞=22 m)",
    "SI": "Sinika (IV, H∞=20 m)",
}

ages = np.arange(0, 181, 1)
colors = cm.viridis(np.linspace(0.1, 0.9, len(SHOW_TYPES)))

fig, axes = plt.subplots(1, 2, figsize=(14, 6))
fig.suptitle(
    "Norway spruce (Picea abies) — Kiviste 1997 Chapman-Richards model\n"
    f"dH/dt = b·c·(H_inf − H)·(H/H_inf)^((c−1)/c)    b={SPRUCE_B}  c={SPRUCE_C}",
    fontsize=11,
)

# ── Left: H(t) forward curves ────────────────────────────────────────────────
ax1 = axes[0]
for (code, label), color in zip(SHOW_TYPES.items(), colors):
    H_inf = SITE_TYPE_PARAMS[code]["H_inf"]
    heights = [age_to_height(t, H_inf) for t in ages]
    ax1.plot(ages, heights, label=label, color=color, linewidth=1.8)

ax1.set_xlabel("Stand age (years)")
ax1.set_ylabel("Dominant height H (m)")
ax1.set_title("Forward model: H(t) = H_inf · (1 − e^(−bt))^c")
ax1.legend(fontsize=7.5, loc="upper left")
ax1.set_xlim(0, 180)
ax1.set_ylim(0, 40)
ax1.grid(True, alpha=0.3)

# ── Right: t(H) inverse — age from nDSM height ───────────────────────────────
ax2 = axes[1]
h_range = np.linspace(0.5, 35, 300)

for (code, label), color in zip(SHOW_TYPES.items(), colors):
    H_inf = SITE_TYPE_PARAMS[code]["H_inf"]
    est_ages = []
    for h in h_range:
        a = height_to_age(h, H_inf)
        est_ages.append(a if not math.isnan(a) and a <= 200 else np.nan)
    ax2.plot(h_range, est_ages, label=label, color=color, linewidth=1.8)

ax2.set_xlabel("Observed canopy height — nDSM (m)")
ax2.set_ylabel("Estimated stand age (years)")
ax2.set_title("Inverse model: t(H) = −ln(1 − (H/H_inf)^(1/c)) / b")
ax2.legend(fontsize=7.5, loc="upper left")
ax2.set_xlim(0, 36)
ax2.set_ylim(0, 200)
ax2.grid(True, alpha=0.3)

plt.tight_layout()
out = "spruce_growth_curves.png"
plt.savefig(out, dpi=150)
print(f"Saved: {out}")
plt.show()