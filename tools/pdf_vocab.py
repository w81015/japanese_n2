# -*- coding: utf-8 -*-
"""
從 resources/9.pdf（N2 單字一覽表）抽出單字資料。

版面是固定的兩欄，每欄四個 x 座標帶：
        假名      漢字      詞性      中文
  左欄   27        90       150       168
  右欄  309       372       432       450

每一筆一定有「詞性」，所以拿詞性當錨點，再把同一個 y（±5）的假名／漢字／
中文收進來。長詞會折行，折下來的片段自成一列且沒有詞性，歸給上方那一筆。

用法：python3 tools/pdf_vocab.py [來源PDF]
"""
import json, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    HERE, "..", "..", "resources", "9.pdf")
OUT = os.path.join(HERE, "..", "data")

try:
    import pdfplumber
except ImportError:
    sys.exit("需要 pdfplumber：pip install pdfplumber")

# 欄位的 x 座標帶（左欄、右欄），容差 8pt
BANDS = {"kana": (27, 309), "kanji": (90, 372), "pos": (150, 432), "zh": (168, 450)}
XTOL = 8
YTOL = 5          # 同一筆的欄位 y 差距
# 表裡實際出現的詞性（繁體），「一覧表」是表頭不是詞性
POS_SET = {"名詞", "動詞", "い形容詞", "な形容詞", "副詞",
           "連體詞", "接續詞", "數詞", "其他"}
# 落在假名欄位的分類標題（あ行、200 個…），不是資料
JUNK = re.compile(r"^[ぁ-んァ-ヶ]行$|^\d+\s*個$|一覧表|背誦|五十音")
# 資料只用這三種字級；頁尾署名是 6.7pt、標題更大，靠字級就能濾掉
DATA_SIZES = (9.4, 6.0, 7.9)

norm = lambda s: unicodedata.normalize("NFKC", s or "").strip()


KANA_CLASS = "ぁ-ゟ゠-ヿー"


KANJI_SEG = re.compile(r"[0-9一-鿿々〆ヶ]+")


def head_anno(word, reading):
    """
    把整詞讀音拆回各個漢字段，輸出「漢字{かな}」。
    假名在詞中間也要處理：空き地／あきち → 空{あ}き地{ち}
    （若整段掛在最後一個漢字上，渲染時會變成「空き<ruby>地</ruby>」而錯位）
    對不上就不注音，寧可少也不要錯。
    """
    if not reading or reading == word or not KANJI_SEG.search(word):
        return word
    segs = re.findall(r"[0-9一-鿿々〆ヶ]+|[^0-9一-鿿々〆ヶ]+", word)
    out, ri = "", 0
    for i, seg in enumerate(segs):
        if KANJI_SEG.fullmatch(seg):
            if i + 1 < len(segs):
                j = reading.find(segs[i + 1], ri)
                if j < 0:
                    return word
            else:
                j = len(reading)
            if j <= ri:
                return word
            out += "%s{%s}" % (seg, reading[ri:j])
            ri = j
        else:
            if not reading.startswith(seg, ri):
                return word
            out += seg
            ri += len(seg)
    return out if ri == len(reading) else word


def field_of(x, col):
    for name, (a, b) in BANDS.items():
        if abs(x - (a if col == 0 else b)) <= XTOL:
            return name
    # 中文折行時會往右縮排，仍算中文
    return "zh" if x > (BANDS["pos"][col] + XTOL) else None


def parse_page(page):
    mid = page.width / 2
    items = []
    for w in page.extract_words(extra_attrs=["size"]):
        t = norm(w["text"])
        if not t:
            continue
        if JUNK.search(t):
            continue
        if not any(abs(w["size"] - s) < 0.3 for s in DATA_SIZES):
            continue
        col = 0 if w["x0"] < mid else 1
        f = field_of(w["x0"], col)
        if f:
            items.append({"f": f, "t": t, "y": w["top"], "x": w["x0"], "col": col})
    return items


def records_from(items):
    out = []
    for col in (0, 1):
        ws = [w for w in items if w["col"] == col]
        anchors = sorted([w for w in ws if w["f"] == "pos" and w["t"] in POS_SET],
                         key=lambda w: w["y"])
        if not anchors:
            continue
        recs = [{"pos": a["t"], "y": a["y"], "kana": "", "kanji": "", "zh": ""}
                for a in anchors]
        used = set()
        # 第一輪：y 對得上的直接歸位
        for i, w in enumerate(ws):
            if w["f"] == "pos":
                continue
            for r in recs:
                if abs(w["y"] - r["y"]) <= YTOL:
                    r[w["f"]] += w["t"]
                    used.add(i)
                    break
        # 第二輪：剩下的都是折行片段，接到它上方最近的那一筆
        for i, w in enumerate(ws):
            if i in used or w["f"] == "pos":
                continue
            above = [r for r in recs if r["y"] < w["y"]]
            if above:
                above[-1][w["f"]] += w["t"]
        out.extend(recs)
    return out


def main():
    src = os.path.abspath(SRC)
    if not os.path.exists(src):
        sys.exit("找不到 " + src)
    recs = []
    with pdfplumber.open(src) as pdf:
        for page in pdf.pages:
            recs.extend(records_from(parse_page(page)))

    out, bad, seen, dups = [], [], {}, []
    for r in recs:
        kana, kanji, zh = r["kana"], r["kanji"], r["zh"]
        if not kana or not zh:
            bad.append(r)
            continue
        word = kanji or kana
        k = (word, kana)
        if k in seen:                       # 原始 PDF 本身就有重複條目
            prev = seen[k]
            if zh not in prev["zh"]:
                prev["zh"] += "／" + zh      # 兩邊的中文都留著
            dups.append(k)
            continue
        rec = {"id": 0, "pos": r["pos"], "word": word,
               "wordRuby": head_anno(word, kana),
               "reading": kana, "zh": zh, "en": ""}
        seen[k] = rec
        out.append(rec)
    for i, x in enumerate(out, 1):
        x["id"] = i
    if dups:
        print("原始資料重複，已合併 %d 筆：%s" % (len(dups), dups))

    print("抽出 %d 筆（欄位不全而略過 %d 筆）" % (len(out), len(bad)))
    for b in bad[:8]:
        print("   略過:", b)

    # 品質檢查
    probs = []
    for x in out:
        if not re.fullmatch(r"[ぁ-んァ-ヶー・]+", x["reading"]):
            probs.append(("讀音含非假名", x))
        if len(x["reading"]) > 14 or len(x["word"]) > 12:
            probs.append(("異常長", x))
    print("可疑資料 %d 筆" % len(probs))
    for p in probs[:8]:
        print("   ", p[0], p[1])
    dup = len(out) - len({(x["word"], x["reading"]) for x in out})
    print("重複 %d 筆" % dup)

    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, "vocab_list.js")
    with open(p, "w", encoding="utf-8") as f:
        f.write("window.VOCAB_LIST = %s;\n"
                % json.dumps(out, ensure_ascii=False, indent=0))
    print("->", p)


if __name__ == "__main__":
    main()
