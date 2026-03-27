from __future__ import annotations

import csv
import importlib
import importlib.metadata
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


LIST_MARKER_PATTERN = re.compile(r"^(\*|-|\u2022|\d+[\.\)])\s+")
HEADING_PREFIX_PATTERN = re.compile(r"^(\d+(?:\.\d+)*\.?)\s+")


def load_json(path: str) -> Dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path: str, value: Dict[str, Any]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None  # type: ignore[attr-defined]


def module_version(name: str) -> Optional[str]:
    try:
        return importlib.metadata.version(name)
    except Exception:
        return None


def build_capabilities() -> Dict[str, Any]:
    modules = {
        "pypdf": module_available("pypdf"),
        "docx": module_available("docx"),
        "openpyxl": module_available("openpyxl"),
        "paddleocr": module_available("paddleocr"),
        "docling": module_available("docling"),
    }
    versions = {
        "pypdf": module_version("pypdf"),
        "python-docx": module_version("python-docx"),
        "openpyxl": module_version("openpyxl"),
        "paddleocr": module_version("paddleocr"),
        "docling": module_version("docling"),
    }
    reasons: List[str] = []
    if not modules["pypdf"]:
        reasons.append("pypdf is unavailable.")
    if not modules["docx"]:
        reasons.append("python-docx is unavailable.")
    if not modules["openpyxl"]:
        reasons.append("openpyxl is unavailable.")
    if not modules["paddleocr"]:
        reasons.append("PaddleOCR is unavailable.")
    if not modules["docling"]:
        reasons.append("Docling is unavailable.")

    return {
        "available": any(modules.values()),
        "nativeReady": modules["pypdf"] or modules["docx"] or modules["openpyxl"],
        "ocrReady": modules["paddleocr"] or modules["docling"],
        "modules": modules,
        "versions": versions,
        "reasons": reasons,
    }


def build_language_hints(text: str) -> List[str]:
    hints: List[str] = []
    if re.search(r"[A-Za-z]", text or ""):
        hints.append("en")
    if re.search(r"[\u0600-\u06FF]", text or ""):
        hints.append("ar")
    return hints


def normalize_text(value: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]{2,}", " ", (value or "").replace("\r", ""))).strip()


def normalize_table_rows(rows: Iterable[Sequence[Any]]) -> List[List[str]]:
    normalized_rows: List[List[str]] = []
    for row in rows:
        normalized = [str(cell).strip() for cell in row if cell not in (None, "")]
        if normalized:
            normalized_rows.append(normalized)
    return normalized_rows


def looks_like_heading(line: str) -> bool:
    trimmed = (line or "").strip()
    if not trimmed or len(trimmed) > 120:
        return False
    if re.match(r"^(chapter|section|unit|module|lesson|topic|abstract|introduction|conclusion)\b", trimmed, re.I):
        return True
    if HEADING_PREFIX_PATTERN.match(trimmed):
        return True
    if re.match(r"^[A-Z0-9\s\-:()]{4,}$", trimmed):
        return True
    if re.match(r"^[\u0600-\u06FF0-9\s\-:()]{4,}$", trimmed) and len(trimmed) <= 80:
        return True
    return False


def looks_like_title_candidate(line: str, index: int) -> bool:
    trimmed = (line or "").strip()
    if index > 1 or not trimmed or len(trimmed) > 100:
        return False
    return bool(
        re.match(r"^[A-Z][A-Za-z0-9\s\-:()]{4,}$", trimmed)
        or re.match(r"^[\u0600-\u06FF][\u0600-\u06FF0-9\s\-:()]{3,}$", trimmed)
    )


def looks_like_list_item(line: str) -> bool:
    return bool(LIST_MARKER_PATTERN.match((line or "").strip()))


def looks_like_table_row(line: str) -> bool:
    trimmed = (line or "").strip()
    if not trimmed:
        return False
    return "\t" in trimmed or "|" in trimmed or re.search(r"\s{3,}", trimmed) is not None


def strip_list_marker(line: str) -> str:
    return LIST_MARKER_PATTERN.sub("", line or "").strip()


def infer_heading_metadata(line: str, index: int) -> Optional[Tuple[str, int]]:
    trimmed = (line or "").strip()
    if not looks_like_heading(trimmed):
        if looks_like_title_candidate(trimmed, index):
            return ("title", 1)
        return None

    numbered_match = HEADING_PREFIX_PATTERN.match(trimmed)
    if numbered_match:
        depth = len(numbered_match.group(1).rstrip(".").split("."))
        return ("heading" if depth <= 1 else "subheading", min(6, depth + 1))

    if looks_like_title_candidate(trimmed, index):
        return ("title", 1)

    return ("heading" if re.match(r"^[A-Z0-9\s\-:()]{4,}$", trimmed) else "subheading", 2 if re.match(r"^[A-Z0-9\s\-:()]{4,}$", trimmed) else 3)


def block_plain_text(block: Dict[str, Any]) -> str:
    block_type = str(block.get("type") or "paragraph")
    text = str(block.get("text") or "").strip()
    if not text:
        return ""
    if block_type == "list_item":
        return f"- {strip_list_marker(text)}"
    if block_type == "table":
        rows = block.get("rows") or []
        if isinstance(rows, list) and rows:
            return "\n".join(" | ".join(str(cell).strip() for cell in row if str(cell).strip()) for row in rows)
    if block_type == "ocr_block":
        return f"OCR: {text}"
    if block_type == "note":
        return f"Note: {text}"
    return text


def create_block(
    page_number: int,
    order: int,
    text: str,
    source: str,
    *,
    block_type: Optional[str] = None,
    level: Optional[int] = None,
    rows: Optional[List[List[str]]] = None,
    confidence: Optional[float] = None,
    bbox: Optional[Dict[str, float]] = None,
    notes: Optional[List[str]] = None,
) -> Dict[str, Any]:
    normalized = normalize_text(text)
    if not normalized:
        normalized = text.strip()

    resolved_type = block_type or "paragraph"
    resolved_level = level
    if not block_type:
        heading = infer_heading_metadata(normalized, order - 1)
        if heading:
            resolved_type, resolved_level = heading
        elif looks_like_list_item(normalized):
            resolved_type = "list_item"
        elif looks_like_table_row(normalized):
            resolved_type = "table"
            rows = [re.split(r"\s{3,}|\t|\|", normalized)]
            rows = [[cell.strip() for cell in row if cell.strip()] for row in rows if row]

    return {
        "blockId": f"py-{page_number}-{order}",
        "type": resolved_type,
        "source": source,
        "text": normalized,
        "pageNumber": page_number,
        "order": order,
        "level": resolved_level,
        "rows": rows,
        "confidence": confidence,
        "bbox": bbox,
        "notes": notes,
    }


def lines_to_blocks(page_number: int, text: str, source: str) -> List[Dict[str, Any]]:
    lines = [line.strip() for line in normalize_text(text).split("\n") if line.strip()]
    return [create_block(page_number, index, line, source) for index, line in enumerate(lines, start=1)]


def page_from_blocks(page_number: int, blocks: List[Dict[str, Any]], source_kind: str) -> Dict[str, Any]:
    sorted_blocks = sorted(blocks, key=lambda item: int(item.get("order") or 0))
    page_text = normalize_text("\n".join(block_plain_text(block) for block in sorted_blocks if block_plain_text(block)))
    heading_candidates = [
        str(block.get("text") or "")
        for block in sorted_blocks
        if str(block.get("type") or "") in ("title", "heading", "subheading")
    ][:10]

    return {
        "pageNumber": page_number,
        "text": page_text,
        "headingCandidates": heading_candidates,
        "blocks": sorted_blocks,
        "sourceKind": source_kind,
    }


def page_payload(page_number: int, text: str, source_kind: str) -> Dict[str, Any]:
    return page_from_blocks(page_number, lines_to_blocks(page_number, text, source_kind), source_kind)


def extract_pdf_native(source_path: str) -> Dict[str, Any]:
    from pypdf import PdfReader  # type: ignore

    reader = PdfReader(source_path)
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text(extraction_mode="layout") or page.extract_text() or ""
        except TypeError:
            text = page.extract_text() or ""
        pages.append(page_payload(index, text, "native"))

    full_text = normalize_text("\n\n".join(page["text"] for page in pages if page["text"]))
    return {
        "engine": "python:pypdf",
        "pages": pages,
        "fullText": full_text,
        "languageHints": build_language_hints(full_text),
        "notes": [],
        "tablesDetected": sum(1 for page in pages for block in page["blocks"] if block["type"] == "table"),
        "listsDetected": sum(1 for page in pages for block in page["blocks"] if block["type"] == "list_item"),
    }


def docx_paragraph_to_block(page_number: int, order: int, text: str, style_name: str) -> Dict[str, Any]:
    style = (style_name or "").strip().lower()
    if style.startswith("title"):
        return create_block(page_number, order, text, "native", block_type="title", level=1)

    if style.startswith("heading"):
        match = re.search(r"(\d+)", style)
        level = int(match.group(1)) if match else 1
        block_type = "heading" if level <= 1 else "subheading"
        return create_block(page_number, order, text, "native", block_type=block_type, level=min(6, level + 1))

    if "list" in style or looks_like_list_item(text):
        return create_block(page_number, order, text, "native", block_type="list_item")

    return create_block(page_number, order, text, "native")


def extract_docx_native(source_path: str) -> Dict[str, Any]:
    from docx import Document  # type: ignore

    document = Document(source_path)
    blocks: List[Dict[str, Any]] = []
    order = 1

    for paragraph in document.paragraphs:
        text = normalize_text(paragraph.text or "")
        if not text:
            continue
        style_name = getattr(getattr(paragraph, "style", None), "name", "") or ""
        blocks.append(docx_paragraph_to_block(1, order, text, style_name))
        order += 1

    for table in document.tables:
        rows = normalize_table_rows([[cell.text for cell in row.cells] for row in table.rows])
        if not rows:
            continue
        table_text = "\n".join(" | ".join(row) for row in rows)
        blocks.append(
            create_block(
                1,
                order,
                table_text,
                "native",
                block_type="table",
                rows=rows,
            )
        )
        order += 1

    pages = [page_from_blocks(1, blocks, "native")]
    full_text = pages[0]["text"] if pages else ""
    return {
        "engine": "python:python-docx",
        "pages": pages,
        "fullText": full_text,
        "languageHints": build_language_hints(full_text),
        "notes": [],
        "tablesDetected": sum(1 for page in pages for block in page["blocks"] if block["type"] == "table"),
        "listsDetected": sum(1 for page in pages for block in page["blocks"] if block["type"] == "list_item"),
    }


def extract_spreadsheet_native(source_path: str, file_type: str) -> Dict[str, Any]:
    pages = []

    if file_type == "csv":
        with open(source_path, "r", encoding="utf-8", errors="ignore", newline="") as handle:
            rows = normalize_table_rows(csv.reader(handle))
        blocks: List[Dict[str, Any]] = []
        if rows:
            blocks.append(
                create_block(
                    1,
                    1,
                    "\n".join(" | ".join(row) for row in rows),
                    "native",
                    block_type="table",
                    rows=rows,
                )
            )
        pages.append(page_from_blocks(1, blocks, "native"))
    else:
        from openpyxl import load_workbook  # type: ignore

        workbook = load_workbook(source_path, data_only=True)
        for index, sheet_name in enumerate(workbook.sheetnames, start=1):
            sheet = workbook[sheet_name]
            rows = normalize_table_rows(sheet.iter_rows(values_only=True))
            blocks: List[Dict[str, Any]] = [
                create_block(index, 1, f"Sheet: {sheet_name}", "native", block_type="heading", level=2)
            ]
            if rows:
                blocks.append(
                    create_block(
                        index,
                        2,
                        "\n".join(" | ".join(row) for row in rows),
                        "native",
                        block_type="table",
                        rows=rows,
                    )
                )
            pages.append(page_from_blocks(index, blocks, "native"))

    full_text = normalize_text("\n\n".join(page["text"] for page in pages if page["text"]))
    return {
        "engine": "python:openpyxl",
        "pages": pages,
        "fullText": full_text,
        "languageHints": build_language_hints(full_text),
        "notes": [],
        "tablesDetected": sum(1 for page in pages for block in page["blocks"] if block["type"] == "table"),
        "listsDetected": 0,
    }


def extract_plain_text(source_path: str) -> Dict[str, Any]:
    text = Path(source_path).read_text(encoding="utf-8", errors="ignore").strip()
    pages = [page_payload(1, text, "native")]
    return {
        "engine": "python:text",
        "pages": pages,
        "fullText": text,
        "languageHints": build_language_hints(text),
        "notes": [],
        "tablesDetected": 0,
        "listsDetected": 0,
    }


def build_paddleocr_engine() -> Tuple[Any, List[str]]:
    from paddleocr import PaddleOCR  # type: ignore

    notes: List[str] = []
    last_error: Optional[str] = None
    for lang in ("ar", "arabic", "en"):
        try:
            engine = PaddleOCR(use_angle_cls=True, lang=lang)
            notes.append(f"PaddleOCR initialized with language profile: {lang}")
            return engine, notes
        except Exception as error:
            last_error = str(error)

    if last_error:
        notes.append(f"PaddleOCR language profile fallback triggered: {last_error}")
    notes.append("PaddleOCR fell back to the default English profile.")
    return PaddleOCR(use_angle_cls=True, lang="en"), notes


def looks_like_ocr_line(entry: Any) -> bool:
    return (
        isinstance(entry, (list, tuple))
        and len(entry) >= 2
        and isinstance(entry[0], (list, tuple))
    )


def iter_ocr_pages(result: Any) -> List[List[Any]]:
    if not isinstance(result, list):
        return []

    if result and all(looks_like_ocr_line(entry) for entry in result):
        return [list(result)]

    pages: List[List[Any]] = []
    for page in result:
        if isinstance(page, list):
            pages.append(page)
    return pages


def bbox_from_points(points: Sequence[Sequence[float]]) -> Optional[Dict[str, float]]:
    if not points:
        return None
    x_values = [float(point[0]) for point in points if len(point) >= 2]
    y_values = [float(point[1]) for point in points if len(point) >= 2]
    if not x_values or not y_values:
        return None
    return {
        "x": min(x_values),
        "y": min(y_values),
        "width": max(x_values) - min(x_values),
        "height": max(y_values) - min(y_values),
    }


def ocr_entry_to_block(page_number: int, order: int, entry: Sequence[Any]) -> Optional[Dict[str, Any]]:
    if len(entry) < 2:
        return None

    bbox = entry[0] if isinstance(entry[0], (list, tuple)) else []
    payload = entry[1] if isinstance(entry[1], (list, tuple)) else [entry[1], None]
    text = normalize_text(str(payload[0] if len(payload) > 0 else ""))
    confidence = float(payload[1]) if len(payload) > 1 and payload[1] is not None else None
    if not text:
        return None

    heading = infer_heading_metadata(text, order - 1)
    block_type = "ocr_block"
    level = None
    if heading:
        block_type, level = heading
    elif looks_like_list_item(text):
        block_type = "list_item"
    elif looks_like_table_row(text):
        block_type = "table"

    rows = [re.split(r"\s{3,}|\t|\|", text)] if block_type == "table" else None
    if rows is not None:
        rows = [[cell.strip() for cell in row if cell.strip()] for row in rows if row]

    return create_block(
        page_number,
        order,
        text,
        "ocr",
        block_type=block_type,
        level=level,
        rows=rows,
        confidence=confidence,
        bbox=bbox_from_points(bbox),
    )


def extract_ocr_document(source_path: str, file_type: str) -> Dict[str, Any]:
    engine, notes = build_paddleocr_engine()
    result = engine.ocr(source_path, cls=True)
    page_results = iter_ocr_pages(result)

    pages: List[Dict[str, Any]] = []
    ocr_blocks: List[Dict[str, Any]] = []

    for page_index, page_entries in enumerate(page_results, start=1):
        blocks = []
        for entry_index, entry in enumerate(page_entries, start=1):
            block = ocr_entry_to_block(page_index, entry_index, entry)
            if block is None:
                continue
            blocks.append(block)
            ocr_blocks.append(block)

        if blocks:
            pages.append(page_from_blocks(page_index, blocks, "ocr"))

    full_text = normalize_text("\n\n".join(page["text"] for page in pages if page["text"]))
    if file_type == "pdf":
        notes.append("PaddleOCR was asked to resolve PDF pages as OCR/document-vision input.")

    return {
        "engine": "python:paddleocr",
        "pages": pages,
        "ocrBlocks": ocr_blocks,
        "fullText": full_text,
        "languageHints": build_language_hints(full_text),
        "notes": notes,
    }


def load_docling_payload(source_path: str) -> Optional[Dict[str, Any]]:
    try:
        from docling.document_converter import DocumentConverter  # type: ignore
    except Exception:
        return None

    try:
        converter = DocumentConverter()
        conversion = converter.convert(source_path)
        document = getattr(conversion, "document", None) or getattr(conversion, "legacy_document", None)
        if document is None:
            return None

        markdown = document.export_to_markdown() if hasattr(document, "export_to_markdown") else None
        if hasattr(document, "export_to_dict"):
            structured = document.export_to_dict()
        elif hasattr(document, "export_to_json"):
            try:
                structured = json.loads(document.export_to_json())
            except Exception:
                structured = None
        else:
            structured = None
        text = document.export_to_text() if hasattr(document, "export_to_text") else None

        return {
            "markdown": markdown,
            "structured": structured,
            "text": normalize_text(text or markdown or ""),
        }
    except Exception as error:
        return {
            "markdown": None,
            "structured": None,
            "text": None,
            "error": str(error),
        }


def extract_document(payload: Dict[str, Any]) -> Dict[str, Any]:
    source_path = str(payload.get("sourcePath") or "")
    file_type = str(payload.get("fileType") or "").lower()
    mode = str(payload.get("mode") or "native")
    capabilities = build_capabilities()
    notes: List[str] = []
    errors: List[str] = []

    native = None
    ocr = None
    docling_payload = None

    try:
        if mode in ("native", "hybrid"):
            if file_type == "pdf" and capabilities["modules"].get("pypdf"):
                native = extract_pdf_native(source_path)
            elif file_type == "docx" and capabilities["modules"].get("docx"):
                native = extract_docx_native(source_path)
            elif file_type in ("xlsx", "csv") and capabilities["modules"].get("openpyxl"):
                native = extract_spreadsheet_native(source_path, file_type)
            elif file_type == "txt":
                native = extract_plain_text(source_path)
            elif file_type == "csv":
                native = extract_spreadsheet_native(source_path, file_type)
    except Exception as error:
        errors.append(f"native-extract-failed: {error}")

    try:
        if mode in ("ocr", "hybrid"):
            if file_type in ("image", "pdf") and capabilities["modules"].get("paddleocr"):
                ocr = extract_ocr_document(source_path, file_type)
            elif capabilities["modules"].get("docling"):
                docling_payload = load_docling_payload(source_path)
                if docling_payload:
                    text = normalize_text(str(docling_payload.get("text") or ""))
                    ocr = {
                        "engine": "python:docling-structural-fallback",
                        "pages": [page_payload(1, text, "ocr")] if text else [],
                        "ocrBlocks": [],
                        "fullText": text,
                        "languageHints": build_language_hints(text),
                        "notes": ["Docling provided structural OCR/hybrid fallback text."],
                    }
                    notes.append("Docling payload resolved for OCR/hybrid normalization.")
    except Exception as error:
        errors.append(f"ocr-extract-failed: {error}")

    if capabilities["modules"].get("docling") and docling_payload is None:
        docling_payload = load_docling_payload(source_path)

    return {
        "ok": native is not None or ocr is not None or docling_payload is not None,
        "native": native,
        "ocr": ocr,
        "docling": docling_payload,
        "notes": notes,
        "errors": errors,
        "capabilities": capabilities,
    }


def main() -> int:
    if len(sys.argv) != 4:
        return 2

    command = sys.argv[1]
    input_path = sys.argv[2]
    output_path = sys.argv[3]

    if command == "detect":
        write_json(output_path, build_capabilities())
        return 0

    if command == "extract":
        payload = load_json(input_path)
        write_json(output_path, extract_document(payload))
        return 0

    write_json(output_path, {"error": f"Unknown command: {command}"})
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
