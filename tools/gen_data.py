# -*- coding: utf-8 -*-
import json, re, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from anno import VOCAB_ANNO, GRAM_ANNO
from trans import VOCAB_TRANS, GRAM_TRANS
from kanji import WRONG_KANJI

OUT = os.path.join(HERE, "..", "data")
os.makedirs(OUT, exist_ok=True)

vocab = json.load(open(os.path.join(HERE, "vocab_raw.json"), encoding="utf-8"))
gram = json.load(open(os.path.join(HERE, "gram_raw.json"), encoding="utf-8"))

KANA = "ぁ-ゟ゠-ヿー"
strip_ruby = lambda s: re.sub(r"\{[^}]*\}", "", s).replace("/", "")

errs = []

# ---------- 驗證標注 ----------
for v in vocab:
    a = VOCAB_ANNO.get(v["id"])
    if a is None:
        errs.append(("V-missing", v["id"])); continue
    if strip_ruby(a) != v["ex"]:
        errs.append(("V-mismatch", v["id"], v["ex"], strip_ruby(a)))
for g in gram:
    a = GRAM_ANNO.get(g["id"])
    if a is None:
        errs.append(("G-missing", g["id"])); continue
    if strip_ruby(a) != g["ex"]:
        errs.append(("G-mismatch", g["id"], g["ex"], strip_ruby(a)))

# ---------- 驗證翻譯 ----------
for v in vocab:
    t = VOCAB_TRANS.get(v["id"])
    if not t or not all(t):
        errs.append(("V-trans-missing", v["id"]))
for g in gram:
    t = GRAM_TRANS.get(g["id"])
    if not t or not all(t):
        errs.append(("G-trans-missing", g["id"]))

if errs:
    for e in errs:
        print("ERR", e)
    sys.exit(1)

# ---------- 單字本身的注音 ----------
def head_anno(word, reading):
    """把 招く/まねく 轉成 招{まね}く；全漢字詞則整詞注音。"""
    if not reading or reading == word:
        return word
    if not re.search(r"[一-鿿]", word):
        return word
    # 找共同的尾端假名（送假名）
    tail = 0
    while (tail < len(word) - 1 and tail < len(reading) - 1
           and word[-1 - tail] == reading[-1 - tail]
           and re.match("[" + KANA + "]", word[-1 - tail])):
        tail += 1
    stem_w = word[: len(word) - tail] if tail else word
    stem_r = reading[: len(reading) - tail] if tail else reading
    okuri = word[len(word) - tail:] if tail else ""
    if not re.search(r"[一-鿿]", stem_w):
        return word
    return "%s{%s}%s" % (stem_w, stem_r, okuri)

# ---------- 填空目標：找出例句中含目標語的文節 ----------
def find_chunk(anno, needle_forms):
    chunks = anno.split("/")
    for i, c in enumerate(chunks):
        plain = re.sub(r"\{[^}]*\}", "", c)
        for n in needle_forms:
            if n and n in plain:
                return i
    return -1

plain_of = lambda s: re.sub(r"\{[^}]*\}", "", s)
kana_of = lambda s: re.sub(r"[々〆ヶ一-鿿]+\{([^}]*)\}", r"\1", s)

# 挖空時要留在空格外面的尾巴（助詞與標點），讓句子讀起來仍然通順
# 只切這幾個，不切「と・か・も」等可能是詞的一部分的字
# （例如「逃れることは」若切掉と，會變成「逃れるこ」）
# 「の」要切，否則答案會變成「判断するの」「共通の」這種跟其他選項形態不一致的樣子
TAIL_CHARS = "をにがはでの、。！？"

def split_tail(anno_chunk, stem):
    """把文節末尾的助詞、標點切出來，只挖單字本體。"""
    tail = ""
    cur = anno_chunk
    while len(plain_of(cur)) > 1 and cur and cur[-1] in TAIL_CHARS:
        tail = cur[-1] + tail
        cur = cur[:-1]
    # 切完之後本體必須還看得到這個單字，否則不切
    if stem and stem not in plain_of(cur):
        return anno_chunk, ""
    return cur, tail

HAS_KANJI = re.compile(r"[一-鿿]")

VOC = []
tail_errs = []
kanji_errs = []
for v in vocab:
    anno = VOCAB_ANNO[v["id"]]
    stem = re.sub("[" + KANA + "]+$", "", v["word"]) or v["word"]
    idx = find_chunk(anno, [v["word"], stem])
    chunk = anno.split("/")[idx]
    head, tail = split_tail(chunk, stem)
    if plain_of(head) + tail != plain_of(chunk):
        tail_errs.append((v["id"], chunk, head, tail))
    rec = {
        "id": v["id"], "group": v["group"], "pos": v["pos"],
        "word": v["word"], "wordRuby": head_anno(v["word"], v["reading"]),
        "reading": v["reading"], "en": v["en"], "zh": v["zh"],
        "ex": anno, "exZh": VOCAB_TRANS[v["id"]][0], "exEn": VOCAB_TRANS[v["id"]][1],
        "clozeIdx": idx,
        "clozeAnswer": plain_of(head), "clozeKana": kana_of(head), "clozeTail": tail,
    }

    # ---- 日檢問題1（漢字読み）／問題2（表記）用的欄位 ----
    # qWord：例句中要畫底線的那一段；qKana：它的讀音
    # 原形直接出現在句中就用原形，否則用活用後的形態
    if HAS_KANJI.search(v["word"]):
        sent = plain_of(anno).replace("/", "")
        if v["word"] in sent:
            rec["qWord"], rec["qKana"] = v["word"], v["reading"]
        else:
            rec["qWord"], rec["qKana"] = rec["clozeAnswer"], rec["clozeKana"]
        rec["qStem"] = stem
        rec["wrongKanji"] = WRONG_KANJI.get(v["id"], [])
        if rec["qWord"] not in sent:
            kanji_errs.append((v["id"], "qWord 不在例句中", rec["qWord"]))
        if not rec["qWord"].startswith(stem):
            kanji_errs.append((v["id"], "qWord 不是以語幹開頭", rec["qWord"], stem))
        if HAS_KANJI.search(rec["qKana"]):
            kanji_errs.append((v["id"], "讀音殘留漢字", rec["qKana"]))
        w = rec["wrongKanji"]
        if len(w) != 3:
            kanji_errs.append((v["id"], "誘答漢字不是 3 個", w))
        else:
            if len(set(w)) != 3:
                kanji_errs.append((v["id"], "誘答重複", w))
            for x in w:
                if len(x) != len(stem):
                    kanji_errs.append((v["id"], "誘答字數與語幹不符", x, stem))
                if x == stem:
                    kanji_errs.append((v["id"], "誘答與正解相同", x))
    VOC.append(rec)
assert not tail_errs, tail_errs
if kanji_errs:
    for e in kanji_errs:
        print("KANJI-ERR", e)
    sys.exit(1)
print("漢字読み／表記可出題單字：",
      sum(1 for x in VOC if x.get("qWord")))

# ---------- 文法填空目標 ----------
# 例句中的文法因為活用或漢字表記，跟文法名稱長得不一樣，
# 這裡手動指定挖空處，避免挖到一半（例如把「かねます」挖成「かね」）
CLOZE_OVERRIDE = {
    11: "得ない",
    13: "かいがあって",
    17: "かのうちに",
    19: "かねます",
    24: "がいがある",
    31: "げな",
    38: "ざるを得なかった",
    39: "上",
    55: "っぽく",
    56: "っぽくて",
    61: "ではいられない",
    63: "てみせた",
    79: "ないで済んだ",
}

def gram_targets(pattern):
    """把文法名稱拆成可能出現在例句裡的字串候選，長的排前面。"""
    p = re.sub(r"【.*?】", "", pattern)      # 去掉中文標籤
    p = re.sub(r"（.*?）|\(.*?\)", "", p)    # 去掉讀音註記
    p = re.sub(r"[①②③]", "", p)
    p = p.replace("A", "").replace("B", "")
    outs = []
    for part in re.split(r"[／/～]", p):     # ／ 是不同寫法，～ 是省略處
        part = part.strip()
        if len(part) >= 2 and part not in outs:
            outs.append(part)
    outs.sort(key=len, reverse=True)
    return outs


def pick_cloze(targets, sentence):
    """先用完整候選比對；都找不到才允許截短。一律取最長的命中結果。"""
    hits = [t for t in targets if t in sentence]
    if hits:
        return max(hits, key=len)
    prefixes = set()
    for t in targets:
        for n in range(len(t), 1, -1):
            prefixes.add(t[:n])
    hits = [t for t in prefixes if t in sentence]
    return max(hits, key=len) if hits else ""

GRA = []
nomatch = []
truncated = []
for g in gram:
    anno = GRAM_ANNO[g["id"]]
    plain = g["ex"]
    tgts = gram_targets(g["pattern"])
    override = CLOZE_OVERRIDE.get(g["id"])
    hit = override or pick_cloze(tgts, plain)
    if not hit:
        nomatch.append((g["id"], g["pattern"], plain))
    elif not override and hit not in tgts:
        # 只有被截短過的候選才會走到這裡，很可能挖到詞的一半，需要人工確認
        truncated.append((g["id"], g["pattern"], hit, plain.replace(hit, "［" + hit + "］")))
    GRA.append({
        "id": g["id"], "pattern": g["pattern"], "meaning": g["meaning"],
        "meaningEn": GRAM_TRANS[g["id"]][0],
        "note": g["note"], "noteEn": GRAM_TRANS[g["id"]][1], "usage": g["usage"],
        "ex": anno, "exZh": g["exZh"], "exEn": GRAM_TRANS[g["id"]][2], "cloze": hit,
        "variants": tgts,
    })

print("cloze 找不到的文法：", len(nomatch))
for n in nomatch:
    print("  ", n)
print("cloze 被截短、需人工確認的：", len(truncated))
for n in truncated:
    print("  ", n)
assert not nomatch and not truncated, "請在 CLOZE_OVERRIDE 補上這些文法的挖空字串"

def js(name, obj):
    p = os.path.join(OUT, name + ".js")
    with open(p, "w", encoding="utf-8") as f:
        f.write("window.%s = %s;\n" % (name.upper().replace("-", "_"),
                                       json.dumps(obj, ensure_ascii=False, indent=0)))
    print(name, len(obj), "->", p)

js("vocab", VOC)
js("grammar", GRA)
