#!/usr/bin/env python3
"""
自動上振假名與文節。

輸入純日文句子，輸出專案用的標注格式：

    台風の影響で、電車が止まっている。
    → 台風{たいふう}の/影響{えいきょう}で、/電車{でんしゃ}が/止{と}まっている。

用 MeCab（fugashi + unidic-lite）斷詞取讀音。**不是拿來無人監督用的**：
形態素分析器對「言う」這種有兩種讀法的詞會挑錯，所以底下有一張 READING
對照表，發現錯的就往裡面加，越滾越準。

直接執行會拿現有的 204 句手寫例句當回歸測試：

    python3 tools/furigana.py

改了規則或對照表就跑一次，確認沒有把本來對的弄壞。
"""
import json
import os
import re
import subprocess
import sys

try:
    import fugashi
except ImportError:
    sys.exit("需要 MeCab：pip install fugashi unidic-lite")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

KANJI = re.compile(r"[々〆ヶ一-鿿]")
_tagger = None


def tagger():
    global _tagger
    if _tagger is None:
        _tagger = fugashi.Tagger()
    return _tagger


def kata2hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


# ── 讀音對照表 ────────────────────────────────────────────────
# MeCab 挑錯或挑了不合這裡語境的讀法，在這裡指定。key 是詞的表層形。
READING = {
    "言う": "いう",       # MeCab 會給「ゆう」，那是口語音，卷面上寫「いう」
    "言っ": "いっ",
    "日本": "にほん",      # にっぽん 也對，但教材習慣用 にほん
    "私": "わたし",        # MeCab 會給「わたくし」
    "一人": "ひとり",
    "二人": "ふたり",
    "今日": "きょう",
    "昨日": "きのう",
    "明日": "あした",
    "一日": "いちにち",
    "気味": "ぎみ",        # 風邪気味 かぜぎみ，連濁
}
# 注意：這張表是比對「詞的表層形」，所以只能放讀音固定的詞。
# 像「中」這種 実施中（ちゅう）／今日中（じゅう）兩種都有的，放進來會改壞另一邊，
# 要放到下面的 PHRASE 整組指定。

# 整個詞組直接指定標注。用在 MeCab 會拆開、拆開之後就救不回來的詞：
# 「富士山」被拆成 富士＋山 會讀成 ふじやま，「外国人」被拆成 外国＋人 會讀成 にん。
PHRASE = {
    "富士山": "富士山{ふじさん}",
    "外国人": "外国人{がいこくじん}",
    "日本人": "日本人{にほんじん}",
    "今日中": "今日中{きょうじゅう}",
    "スマートフォン": "スマートフォン",
}

# 形式名詞：前面接動詞・形容詞時是黏著的，不另起文節
# （「食べられたものではない」是一個文節，不是「食べられた／ものでは／ない」）
BOUND_NOUNS = {"もの", "こと", "の", "ん", "ため", "はず", "わけ",
               "つもり", "ところ", "とおり", "うち", "ほう", "よう", "まま"}

# サ変動詞的「する」黏在名詞後面：「検討する」是一個文節，不是「検討／する」
SURU = {"する", "し", "さ", "せ", "しよ", "すれ", "した", "して"}

# ── 文節切分 ──────────────────────────────────────────────────
# 自立語會起一個新文節；付属語（助詞・助動詞・接尾辞）黏在前面。
HEADS = {"名詞", "動詞", "形容詞", "形状詞", "副詞", "連体詞",
         "接続詞", "感動詞", "代名詞", "接頭辞"}
# 名詞連著名詞是複合詞（採用＋条件），不切開
NOUNY = {"名詞", "接頭辞", "接尾辞"}
# 這些一定黏在前面：助詞、助動詞、接尾辞、標點
GLUE = {"助詞", "助動詞", "接尾辞", "補助記号", "記号"}


def anno_word(surface, reading):
    """
    把讀音分配到各個漢字段落上，中間的假名留在外面。

      学び直す + まなびなおす → 学{まな}び直{なお}す
      案の定   + あんのじょう → 案{あん}の定{じょう}
      お菓子   + おかし       → お菓子{かし}

    做法是拿詞裡的假名當錨點：假名在讀音裡的位置是確定的，
    夾在兩個錨點之間的就是那一段漢字的讀音。
    網站的 ruby() 只認「緊接在 { 前的漢字連續」，所以底字絕不能夾到假名，
    對不齊就整個放棄標注——寧可沒有注音，也不要標錯。
    """
    if not reading or not KANJI.search(surface):
        return surface

    # 切成 [(是不是漢字, 那一段字)]
    segs, cur, cur_kanji = [], "", None
    for ch in surface:
        k = bool(KANJI.match(ch))
        if cur and k != cur_kanji:
            segs.append((cur_kanji, cur))
            cur = ""
        cur, cur_kanji = cur + ch, k
    if cur:
        segs.append((cur_kanji, cur))

    out, pos = "", 0
    for i, (is_kanji, text) in enumerate(segs):
        if not is_kanji:
            # 假名段落必須在讀音裡原封不動地出現
            if reading[pos:pos + len(text)] != text:
                return surface
            out += text
            pos += len(text)
            continue
        nxt = segs[i + 1][1] if i + 1 < len(segs) else ""
        if nxt:
            end = reading.find(nxt, pos + 1)
            if end < 0:
                return surface
        else:
            end = len(reading)
        rt = reading[pos:end]
        if not rt or KANJI.search(rt):
            return surface
        out += text + "{" + rt + "}"
        pos = end
    return out if pos == len(reading) else surface


def words(text):
    """斷詞，回傳 [(表層, 讀音, 詞性)]"""
    out = []
    for w in tagger()(text):
        sf = w.surface
        rd = READING.get(sf)
        if rd is None:
            rd = kata2hira(getattr(w.feature, "kana", None) or sf)
        out.append((sf, rd, w.feature.pos1))
    return out


def _tokens(text):
    """斷詞，但 PHRASE 裡的詞組整組保留，不讓 MeCab 拆開"""
    if not PHRASE:
        return [(sf, rd, pos, None) for sf, rd, pos in words(text)]
    pat = "(" + "|".join(re.escape(k) for k in sorted(PHRASE, key=len, reverse=True)) + ")"
    out = []
    for part in re.split(pat, text):
        if not part:
            continue
        if part in PHRASE:
            out.append((part, None, "名詞", PHRASE[part]))
        else:
            out += [(sf, rd, pos, None) for sf, rd, pos in words(part)]
    return out


def annotate(text, bunsetsu=True):
    parts, cur, prev = [], "", None
    for sf, rd, pos, fixed in _tokens(text):
        piece = fixed if fixed is not None else anno_word(sf, rd)
        head = pos in HEADS and pos not in GLUE
        if pos in NOUNY and prev in NOUNY:
            head = False              # 複合名詞不切（採用＋条件）
        if sf in BOUND_NOUNS:
            head = False              # 形式名詞黏在前面
        if pos == "動詞" and sf in SURU and prev in NOUNY:
            head = False              # サ変：検討＋する 是一個文節
        if cur and head and bunsetsu:
            parts.append(cur)
            cur = piece
        else:
            cur += piece
        prev = pos
    if cur:
        parts.append(cur)
    return "/".join(parts) if bunsetsu else "".join(parts)


# ── 還原 ──────────────────────────────────────────────────────
def plain(anno):
    return re.sub(r"\{[^}]*\}", "", anno).replace("/", "")


def kana(anno):
    return re.sub(r"[々〆ヶ一-鿿]+\{([^}]*)\}", r"\1", anno).replace("/", "")


def check(anno):
    """回傳這句標注的問題清單，空的就代表格式合格"""
    bad = []
    if anno.count("{") != anno.count("}"):
        bad.append("括號不對稱")
    for m in re.finditer(r"\{([^}]*)\}", anno):
        if not re.fullmatch(r"[ぁ-んー]+", m.group(1)):
            bad.append(f"注音不是平假名：{m.group(1)}")
    for m in re.finditer(r"(.)\{", anno):
        if not KANJI.match(m.group(1)):
            bad.append(f"注音底下不是漢字：{m.group(1)}")
    if KANJI.search(kana(anno)):
        bad.append("還有漢字沒上到假名：" + kana(anno))
    # 每個文節都要有一個自立語，不能整段都是助詞助動詞
    for c in [c for c in anno.split("/") if c]:
        if not any(pos in HEADS for _, _, pos, _ in _tokens(plain(c))):
            bad.append(f"有文節沒有自立語：{c}")
    return bad


# ── 回歸測試 ──────────────────────────────────────────────────
def existing():
    """現有 204 句手寫標注，當作標準答案"""
    js = subprocess.run(
        ["node", "-e", """
global.window = {};
['vocab', 'grammar'].forEach(function (f) {
  eval(require('fs').readFileSync(process.argv[1] + '/data/' + f + '.js', 'utf8'));
});
console.log(JSON.stringify(window.VOCAB.concat(window.GRAMMAR).map(function (x) {
  return x.ex;
})));
""", ROOT], capture_output=True, text=True)
    return json.loads(js.stdout)


def main():
    exs = existing()
    n = len(exs)
    round_trip = reading_ok = 0
    fmt_bad, read_bad = [], []
    for e in exs:
        got = annotate(plain(e))
        if plain(got) == plain(e):
            round_trip += 1
        else:
            fmt_bad.append(("原文被改掉", e, got))
        problems = check(got)
        if problems:
            fmt_bad.append(("格式：" + "；".join(problems), e, got))
        if kana(got) == kana(e):
            reading_ok += 1
        else:
            read_bad.append((kana(e), kana(got), plain(e)))

    print(f"拿 {n} 句手寫標注當標準答案：")
    print(f"  原文可完整還原  {round_trip}/{n}  ({round_trip * 100 // n}%)")
    print(f"  整句讀音一致    {reading_ok}/{n}  ({reading_ok * 100 // n}%)")
    print(f"  格式檢查未過    {len(fmt_bad)} 句")

    if read_bad:
        print(f"\n讀音不一致的 {len(read_bad)} 句（要新增 READING 對照的看這裡）：")
        for want, got, src in read_bad[:20]:
            print(f"  原文 {src}")
            print(f"    手寫 {want}")
            print(f"    自動 {got}")
    for why, e, got in fmt_bad[:10]:
        print(f"\n  [{why}]\n    {e}\n    {got}")

    # 格式一定要全過；讀音允許少數落差（同一個詞兩種讀法都對的情況）
    return 1 if fmt_bad or reading_ok < n * 0.9 else 0


if __name__ == "__main__":
    sys.exit(main())
