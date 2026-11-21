"""Read the synthetic/empty XLSX response; never runs a request or changes data."""
import json, sys, zipfile, xml.etree.ElementTree as ET

ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(sys.argv[1]) as archive:
    strings = []
    if "xl/sharedStrings.xml" in archive.namelist():
        strings = ["".join(node.itertext()) for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("x:si", ns)]
    rows = []
    for row in ET.fromstring(archive.read("xl/worksheets/sheet1.xml")).findall(".//x:row", ns):
        cells = []
        for cell in row.findall("x:c", ns):
            value = cell.find("x:v", ns)
            text = value.text if value is not None else ""
            if cell.get("t") == "s":
                text = strings[int(text)]
            elif cell.get("t") == "inlineStr":
                text = "".join(cell.find("x:is", ns).itertext())
            cells.append(text)
        rows.append(cells)
    headers = rows[0] if rows else []
    print(json.dumps({"zipValid": True, "sheetCount": len([p for p in archive.namelist() if p.startswith("xl/worksheets/sheet") and p.endswith(".xml")]), "headers": headers, "dataRows": max(0, len(rows) - 1), "sensitiveHeader": any(any(word in header.lower() for word in ["password", "密码", "token", "openid", "密钥"]) for header in headers)}, ensure_ascii=False))
