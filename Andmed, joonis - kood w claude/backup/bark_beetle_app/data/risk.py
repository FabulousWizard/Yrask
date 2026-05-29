"""
Vulnerability risk configuration for bark beetle assessment.

To add species to risk categories, add their code to the appropriate level.
Species codes follow the Estonian Forest Registry (metsaregister) convention:
    KU = kuusk (spruce)         MA = mänd (pine)
    KS = kask (birch)           HB = haab (aspen)
    LV = sanglepp (black alder) LM = hall lepp (grey alder)
    TA = tamm (oak)             SA = saar (ash)
"""

RISK_CONFIG = {
    "spruce_dominant": {
        "name": "Spruce-dominant",
        "levels": [
            {
                "label": "High risk (Kuusk / Spruce)",
                "species": ["KU"],
                "color": "#e74c3c",
                "fill_opacity": 0.55,
            },
            {
                "label": "Other species",
                "species": None,  # catch-all default
                "color": "#27ae60",
                "fill_opacity": 0.20,
            },
        ],
    },
    "gradient": {
        "name": "Full vulnerability gradient",
        "levels": [
            {
                "label": "High risk (Kuusk / Spruce)",
                "species": ["KU"],
                "color": "#e74c3c",
                "fill_opacity": 0.55,
            },
            {
                "label": "Medium risk (Mänd / Pine)",
                "species": ["MA"],
                "color": "#f39c12",
                "fill_opacity": 0.35,
            },
            {
                "label": "Low risk (Other)",
                "species": None,  # catch-all default
                "color": "#27ae60",
                "fill_opacity": 0.20,
            },
        ],
    },
}


def get_risk_style(species_code: str, mode: str = "spruce_dominant") -> dict:
    """
    Return style dict for a species code under a given risk mode.

    Returns:
        {"color": str, "fill_opacity": float, "label": str}
    """
    config = RISK_CONFIG[mode]
    for level in config["levels"]:
        if level["species"] is not None and species_code in level["species"]:
            return {
                "color": level["color"],
                "fill_opacity": level["fill_opacity"],
                "label": level["label"],
            }
    # Fall through to default (species=None)
    default = next(l for l in config["levels"] if l["species"] is None)
    return {
        "color": default["color"],
        "fill_opacity": default["fill_opacity"],
        "label": default["label"],
    }


def get_species_to_fetch(mode: str) -> list[str]:
    """
    Return list of at-risk species codes for a given mode.
    Used as a CQL filter in WFS requests to skip low-risk compartments.
    """
    config = RISK_CONFIG[mode]
    species = []
    for level in config["levels"]:
        if level["species"] is not None:
            species.extend(level["species"])
    return species