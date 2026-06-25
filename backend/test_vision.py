#!/usr/bin/env python3
"""
Test script for verifying vision_service.py functionality
on PNG, JPG, and SVG file inputs.
"""

import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent))

from services.vision_service import analyze_image, is_supported_image

import io
from PIL import Image as PILImage
from services.vision_service import analyze_image, is_supported_image

# Generate valid PNG and JPG bytes dynamically
def get_mock_png_bytes():
    img = PILImage.new("RGB", (100, 100), color="red")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

def get_mock_jpg_bytes():
    img = PILImage.new("RGB", (100, 100), color="green")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# 2. Mock SVG XML
MOCK_SVG_CONTENT = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <title>Pragna AI Logo</title>
  <desc>A descriptive SVG for testing</desc>
  <rect x="10" y="10" width="80" height="80" rx="10" fill="blue" />
  <circle cx="50" cy="50" r="30" fill="white" />
  <text x="50" y="55" font-family="Arial" font-size="12" text-anchor="middle" fill="black">Pragna AI</text>
</svg>"""
MOCK_SVG_BYTES = MOCK_SVG_CONTENT.encode("utf-8")


def run_tests():
    print("=== Testing is_supported_image ===")
    for ext in (".png", ".jpg", ".jpeg", ".svg", ".gif", ".pdf"):
        filename = f"test_file{ext}"
        supported = is_supported_image(filename)
        print(f"File: {filename:<15} | Supported: {supported}")

    print("\n=== Testing SVG parsing ===")
    svg_result = analyze_image(MOCK_SVG_BYTES, "test_logo.svg")
    print(svg_result)

    print("\n=== Testing PNG BLIP captioning ===")
    print("Running BLIP analysis on generated red PNG...")
    png_result = analyze_image(get_mock_png_bytes(), "solid_red_square.png")
    print(png_result)

    print("\n=== Testing JPG BLIP captioning ===")
    print("Running BLIP analysis on generated green JPG...")
    jpg_result = analyze_image(get_mock_jpg_bytes(), "solid_green_square.jpg")
    print(jpg_result)


if __name__ == "__main__":
    run_tests()
