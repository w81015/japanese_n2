#!/usr/bin/env python3
"""
把 tools/past_raw.json（題目）跟 tools/past_answers.py（答案）合成 data/past.js。

跑之前要先有 past_raw.json：
    python3 tools/pdf_past.py
    python3 tools/gen_past.py

每一項都會過下面的關卡，有任何一項不合格就中止，不會產出半殘的資料。
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import past_answers as A                                    # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SECTION_NAMES = {
    1: "漢字読み", 2: "表記", 3: "語形成", 4: "文脈規定", 5: "言い換え類義",
    6: "用法", 7: "文法形式の判断", 8: "文の組み立て", 9: "文章の文法",
}
KANA = re.compile(r"^[ぁ-んァ-ヶー]+$")
KANJI_OR_NUM = re.compile(r"[0-9一-鿿々〆ヶ]")
SLOT = re.compile("＿＿＿|＿★＿")

errs = []


def bad(msg):
    errs.append(msg)


def check_ruby(where, s):
    if s.count("{") != s.count("}"):
        bad(f"{where} 振假名括號不對稱")
        return
    for m in re.finditer(r"\{([^}]*)\}", s):
        if not KANA.match(m.group(1)):
            bad(f"{where} 振假名不是假名：{m.group(1)}")
    for m in re.finditer(r"(.)\{", s):
        if not KANJI_OR_NUM.match(m.group(1)):
            bad(f"{where} 振假名底下不是漢字：{m.group(1)}")


def main():
    raw_path = os.path.join(HERE, "past_raw.json")
    if not os.path.exists(raw_path):
        sys.exit("✗ 找不到 tools/past_raw.json，請先跑 python3 tools/pdf_past.py")
    raw = json.load(open(raw_path, encoding="utf8"))

    for m in A.check():
        bad("答案自我檢查：" + m)

    if [q["id"] for q in raw] != list(range(1, 55)):
        bad("題號不是連續的 1–54")

    items, passage = [], None
    for q in raw:
        i, sec, stem = q["id"], q["section"], q["stem"]
        w = f"#{i}"
        if "�" in json.dumps(q, ensure_ascii=False):
            bad(f"{w} 有無法辨識的字")
        if sec not in SECTION_NAMES:
            bad(f"{w} 大題編號 {sec} 不認得")
        if len(q["options"]) != 4:
            bad(f"{w} 選項不是 4 個")
        if len(set(q["options"])) != 4:
            bad(f"{w} 選項有重複")
        if not all(o.strip() for o in q["options"]):
            bad(f"{w} 有空選項")
        check_ruby(w + " 題幹", stem)
        for k, o in enumerate(q["options"]):
            check_ruby(f"{w} 選項{k + 1}", o)

        # 各大題的版面特徵
        if sec in (1, 2, 5) and "[[" not in stem:
            bad(f"{w} 問題{sec} 應該有畫底線的詞")
        if sec in (3, 4, 7) and "（　）" not in stem:
            bad(f"{w} 問題{sec} 應該有挖空")
        if sec == 8:
            if len(SLOT.findall(stem)) != 4:
                bad(f"{w} 問題8 應該有四個空格")
            if "＿★＿" not in stem:
                bad(f"{w} 問題8 找不到★")
        if sec == 9:
            if not q.get("passage"):
                bad(f"{w} 問題9 少了文章")
            elif passage is None:
                passage = q["passage"]
            elif q["passage"] != passage:
                bad(f"{w} 問題9 的文章跟其他題不一樣")

        ans = A.ANSWERS.get(i)
        if not ans:
            bad(f"{w} 沒有答案")
            continue
        n, note = ans
        if n not in (1, 2, 3, 4):
            bad(f"{w} 答案 {n} 不在 1–4")
        if len(note.strip()) < 8:
            bad(f"{w} 解析太短")
        # 底線內的字不該同時出現在選項裡（那等於送分）
        it = {"id": i, "sec": sec, "secName": SECTION_NAMES[sec],
              "stem": stem, "options": q["options"], "answer": n, "note": note}
        if i in A.ORDERS:
            it["order"] = A.ORDERS[i]
            it["star"] = A.STAR_SLOT[i]
        items.append(it)

    if passage:
        for k in range(50, 55):
            if f"【{k}】" not in passage:
                bad(f"文章裡找不到【{k}】的空格")

    if errs:
        print("\n".join("✗ " + e for e in errs))
        sys.exit(f"\n共 {len(errs)} 個問題，沒有產生檔案")

    paper = {
        "id": "past1",
        "name": "言語知識（文字・語彙・文法）",
        "source": "resources/7.pdf ＋ 3.pdf",
        "note": "答案為未校對的推測，請自行確認",
        "passage": passage,
        "sections": [{"no": s, "name": SECTION_NAMES[s],
                      "from": min(x["id"] for x in items if x["sec"] == s),
                      "to": max(x["id"] for x in items if x["sec"] == s)}
                     for s in sorted({x["sec"] for x in items})],
        "items": items,
    }
    out = os.path.join(ROOT, "data", "past.js")
    with open(out, "w", encoding="utf8") as f:
        f.write("/* 考古題。由 tools/pdf_past.py + tools/gen_past.py 產生，請勿手改。\n")
        f.write("   答案來自 tools/past_answers.py，未經官方解答校對。 */\n")
        f.write("window.PAST_PAPERS = [\n")
        f.write(json.dumps(paper, ensure_ascii=False, indent=1))
        f.write("\n];\n")
    print(f"✓ {len(items)} 題全部通過檢查")
    for s in paper["sections"]:
        print(f"   問題{s['no']} {s['name']:<8} 第 {s['from']}–{s['to']} 題")
    print(f"→ data/past.js  ({os.path.getsize(out) // 1024} KB)")


if __name__ == "__main__":
    main()
