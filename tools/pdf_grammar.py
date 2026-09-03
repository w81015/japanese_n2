# -*- coding: utf-8 -*-
"""
從 resources/1.pdf（N2 文法整理表，254 文型）抽出文法資料。

版面是兩欄，一個條目由這些字級組成：
    4.7pt  文型那行的振假名        9.3pt  接續＋文型
    7.5pt  中文意思
    3.9pt  例句的振假名            6.0pt「例」  7.9pt 例句   7.1pt 例句中譯

振假名是獨立的文字物件，位置就在被注音的漢字正上方，所以可以用 x 座標把它
對回漢字，還原成專案用的「漢字{かな}」標注格式。

用法：python3 tools/pdf_grammar.py [來源PDF]
"""
import json, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    HERE, "..", "..", "resources", "1.pdf")
OUT = os.path.join(HERE, "..", "data")

try:
    import pdfplumber
except ImportError:
    sys.exit("需要 pdfplumber：pip install pdfplumber")

S_PAT, S_PAT_RT = 9.3, 4.7      # 文型 / 其振假名
S_ZH, S_EX, S_EX_RT = 7.5, 7.9, 3.9   # 中文意思 / 例句 / 例句振假名
S_EXZH, S_MARK = 7.1, 6.0       # 例句中譯 /「例」記號
KANJI = re.compile(r"[々〆ヶ一-鿿]")
JUNK = re.compile(r"整理シート|文型一覧|一覽表|速覽|辭典|ikuchannel|老師")
# 分類標題（助詞 2 個、句型 238 個…）不是資料
HEADER = re.compile(r"^\s*(助詞|句型|接續詞|副詞|其他|敬語|複合辭)?\s*\d+\s*個\s*$")

# 這份 PDF 有些字用「CJK 部首補充區」的字碼，NFKC 不會正規化，要自己對回去
RADICALS = {
    "⻑": "長", "⻄": "西", "⻘": "青", "⻙": "韋", "⻢": "馬", "⻥": "魚",
    "⻦": "鳥", "⻨": "麥", "⻩": "黃", "⻫": "齊", "⻭": "齒", "⻯": "龍",
    "⺟": "母", "⺠": "民", "⺡": "水", "⺢": "水", "⺤": "爪", "⺩": "玉",
    "⺬": "示", "⺮": "竹", "⺰": "糸", "⺳": "网", "⺶": "羊", "⺼": "肉",
    "⻂": "衣", "⻈": "言", "⻋": "車", "⻉": "貝", "⻎": "辵", "⻏": "邑",
    "⻖": "阜", "⺈": "刀", "⺊": "卜", "⺌": "小", "⺍": "小", "⺗": "心",
}


def norm(s):
    s = unicodedata.normalize("NFKC", s or "")
    return "".join(RADICALS.get(c, c) for c in s)


def strip_html(s):
    """來源網站的 <ruby> 標記偶爾會漏進 PDF 文字裡，去掉標籤只留底字"""
    s = re.sub(r"<rt>.*?</rt>", "", s)
    return re.sub(r"<[^>]*>", "", s)


def chars_of(page):
    out = []
    for c in page.chars:
        t = norm(c["text"])
        if not t.strip():
            continue
        out.append({"t": t, "s": round(c["size"], 1),
                    "x0": c["x0"], "x1": c["x1"], "y": c["top"]})
    return out


def lines(chars, size, tol=0.3):
    """把某個字級的字元依 y 分行，行內依 x 排序"""
    sel = [c for c in chars if abs(c["s"] - size) < tol]
    sel.sort(key=lambda c: (round(c["y"], 1), c["x0"]))
    out = []
    for c in sel:
        if out and abs(c["y"] - out[-1][0]["y"]) < 3:
            out[-1].append(c)
        else:
            out.append([c])
    for ln in out:
        ln.sort(key=lambda c: c["x0"])
    return out


def runs(line, gap=1.2):
    """把一行字元切成連續的段（用字距判斷）"""
    out = []
    for c in line:
        if out and c["x0"] - out[-1][-1]["x1"] < gap:
            out[-1].append(c)
        else:
            out.append([c])
    return out


def annotate(base_line, ruby_lines):
    """
    把振假名塞回底字，輸出「漢字{かな}」格式。
    ruby_lines 是位在 base_line 正上方的那些振假名行。
    """
    if not base_line:
        return ""
    chars = sorted((c for rl in ruby_lines for c in rl), key=lambda c: c["x0"])
    # 同一個詞的振假名字距約 1.3，不同詞之間 8 以上，用 3.0 就切得乾淨
    groups = runs(chars, gap=3.0)

    attach = {}          # 底字起始索引 -> (結束索引, 假名)
    for g in groups:
        gx0, gx1 = g[0]["x0"], g[-1]["x1"]
        # 數字也可能被注音（「17年間」→じゅうしちねんかん），要一起算進底字
        idxs = [i for i, c in enumerate(base_line)
                if (KANJI.match(c["t"]) or c["t"].isdigit())
                and gx0 - 1 <= (c["x0"] + c["x1"]) / 2 <= gx1 + 1]
        while idxs and not KANJI.match(base_line[idxs[-1]]["t"]):
            idxs.pop()            # 結尾不要停在數字上
        if idxs and idxs[-1] - idxs[0] == len(idxs) - 1:
            attach[idxs[0]] = (idxs[-1], "".join(c["t"] for c in g))

    out, i = "", 0
    while i < len(base_line):
        if i in attach:
            b, rt = attach[i]
            out += "".join(c["t"] for c in base_line[i:b + 1]) + "{" + rt + "}"
            i = b + 1
        else:
            out += base_line[i]["t"]
            i += 1
    return out


def text_of(line):
    return "".join(c["t"] for c in line)


def parse_column(chars, y_lo=0, y_hi=10 ** 9):
    chars = [c for c in chars if y_lo <= c["y"] < y_hi]
    pat_lines = lines(chars, S_PAT)
    if not pat_lines:
        return []
    entries = []
    for idx, pl in enumerate(pat_lines):
        top = pl[0]["y"]
        bottom = pat_lines[idx + 1][0]["y"] if idx + 1 < len(pat_lines) else y_hi
        blk = [c for c in chars if top - 10 <= c["y"] < bottom - 8]

        pat_rt = [l for l in lines(blk, S_PAT_RT) if l[0]["y"] < top]
        pattern = annotate(pl, pat_rt)

        zh = " ".join(text_of(l) for l in lines(blk, S_ZH)
                      if not HEADER.match(text_of(l)))

        # 「例」記號標出每個例句的開頭；同一個例句換行的部分要接回去
        marks = sorted(c["y"] for l in lines(blk, S_MARK) for c in l)
        ex_lines = lines(blk, S_EX)
        ex_rt = lines(blk, S_EX_RT)
        groups = []
        for el in ex_lines:
            y = el[0]["y"]
            started = any(abs(y - m) < 4 for m in marks)
            if started or not groups:
                groups.append([el])
            else:
                groups[-1].append(el)          # 換行，接在同一句後面
        exs = []
        for g in groups:
            s = ""
            for el in g:
                rt = [r for r in ex_rt if 2 < el[0]["y"] - r[0]["y"] < 10]
                s += annotate(el, rt)
            exs.append(s)

        exzh = "".join(text_of(l) for l in lines(blk, S_EXZH)
                       if not HEADER.match(text_of(l)))
        entries.append({"pattern": pattern, "zh": zh,
                        "ex": exs, "exZh": exzh, "y": top})
    return entries


def main():
    src = os.path.abspath(SRC)
    if not os.path.exists(src):
        sys.exit("找不到 " + src)
    raw = []
    with pdfplumber.open(src) as pdf:
        for page in pdf.pages:
            cs = chars_of(page)
            mid = page.width / 2
            for col in (0, 1):
                sub = [c for c in cs if (c["x0"] < mid) == (col == 0)]
                raw.extend(parse_column(sub))

    # 文型太長時會折成兩行，我的解析會把第一行當成一個「沒有意思也沒有例句」
    # 的空條目。把它併回下一條。
    merged = []
    for e in raw:
        if merged and not merged[-1]["zh"] and not merged[-1]["ex"]:
            carry = merged.pop()
            e = dict(e, pattern=carry["pattern"] + e["pattern"])
        merged.append(e)
    raw = merged

    out = []
    for e in raw:
        pat = strip_html(e["pattern"]).strip()
        if not pat or JUNK.search(pat):
            continue
        # 這一行是「接續 ＋ 文型」。接續本身也可能含＋（N ＋ の ＋ たびに），
        # 所以從最後一個＋切開，後面那段才是文型。
        usage, name = "", pat
        if "+" in pat or "＋" in pat:
            head, tail = re.split(r"\s*[+＋]\s*(?=[^+＋]*$)", pat, maxsplit=1)
            if tail.strip():
                usage, name = head.strip(), tail.strip()
        ex = e["ex"][0] if e["ex"] else ""
        out.append({
            "id": len(out) + 1,
            "pattern": name, "usage": [usage] if usage else [],
            "meaning": re.sub(r"\s+", " ", strip_html(e["zh"])).strip(), "note": "",
            "ex": strip_html(ex), "exZh": strip_html(e["exZh"]).strip(),
        })

    print("抽出 %d 條" % len(out))
    miss = {k: sum(1 for x in out if not x[k]) for k in
            ("pattern", "meaning", "ex", "exZh")}
    print("缺欄位：", miss)
    print("有振假名的例句：%d" % sum(1 for x in out if "{" in x["ex"]))

    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, "grammar_list.js")
    with open(p, "w", encoding="utf-8") as f:
        f.write("window.GRAMMAR_LIST = %s;\n"
                % json.dumps(out, ensure_ascii=False, indent=0))
    print("->", p)


if __name__ == "__main__":
    main()
