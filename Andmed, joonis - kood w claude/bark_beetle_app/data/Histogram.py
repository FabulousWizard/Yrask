from pathlib import Path
import json
import matplotlib.pyplot as plt


def load_values(json_path):
    json_path = Path(json_path)

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Expecting a dict like {"6522173": 800.0, "10310369": 809.0, ...}
    if not isinstance(data, dict):
        raise ValueError("Expected a JSON dictionary of id -> value.")

    values = []
    for v in data.values():
        if isinstance(v, (int, float)):
            values.append(v)

    return values


def plot_histogram(values, bins=30):
    plt.figure(figsize=(10, 6))
    plt.hist(values, bins=bins)
    plt.title("Histogram of plot medians")
    plt.xlabel("Value")
    plt.ylabel("Count")
    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    file_path = r"plot_medians.json"   # use the medians file, not the GeoJSON
    values = load_values(file_path)
    plot_histogram(values, bins=30)