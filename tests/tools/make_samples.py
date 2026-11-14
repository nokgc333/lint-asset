import sys
from pathlib import Path

from sample_models import toy_house_broken, toy_house_clean


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 make_samples.py <output_dir>")
    output = Path(sys.argv[1])
    output.mkdir(parents=True, exist_ok=True)
    for variant, builder in [("clean", toy_house_clean), ("broken", toy_house_broken)]:
        (output / f"toy-house-{variant}.glb").write_bytes(builder())


if __name__ == "__main__":
    main()
