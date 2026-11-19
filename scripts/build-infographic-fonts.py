#!/usr/bin/env python3
"""Subsets the system Noto fonts into the glyf-only TTFs and flattened kerning tables the infographic engine embeds.

Run offline, rarely: `python3 -I scripts/build-infographic-fonts.py <noto-dir> <out-dir>`. Outputs are committed, so a
render never depends on installed fonts. Noto is SIL OFL 1.1 with no Reserved Font Name, so subsetting is permitted.
Requires fontTools. Output: <Name>.ttf and <Name>.kern.json ({"<left>|<right>": units} in font units, GPOS 'kern').
"""
import json, sys
from fontTools.ttLib import TTFont
from fontTools import subset

FONTS = {
    "NotoSans-Regular": "NotoSans-Regular.ttf",
    "NotoSans-Bold": "NotoSans-Bold.ttf",
    "NotoSans-Italic": "NotoSans-Italic.ttf",
    "NotoSerif-Bold": "NotoSerif-Bold.ttf",
}
# Basic Latin, Latin-1, Latin Extended-A, general punctuation, super/subscripts, currency, arrows, math, geometric marks.
UNICODES = (
    list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + list(range(0x2010, 0x2028)) + [0x2030, 0x2032, 0x2033, 0x2039, 0x203A, 0x2044]
    + list(range(0x2070, 0x209F)) + [0x20AC, 0x2116, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2194, 0x2197, 0x2198]
    + [0x2212, 0x2215, 0x2219, 0x221A, 0x221E, 0x2248, 0x2260, 0x2264, 0x2265, 0x25A0, 0x25B2, 0x25BC, 0x25CF, 0x2713, 0x2717, 0x00B1]
)

def kern_pairs(font):
    gpos = font["GPOS"].table if "GPOS" in font else None
    out = {}
    if gpos is None:
        return out
    cmap_rev = {}
    lookups_idx = set()
    for rec in gpos.FeatureList.FeatureRecord:
        if rec.FeatureTag == "kern":
            lookups_idx.update(rec.Feature.LookupListIndex)
    for li in sorted(lookups_idx):
        lookup = gpos.LookupList.Lookup[li]
        for st in lookup.SubTable:
            if lookup.LookupType == 9:
                st = st.ExtSubTable
            if st.LookupType != 2 if hasattr(st, "LookupType") else False:
                continue
            if not hasattr(st, "Format"):
                continue
            if st.Format == 1:
                for first, ps in zip(st.Coverage.glyphs, st.PairSet):
                    for rec in ps.PairValueRecord:
                        v = rec.Value1.XAdvance if rec.Value1 is not None and hasattr(rec.Value1, "XAdvance") else 0
                        if v:
                            out.setdefault(f"{first}|{rec.SecondGlyph}", v)
            elif st.Format == 2:
                cd1 = st.ClassDef1.classDefs
                cd2 = st.ClassDef2.classDefs
                members2 = {}
                for g, c in cd2.items():
                    members2.setdefault(c, []).append(g)
                for first in st.Coverage.glyphs:
                    c1 = cd1.get(first, 0)
                    rec1 = st.Class1Record[c1]
                    for c2, rec2 in enumerate(rec1.Class2Record):
                        v = rec2.Value1.XAdvance if rec2.Value1 is not None and hasattr(rec2.Value1, "XAdvance") else 0
                        if not v or c2 == 0:
                            continue
                        for second in members2.get(c2, []):
                            out.setdefault(f"{first}|{second}", v)
    return out

def main(src, dst):
    for name, file in FONTS.items():
        opts = subset.Options()
        opts.layout_features = ["kern"]
        opts.hinting = False
        opts.notdef_outline = True
        opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
        opts.drop_tables += ["DSIG", "GSUB", "GDEF", "fpgm", "prep", "cvt ", "gasp", "STAT", "FFTM"]
        font = subset.load_font(f"{src}/{file}", opts)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=UNICODES)
        sub.subset(font)
        order = font.getGlyphOrder()
        pairs = kern_pairs(font)
        # glyph names -> codepoints for a stable, name-independent table
        cmap = font.getBestCmap()
        by_name = {}
        for cp, gname in sorted(cmap.items()):
            by_name.setdefault(gname, cp)
        table = {}
        for key, v in pairs.items():
            a, b = key.split("|")
            if a in by_name and b in by_name:
                table[f"{by_name[a]}|{by_name[b]}"] = v
        font.save(f"{dst}/{name}.ttf")
        with open(f"{dst}/{name}.kern.json", "w") as fh:
            json.dump({"unitsPerEm": font["head"].unitsPerEm, "pairs": dict(sorted(table.items()))}, fh, separators=(",", ":"), sort_keys=False)
        print(name, len(order), "glyphs", len(table), "kern pairs")

main(sys.argv[1], sys.argv[2])
