#!/usr/bin/env python3
"""
從考古題 PDF 抽出題目。

  resources/7.pdf  問題用紙 p1–7   → 問題1〜6（文字・語彙）第 1–32 題
  resources/3.pdf  問題用紙 p8–13  → 問題7〜9（文法）    第 33–54 題

兩份是同一回考題的前後半，合起來是完整的「言語知識（文字・語彙・文法）」。

版面規律（用字級與座標判斷，不靠正規表示式猜）：
  11.3pt  內文（題幹與選項）
   5.6pt  振假名
   9.2pt  題號（外框數字，PDF 內是 cid，字碼不可靠，所以改用出現順序編號）
  12.8pt  「問題N」標題
   9.0pt  頁首        14.4pt  頁碼        x0>560  側邊標籤（文字・語彙／文法）
  page.lines(高度 0)  題幹裡的底線（問題1・2・5 要考的那個詞）

輸出 data/past.js。答案不在任何一份 PDF 裡，由 tools/past_answers.py 提供。
"""
import json
import os
import re
import sys
import unicodedata

import pdfplumber

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RES = os.path.join(os.path.dirname(ROOT), "resources")

S_BODY, S_RT, S_NUM, S_HEAD = 11.3, 5.6, 9.2, 12.8
SIDE_X = 560          # 超過這個 x 是側邊直排標籤
KANJI = re.compile(r"[々〆ヶ一-鿿]")
# 卷面是全形１２３４，但 norm() 會做 NFKC，到這裡已經是半形
OPT_MARK = "1234"

# NFKC 不會處理「CJK 部首補充」區，這裡自己補
RADICALS = {"⻑": "長", "⻝": "食", "⻟": "食", "⺅": "人", "⺉": "刀", "⺏": "尢",
            "⺒": "已", "⺓": "彑", "⺖": "心", "⺘": "手", "⺙": "攴", "⺛": "无",
            "⺜": "日", "⺝": "月", "⺞": "歹", "⺟": "母", "⺠": "民", "⺡": "水",
            "⺣": "火", "⺤": "爪", "⺥": "爪", "⺨": "犬", "⺩": "玉", "⺪": "疋",
            "⺬": "示", "⺮": "竹", "⺰": "糸", "⺳": "网", "⺶": "羊", "⺼": "肉",
            "⻂": "衣", "⻈": "言", "⻋": "車", "⻉": "貝", "⻎": "辵", "⻏": "邑",
            "⻖": "阜", "⺈": "刀", "⺊": "卜", "⺌": "小", "⺍": "小", "⺗": "心"}

# pdfplumber 對少數字形取不到 unicode，會變成 U+FFFD。
# 這些是逐一比對 PDF 畫面後補回來的，位置以「前後文」指定，避免補錯地方。
MOJIBAKE = [
    ("家に帰ると�れて", "家に帰ると疲れて"),
    ("�手への思いやり", "相手への思いやり"),
    # 逗號的座標比數字低，排序時被擠到前面去了
    ("約2336,00時間", "約233,600時間"),
]

SECTIONS = {
    1: "漢字読み", 2: "表記", 3: "語形成", 4: "文脈規定",
    5: "言い換え類義", 6: "用法", 7: "文法形式の判断",
    8: "文の組み立て", 9: "文章の文法",
}
# 每個大題的題數，用來把「出現順序」換成正式題號
COUNTS = [(1, 5), (2, 5), (3, 5), (4, 7), (5, 5), (6, 5), (7, 12), (8, 5), (9, 5)]


def norm(s):
    s = unicodedata.normalize("NFKC", s or "")
    return "".join(RADICALS.get(c, c) for c in s)


def fix(s):
    for bad, good in MOJIBAKE:
        s = s.replace(bad, good)
    return s


def tidy(s):
    """NFKC 把全形標點壓成半形了，日文句子還是全形好讀，這裡還原回去"""
    s = re.sub(r"\(\s*\)", "（　）", s)
    # 括號內有非 ASCII 就是日文括號
    s = re.sub(r"\(([^()]*[^\x00-\x7f][^()]*)\)", r"（\1）", s)
    s = s.replace("?", "？").replace("!", "！")
    s = re.sub(r"[ \t]+", "", s)
    return s.strip()


def side_tabs(page):
    """側邊直排標籤（文字・語彙／文法）是一個窄長方塊，左右頁交替出現"""
    return [r for r in page.rects if r["x1"] - r["x0"] < 40 and r["height"] > 40]


def chars_of(page):
    tabs = side_tabs(page)
    out = []
    for c in page.chars:
        t = norm(c["text"])
        if not t.strip():
            continue
        cx = (c["x0"] + c["x1"]) / 2
        if any(r["x0"] - 4 <= cx <= r["x1"] + 4 for r in tabs):
            continue
        out.append({"t": t, "s": round(c["size"], 1), "x0": c["x0"],
                    "x1": c["x1"], "y": c["top"]})
    return out


def lines(chars, size=None, tol=0.35, ygap=3):
    sel = chars if size is None else [c for c in chars if abs(c["s"] - size) < tol]
    sel = sorted(sel, key=lambda c: (round(c["y"], 1), c["x0"]))
    out = []
    for c in sel:
        if out and abs(c["y"] - out[-1][0]["y"]) < ygap:
            out[-1].append(c)
        else:
            out.append([c])
    for ln in out:
        ln.sort(key=lambda c: c["x0"])
    return out


def runs(line, gap=1.2):
    out = []
    for c in line:
        if out and c["x0"] - out[-1][-1]["x1"] < gap:
            out[-1].append(c)
        else:
            out.append([c])
    return out


def annotate(base_line, ruby_chars):
    """把振假名塞回底字，輸出「漢字{かな}」"""
    if not base_line:
        return ""
    groups = runs(sorted(ruby_chars, key=lambda c: c["x0"]), gap=3.0)
    attach = {}
    for g in groups:
        gx0, gx1 = g[0]["x0"], g[-1]["x1"]
        idxs = [i for i, c in enumerate(base_line)
                if (KANJI.match(c["t"]) or c["t"].isdigit())
                and gx0 - 1 <= (c["x0"] + c["x1"]) / 2 <= gx1 + 1]
        while idxs and not KANJI.match(base_line[idxs[-1]]["t"]):
            idxs.pop()
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


def render(body_lines, ruby, underlines):
    """
    把幾行內文接成一段字串。

    底線有兩種用途，靠「線上面有沒有字」分辨：
      有字 → 問題1・2・5 要考的那個詞，包成 [[…]]
      沒字 → 問題8 的空格，換成 ＿＿＿；裡面有★的那格換成 ＿★＿
    """
    parts, prev_slot = [], False
    for ln in body_lines:
        rt = [c for c in ruby
              if ln[0]["y"] - 14 < c["y"] < ln[0]["y"] - 1
              and ln[0]["x0"] - 6 <= c["x0"] <= ln[-1]["x1"] + 6]
        segs = [u for u in underlines if abs(u["top"] - (ln[0]["y"] + 13)) <= 7]

        marked, slots = set(), []
        for u in segs:
            inside = [i for i, c in enumerate(ln)
                      if u["x0"] - 1 <= (c["x0"] + c["x1"]) / 2 <= u["x1"] + 1]
            body = [i for i in inside if ln[i]["t"] != "★"]
            if body:
                marked |= set(inside)
            else:
                slots.append((u["x0"], "＿★＿" if inside else "＿＿＿"))
                marked |= set(inside)      # ★ 本身不另外輸出

        # 依 x 位置把「字的片段」和「空格」排在一起
        toks, i = [], 0
        while i < len(ln):
            on = i in marked
            j = i
            while j < len(ln) and (j in marked) == on:
                j += 1
            chunk = ln[i:j]
            i = j
            if on and all(c["t"] == "★" for c in chunk):
                continue                    # ★ 已經由 slots 代表了
            sub = [c for c in rt if chunk[0]["x0"] - 6 <= c["x0"] <= chunk[-1]["x1"] + 6]
            txt = annotate(chunk, sub)
            toks.append((chunk[0]["x0"], "[[" + txt + "]]" if on else txt))
        toks += slots
        toks.sort(key=lambda t: t[0])
        # 相鄰的空格之間插一個全形空白，四格才看得出來是四格（跨行也要算）
        buf = ""
        for _, t in toks:
            slot = t.startswith("＿")
            buf += ("　" if slot and prev_slot else "") + t
            prev_slot = slot
        parts.append(buf)
    return fix("".join(parts))


def marks_in(line):
    """
    找出這一行的選項編號。編號是獨立的一個字，前後都有空隙；
    只看文字會誤判——像「２ 初めの設計では２階建てだったが、３階建ての…」
    裡的２和３其實是內文。
    """
    out = []
    for k, c in enumerate(line):
        if c["t"] not in OPT_MARK:
            continue
        before = line[k - 1]["x1"] if k else -99
        after = line[k + 1]["x0"] if k + 1 < len(line) else 10 ** 9
        if c["x0"] - before >= 3 and after - c["x1"] >= 2:
            out.append((k, OPT_MARK.index(c["t"]) + 1))
    return out


def split_options(blk, ruby, ul):
    """
    把一或多行切成四個選項。回傳 [四個字串] 或 None。
    blk 是行（字元串列）的清單。
    """
    flat = []                       # [(行索引, 行, 起, 迄, 編號或 None)]
    for li, ln in enumerate(blk):
        ms = marks_in(ln)
        if not ms:
            flat.append((li, ln, 0, len(ln), None))
            continue
        for j, (k, n) in enumerate(ms):
            end = ms[j + 1][0] if j + 1 < len(ms) else len(ln)
            if j == 0 and k > 0:
                flat.append((li, ln, 0, k, None))
            flat.append((li, ln, k + 1, end, n))
    nums = [f[4] for f in flat if f[4] is not None]
    # 必須從第一個字就是「１」開始，否則會把題幹一起吃掉
    if nums != [1, 2, 3, 4] or not flat or flat[0][4] != 1:
        return None
    out, cur = [], None
    for _, ln, a, b, n in flat:
        if n is not None:
            cur = []
            out.append(cur)
        if cur is None:             # 編號之前的字是題幹，不是選項
            continue
        seg = ln[a:b]
        if seg:
            sub = [c for c in ruby if seg[0]["x0"] - 6 <= c["x0"] <= seg[-1]["x1"] + 6
                   and seg[0]["y"] - 14 < c["y"] < seg[0]["y"] - 1]
            cur.append(annotate(seg, sub))
    res = [fix("".join(x)).strip() for x in out]
    return res if all(res) else None


def page_blocks(page):
    """把一頁切成 [(題號錨點 y, 內文行們)]，外加這一頁的「問題N」標題"""
    ch = chars_of(page)
    body = [c for c in ch if abs(c["s"] - S_BODY) < 0.35]
    ruby = [c for c in ch if abs(c["s"] - S_RT) < 0.35]
    nums = lines(ch, S_NUM)
    heads = [l for l in lines(ch, S_HEAD) if "".join(c["t"] for c in l).startswith("問題")]
    ul = [l for l in page.lines if l["x1"] - l["x0"] > 8]
    head_no = None
    if heads:
        m = re.search(r"問題\s*([0-9])", norm("".join(c["t"] for c in heads[0])))
        if m:
            head_no = int(m.group(1))
    anchors = sorted(l[0]["y"] for l in nums)
    # 標題本身那一行的說明文字不算題目
    if heads:
        anchors = [a for a in anchors if a > heads[0][0]["y"] - 2]
    return head_no, anchors, body, ruby, ul


def parse(path, pages):
    """回傳 [(大題編號, 題幹, 選項)]，順序就是卷面順序"""
    out = []
    with pdfplumber.open(path) as pdf:
        cur = None
        for pno in pages:
            page = pdf.pages[pno]
            head, anchors, body, ruby, ul = page_blocks(page)
            if head:
                cur = head
            if not anchors:
                continue
            bl = lines(body)
            for k, a in enumerate(anchors):
                lo = a - 3
                hi = anchors[k + 1] - 3 if k + 1 < len(anchors) else 10 ** 9
                blk = [l for l in bl if lo <= l[0]["y"] < hi]
                if not blk:
                    continue
                opts, cut = None, len(blk)
                for j in range(len(blk) - 1, -1, -1):
                    got = split_options(blk[j:], ruby, ul)
                    if got:
                        opts, cut = got, j
                if not opts:
                    continue
                # 整段一起 render，跨行的空格才接得起來
                stem = render(blk[:cut], ruby, ul).strip()
                out.append((cur, tidy(stem), [tidy(o) for o in opts]))
    return out


def parse_cloze(path, passage_page, option_page, first_id):
    """
    問題9 的版面跟別的大題不一樣：一頁是文章（空格散在行間），
    下一頁才是五組選項。空格本身是 9.2pt 的外框數字，字碼不可靠，
    所以照「由上到下、由左到右」的順序編號。
    """
    with pdfplumber.open(path) as pdf:
        pg = pdf.pages[passage_page]
        ch = chars_of(pg)
        body = [c for c in ch if abs(c["s"] - S_BODY) < 0.35]
        ruby = [c for c in ch if abs(c["s"] - S_RT) < 0.35]
        nums = [c for c in ch if abs(c["s"] - S_NUM) < 0.35]
        ul = [l for l in pg.lines if l["x1"] - l["x0"] > 8]

        bl = lines(body)
        start = 0
        for i, l in enumerate(bl):
            if "選びなさい" in "".join(c["t"] for c in l):
                start = i + 1
        # 說明段落裡的空格編號不算，只取文章本體的
        y0 = bl[start][0]["y"] - 3 if start < len(bl) else 0
        blanks = []
        for nl in lines([c for c in nums if c["y"] >= y0]):
            blanks += runs(nl, gap=3.0)      # 先分行再依字距分組，才不會跨行黏在一起
        blanks.sort(key=lambda g: (round(g[0]["y"]), g[0]["x0"]))

        seq = {id(g): first_id + i for i, g in enumerate(blanks)}
        left = min(l[0]["x0"] for l in bl[start:])
        para = []
        for l in bl[start:]:
            mix = list(l)
            for g in blanks:
                if abs(g[0]["y"] - l[0]["y"]) < 8:
                    mix.append({"t": "【%d】" % seq[id(g)], "s": S_BODY,
                                "x0": g[0]["x0"], "x1": g[-1]["x1"], "y": l[0]["y"]})
            mix.sort(key=lambda c: c["x0"])
            txt = render([mix], ruby, ul)
            # 段落開頭有縮排，用它還原分段
            para.append(("\n" if l[0]["x0"] > left + 4 and para else "") + txt)
        passage = tidy(fix("".join(para)))

        # 選項頁
        pg2 = pdf.pages[option_page]
        head2, anchors, body2, ruby2, ul2 = page_blocks(pg2)
        bl2 = lines(body2)
        out = []
        for k, a in enumerate(anchors):
            hi = anchors[k + 1] - 3 if k + 1 < len(anchors) else 10 ** 9
            blk = [l for l in bl2 if a - 3 <= l[0]["y"] < hi]
            opts = split_options(blk, ruby2, ul2)
            if opts:
                out.append([tidy(o) for o in opts])
    if len(out) != len(blanks):
        sys.exit(f"✗ 問題9 有 {len(blanks)} 個空格但只找到 {len(out)} 組選項")
    return passage, out


def number(items):
    """依卷面順序配上正式題號，並檢查每個大題的題數對不對"""
    seq, i = [], 0
    for sec, n in COUNTS[:8]:
        got = [x for x in items if x[0] == sec]
        if len(got) != n:
            sys.exit(f"✗ 問題{sec} 抽到 {len(got)} 題，應該是 {n} 題")
        for x in got:
            i += 1
            seq.append({"id": i, "section": sec, "sectionName": SECTIONS[sec],
                        "stem": x[1], "options": x[2]})
    return seq


def main():
    items = parse(os.path.join(RES, "7.pdf"), range(2, 8))
    items += parse(os.path.join(RES, "3.pdf"), range(0, 4))
    qs = number(items)

    first9 = len(qs) + 1
    passage, opt9 = parse_cloze(os.path.join(RES, "3.pdf"), 4, 5, first9)
    for k, opts in enumerate(opt9):
        qs.append({"id": first9 + k, "section": 9, "sectionName": SECTIONS[9],
                   "stem": "", "options": opts, "passage": passage})

    print(f"抽到 {len(qs)} 題")
    for sec, n in COUNTS:
        got = [q for q in qs if q["section"] == sec]
        flag = "" if len(got) == n else f"  ← 應該是 {n} 題"
        print(f"  問題{sec} {SECTIONS[sec]:<8} {len(got):>2} 題  "
              f"第 {got[0]['id']}–{got[-1]['id']} 題{flag}")
    with open(os.path.join(HERE, "past_raw.json"), "w", encoding="utf8") as f:
        json.dump(qs, f, ensure_ascii=False, indent=1)
    print("→ tools/past_raw.json")


if __name__ == "__main__":
    main()
