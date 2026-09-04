#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import warnings
from pathlib import Path

from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 100_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)

CONTENT_TYPES = {
    "bmp": "image/bmp",
    "gif": "image/gif",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "tif": "image/tiff",
    "tiff": "image/tiff",
    "webp": "image/webp",
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate full, card, and thumbnail artwork images."
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--artwork-id", required=True)
    parser.add_argument("--extension", required=True)
    parser.add_argument("--card-max", type=int, default=900)
    parser.add_argument("--thumb-max", type=int, default=240)
    return parser.parse_args()


def prepare_for_format(image, extension):
    if extension in {"jpg", "jpeg", "bmp"}:
        if image.mode in {"RGBA", "LA"}:
            background = Image.new("RGB", image.size, "white")
            alpha = image.getchannel("A")
            background.paste(image.convert("RGB"), mask=alpha)
            return background
        return image.convert("RGB")

    if extension == "gif":
        return image.convert("P", palette=Image.Palette.ADAPTIVE)

    if image.mode not in {"RGB", "RGBA", "L", "LA", "P"}:
        return image.convert("RGBA")

    return image


def save_image(image, output_path, extension):
    options = {}
    if extension in {"jpg", "jpeg"}:
        options = {"quality": 90, "optimize": True, "progressive": True}
    elif extension == "png":
        options = {"optimize": True, "compress_level": 9}
    elif extension == "webp":
        options = {"quality": 90, "method": 6}
    elif extension == "gif":
        options = {"optimize": True}
    elif extension in {"tif", "tiff"}:
        options = {"compression": "tiff_deflate"}

    prepare_for_format(image, extension).save(output_path, **options)


def describe_file(path, extension):
    with Image.open(path) as image:
        width, height = image.size

    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)

    return {
        "path": str(path.resolve()),
        "extension": extension,
        "content_type": CONTENT_TYPES[extension],
        "width": width,
        "height": height,
        "byte_size": path.stat().st_size,
        "checksum": digest.hexdigest(),
    }


def main():
    args = parse_args()
    extension = args.extension.lower().lstrip(".")
    if extension == "jpeg":
        extension = "jpg"
    if extension not in CONTENT_TYPES:
        raise ValueError(f"Unsupported output extension: {extension}")
    if args.card_max <= 0 or args.thumb_max <= 0:
        raise ValueError("Image size limits must be positive.")

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    with Image.open(args.input) as source:
        source.verify()

    with Image.open(args.input) as source:
        source.seek(0)
        full = ImageOps.exif_transpose(source).copy()
        full.load()
    if full.width <= 0 or full.height <= 0:
        raise ValueError("The source image has invalid dimensions.")

    variants = {}
    for name, maximum in (
        ("full", None),
        ("card", args.card_max),
        ("thumb", args.thumb_max),
    ):
        image = full.copy()
        if maximum is not None:
            image.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)

        output_path = output_dir / f"{args.artwork_id}_{name}.{extension}"
        save_image(image, output_path, extension)
        variants[name] = describe_file(output_path, extension)

    print(json.dumps({"variants": variants}, separators=(",", ":")))


if __name__ == "__main__":
    main()
