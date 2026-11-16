"""Conservative capture quality gates; these do not establish authenticity."""

import io

from PIL import Image, ImageFilter, ImageStat, UnidentifiedImageError


def inspect_capture(data: bytes) -> tuple[Image.Image, str | None]:
    try:
        with Image.open(io.BytesIO(data)) as source:
            if source.width * source.height > 20_000_000:
                raise ValueError("Camera image is too large")
            image = source.convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("Capture a valid camera image") from exc
    if image.width < 320 or image.height < 240:
        return image, "Move closer and capture a larger, clearer image"
    gray = image.convert("L")
    gray.thumbnail((640, 640))
    mean, spread = ImageStat.Stat(gray).mean[0], ImageStat.Stat(gray).stddev[0]
    if mean < 28:
        return image, "The photo is too dark. Turn on a light and retake it"
    if mean > 235:
        return image, "The photo is overexposed. Reduce glare and retake it"
    if spread < 12 or ImageStat.Stat(gray.filter(ImageFilter.FIND_EDGES)).stddev[0] < 3:
        return image, "The photo is too unclear. Focus the camera and retake it"
    return image, None
